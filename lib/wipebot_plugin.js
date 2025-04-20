/**
 * wipebot_plugin.js
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

/**
 * WipeBot-Plugin-Klasse
 * Zentrales Interface für alle WipeBot-Funktionen
 */
class WipeBotPlugin {
  constructor() {
    this.debugMode = DEBUG_MODE;
    this.version = version;
    
    if (this.debugMode) {
      logDebug(`🤖 WipeBot Plugin v${this.version} gestartet (DEBUG-MODUS)`);
    } else {
      logger.log(`🤖 WipeBot Plugin v${this.version} gestartet`);
    }
  }

  /**
   * Verarbeitet eingehende Debug-Trigger-Nachrichten
   * @param {string} trigger - Der erkannte Trigger-Befehl
   * @param {Array} args - Argumente für den Trigger
   * @param {Object} context - Kontext-Informationen (Website-ID, Session-ID, etc.)
   * @returns {Promise<Object>} - Ergebnis der Trigger-Verarbeitung
   */
  async handleDebugTrigger(trigger, args, context) {
    if (!this.debugMode) {
      return { success: false, message: 'Debug-Modus ist deaktiviert' };
    }
    
    // Log des eingehenden Triggers
    logDebug(`🔧 Debug-Trigger empfangen: ${trigger} ${args.join(' ')}`);
    
    let response = null;
    
    try {
      // Spezifische Trigger verarbeiten
      switch (trigger) {
        // Basisinformationen
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
          
        // Filter-Verwaltung
        case 'filters':
          response = await this.handleFiltersTrigger(context);
          break;
        case 'preview':
          response = await this.handlePreviewTrigger(args[0], context);
          break;
          
        // Löschoperationen
        case 'wipe':
          if (args[0] === 'test') {
            response = await this.handleWipeTestTrigger(context);
          } else {
            response = await this.handleWipeTrigger(args[0], context);
          }
          break;
          
        // Log-Verwaltung
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
          
        // Plugin-Verwaltung
        case 'disconnect':
          response = await this.handleDisconnectTrigger(context);
          break;
        case 'debug':
          if (args[0] === 'off') {
            response = await this.handleDebugOffTrigger(context);
          } else {
            response = { success: false, message: 'Ungültiger Debug-Befehl' };
          }
          break;
          
        // Unbekannter Trigger
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
      
      // Fehlermeldung in die Konversation senden
      if (context.website_id && context.session_id) {
        await this.sendResponse(context, `Fehler: ${error.message}`);
      }
      
      return { success: false, message: error.message };
    }
  }

  /**
   * Sendet eine Antwort auf einen Debug-Trigger
   * @param {Object} context - Kontext-Informationen (Website-ID, Session-ID, etc.)
   * @param {string} message - Die zu sendende Nachricht
   */
  async sendResponse(context, message) {
    if (!this.debugMode) return;
    
    try {
      await crispClient.sendMessage(context.website_id, context.session_id, {
        type: 'text',
        content: message
      });
      
      logDebug(`📤 Antwort gesendet: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    } catch (error) {
      logDebug(`❌ Fehler beim Senden der Antwort: ${error.message}`);
    }
  }

  /**
   * Verarbeitet den 'ping' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit erfolgreicher Antwort
   */
  async handlePingTrigger(context) {
    logDebug('🏓 Ping-Befehl empfangen');
    return { success: true, message: 'pong' };
  }

  /**
   * Verarbeitet den 'help' Trigger und gibt verfügbare Befehle zurück
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Hilfe-Text
   */
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

**Plugin-Verwaltung:**
- \`disconnect\` - Trennt das Plugin von dieser Website (mit Bestätigung)
- \`debug off\` - Deaktiviert den Debug-Modus
`;

    logDebug('📚 Hilfe-Befehl empfangen');
    return { success: true, message: helpText };
  }

  /**
   * Verarbeitet den 'version' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Versionsinformationen
   */
  async handleVersionTrigger(context) {
    logDebug('🏷️ Versions-Befehl empfangen');
    return { 
      success: true, 
      message: `WipeBot Plugin v${this.version} | DEBUG_MODE: ${this.debugMode ? 'AKTiV' : 'INAKTIV'}`
    };
  }

  /**
   * Verarbeitet den 'time' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit aktueller Serverzeit
   */
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

  /**
   * Verarbeitet den 'crisp id' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Website-ID
   */
  async handleCrispTrigger(context) {
    logDebug('🆔 Crisp-ID-Befehl empfangen');
    return { 
      success: true, 
      message: `Website-ID: ${context.website_id || 'Nicht verfügbar'}`
    };
  }

  /**
   * Verarbeitet den 'filters' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Liste aller Filter
   */
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
    
    // Formatierte Liste aller Filter erstellen
    const filterList = filters.map(filter => {
      return `- ${filter.active ? '✅' : '❌'} ${filter.name}${filter.group ? ' (Gruppe: ' + filter.group + ')' : ''}`;
    }).join('\n');
    
    logDebug(`📋 Filter-Befehl empfangen - ${filters.length} Filter gefunden`);
    return { 
      success: true, 
      message: `**Verfügbare Filter (${filters.length}):**\n${filterList}` 
    };
  }

  /**
   * Verarbeitet den 'preview [filtername]' Trigger
   * @param {string} filterName - Name des Filters, der angezeigt werden soll
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Filterdetails
   */
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
    
    // Simulation durchführen, um zu sehen, wie viele Konversationen betroffen wären
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
      advanced: {
        // Inaktivitätsfilter
        inactivityEnabled: filter.inactivityEnabled,
        inactivityDays: filter.inactivityDays,
        
        // Schlüsselwortfilter
        keywordEnabled: filter.keywordEnabled,
        keywords: filter.keywords,
        
        // Tag-Filter
        tagsEnabled: filter.tagsEnabled,
        includeTags: filter.includeTags,
        excludeTags: filter.excludeTags
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

  /**
   * Verarbeitet den 'wipe test' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Simulationsergebnissen
   */
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

  /**
   * Verarbeitet den 'wipe [filtername]' Trigger
   * @param {string} filterName - Name des Filters, der ausgeführt werden soll
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis der Löschoperation
   */
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
    
    logDebug(`🧹 Wipe-Befehl für "${filterName}" ausgeführt - ${result.deleted} von ${result.total} Konversationen gelöscht`);
    return { 
      success: true, 
      message: `**Wipe-Ergebnis für "${filter.name}":**\n\n${result.deleted} von ${result.total} Konversation(en) erfolgreich gelöscht. Fehler: ${result.errors}` 
    };
  }

  /**
   * Verarbeitet den 'log test' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Erfolgsergebnis
   */
  async handleLogTestTrigger(context) {
    logDebug('📝 Trigger - Log Test erfolgreich');
    return { 
      success: true, 
      message: 'Log-Test erfolgreich durchgeführt. Eintrag ins Debug-Log geschrieben.' 
    };
  }

  /**
   * Verarbeitet den 'log view' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Log-Inhalt
   */
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

  /**
   * Verarbeitet den 'log clear' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Erfolgsergebnis
   */
  async handleLogClearTrigger(context) {
    clearLog();
    logDebug('🧹 Log geleert');
    return { 
      success: true, 
      message: 'Debug-Log wurde geleert.' 
    };
  }

  /**
   * Verarbeitet den 'disconnect' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Ergebnis mit Bestätigungsanfrage
   */
  async handleDisconnectTrigger(context) {
    const websiteId = context.website_id;
    
    if (!websiteId) {
      return { success: false, message: 'Website-ID nicht verfügbar' };
    }
    
    // Bestätigungsanfrage senden
    await this.sendResponse(context, `⚠️ **WARNUNG**: Möchtest du wirklich das WipeBot-Plugin von dieser Website trennen? Alle Filter werden gelöscht.\n\nBitte antworte mit "disconnect confirm", um fortzufahren, oder "disconnect cancel", um abzubrechen.`);
    
    // Wir markieren nur, dass eine Disconnect-Anfrage aussteht
    // Die eigentliche Aktion wird erst nach Bestätigung durchgeführt
    logDebug(`⚠️ Disconnect-Anfrage für Website ${websiteId} gesendet`);
    return { 
      success: true, 
      message: null // Keine zusätzliche Nachricht, da wir bereits eine Bestätigung gesendet haben
    };
  }

  /**
   * Bestätigt die Trennung des Plugins von einer Website
   * @param {string} websiteId - Die Website-ID
   * @returns {Object} - Ergebnis der Trennung
   */
  async confirmDisconnect(websiteId) {
    const result = await filterManager.removeWebsiteData(websiteId);
    
    if (result.success) {
      logDebug(`🔌 Website ${websiteId} erfolgreich vom Plugin getrennt`);
      return { 
        success: true, 
        message: 'Website erfolgreich vom Plugin getrennt. Alle Plugin-Daten wurden gelöscht.' 
      };
    } else {
      return { 
        success: false, 
        message: `Fehler beim Trennen des Plugins: ${result.error}` 
      };
    }
  }

  /**
   * Verarbeitet den 'debug off' Trigger
   * @param {Object} context - Kontext-Informationen
   * @returns {Object} - Erfolgsergebnis
   */
  async handleDebugOffTrigger(context) {
    logDebug('🔧 Debug-Modus wird deaktiviert');
    
    // Wir können den Debug-Modus nicht wirklich deaktivieren, da er durch die Umgebungsvariable gesteuert wird
    // aber wir können eine Nachricht senden, dass eine Neustart mit DEBUG_MODE=false erforderlich ist
    return { 
      success: true, 
      message: 'Der Debug-Modus kann nur durch Neustart des Plugins mit DEBUG_MODE=false deaktiviert werden. Bitte nutze das Shell-Skript ohne den Debug-Parameter.' 
    };
  }

  /**
   * Führt einen Cleanup gemäß einem Filter durch
   * @param {string} websiteId - Die Website-ID
   * @param {string} filterId - Die ID des Filters
   * @param {boolean} dryRun - Wenn true, werden keine tatsächlichen Löschungen durchgeführt
   * @returns {Promise<Object>} - Ergebnis des Cleanups
   */
  async runCleanup(websiteId, filterId, dryRun = false) {
    try {
      if (!websiteId) {
        throw new Error('Website-ID ist erforderlich');
      }
      
      if (!filterId) {
        throw new Error('Filter-ID oder Filtername ist erforderlich');
      }
      
      // Filter finden
      const filter = filterManager.findFilter(websiteId, filterId);
      
      if (!filter) {
        throw new Error(`Filter mit ID/Name ${filterId} nicht gefunden`);
      }
      
      // Cleanup durchführen
      const result = await filterManager.runCleanup(websiteId, filter.id, dryRun);
      
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

  /**
   * Stellt eine REST-API für die UI-Integration bereit
   * @param {Object} app - Express-App-Instanz
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
    
    logDebug('🚦 REST-API-Endpunkte erfolgreich eingerichtet');
  }

  /**
   * REST-API: Gibt alle Filter für eine Website zurück
   */
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

  /**
   * REST-API: Erstellt einen neuen Filter
   */
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

  /**
   * REST-API: Aktualisiert einen bestehenden Filter
   */
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

  /**
   * REST-API: Löscht einen Filter
   */
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

  /**
   * REST-API: Klont einen Filter
   */
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

  /**
   * REST-API: Gibt alle Gruppen für eine Website zurück
   */
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

  /**
   * REST-API: Erstellt eine neue Gruppe
   */
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

  /**
   * REST-API: Löscht eine Gruppe
   */
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

  /**
   * REST-API: Führt einen Cleanup aus
   */
  async handleRunCleanup(req, res) {
    try {
      const websiteId = req.params.websiteId;
      const filterId = req.params.filterId;
      
      // Bestätigung prüfen
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

  /**
   * REST-API: Testet einen Cleanup (keine tatsächliche Löschung)
   */
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

  /**
   * REST-API: Gibt alle Mailboxes für eine Website zurück
   */
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

  /**
   * REST-API: Gibt alle aktiven Plattformen für eine Website zurück
   */
  async handleGetPlatforms(req, res) {
    try {
      const websiteId = req.params.websiteId;
      
      const plugins = await crispClient.getWebsitePlugins(websiteId);
      
      // Plattformen aus den Plugins extrahieren
      const platforms = plugins
        .filter(plugin => plugin.id.startsWith('plugin:'))
        .map(plugin => {
          const platformId = plugin.id.replace('plugin:', '');
          return { 
            id: platformId,
            name: platformId.charAt(0).toUpperCase() + platformId.slice(1)
          };
        });
      
      // Immer Webchat hinzufügen, da er standardmäßig verfügbar ist
      if (!platforms.some(p => p.id === 'webchat')) {
        platforms.push({ id: 'webchat', name: 'Webchat' });
      }
      
      res.json({ success: true, platforms });
    } catch (error) {
      logDebug(`❌ API-Fehler bei GET /api/platforms: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * REST-API: Trennt das Plugin von einer Website
   */
  async handleDisconnectPlugin(req, res) {
    try {
      const websiteId = req.params.websiteId;
      
      // Bestätigung prüfen
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
}

// Einzelne Instanz exportieren
module.exports = new WipeBotPlugin();