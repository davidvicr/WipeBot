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
const { logDebug } = require("../utils/debugLogger");
const { log } = require("../utils/logger");

// Konstanten für HTTP-Status-Codes und Konfiguration
const HTTP_TOO_MANY_REQUESTS = 429;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 Sekunde
const MAX_PAGE_SIZE = 100;

class CrispClient {
constructor() {
  // Initialisiere den offiziellen Crisp Node.js Client
  this.client = new Crisp();
  
  // API-Authentifizierung mit den Umgebungsvariablen
  this.client.authenticateTier("plugin", {
    identifier: process.env.CRISP_API_IDENTIFIER,
    key: process.env.CRISP_API_KEY,
    version: "1"
  });
  
  this.DEBUG_MODE = process.env.DEBUG_MODE === "true";
  
  // Axios-Instance für direkte API-Aufrufe mit mehr Kontrolle
  this.api = axios.create({
    baseURL: "https://api.crisp.chat/v1/",
    headers: {
      "X-Crisp-Tier": "plugin",
      "X-Crisp-API-Identifier": process.env.CRISP_API_IDENTIFIER,
      "X-Crisp-API-Key": process.env.CRISP_API_KEY,
      "Content-Type": "application/json"
    },
    timeout: 10000 // 10 Sekunden Timeout für API-Anfragen
  });
  
  // Request-Interceptor für Debugging
  this.api.interceptors.request.use(config => {
    if (this.DEBUG_MODE) {
      logDebug(`🔄 API-Anfrage: ${config.method.toUpperCase()} ${config.url}`);
      // Zusätzliches Debug-Logging für Headers
      logDebug(`🔑 Authentifizierungs-Headers: X-Crisp-API-Identifier=${process.env.CRISP_API_IDENTIFIER.substring(0, 5)}..., X-Crisp-API-Key=${process.env.CRISP_API_KEY.substring(0, 5)}...`);
    }
    return config;
  });
  
  // Response-Interceptor für Fehlerhandling
  this.api.interceptors.response.use(
    response => response,
    error => {
      if (this.DEBUG_MODE) {
        const status = error.response ? error.response.status : 'unbekannt';
        logDebug(`❌ API-Fehler: ${status} bei ${error.config.url}`);
        if (error.response && error.response.data) {
          logDebug(`📝 API-Fehler-Details: ${JSON.stringify(error.response.data)}`);
        }
      }
      return Promise.reject(error);
    }
  );
  
  if (this.DEBUG_MODE) {
    logDebug("🔌 Crisp API Client initialisiert");
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
        
        if (this.DEBUG_MODE) {
          logDebug(`⏱️ Rate-Limit erreicht. Warte ${retryDelay}ms vor Retry #${retryCount + 1}`);
        }
        
        // Warte exponentiell länger zwischen den Versuchen
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        // Rekursiver Aufruf mit erhöhtem Retry-Zähler
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
        origin: "plugin",
        content: message.content
      };
      
      if (this.DEBUG_MODE) {
        logDebug(`📤 Sende Nachricht an ${sessionId}: ${message.content}`);
      }
      
      await this.handleRateLimiting(() => 
        this.api.post(endpoint, payload)
      );
      
      return true;
    } catch (error) {
      logDebug(`❌ Fehler beim Senden der Nachricht: ${error.message}`);
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
      logDebug(`❌ Fehler beim Laden der Konversation ${sessionId}: ${error.message}`);
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
      
      if (this.DEBUG_MODE) {
        logDebug(`🔍 Suche Konversationen für ${websiteId} mit Filter: ${JSON.stringify(params)}`);
      }
      
      const response = await this.handleRateLimiting(() => 
        this.api.get(`website/${websiteId}/conversations`, { params })
      );
      
      return response.data;
    } catch (error) {
      logDebug(`❌ Fehler beim Auflisten der Konversationen: ${error.message}`);
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
      
      if (this.DEBUG_MODE) {
        logDebug(`📊 Insgesamt ${allConversations.length} Konversationen gefunden`);
      }
      
      return allConversations;
    } catch (error) {
      logDebug(`❌ Fehler beim Laden aller Konversationen: ${error.message}`);
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
      
      if (this.DEBUG_MODE) {
        logDebug(`🗑️ Konversation ${sessionId} gelöscht`);
      }
      
      // Logge Löschung im regulären Log
      log(`Konversation ${sessionId} von Website ${websiteId} gelöscht`);
      
      return true;
    } catch (error) {
      logDebug(`❌ Fehler beim Löschen der Konversation ${sessionId}: ${error.message}`);
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
      
      for (const segmentId of segmentIds) {
        try {
          await this.handleRateLimiting(() => 
            this.api.delete(`website/${websiteId}/conversation/${sessionId}/message/${segmentId}`)
          );
          
          deleted++;
          
          if (this.DEBUG_MODE) {
            logDebug(`🗑️ Segment ${segmentId} aus Konversation ${sessionId} gelöscht`);
          }
        } catch (segmentError) {
          logDebug(`⚠️ Segment ${segmentId} konnte nicht gelöscht werden: ${segmentError.message}`);
        }
      }
      
      // Logge Löschung im regulären Log
      if (deleted > 0) {
        log(`${deleted} Segmente aus Konversation ${sessionId} von Website ${websiteId} gelöscht`);
      }
      
      return deleted;
    } catch (error) {
      logDebug(`❌ Fehler beim Löschen von Segmenten: ${error.message}`);
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
        logDebug(`⚠️ Ungültiger Status: ${newStatus}. Erlaubte Werte: ${validStatuses.join(", ")}`);
        return false;
      }
      
      await this.handleRateLimiting(() => 
        this.api.patch(`website/${websiteId}/conversation/${sessionId}/meta`, {
          status: newStatus
        })
      );
      
      if (this.DEBUG_MODE) {
        logDebug(`🔄 Status der Konversation ${sessionId} auf '${newStatus}' geändert`);
      }
      
      return true;
    } catch (error) {
      logDebug(`❌ Fehler beim Ändern des Konversationsstatus: ${error.message}`);
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
      logDebug(`❌ Fehler bei der Segment-Suche: ${error.message}`);
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
      
      // Laden aller Konversationen mit dem Basis-Filter
      let conversations = await this.getAllConversations(websiteId, apiFilter);
      
      if (this.DEBUG_MODE) {
        logDebug(`👀 Anwenden von erweiterten Filtern auf ${conversations.length} Konversationen`);
      }
      
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
      
      if (this.DEBUG_MODE) {
        logDebug(`🎯 ${conversations.length} Konversationen nach Filterung übrig`);
      }
      
      return conversations;
    } catch (error) {
      logDebug(`❌ Fehler beim Filtern der Konversationen: ${error.message}`);
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
    
    if (this.DEBUG_MODE) {
      logDebug(`🗑️ Starte Bulk-Löschung von ${sessionIds.length} Konversationen`);
    }
    
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
      
      // Pause zwischen den Anfragen, um Rate-Limiting zu vermeiden
      if (i < sessionIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    if (this.DEBUG_MODE) {
      logDebug(`✅ Bulk-Löschung abgeschlossen: ${result.successful} erfolgreich, ${result.failed} fehlgeschlagen`);
    }
    
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
      const conversations = await this.filterConversations(websiteId, filter);
      
      if (this.DEBUG_MODE) {
        logDebug(`🧪 Löschsimulation: ${conversations.length} Konversationen würden gelöscht werden`);
      }
      
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
      logDebug(`❌ Fehler bei der Löschsimulation: ${error.message}`);
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
      logDebug(`❌ Fehler beim Laden der Konversationsmetadaten: ${error.message}`);
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
      logDebug(`❌ Fehler beim Laden der Mailboxes: ${error.message}`);
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
      logDebug(`❌ Fehler beim Laden der Website-Plugins: ${error.message}`);
      return [];
    }
  }
}

module.exports = new CrispClient();