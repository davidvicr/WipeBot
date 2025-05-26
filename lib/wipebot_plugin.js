/**
 * wipebot_plugin.js - KORRIGIERT mit allen Handler-Methoden
 * Zentrale Steuerungslogik für das WipeBot-Plugin
 * 
 * BUGFIXES:
 * - Alle fehlenden REST-API-Handler hinzugefügt
 * - Vollständige Debug-Trigger-Handler implementiert
 * - Context-Management für alle Funktionen
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
   */
  isCacheValid(websiteId, cacheType) {
    const cacheKey = `${websiteId}_${cacheType}`;
    const lastUpdate = performanceCache.lastCacheUpdate.get(cacheKey);
    
    if (!lastUpdate) return false;
    
    return (Date.now() - lastUpdate) < performanceCache.CACHE_DURATION;
  }

  /**
   * OPTIMIERT: Aktualisiert Cache für eine gegebene Website-ID und Cache-Type
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
   * OPTIMIERT: Ruft die aktuelle Anzahl der Chats für eine Website ab
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
   * OPTIMIERT: Berechnet die Anzahl der von aktiven Filtern betroffenen Chats
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
   * Verarbeitet eingehende Debug-Trigger-Nachrichten
   */
  async handleDebugTrigger(trigger, args, context) {
    if (!this.debugMode) {
      return { success: false, message: 'Debug-Modus ist deaktiviert' };
    }
    
    logDebug(`🔧 Debug-Trigger empfangen: ${trigger} ${args.join(' ')}`);
    
    let response = null;
    
    try {
      switch (trigger) {
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
        case 'filters':
          response = await this.handleFiltersTrigger(context);
          break;
        case 'preview':
          response = await this.handlePreviewTrigger(args[0], context);
          break;
        case 'wipe':
          if (args[0] === 'test') {
            response = await this.handleWipeTestTrigger(context);
          } else {
            response = await this.handleWipeTrigger(args[0], context);
          }
          break;
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

  // ===== DEBUG-TRIGGER-HANDLER =====
  
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

  async handlePreviewTrigger(filterName, context) {
    const websiteId = context.website_id;
    
    if (!websiteId) {
      return { success: false, message: 'Website-ID nicht verfügbar' };
    }
    
    if (!filterName) {
      return { 
        success: false, 
        message: 'Kein Filtername angegeben. Syntax: preview [filtername]' 
      };
    }
    
    const filter = filterManager.findFilter(websiteId, filterName);
    
    if (!filter) {
      return { 
        success: false, 
        message: `Filter "${filterName}" nicht gefunden. Nutze 'filters' für eine Liste verfügbarer Filter.` 
      };
    }
    
    // Simulation durchführen
    const simulation = await filterManager.simulateCleanup(websiteId, filter.id);
    
    // Formatierte Filterdetails erstellen
    const details = {
      name: filter.name,
      id: filter.id,
      status: filter.active ? 'Aktiv' : 'Inaktiv',
      group: filter.group || 'Keine',
      criteria: {
        maxDays: filter.maxDays,
        closedOnly: filter.closedOnly,
        platforms: filter.platforms,
        segmentFilter: filter.deleteSegmentsOnly ? 'Nur Segmente löschen' : 'Ganze Konversationen löschen',
        includeSegments: filter.includeSegments,
        excludeSegments: filter.excludeSegments
      },
      automation: {
        autoEnabled: filter.autoEnabled,
        autoTime: filter.autoTime
      },
      simulation: {
        affectedConversations: simulation.success ? simulation.count : 'Fehler bei Simulation'
      },
      created: new Date(filter.created).toLocaleString(),
      updated: new Date(filter.updated).toLocaleString()
    };
    
    logDebug(`🔍 Preview-Befehl für "${filterName}" empfangen`);
    return { 
      success: true, 
      message: `**Filter-Details: ${filter.name}**\n\n${JSON.stringify(details, null, 2)}` 
    };
  }

  async handleWipeTestTrigger(context) {
    const websiteId = context.website_id;
    
    if (!websiteId) {
      return { success: false, message: 'Website-ID nicht verfügbar' };
    }
    
    const filters = filterManager.getActiveFilters(websiteId);
    
    if (filters.length === 0) {
      return { 
        success: true, 
        message: 'Keine aktiven Filter für diese Website konfiguriert. Aktiviere Filter über die Benutzeroberfläche.' 
      };
    }
    
    // Für jeden aktiven Filter eine Simulation durchführen
    const results = [];
    
    for (const filter of filters) {
      const simulation = await filterManager.simulateCleanup(websiteId, filter.id);
      
      if (simulation.success) {
        results.push({
          name: filter.name,
          count: simulation.count
        });
      }
    }
    
    // Zusammenfassung erstellen
    const totalConversations = results.reduce((sum, result) => sum + result.count, 0);
    
    // Detaillierte Auflistung der Filter
    const filterResults = results.map(result => {
      return `- ${result.name}: ${result.count} Konversation(en)`;
    }).join('\n');
    
    logDebug(`🧪 Wipe-Test-Befehl empfangen - ${totalConversations} betroffene Konversationen`);
    return { 
      success: true, 
      message: `**Wipe-Test Ergebnis:**\n\nInsgesamt ${totalConversations} Konversation(en) würden durch ${results.length} aktive Filter gelöscht werden.\n\n${filterResults}` 
    };
  }

  async handleWipeTrigger(filterName, context) {
    const websiteId = context.website_id;
    
    if (!websiteId) {
      return { success: false, message: 'Website-ID nicht verfügbar' };
    }
    
    if (!filterName) {
      return { 
        success: false, 
        message: 'Kein Filtername angegeben. Syntax: wipe [filtername]' 
      };
    }
    
    const filter = filterManager.findFilter(websiteId, filterName);
    
    if (!filter) {
      return { 
        success: false, 
        message: `Filter "${filterName}" nicht gefunden. Nutze 'filters' für eine Liste verfügbarer Filter.` 
      };
    }
    
    // Vorwarnung senden
    await this.sendResponse(context, `⚠️ Filter "${filter.name}" wird ausgeführt. Bitte warten...`);
    
    // Filterlöschung durchführen
    const result = await filterManager.runCleanup(websiteId, filter.id);
    
    if (!result.success) {
      return { 
        success: false, 
        message: `Fehler beim Ausführen des Filters: ${result.error}` 
      };
    }
    
    // Statistiken aktualisieren
    if (filter.deleteSegmentsOnly) {
      this.updateStatistics(websiteId, 0, result.deleted);
    } else {
      this.updateStatistics(websiteId, result.deleted, 0);
    }
    
    logDebug(`🧹 Wipe-Befehl für "${filterName}" ausgeführt - ${result.deleted} von ${result.total} Konversationen gelöscht`);
    return { 
      success: true, 
      message: `**Wipe-Ergebnis für "${filter.name}":**\n\n${result.deleted} von ${result.total} Konversation(en) erfolgreich gelöscht. Fehler: ${result.errors}` 
    };
  }

  async handleLogTestTrigger(context) {
    logDebug('📝 Trigger - Log Test erfolgreich');
    return { 
      success: true, 
      message: 'Log-Test erfolgreich durchgeführt. Eintrag ins Debug-Log geschrieben.' 
    };
  }

  async handleLogViewTrigger(context) {
    const log = readLog();
    
    // Wenn das Log zu lang ist, nur die letzten 20 Zeilen anzeigen
    const lines = log.split('\n');
    const truncatedLog = lines.length > 20 
      ? `... (${lines.length - 20} weitere Zeilen)\n\n${lines.slice(-20).join('\n')}` 
      : log;
    
    logDebug('📋 Log-View-Befehl empfangen');
    return { 
      success: true, 
      message: `**Debug-Log:**\n\n${truncatedLog}` 
    };
  }

  async handleLogClearTrigger(context) {
    clearLog();
    logDebug('🧹 Log geleert');
    return { 
      success: true, 
      message: 'Debug-Log wurde geleert.' 
    };
  }

  async handleDisconnectTrigger(context) {
    const websiteId = context.website_id;
    
    if (!websiteId) {
      return { success: false, message: 'Website-ID nicht verfügbar' };
    }
    
    // Bestätigungsanfrage senden
    await this.sendResponse(context, `⚠️ **WARNUNG**: Möchtest du wirklich das WipeBot-Plugin von dieser Website trennen? Alle Filter werden gelöscht.\n\nBitte antworte mit "disconnect confirm", um fortzufahren, oder "disconnect cancel", um abzubrechen.`);
    
    logDebug(`⚠️ Disconnect-Anfrage für Website ${websiteId} gesendet`);
    return { 
      success: true, 
      message: null 
    };
  }

  async handleDebugOffTrigger(context) {
    logDebug('🔧 Debug-Modus wird deaktiviert');
    
    return { 
      success: true, 
      message: 'Der Debug-Modus kann nur durch Neustart des Plugins mit DEBUG_MODE=false deaktiviert werden. Bitte nutze das Shell-Skript ohne den Debug-Parameter.' 
    };
  }

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

  async handleStatsResetTrigger(context) {
    try {
      const websiteId = context.website_id;
      
      if (!websiteId) {
        return { success: false, message: 'Website-ID nicht verfügbar' };
      }
      
      // Bestätigungsanfrage senden
      await this.sendResponse(context, `⚠️ **WARNUNG**: Möchtest du wirklich alle Statistiken für diese Website zurücksetzen?\n\nBitte antworte mit "stats reset confirm", um fortzufahren, oder "stats reset cancel", um abzubrechen.`);
      
      logDebug(`⚠️ Stats-Reset-Anfrage für Website ${websiteId} gesendet`);
      
      return {
        success: true,
        message: null
      };
    } catch (error) {
      logDebug(`❌ Fehler beim Zurücksetzen der Statistiken: ${error.message}`);
      return { success: false, message: `Fehler beim Zurücksetzen der Statistiken: ${error.message}` };
    }
  }

  // ===== CLEANUP-FUNKTIONEN =====

  async runCleanup(websiteId, filterId, dryRun = false) {
    try {
      if (!websiteId) {
        throw new Error('Website-ID ist erforderlich');
      }
      
      if (!filterId) {
        throw new Error('Filter-ID oder Filtername ist erforderlich');
      }
      
      const filter = filterManager.findFilter(websiteId, filterId);
      
      if (!filter) {
        throw new Error(`Filter mit ID/Name ${filterId} nicht gefunden`);
      }
      
      const result = await filterManager.runCleanup(websiteId, filter.id, dryRun);
      
      if (!dryRun && result.success) {
        if (filter.deleteSegmentsOnly) {
          this.updateStatistics(websiteId, 0, result.deleted);
        } else {
          this.updateStatistics(websiteId, result.deleted, 0);
        }
      }
      
      if (dryRun) {
        logDebug(`🧪 Testlauf für Filter "${filter.name}" durchgeführt - ${result.count} betroffene Konversationen`);
      } else {
        logDebug(`🧹 Cleanup für Filter "${filter.name}" durchgeführt - ${result.deleted} von ${result.total} Konversationen gelöscht`);
      }
      
      return result;
    } catch (error) {
      logDebug(`❌ Fehler beim Ausführen des Cleanups: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ===== REST-API-SETUP =====

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
    
    // Statistik-Endpunkte
    app.get('/api/statistics/:websiteId', this.handleGetStatistics.bind(this));
    app.get('/api/statistics/:websiteId/detailed', this.handleGetDetailedStatistics.bind(this));
    app.post('/api/statistics/:websiteId/reset', this.handleResetStatistics.bind(this));
    
    // System-Endpunkte
    app.get('/api/system/scheduler', this.handleGetSchedulerStatus.bind(this));
    app.get('/api/system/version', this.handleGetPluginVersion.bind(this));
    
    logDebug('🚦 REST-API-Endpunkte erfolgreich eingerichtet');
  }

  // ===== REST-API-HANDLER =====

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

  async handleUpdateFilter(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filterId = req.params.filterId;
      const filterData = req.body;
      
      const result = await filterManager.updateFilter(websiteId, filterId, filterData);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei PUT /api/filters/${req.params.filterId}: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleDeleteFilter(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filterId = req.params.filterId;
      
      const result = await filterManager.deleteFilter(websiteId, filterId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei DELETE /api/filters/${req.params.filterId}: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleCloneFilter(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filterId = req.params.filterId;
      const { newName } = req.body;
      
      if (!newName) {
        return res.status(400).json({ success: false, error: 'Neuer Name für den Filter ist erforderlich' });
      }
      
      const result = await filterManager.cloneFilter(websiteId, filterId, newName);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei POST /api/filters/${req.params.filterId}/clone: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetGroups(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const groups = filterManager.getGroups(websiteId);
      res.json({ success: true, groups });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/groups: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleCreateGroup(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, error: 'Gruppenname ist erforderlich' });
      }
      
      const result = await filterManager.createGroup(websiteId, name);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei POST /api/groups: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleDeleteGroup(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const groupId = req.params.groupId;
      
      const result = await filterManager.deleteGroup(websiteId, groupId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei DELETE /api/groups/${req.params.groupId}: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleRunCleanup(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filterId = req.params.filterId;
      
      const { confirm } = req.body;
      
      if (!confirm || confirm !== true) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bestätigung erforderlich. Sende { confirm: true } im Request-Body.'
        });
      }
      
      const result = await this.runCleanup(websiteId, filterId, false);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei POST /api/cleanup/${req.params.filterId}: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleTestCleanup(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filterId = req.params.filterId;
      
      const result = await this.runCleanup(websiteId, filterId, true);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei POST /api/cleanup/${req.params.filterId}/test: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetMailboxes(req, res) {
    try {
      const websiteId = req.params.websiteId;
      
      const mailboxes = await crispClient.getMailboxes(websiteId);
      
      res.json({ success: true, mailboxes: mailboxes.data || [] });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/mailboxes: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetPlatforms(req, res) {
    try {
      const websiteId = req.params.websiteId;
      
      const plugins = await crispClient.getWebsitePlugins(websiteId);
      
      const platforms = plugins
        .filter(plugin => plugin.id.startsWith('plugin:'))
        .map(plugin => {
          const platformId = plugin.id.replace('plugin:', '');
          return { 
            id: platformId,
            name: platformId.charAt(0).toUpperCase() + platformId.slice(1)
          };
        });
      
      if (!platforms.some(p => p.id === 'webchat')) {
        platforms.push({ id: 'webchat', name: 'Webchat' });
      }
      
      res.json({ success: true, platforms });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/platforms: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleDisconnectPlugin(req, res) {
    try {
      const websiteId = req.params.websiteId;
      
      const { confirm } = req.body;
      
      if (!confirm || confirm !== true) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bestätigung erforderlich. Sende { confirm: true } im Request-Body.'
        });
      }
      
      const result = await filterManager.removeWebsiteData(websiteId);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Website erfolgreich vom Plugin getrennt. Alle Plugin-Daten wurden gelöscht.' 
        });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei DELETE /api/plugin/${req.params.websiteId}: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

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
      
      this.updateCache(websiteId, 'statistics', statistics);
      
      res.json({ success: true, statistics });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/statistics/${req.params.websiteId}: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetDetailedStatistics(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const period = req.query.period || 'week';
      
      const stats = this.loadStatistics(websiteId).websites[websiteId];
      
      const now = new Date();
      let startDate;
      
      switch (period) {
        case 'day':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 30);
          break;
        case 'all':
        default:
          startDate = new Date(0);
          break;
      }
      
      const startDateStr = startDate.toISOString().split('T')[0];
      
      const filteredDailyStats = {};
      let totalDeletedChats = 0;
      let totalDeletedSegments = 0;
      
      for (const [date, dayStat] of Object.entries(stats.dailyStats)) {
        if (date >= startDateStr) {
          filteredDailyStats[date] = dayStat;
          totalDeletedChats += dayStat.deletedChats;
          totalDeletedSegments += dayStat.deletedSegments;
        }
      }
      
      const context = this.debugMode ? 'auto' : 'auto';
      const currentChats = await this.getCurrentChatCount(websiteId, context);
      const affectedChats = await this.getAffectedChatCount(websiteId, context);
      const activeFilters = filterManager.getActiveFilters(websiteId).length;
      
      const detailedStatistics = {
        period,
        summary: {
          currentChats,
          affectedChats,
          activeFilters,
          deletedChats: totalDeletedChats,
          deletedSegments: totalDeletedSegments
        },
        dailyStats: filteredDailyStats,
        lastRun: stats.lastRun ? new Date(stats.lastRun).toISOString() : null,
        nextScheduledRun: stats.nextScheduledRun ? new Date(stats.nextScheduledRun).toISOString() : null
      };
      
      res.json({ success: true, statistics: detailedStatistics });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/statistics/${req.params.websiteId}/detailed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleResetStatistics(req, res) {
    try {
      const websiteId = req.params.websiteId;
      
      const { confirm } = req.body;
      
      if (!confirm || confirm !== true) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bestätigung erforderlich. Sende { confirm: true } im Request-Body.'
        });
      }
      
      const result = this.resetStatistics(websiteId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logDebug(`❌ API-Fehler bei POST /api/statistics/${req.params.websiteId}/reset: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }
  
  async handleGetSchedulerStatus(req, res) {
    try {
      const schedulerStatus = require('../cron_scheduler').getSchedulerStats();
      
      res.json({
        success: true,
        scheduler: schedulerStatus
      });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/system/scheduler: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }
  
  async handleGetPluginVersion(req, res) {
    try {
      res.json({
        success: true,
        version: this.version,
        debugMode: this.debugMode
      });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/system/version: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

// Einzelne Instanz exportieren
module.exports = new WipeBotPlugin();