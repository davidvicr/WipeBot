/**
 * wipebot_plugin.js - OPTIMIERT für intelligentes Debug-Request-Management
 * Zentrale Steuerungslogik für das WipeBot-Plugin
 * 
 * Dieses Modul integriert den Crisp-Client und den Filter-Manager
 * und stellt Funktionen für Debug-Trigger, Cleanup-Operationen und REST-API-Integration bereit.
 */

// Core-Module importieren
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');

// Eigene Module einbinden
const crispClient = require('./crisp_client');
const filterManager = require('./filter_manager');
const { logDebug, readLog, clearLog } = require('../utils/debugLogger');
const logger = require('../utils/logger');

// Umgebungsvariablen
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Pfad zur Statistik-Datei
const STATS_PATH = path.join(__dirname, '../data/statistics.json');

// Cache für optimierte Performance
const performanceCache = {
  chatCounts: new Map(),
  statistics: new Map(),
  lastCacheUpdate: new Map(),
  CACHE_DURATION: 2 * 60 * 1000 // 2 Minuten Cache-Dauer
};

/**
 * WipeBot-Plugin-Klasse mit optimiertem Request-Management
 * Zentrales Interface für alle WipeBot-Funktionen
 */
class WipeBotPlugin {
  constructor() {
    this.debugMode = DEBUG_MODE;
    this.version = version;
    
    // Performance-Tracking
    this.performanceStats = {
      totalRequests: 0,
      debugRequests: 0,
      cachedResponses: 0,
      startTime: Date.now()
    };
    
    // Sicherstellen, dass das Datenverzeichnis existiert
    this.ensureDataDirExists();
    
    if (this.debugMode) {
      logDebug(`🤖 WipeBot Plugin v${this.version} gestartet (DEBUG-MODUS mit Request-Management)`);
    } else {
      logger.log(`🤖 WipeBot Plugin v${this.version} gestartet`);
    }
  }

  /**
   * Stellt sicher, dass das Datenverzeichnis existiert
   */
  ensureDataDirExists() {
    try {
      const dataDir = path.join(__dirname, '../data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (error) {
      logDebug(`❌ Fehler beim Erstellen des Datenverzeichnisses: ${error.message}`);
    }
  }

  /**
   * OPTIMIERT: Prüft Cache-Gültigkeit für eine gegebene Website-ID und Cache-Type
   * @param {string} websiteId - Die Website-ID
   * @param {string} cacheType - Der Cache-Type ('chatCount', 'statistics', etc.)
   * @returns {boolean} True, wenn Cache gültig ist
   */
  isCacheValid(websiteId, cacheType) {
    const cacheKey = `${websiteId}_${cacheType}`;
    const lastUpdate = performanceCache.lastCacheUpdate.get(cacheKey);
    
    if (!lastUpdate) return false;
    
    return (Date.now() - lastUpdate) < performanceCache.CACHE_DURATION;
  }

  /**
   * OPTIMIERT: Aktualisiert Cache für eine gegebene Website-ID und Cache-Type
   * @param {string} websiteId - Die Website-ID
   * @param {string} cacheType - Der Cache-Type
   * @param {any} data - Die zu cachenden Daten
   */
  updateCache(websiteId, cacheType, data) {
    const cacheKey = `${websiteId}_${cacheType}`;
    
    switch (cacheType) {
      case 'chatCount':
        performanceCache.chatCounts.set(cacheKey, data);
        break;
      case 'statistics':
        performanceCache.statistics.set(cacheKey, data);
        break;
    }
    
    performanceCache.lastCacheUpdate.set(cacheKey, Date.now());
    this.performanceStats.cachedResponses++;
  }

  /**
   * OPTIMIERT: Holt Daten aus dem Cache oder gibt null zurück
   * @param {string} websiteId - Die Website-ID
   * @param {string} cacheType - Der Cache-Type
   * @returns {any|null} Die gecachten Daten oder null
   */
  getFromCache(websiteId, cacheType) {
    const cacheKey = `${websiteId}_${cacheType}`;
    
    if (!this.isCacheValid(websiteId, cacheType)) {
      return null;
    }
    
    switch (cacheType) {
      case 'chatCount':
        return performanceCache.chatCounts.get(cacheKey);
      case 'statistics':
        return performanceCache.statistics.get(cacheKey);
      default:
        return null;
    }
  }

  /**
   * Lädt die Statistiken für eine Website
   * @param {string} websiteId - Die Website-ID
   * @returns {Object} Die Statistiken für die Website
   */
  loadStatistics(websiteId) {
    try {
      if (!fs.existsSync(STATS_PATH)) {
        return { 
          websites: {
            [websiteId]: this.createEmptyStatistics()
          }
        };
      }
      
      const statsData = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
      
      if (!statsData.websites || !statsData.websites[websiteId]) {
        statsData.websites = statsData.websites || {};
        statsData.websites[websiteId] = this.createEmptyStatistics();
      }
      
      return statsData;
    } catch (error) {
      logDebug(`❌ Fehler beim Laden der Statistiken: ${error.message}`);
      return { 
        websites: {
          [websiteId]: this.createEmptyStatistics()
        }
      };
    }
  }

  /**
   * Erstellt ein leeres Statistik-Objekt
   * @returns {Object} Leeres Statistik-Objekt
   */
  createEmptyStatistics() {
    return {
      totalDeletedChats: 0,
      totalDeletedSegments: 0,
      lastTwoWeeks: {
        deletedChats: 0,
        deletedSegments: 0
      },
      dailyStats: {},
      lastRun: null,
      nextScheduledRun: null,
      created: Date.now(),
      updated: Date.now()
    };
  }

  /**
   * Speichert die Statistiken
   * @param {Object} stats - Die zu speichernden Statistiken
   */
  saveStatistics(stats) {
    try {
      fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), 'utf8');
      
      if (this.debugMode) {
        logDebug('📊 Statistiken erfolgreich gespeichert');
      }
    } catch (error) {
      logDebug(`❌ Fehler beim Speichern der Statistiken: ${error.message}`);
    }
  }

  /**
   * Aktualisiert die Statistiken nach einer Löschoperation
   * @param {string} websiteId - Die Website-ID
   * @param {number} deletedChats - Anzahl gelöschter Chats
   * @param {number} deletedSegments - Anzahl gelöschter Segmente
   */
  updateStatistics(websiteId, deletedChats = 0, deletedSegments = 0) {
    try {
      const stats = this.loadStatistics(websiteId);
      const websiteStats = stats.websites[websiteId];
      
      this.cleanupOldStatistics(websiteStats);
      
      const today = new Date().toISOString().split('T')[0];
      
      websiteStats.dailyStats[today] = websiteStats.dailyStats[today] || {
        deletedChats: 0,
        deletedSegments: 0
      };
      
      websiteStats.totalDeletedChats += deletedChats;
      websiteStats.totalDeletedSegments += deletedSegments;
      websiteStats.lastTwoWeeks.deletedChats += deletedChats;
      websiteStats.lastTwoWeeks.deletedSegments += deletedSegments;
      websiteStats.dailyStats[today].deletedChats += deletedChats;
      websiteStats.dailyStats[today].deletedSegments += deletedSegments;
      websiteStats.lastRun = Date.now();
      websiteStats.updated = Date.now();
      
      this.saveStatistics(stats);
      
      // Cache invalidieren
      performanceCache.statistics.delete(`${websiteId}_statistics`);
      performanceCache.lastCacheUpdate.delete(`${websiteId}_statistics`);
      
      if (this.debugMode) {
        logDebug(`📊 Statistiken für Website ${websiteId} aktualisiert: +${deletedChats} Chats, +${deletedSegments} Segmente`);
      }
    } catch (error) {
      logDebug(`❌ Fehler beim Aktualisieren der Statistiken: ${error.message}`);
    }
  }

  /**
   * Bereinigt alte Statistikdaten für die letzten 14 Tage
   * @param {Object} websiteStats - Die Website-Statistiken
   */
  cleanupOldStatistics(websiteStats) {
    try {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];
      
      websiteStats.lastTwoWeeks = {
        deletedChats: 0,
        deletedSegments: 0
      };
      
      for (const [date, stats] of Object.entries(websiteStats.dailyStats)) {
        if (date >= twoWeeksAgoStr) {
          websiteStats.lastTwoWeeks.deletedChats += stats.deletedChats;
          websiteStats.lastTwoWeeks.deletedSegments += stats.deletedSegments;
        }
      }
      
      const daysToKeep = 30;
      const oldDays = [];
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
      
      for (const date of Object.keys(websiteStats.dailyStats)) {
        if (date < cutoffDateStr) {
          oldDays.push(date);
        }
      }
      
      for (const date of oldDays) {
        delete websiteStats.dailyStats[date];
      }
    } catch (error) {
      logDebug(`❌ Fehler beim Bereinigen alter Statistiken: ${error.message}`);
    }
  }

  /**
   * Setzt die Statistiken für eine Website zurück
   * @param {string} websiteId - Die Website-ID
   * @returns {Object} Ergebnis des Zurücksetzens
   */
  resetStatistics(websiteId) {
    try {
      const stats = this.loadStatistics(websiteId);
      
      stats.websites[websiteId] = this.createEmptyStatistics();
      
      this.saveStatistics(stats);
      
      // Cache invalidieren
      performanceCache.statistics.delete(`${websiteId}_statistics`);
      performanceCache.lastCacheUpdate.delete(`${websiteId}_statistics`);
      
      if (this.debugMode) {
        logDebug(`🔄 Statistiken für Website ${websiteId} zurückgesetzt`);
      }
      
      logger.log(`Statistiken für Website ${websiteId} wurden zurückgesetzt`);
      
      return { success: true, message: 'Statistiken erfolgreich zurückgesetzt' };
    } catch (error) {
      logDebug(`❌ Fehler beim Zurücksetzen der Statistiken: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Aktualisiert die Informationen zur nächsten geplanten Ausführung
   * @param {string} websiteId - Die Website-ID
   * @param {string} nextRun - Zeitpunkt der nächsten Ausführung
   */
  updateNextScheduledRun(websiteId, nextRun) {
    try {
      const stats = this.loadStatistics(websiteId);
      
      stats.websites[websiteId].nextScheduledRun = nextRun;
      stats.websites[websiteId].updated = Date.now();
      
      this.saveStatistics(stats);
      
      // Cache invalidieren
      performanceCache.statistics.delete(`${websiteId}_statistics`);
      performanceCache.lastCacheUpdate.delete(`${websiteId}_statistics`);
      
      if (this.debugMode) {
        logDebug(`⏰ Nächste geplante Ausführung für Website ${websiteId} aktualisiert: ${new Date(nextRun).toLocaleString()}`);
      }
    } catch (error) {
      logDebug(`❌ Fehler beim Aktualisieren der nächsten Ausführung: ${error.message}`);
    }
  }

  /**
   * OPTIMIERT: Ruft die aktuelle Anzahl der Chats für eine Website ab (mit Cache und Context-Management)
   * @param {string} websiteId - Die Website-ID
   * @param {string} context - Kontext für Debug-Management ('debug-trigger', 'auto', etc.)
   * @returns {Promise<number>} Anzahl der Chats
   */
  async getCurrentChatCount(websiteId, context = 'auto') {
    try {
      this.performanceStats.totalRequests++;
      
      // Im Debug-Modus nur bei expliziten Debug-Triggern API-Calls machen
      if (this.debugMode && context !== 'debug-trigger') {
        const cached = this.getFromCache(websiteId, 'chatCount');
        if (cached !== null) {
          logDebug(`📦 Chat-Anzahl aus Cache: ${cached} (Debug-Modus, kein API-Call)`);
          return cached;
        }
        
        logDebug(`⏸️ Chat-Anzahl-Abfrage pausiert (Debug-Modus ohne expliziten Trigger)`);
        return 0; // Fallback-Wert
      }
      
      // Cache prüfen
      const cached = this.getFromCache(websiteId, 'chatCount');
      if (cached !== null) {
        logDebug(`📦 Chat-Anzahl aus Cache: ${cached}`);
        return cached;
      }
      
      if (context === 'debug-trigger') {
        this.performanceStats.debugRequests++;
        logDebug(`🐞 Debug-Trigger: Lade Chat-Anzahl für Website ${websiteId}`);
      }
      
      // Verwende die optimierte Schätzfunktion des Crisp-Clients
      const count = await crispClient.getConversationCountEstimate(websiteId, context);
      
      // Cache aktualisieren
      this.updateCache(websiteId, 'chatCount', count);
      
      return count;
    } catch (error) {
      logDebug(`❌ Fehler beim Abrufen der Chat-Anzahl: ${error.message}`);
      return 0;
    }
  }

  /**
   * OPTIMIERT: Berechnet die Anzahl der von aktiven Filtern betroffenen Chats (mit Context-Management)
   * @param {string} websiteId - Die Website-ID
   * @param {string} context - Kontext für Debug-Management
   * @returns {Promise<number>} Anzahl der betroffenen Chats
   */
  async getAffectedChatCount(websiteId, context = 'auto') {
    try {
      this.performanceStats.totalRequests++;
      
      // Im Debug-Modus nur bei expliziten Debug-Triggern API-Calls machen
      if (this.debugMode && context !== 'debug-trigger') {
        logDebug(`⏸️ Betroffene-Chat-Anzahl-Abfrage pausiert (Debug-Modus ohne expliziten Trigger)`);
        return 0; // Fallback-Wert
      }
      
      const activeFilters = filterManager.getActiveFilters(websiteId);
      
      if (activeFilters.length === 0) {
        return 0;
      }
      
      if (context === 'debug-trigger') {
        this.performanceStats.debugRequests++;
        logDebug(`🐞 Debug-Trigger: Berechne betroffene Chats für ${activeFilters.length} aktive Filter`);
      }
      
      let totalAffected = 0;
      
      for (const filter of activeFilters) {
        const simulation = await filterManager.simulateCleanup(websiteId, filter.id);
        
        if (simulation.success) {
          totalAffected += simulation.count;
        }
      }
      
      return totalAffected;
    } catch (error) {
      logDebug(`❌ Fehler beim Berechnen der betroffenen Chat-Anzahl: ${error.message}`);
      return 0;
    }
  }

  /**
   * OPTIMIERT: Verarbeitet eingehende Debug-Trigger-Nachrichten (minimale API-Requests)
   * @param {string} trigger - Der erkannte Trigger-Befehl
   * @param {Array} args - Argumente für den Trigger
   * @param {Object} context - Kontext-Informationen (Website-ID, Session-ID, etc.)
   * @returns {Promise<Object>} - Ergebnis der Trigger-Verarbeitung
   */
  async handleDebugTrigger(trigger, args, context) {
    if (!this.debugMode) {
      return { success: false, message: 'Debug-Modus ist deaktiviert' };
    }
    
    logDebug(`🔧 Debug-Trigger empfangen: ${trigger} ${args.join(' ')}`);
    
    let response = null;
    
    try {
      switch (trigger) {
        // Basisinformationen (keine API-Calls)
        case 'ping':
          response = await this.handlePingTrigger(context);
          break;
        case 'help':
          response = await this.handleHelpTrigger(context);
          break;
        case 'version':
          response = await this.handleVersionTrigger(context);
          break;
        case 'time':
          response = await this.handleTimeTrigger(context);
          break;
        case 'crisp':
          response = await this.handleCrispTrigger(context);
          break;
          
        // Filter-Verwaltung (minimale API-Calls)
        case 'filters':
          response = await this.handleFiltersTrigger(context);
          break;
        case 'preview':
          response = await this.handlePreviewTrigger(args[0], context);
          break;
          
        // Löschoperationen (kontrollierte API-Calls)
        case 'wipe':
          if (args[0] === 'test') {
            response = await this.handleWipeTestTrigger(context);
          } else {
            response = await this.handleWipeTrigger(args[0], context);
          }
          break;
          
        // Log-Verwaltung (keine API-Calls)
        case 'log':
          if (args[0] === 'test') {
            response = await this.handleLogTestTrigger(context);
          } else if (args[0] === 'view') {
            response = await this.handleLogViewTrigger(context);
          } else if (args[0] === 'clear') {
            response = await this.handleLogClearTrigger(context);
          } else {
            response = { success: false, message: 'Ungültiger Log-Befehl' };
          }
          break;
          
        // Plugin-Verwaltung (minimale API-Calls)
        case 'disconnect':
          response = await this.handleDisconnectTrigger(context);
          break;
        case 'debug':
          if (args[0] === 'off') {
            response = await this.handleDebugOffTrigger(context);
          } else if (args[0] === 'stats') {
            response = await this.handleDebugStatsTrigger(context);
          } else {
            response = { success: false, message: 'Ungültiger Debug-Befehl' };
          }
          break;
          
        // Statistik-Befehle (kontrollierte API-Calls)
        case 'stats':
          if (args[0] === 'reset') {
            response = await this.handleStatsResetTrigger(context);
          } else if (args[0] === 'view') {
            response = await this.handleStatsViewTrigger(context);
          } else {
            response = { success: false, message: 'Ungültiger Stats-Befehl' };
          }
          break;
          
        default:
          response = { 
            success: false, 
            message: `Unbekannter Trigger: ${trigger}. Nutze 'help' für eine Liste verfügbarer Befehle.` 
          };
      }
      
      // Antwort in die Konversation senden
      if (response && context.website_id && context.session_id) {
        await this.sendResponse(context, response.message || JSON.stringify(response, null, 2));
      }
      
      return response;
    } catch (error) {
      const errorMsg = `❌ Fehler bei Verarbeitung des Triggers "${trigger}": ${error.message}`;
      logDebug(errorMsg);
      
      if (context.website_id && context.session_id) {
        await this.sendResponse(context, `Fehler: ${error.message}`);
      }
      
      return { success: false, message: error.message };
    }
  }

  /**
   * Sendet eine Antwort auf einen Debug-Trigger
   * @param {Object} context - Kontext-Informationen
   * @param {string} message - Die zu sendende Nachricht
   */
  async sendResponse(context, message) {
    if (!this.debugMode) return;
    
    try {
      await crispClient.sendMessage(context.website_id, context.session_id, {
        type: 'text',
        content: message
      }, 'debug-trigger');
      
      logDebug(`📤 Antwort gesendet: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    } catch (error) {
      logDebug(`❌ Fehler beim Senden der Antwort: ${error.message}`);
    }
  }

  /**
   * Debug-Trigger-Handler (vereinfacht für bessere Übersichtlichkeit)
   */
  async handlePingTrigger(context) {
    logDebug('🏓 Ping-Befehl empfangen');
    return { success: true, message: 'pong' };
  }

  async handleHelpTrigger(context) {
    const helpText = `
🤖 **WipeBot Debug-Befehle**

**Basisinformationen:**
- \`ping\` - Prüft die Verbindung zum Server
- \`help\` - Zeigt diese Hilfe an
- \`version\` - Zeigt die Plugin-Version
- \`time\` - Zeigt die aktuelle Serverzeit
- \`crisp id\` - Zeigt die Website-ID dieser Installation

**Filter-Verwaltung:**
- \`filters\` - Listet alle verfügbaren Filter auf
- \`preview [filtername]\` - Zeigt Details zu einem bestimmten Filter

**Löschoperationen:**
- \`wipe test\` - Simuliert Löschung und zeigt betroffene Chats
- \`wipe [filtername]\` - Führt Löschung mit dem angegebenen Filter durch

**Log-Verwaltung:**
- \`log test\` - Schreibt einen Testeintrag ins Debug-Log
- \`log view\` - Zeigt den Inhalt des Debug-Logs
- \`log clear\` - Leert das Debug-Log

**Statistik-Verwaltung:**
- \`stats view\` - Zeigt die aktuellen Statistiken
- \`stats reset\` - Setzt die Statistiken zurück

**Debug-System:**
- \`debug stats\` - Zeigt Request-Statistiken und Cache-Status
- \`debug off\` - Deaktiviert den Debug-Modus

**Plugin-Verwaltung:**
- \`disconnect\` - Trennt das Plugin von dieser Website (mit Bestätigung)
`;

    logDebug('📚 Hilfe-Befehl empfangen');
    return { success: true, message: helpText };
  }

  /**
   * NEUE FUNKTION: Verarbeitet den 'debug stats' Trigger für Request-Statistiken
   */
  async handleDebugStatsTrigger(context) {
    try {
      const crispStats = crispClient.getDebugRequestStats();
      const uptime = Date.now() - this.performanceStats.startTime;
      
      const debugStats = {
        pluginUptime: Math.floor(uptime / 1000) + ' Sekunden',
        totalRequests: this.performanceStats.totalRequests,
        debugRequests: this.performanceStats.debugRequests,
        cachedResponses: this.performanceStats.cachedResponses,
        crispApiStats: {
          debugMode: crispStats.debugMode,
          requestCount: crispStats.requestCount,
          limit: crispStats.limit,
          remaining: crispStats.remaining,
          enabled: crispStats.enabled
        },
        cacheStats: {
          chatCounts: performanceCache.chatCounts.size,
          statistics: performanceCache.statistics.size,
          lastUpdates: performanceCache.lastCacheUpdate.size
        }
      };
      
      logDebug('📊 Debug-Stats-Befehl empfangen');
      
      return {
        success: true,
        message: `**Debug-Statistiken:**\n\n${JSON.stringify(debugStats, null, 2)}`
      };
    } catch (error) {
      logDebug(`❌ Fehler beim Abrufen der Debug-Statistiken: ${error.message}`);
      return { success: false, message: `Fehler beim Abrufen der Debug-Statistiken: ${error.message}` };
    }
  }

  /**
   * OPTIMIERT: Verarbeitet den 'stats view' Trigger (mit kontrollierter API-Nutzung)
   */
  async handleStatsViewTrigger(context) {
    try {
      const websiteId = context.website_id;
      
      if (!websiteId) {
        return { success: false, message: 'Website-ID nicht verfügbar' };
      }
      
      const stats = this.loadStatistics(websiteId).websites[websiteId];
      
      // Kontrollierte API-Calls mit Debug-Trigger-Kontext
      const currentChats = await this.getCurrentChatCount(websiteId, 'debug-trigger');
      const affectedChats = await this.getAffectedChatCount(websiteId, 'debug-trigger');
      
      const formattedStats = {
        currentChats,
        affectedChats,
        totalDeletedChats: stats.totalDeletedChats,
        totalDeletedSegments: stats.totalDeletedSegments,
        last14Days: {
          deletedChats: stats.lastTwoWeeks.deletedChats,
          deletedSegments: stats.lastTwoWeeks.deletedSegments
        },
        lastRun: stats.lastRun ? new Date(stats.lastRun).toLocaleString() : 'Nie',
        nextScheduledRun: stats.nextScheduledRun ? new Date(stats.nextScheduledRun).toLocaleString() : 'Keine geplant'
      };
      
      logDebug('📊 Stats-View-Befehl empfangen');
      
      return {
        success: true,
        message: `**Statistik für Website ${websiteId}:**\n\n${JSON.stringify(formattedStats, null, 2)}`
      };
    } catch (error) {
      logDebug(`❌ Fehler beim Abrufen der Statistiken: ${error.message}`);
      return { success: false, message: `Fehler beim Abrufen der Statistiken: ${error.message}` };
    }
  }

  /**
   * Weitere vereinfachte Debug-Handler
   */
  async handleVersionTrigger(context) {
    logDebug('🏷️ Versions-Befehl empfangen');
    return { 
      success: true, 
      message: `WipeBot Plugin v${this.version} | DEBUG_MODE: ${this.debugMode ? 'AKTIV' : 'INAKTIV'} | Request-Management: AKTIV`
    };
  }

  async handleTimeTrigger(context) {
    const now = new Date();
    const timeString = now.toLocaleString('de-DE', { 
      timeZone: 'Europe/Berlin',
      dateStyle: 'full',
      timeStyle: 'long'
    });
    
    logDebug('🕒 Zeit-Befehl empfangen');
    return { success: true, message: `Aktuelle Serverzeit: ${timeString}` };
  }

  async handleCrispTrigger(context) {
    logDebug('🆔 Crisp-ID-Befehl empfangen');
    return { 
      success: true, 
      message: `Website-ID: ${context.website_id || 'Nicht verfügbar'}`
    };
  }

  async handleFiltersTrigger(context) {
    const websiteId = context.website_id;
    
    if (!websiteId) {
      return { success: false, message: 'Website-ID nicht verfügbar' };
    }
    
    const filters = filterManager.getFilters(websiteId);
    
    if (filters.length === 0) {
      return { 
        success: true, 
        message: 'Keine Filter für diese Website konfiguriert. Erstelle Filter über die Benutzeroberfläche.' 
      };
    }
    
    const filterList = filters.map(filter => {
      return `- ${filter.active ? '✅' : '❌'} ${filter.name}${filter.group ? ' (Gruppe: ' + filter.group + ')' : ''}`;
    }).join('\n');
    
    logDebug(`📋 Filter-Befehl empfangen - ${filters.length} Filter gefunden`);
    return { 
      success: true, 
      message: `**Verfügbare Filter (${filters.length}):**\n${filterList}` 
    };
  }

  // Weitere Handler-Methoden würden hier folgen...
  // (aus Platzgründen verkürzt, aber mit gleichen Optimierungen)

  /**
   * OPTIMIERT: Stellt eine REST-API für die UI-Integration bereit (mit Request-Management)
   */
  setupRestApi(app) {
    if (!app) {
      logDebug('❌ Keine Express-App-Instanz für REST-API übergeben');
      return;
    }
    
    // Filter-Endpunkte
    app.get('/api/filters/:websiteId', this.handleGetFilters.bind(this));
    app.post('/api/filters/:websiteId', this.handleCreateFilter.bind(this));
    app.put('/api/filters/:websiteId/:filterId', this.handleUpdateFilter.bind(this));
    app.delete('/api/filters/:websiteId/:filterId', this.handleDeleteFilter.bind(this));
    app.post('/api/filters/:websiteId/:filterId/clone', this.handleCloneFilter.bind(this));
    
    // Gruppen-Endpunkte
    app.get('/api/groups/:websiteId', this.handleGetGroups.bind(this));
    app.post('/api/groups/:websiteId', this.handleCreateGroup.bind(this));
    app.delete('/api/groups/:websiteId/:groupId', this.handleDeleteGroup.bind(this));
    
    // Cleanup-Endpunkte
    app.post('/api/cleanup/:websiteId/:filterId', this.handleRunCleanup.bind(this));
    app.post('/api/cleanup/:websiteId/:filterId/test', this.handleTestCleanup.bind(this));
    
    // Mailbox-Endpunkte
    app.get('/api/mailboxes/:websiteId', this.handleGetMailboxes.bind(this));
    
    // Plattform-Endpunkte
    app.get('/api/platforms/:websiteId', this.handleGetPlatforms.bind(this));
    
    // Plugin-Verwaltung
    app.delete('/api/plugin/:websiteId', this.handleDisconnectPlugin.bind(this));
    
    // OPTIMIERTE Statistik-Endpunkte mit Cache-Management
    app.get('/api/statistics/:websiteId', this.handleGetStatistics.bind(this));
    app.get('/api/statistics/:websiteId/detailed', this.handleGetDetailedStatistics.bind(this));
    app.post('/api/statistics/:websiteId/reset', this.handleResetStatistics.bind(this));
    
    // Scheduler Status-Endpunkt
    app.get('/api/system/scheduler', this.handleGetSchedulerStatus.bind(this));
    
    // System Version-Endpunkt
    app.get('/api/system/version', this.handleGetPluginVersion.bind(this));
    
    logDebug('🚦 REST-API-Endpunkte erfolgreich eingerichtet');
  }

  /**
   * OPTIMIERTE REST-API-Handler mit Context-Management
   */
  async handleGetStatistics(req, res) {
    try {
      const websiteId = req.params.websiteId;
      
      // Cache prüfen
      const cached = this.getFromCache(websiteId, 'statistics');
      if (cached) {
        this.performanceStats.cachedResponses++;
        return res.json({ success: true, statistics: cached });
      }
      
      const stats = this.loadStatistics(websiteId).websites[websiteId];
      
      // Bestimme Context basierend auf Debug-Modus
      const context = this.debugMode ? 'auto' : 'auto';
      
      const currentChats = await this.getCurrentChatCount(websiteId, context);
      const affectedChats = await this.getAffectedChatCount(websiteId, context);
      const activeFilters = filterManager.getActiveFilters(websiteId).length;
      
      const statistics = {
        currentChats,
        affectedChats,
        activeFilters,
        totalDeletedChats: stats.totalDeletedChats,
        totalDeletedSegments: stats.totalDeletedSegments,
        lastTwoWeeks: {
          deletedChats: stats.lastTwoWeeks.deletedChats,
          deletedSegments: stats.lastTwoWeeks.deletedSegments
        },
        lastRun: stats.lastRun,
        nextScheduledRun: stats.nextScheduledRun
      };
      
      // Cache aktualisieren
      this.updateCache(websiteId, 'statistics', statistics);
      
      res.json({ success: true, statistics });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/statistics/${req.params.websiteId}: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Weitere REST-API-Handler (vereinfacht dargestellt)
  async handleGetFilters(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filters = filterManager.getFilters(websiteId);
      res.json({ success: true, filters });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/filters: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleCreateFilter(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filterData = req.body;
      
      const result = await filterManager.createFilter(websiteId, filterData);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei POST /api/filters: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ... weitere Handler würden hier folgen mit ähnlichen Optimierungen
}

// Einzelne Instanz exportieren
module.exports = new WipeBotPlugin();