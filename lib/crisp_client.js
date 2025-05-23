/**
 * crisp_client.js
 * Umfassender Client für die Crisp-API-Interaktion im WipeBot-Plugin
 * 
 * Dieser Client stellt alle notwendigen Methoden bereit, um:
 * - Konversationen zu lesen, filtern und zu verwalten
 * - Konversationen oder einzelne Segmente zu löschen
 * - Mit Rate-Limiting umzugehen
 * - Bulk-Operationen effizient durchzuführen
 * - Simulationen für sichere Testläufe zu ermöglichen
 */

const Crisp = require("crisp-api");
const axios = require("axios");
const { 
  logDebug, 
  logError, 
  logWarn, 
  logInfo,
  logAPIError, 
  logAPIWarn, 
  logAPIInfo, 
  logAPIDebug, 
  logAPIVerbose,
  LOG_LEVELS 
} = require("../utils/debugLogger");
const { log } = require("../utils/logger");
const auth = require("../auth");

// Konstanten für HTTP-Status-Codes und Konfiguration
const HTTP_TOO_MANY_REQUESTS = 429;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 Sekunde
const MAX_PAGE_SIZE = 100;

class CrispClient {
  constructor() {
    // Session-Tracking für intelligentes Logging
    this.sessionStats = {
      requestCount: 0,
      errorCount: 0,
      startTime: Date.now(),
      lastLoggedPage: 0
    };
    
    // Überprüfe, ob die API-Credentials vorhanden sind
    if (!auth.env.CRISP_API_IDENTIFIER || !auth.env.CRISP_API_KEY) {
      const errorMsg = "❌ FEHLER: Crisp API Credentials fehlen. Der Client kann nicht initialisiert werden.";
      console.error(errorMsg);
      logError(errorMsg);
      throw new Error("Crisp API Credentials fehlen");
    }
    
    // Initialisiere den offiziellen Crisp Node.js Client
    this.client = new Crisp();
    
    // API-Authentifizierung mit der korrekten Methode
    try {
      // Verwende die standard authenticate() Methode
      this.client.authenticate(auth.env.CRISP_API_IDENTIFIER, auth.env.CRISP_API_KEY);
      
      logAPIInfo("🔐 Crisp-API-Client-Authentifizierung mit authenticate() durchgeführt");
      
      // Basic Auth String für Axios erstellen
      const authString = `${auth.env.CRISP_API_IDENTIFIER}:${auth.env.CRISP_API_KEY}`;
      const base64Auth = Buffer.from(authString).toString('base64');
      
      // Axios-Instance für direkte API-Aufrufe mit Basic Auth
      this.api = axios.create({
        baseURL: "https://api.crisp.chat/v1/",
        headers: {
          "Authorization": `Basic ${base64Auth}`,
          "X-Crisp-Tier": "plugin",
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 15000 // 15 Sekunden Timeout für API-Anfragen
      });
      
      logAPIInfo("✅ Axios-Instance mit Basic Auth konfiguriert");
      
    } catch (authError) {
      const errorMsg = `❌ FEHLER bei Crisp-API-Authentifizierung: ${authError.message}`;
      console.error(errorMsg);
      logAPIError(errorMsg);
      throw authError;
    }
    
    this.DEBUG_MODE = auth.DEBUG_MODE || false;
    
    // Request-Interceptor für intelligentes Logging
    this.api.interceptors.request.use(config => {
      this.sessionStats.requestCount++;
      
      // Logge nur wichtige Requests oder bei Verbose-Level
      if (this.shouldLogRequest(config)) {
        logAPIDebug(`🔄 API-Anfrage: ${config.method.toUpperCase()} ${config.url}`);
      }
      
      return config;
    });
    
    // Response-Interceptor für Fehlerhandling
    this.api.interceptors.response.use(
      response => {
        // Logge erfolgreiche Responses nur bei wichtigen Operationen
        if (this.shouldLogResponse(response)) {
          logAPIDebug(`✅ API-Erfolg: ${response.status} - ${response.config.url}`);
        }
        return response;
      },
      error => {
        this.sessionStats.errorCount++;
        
        const status = error.response ? error.response.status : 'unbekannt';
        const url = error.config?.url || 'unbekannte URL';
        
        // Alle Fehler sind wichtig genug zum Loggen
        logAPIError(`❌ API-Fehler: ${status} bei ${url}`);
        
        if (error.response && error.response.data) {
          logAPIDebug(`📝 API-Fehler-Details: ${JSON.stringify(error.response.data)}`);
        }
        
        return Promise.reject(error);
      }
    );
    
    logAPIInfo("🔌 Crisp API Client initialisiert");
    
    // Initiale Authentifizierungsprüfung
    this.testAuthentication()
      .then(success => {
        if (success) {
          logAPIInfo("✅ Initiale Authentifizierungsprüfung erfolgreich");
        } else {
          logAPIWarn("⚠️ Initiale Authentifizierungsprüfung fehlgeschlagen");
        }
      })
      .catch(error => {
        logAPIError(`❌ Fehler bei initialer Authentifizierungsprüfung: ${error.message}`);
      });
  }

  /**
   * Bestimmt, ob ein Request geloggt werden soll (intelligentes Logging)
   * @param {Object} config - Axios Request Config
   * @returns {boolean} True, wenn der Request geloggt werden soll
   */
  shouldLogRequest(config) {
    const url = config.url || '';
    const method = config.method?.toUpperCase() || '';
    
    // Immer loggen bei wichtigen Operationen
    if (method === 'DELETE' || method === 'POST' || method === 'PUT' || method === 'PATCH') {
      return true;
    }
    
    // Authentifizierungstests immer loggen
    if (url.includes('/conversations') && config.params?.page_size === 1) {
      return true;
    }
    
    // Bei GET-Requests: Nur erste Seite und alle 10 Seiten loggen
    if (method === 'GET' && url.includes('/conversations')) {
      const pageNumber = config.params?.page_number || 1;
      
      if (pageNumber === 1 || pageNumber % 10 === 0 || pageNumber !== this.sessionStats.lastLoggedPage + 1) {
        this.sessionStats.lastLoggedPage = pageNumber;
        return true;
      }
      
      return false;
    }
    
    // Andere wichtige Endpunkte immer loggen
    if (url.includes('/message') || url.includes('/meta') || url.includes('/plugins') || url.includes('/mailboxes')) {
      return true;
    }
    
    return false;
  }

  /**
   * Bestimmt, ob eine Response geloggt werden soll
   * @param {Object} response - Axios Response
   * @returns {boolean} True, wenn die Response geloggt werden soll
   */
  shouldLogResponse(response) {
    // Erfolgreiche wichtige Operationen loggen
    const url = response.config?.url || '';
    const method = response.config?.method?.toUpperCase() || '';
    
    return method !== 'GET' || url.includes('/message') || url.includes('/meta');
  }

  /**
   * Testet die Authentifizierung mit einem einfachen API-Aufruf
   * @returns {Promise<boolean>} - true, wenn die Authentifizierung erfolgreich ist
   */
  async testAuthentication() {
    try {
      // Verwende einen einfachen API-Aufruf, um die Authentifizierung zu testen
      const websiteId = auth.env.TEST_WEBSITE_ID || "3297e6f7-69b7-4b60-87bd-d22c65bbacc8";
      const response = await this.api.get(`website/${websiteId}/conversations`, { 
        params: { page_number: 1, page_size: 1 } 
      });
      
      return response.status === 200 || response.status === 206;
    } catch (error) {
      logAPIError(`❌ Authentifizierungstest fehlgeschlagen: ${error.message}`);
      return false;
    }
  }

  /**
   * Führt einen API-Aufruf mit Retry-Logik aus, um mit Rate-Limiting umzugehen
   * @param {Function} apiCallFn - Die auszuführende API-Funktion
   * @param {number} retryCount - Anzahl der bisherigen Versuche (intern verwendet)
   * @returns {Promise<*>} - Das Ergebnis des API-Aufrufs
   */
  async handleRateLimiting(apiCallFn, retryCount = 0) {
    try {
      return await apiCallFn();
    } catch (error) {
      // Wenn wir ein Rate Limit erreicht haben und noch Retries übrig sind
      if (error.response && error.response.status === HTTP_TOO_MANY_REQUESTS && retryCount < MAX_RETRIES) {
        const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        
        logAPIWarn(`⏱️ Rate-Limit erreicht. Warte ${retryDelay}ms vor Retry #${retryCount + 1}`);
        
        // Warte exponentiell länger zwischen den Versuchen
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        // Rekursiver Aufruf mit erhöhtem Retry-Zähler
        return this.handleRateLimiting(apiCallFn, retryCount + 1);
      }
      
      // Wenn wir einen 401-Fehler bekommen, könnte die Authentifizierung ungültig sein
      if (error.response && error.response.status === 401) {
        logAPIError(`🔐 Authentifizierungsfehler 401: ${JSON.stringify(error.response.data || {})}`);
        
        if (retryCount >= 3) {
          logAPIError(`❌ Maximale Anzahl von Authentifizierungsversuchen erreicht (${retryCount})`);
          throw new Error(`Authentifizierungsfehler: ${error.message}`);
        }
        
        // Kurz warten und erneut versuchen
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.handleRateLimiting(apiCallFn, retryCount + 1);
      }
      
      // Wenn es kein Rate-Limit-Problem ist oder wir keine Retries mehr haben
      throw error;
    }
  }

  /**
   * Sendet eine Nachricht in eine Konversation
   * @param {string} websiteId - Die Website-ID
   * @param {string} sessionId - Die Session-ID der Konversation
   * @param {object} message - Die zu sendende Nachricht
   * @returns {Promise<boolean>} - Erfolgsstatus
   */
  async sendMessage(websiteId, sessionId, message) {
    try {
      const endpoint = `website/${websiteId}/conversation/${sessionId}/message`;
      
      const payload = {
        type: message.type || "text",
        from: "operator",
        origin: auth.env.CRISP_PLUGIN_URN || "chat", // Verwende das korrekte URN-Format
        content: message.content
      };
      
      logAPIDebug(`📤 Sende Nachricht an ${sessionId}: ${message.content}`);
      
      await this.handleRateLimiting(() => 
        this.api.post(endpoint, payload)
      );
      
      return true;
    } catch (error) {
      logAPIError(`❌ Fehler beim Senden der Nachricht: ${error.message}`);
      return false;
    }
  }

  /**
   * Lädt eine Konversation mit allen Nachrichten
   * @param {string} websiteId - Die Website-ID
   * @param {string} sessionId - Die Session-ID der Konversation
   * @returns {Promise<object|null>} - Die Konversationsdaten oder null bei Fehler
   */
  async getConversation(websiteId, sessionId) {
    try {
      const response = await this.handleRateLimiting(() => 
        this.api.get(`website/${websiteId}/conversation/${sessionId}`)
      );
      
      return response.data;
    } catch (error) {
      logAPIError(`❌ Fehler beim Laden der Konversation ${sessionId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Lädt Konversationen nach bestimmten Filterkriterien mit Paginierung
   * @param {string} websiteId - Die Website-ID
   * @param {object} filter - Die Filterkriterien
   * @returns {Promise<object>} - Die gefilterten Konversationsdaten
   */
  async listConversations(websiteId, filter = {}) {
    try {
      const params = {
        page_number: filter.page || 1,
        page_size: filter.page_size || 30,
        ...filter
      };
      
      delete params.page; // Entferne unsere eigene Page-Eigenschaft
      
      // Logge nur wichtige Seiten (erste, jede 10te, etc.)
      const pageNumber = params.page_number;
      if (pageNumber === 1 || pageNumber % 10 === 0) {
        logAPIDebug(`🔍 Suche Konversationen für ${websiteId} - Seite ${pageNumber}`);
      }
      
      const response = await this.handleRateLimiting(() => 
        this.api.get(`website/${websiteId}/conversations`, { params })
      );
      
      return response.data;
    } catch (error) {
      logAPIError(`❌ Fehler beim Auflisten der Konversationen: ${error.message}`);
      return { data: [], error: error.message };
    }
  }

  /**
   * Lädt alle Konversationen mit automatischer Paginierung
   * @param {string} websiteId - Die Website-ID
   * @param {object} filter - Die Filterkriterien
   * @returns {Promise<Array>} - Alle Konversationen, die den Filterkriterien entsprechen
   */
  async getAllConversations(websiteId, filter = {}) {
    try {
      let allConversations = [];
      let currentPage = 1;
      let hasMorePages = true;
      
      const pageSize = Math.min(filter.page_size || MAX_PAGE_SIZE, MAX_PAGE_SIZE);
      
      logAPIInfo(`🔍 Starte Konversationssuche für ${websiteId} mit Seitengröße ${pageSize}`);
      
      while (hasMorePages) {
        const result = await this.listConversations(websiteId, {
          ...filter,
          page: currentPage,
          page_size: pageSize
        });
        
        if (!result.data || result.data.length === 0) {
          hasMorePages = false;
        } else {
          allConversations = allConversations.concat(result.data);
          currentPage++;
          
          // Kurze Pause zwischen Anfragen, um API-Limits zu respektieren
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      logAPIInfo(`📊 Insgesamt ${allConversations.length} Konversationen in ${currentPage - 1} Seiten gefunden`);
      
      return allConversations;
    } catch (error) {
      logAPIError(`❌ Fehler beim Laden aller Konversationen: ${error.message}`);
      return [];
    }
  }

  /**
   * Löscht eine Konversation
   * @param {string} websiteId - Die Website-ID
   * @param {string} sessionId - Die Session-ID der Konversation
   * @returns {Promise<boolean>} - Erfolgsstatus
   */
  async deleteConversation(websiteId, sessionId) {
    try {
      await this.handleRateLimiting(() => 
        this.api.delete(`website/${websiteId}/conversation/${sessionId}`)
      );
      
      logAPIInfo(`🗑️ Konversation ${sessionId} gelöscht`);
      
      // Logge Löschung im regulären Log
      log(`Konversation ${sessionId} von Website ${websiteId} gelöscht`);
      
      return true;
    } catch (error) {
      logAPIError(`❌ Fehler beim Löschen der Konversation ${sessionId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Löscht bestimmte Segmente aus einer Konversation
   * @param {string} websiteId - Die Website-ID
   * @param {string} sessionId - Die Session-ID der Konversation
   * @param {string[]} segmentIds - Die IDs der zu löschenden Segmente
   * @returns {Promise<number>} - Anzahl der gelöschten Segmente
   */
  async deleteSegments(websiteId, sessionId, segmentIds) {
    try {
      let deleted = 0;
      
      logAPIInfo(`🗑️ Starte Löschung von ${segmentIds.length} Segmenten aus Konversation ${sessionId}`);
      
      for (const segmentId of segmentIds) {
        try {
          await this.handleRateLimiting(() => 
            this.api.delete(`website/${websiteId}/conversation/${sessionId}/message/${segmentId}`)
          );
          
          deleted++;
          
          // Logge nur alle 5 Segmente oder bei Fehlern
          if (deleted % 5 === 0) {
            logAPIDebug(`🗑️ ${deleted}/${segmentIds.length} Segmente gelöscht`);
          }
        } catch (segmentError) {
          logAPIWarn(`⚠️ Segment ${segmentId} konnte nicht gelöscht werden: ${segmentError.message}`);
        }
      }
      
      // Logge Löschung im regulären Log
      if (deleted > 0) {
        log(`${deleted} Segmente aus Konversation ${sessionId} von Website ${websiteId} gelöscht`);
        logAPIInfo(`✅ Segment-Löschung abgeschlossen: ${deleted}/${segmentIds.length} erfolgreich`);
      }
      
      return deleted;
    } catch (error) {
      logAPIError(`❌ Fehler beim Löschen von Segmenten: ${error.message}`);
      return 0;
    }
  }

  /**
   * Ändert den Status einer Konversation
   * @param {string} websiteId - Die Website-ID
   * @param {string} sessionId - Die Session-ID der Konversation
   * @param {string} newStatus - Der neue Status ('pending', 'resolved', etc.)
   * @returns {Promise<boolean>} - Erfolgsstatus
   */
  async changeConversationStatus(websiteId, sessionId, newStatus) {
    try {
      const validStatuses = ["pending", "unresolved", "resolved", "closed"];
      
      if (!validStatuses.includes(newStatus)) {
        logAPIWarn(`⚠️ Ungültiger Status: ${newStatus}. Erlaubte Werte: ${validStatuses.join(", ")}`);
        return false;
      }
      
      await this.handleRateLimiting(() => 
        this.api.patch(`website/${websiteId}/conversation/${sessionId}/meta`, {
          status: newStatus
        })
      );
      
      logAPIInfo(`🔄 Status der Konversation ${sessionId} auf '${newStatus}' geändert`);
      
      return true;
    } catch (error) {
      logAPIError(`❌ Fehler beim Ändern des Konversationsstatus: ${error.message}`);
      return false;
    }
  }

  /**
   * Prüft, ob ein bestimmtes Segment einen gegebenen Text enthält
   * @param {string} websiteId - Die Website-ID
   * @param {string} sessionId - Die Session-ID der Konversation
   * @param {string} contentPattern - Das zu suchende Textmuster
   * @returns {Promise<boolean>} - true, wenn ein passendes Segment gefunden wurde
   */
  async hasSegmentWithContent(websiteId, sessionId, contentPattern) {
    try {
      const conversation = await this.getConversation(websiteId, sessionId);
      
      if (!conversation || !conversation.data || !conversation.data.messages) {
        return false;
      }
      
      // Suche nach Segmenten, die das Muster enthalten
      return conversation.data.messages.some(message => 
        message.content && message.content.includes(contentPattern)
      );
    } catch (error) {
      logAPIError(`❌ Fehler bei der Segment-Suche: ${error.message}`);
      return false;
    }
  }

  /**
   * Filtert Konversationen nach mehreren Kriterien
   * @param {string} websiteId - Die Website-ID
   * @param {object} criteria - Die Filterkriterien
   * @returns {Promise<Array>} - Gefilterte Konversationen
   */
  async filterConversations(websiteId, criteria) {
    try {
      // Basis-Filter für die Crisp-API
      const apiFilter = {};
      
      // Status-Filter (closed, pending, unresolved)
      if (criteria.status) {
        apiFilter.status = criteria.status;
      }
      
      logAPIInfo(`🎯 Starte Konversationsfilterung für Website ${websiteId}`);
      
      // Laden aller Konversationen mit dem Basis-Filter
      let conversations = await this.getAllConversations(websiteId, apiFilter);
      
      logAPIDebug(`👀 Anwenden von erweiterten Filtern auf ${conversations.length} Konversationen`);
      
      // Jetzt filtern wir manuell nach den anderen Kriterien
      
      // Nach Alter filtern
      if (criteria.maxDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - criteria.maxDays);
        const cutoffTimestamp = cutoffDate.getTime();
        
        conversations = conversations.filter(convo => {
          const lastActive = convo.updated || convo.created || 0;
          return lastActive < cutoffTimestamp;
        });
      }
      
      // Nach Plattform filtern
      if (criteria.platforms && criteria.platforms.length > 0) {
        // Nur filtern, wenn nicht "alle" Plattformen ausgewählt sind
        const allPlatformsSelected = criteria.platforms.includes("alle");
        
        if (!allPlatformsSelected) {
          conversations = conversations.filter(convo => {
            // Hole den Plattform-Ursprung aus den Metadaten
            const origin = convo.meta && convo.meta.origin;
            // Prüfe, ob die Plattform in den gewünschten Plattformen enthalten ist
            return origin && criteria.platforms.includes(origin);
          });
        }
      }
      
      // Weitere Filter würden hier implementiert...
      
      logAPIInfo(`🎯 ${conversations.length} Konversationen nach Filterung übrig`);
      
      return conversations;
    } catch (error) {
      logAPIError(`❌ Fehler beim Filtern der Konversationen: ${error.message}`);
      return [];
    }
  }

  /**
   * Löscht mehrere Konversationen in einem effizienten Durchlauf
   * @param {string} websiteId - Die Website-ID
   * @param {string[]} sessionIds - Liste von Session-IDs
   * @param {Function} progressCallback - Callback für Fortschrittsanzeige
   * @returns {Promise<object>} - Ergebnis mit Erfolgs- und Fehlerzählung
   */
  async bulkDeleteConversations(websiteId, sessionIds, progressCallback = null) {
    const result = {
      total: sessionIds.length,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    logAPIInfo(`🗑️ Starte Bulk-Löschung von ${sessionIds.length} Konversationen`);
    
    for (let i = 0; i < sessionIds.length; i++) {
      const sessionId = sessionIds[i];
      
      try {
        const success = await this.deleteConversation(websiteId, sessionId);
        
        if (success) {
          result.successful++;
        } else {
          result.failed++;
          result.errors.push({
            sessionId,
            error: "Unbekannter Fehler"
          });
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          sessionId,
          error: error.message
        });
      }
      
      // Aktualisiere den Fortschritt, falls ein Callback bereitgestellt wurde
      if (progressCallback && typeof progressCallback === "function") {
        progressCallback({
          current: i + 1,
          total: sessionIds.length,
          percent: Math.round(((i + 1) / sessionIds.length) * 100)
        });
      }
      
      // Logge Fortschritt alle 10 Konversationen
      if ((i + 1) % 10 === 0) {
        logAPIDebug(`⏳ Löschfortschritt: ${i + 1}/${sessionIds.length} (${Math.round(((i + 1) / sessionIds.length) * 100)}%)`);
      }
      
      // Pause zwischen den Anfragen, um Rate-Limiting zu vermeiden
      if (i < sessionIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logAPIInfo(`✅ Bulk-Löschung abgeschlossen: ${result.successful} erfolgreich, ${result.failed} fehlgeschlagen`);
    
    // Logge das Ergebnis
    log(`Bulk-Löschung für Website ${websiteId}: ${result.successful} von ${result.total} Konversationen gelöscht`);
    
    return result;
  }

  /**
   * Simuliert Löschoperationen ohne tatsächliche Änderungen
   * @param {string} websiteId - Die Website-ID
   * @param {object} filter - Filterkriterien
   * @returns {Promise<object>} - Ergebnis mit Anzahl und Details der Konversationen
   */
  async simulateCleanup(websiteId, filter) {
    try {
      logAPIInfo(`🧪 Starte Löschsimulation für Website ${websiteId}`);
      
      const conversations = await this.filterConversations(websiteId, filter);
      
      logAPIInfo(`🧪 Löschsimulation: ${conversations.length} Konversationen würden gelöscht werden`);
      
      // Erstelle ein Ergebnisobjekt mit Details
      const result = {
        count: conversations.length,
        conversations: conversations.map(convo => ({
          id: convo.session_id,
          created: new Date(convo.created || 0).toISOString(),
          updated: new Date(convo.updated || 0).toISOString(),
          status: convo.status || "unknown",
          preview: convo.preview || "(keine Vorschau verfügbar)"
        }))
      };
      
      return result;
    } catch (error) {
      logAPIError(`❌ Fehler bei der Löschsimulation: ${error.message}`);
      return { count: 0, conversations: [], error: error.message };
    }
  }

  /**
   * Lädt Metadaten einer Konversation
   * @param {string} websiteId - Die Website-ID
   * @param {string} sessionId - Die Session-ID
   * @returns {Promise<object|null>} - Die Metadaten oder null bei Fehler
   */
  async getConversationMetadata(websiteId, sessionId) {
    try {
      const response = await this.handleRateLimiting(() => 
        this.api.get(`website/${websiteId}/conversation/${sessionId}/meta`)
      );
      
      return response.data;
    } catch (error) {
      logAPIError(`❌ Fehler beim Laden der Konversationsmetadaten: ${error.message}`);
      return null;
    }
  }

  /**
   * Lädt Informationen über verfügbare Mailboxes für eine Website
   * @param {string} websiteId - Die Website-ID
   * @returns {Promise<object>} - Die Mailbox-Daten
   */
  async getMailboxes(websiteId) {
    try {
      const response = await this.handleRateLimiting(() => 
        this.api.get(`website/${websiteId}/mailboxes`)
      );
      
      return response.data;
    } catch (error) {
      logAPIError(`❌ Fehler beim Laden der Mailboxes: ${error.message}`);
      return { data: [], error: error.message };
    }
  }

  /**
   * Lädt aktivierte Plugins für eine Website
   * @param {string} websiteId - Die Website-ID
   * @returns {Promise<Array>} - Liste der aktivierten Plugins
   */
  async getWebsitePlugins(websiteId) {
    try {
      const response = await this.handleRateLimiting(() => 
        this.api.get(`website/${websiteId}/plugins/list`)
      );
      
      return response.data.data || [];
    } catch (error) {
      logAPIError(`❌ Fehler beim Laden der Website-Plugins: ${error.message}`);
      return [];
    }
  }

  /**
   * Gibt Session-Statistiken für Monitoring zurück
   * @returns {Object} - Aktuelle Session-Statistiken
   */
  getSessionStats() {
    return {
      ...this.sessionStats,
      uptime: Date.now() - this.sessionStats.startTime,
      errorRate: this.sessionStats.requestCount > 0 ? 
        (this.sessionStats.errorCount / this.sessionStats.requestCount * 100).toFixed(2) + '%' : '0%'
    };
  }
}

// Exportiere eine einzelne Instanz des Clients
module.exports = new CrispClient();