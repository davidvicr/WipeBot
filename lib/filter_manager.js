/**
 * filter_manager.js
 * Zentrales Modul zur Verwaltung aller Filter und Filtergruppen im WipeBot
 * 
 * Funktionen:
 * - Laden und Speichern von Filtern aus/in config.json
 * - CRUD-Operationen für Filter und Filtergruppen
 * - Anwendung von Filterkriterien auf Konversationen
 * - Konversationen anhand von Filtereinstellungen identifizieren
 * - Erweiterte Filterung nach Inaktivität, Schlüsselwörtern, Benutzermerkmalen, Tags, Operatoren und mehr
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logDebug } = require('../utils/debugLogger');
const { log } = require('../utils/logger');
const crispClient = require('./crisp_client');

// Konstanten
const CONFIG_PATH = path.join(__dirname, '../config.json');
const MAX_FILTERS_PER_WEBSITE = 30;
const FILTER_COLORS = [
  "#3498db", "#2ecc71", "#e74c3c", "#f39c12", "#9b59b6", 
  "#1abc9c", "#d35400", "#34495e", "#16a085", "#27ae60",
  "#2980b9", "#8e44ad", "#f1c40f", "#e67e22", "#0984e3",
  "#6c5ce7", "#fdcb6e", "#00cec9", "#55efc4", "#fab1a0"
];

// Gültige Filteroperationen für die Kombinations-Filter
const VALID_OPERATIONS = ['AND', 'OR'];

class FilterManager {
  constructor() {
    this.config = this.loadConfig();
    this.DEBUG_MODE = process.env.DEBUG_MODE === "true";
  }

  /**
   * Lädt die Konfigurationsdatei
   * @returns {Object} Die geladene Konfiguration
   */
  loadConfig() {
    try {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      logDebug(`❌ Fehler beim Laden der Konfiguration: ${error.message}`);
      // Erstelle eine leere Konfiguration, wenn keine existiert
      return {};
    }
  }

  /**
   * Speichert die Konfiguration in die Datei
   * @returns {boolean} Erfolgsstatus
   */
  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
      
      if (this.DEBUG_MODE) {
        logDebug('💾 Konfiguration erfolgreich gespeichert');
      }
      
      return true;
    } catch (error) {
      logDebug(`❌ Fehler beim Speichern der Konfiguration: ${error.message}`);
      return false;
    }
  }

  /**
   * Initialisiert die Websitekonfiguration, falls sie noch nicht existiert
   * @param {string} websiteId - Die Website-ID
   */
  initWebsiteConfig(websiteId) {
    if (!this.config[websiteId]) {
      this.config[websiteId] = {
        filters: [],
        groups: []
      };
      
      if (this.DEBUG_MODE) {
        logDebug(`🆕 Neue Website-Konfiguration für ${websiteId} erstellt`);
      }
      
      this.saveConfig();
    }
  }

  /**
   * Prüft, ob ein Filter mit dem gegebenen Namen bereits existiert
   * @param {string} websiteId - Die Website-ID
   * @param {string} filterName - Der zu prüfende Filtername
   * @param {string} excludeId - Optional: ID eines Filters, der ignoriert werden soll (für Updates)
   * @returns {boolean} True, wenn der Name bereits existiert
   */
  filterNameExists(websiteId, filterName, excludeId = null) {
    this.initWebsiteConfig(websiteId);
    
    return this.config[websiteId].filters.some(filter => 
      filter.name.toLowerCase() === filterName.toLowerCase() && 
      (!excludeId || filter.id !== excludeId)
    );
  }

  /**
   * Validiert Filterkriterien und wirft Fehler bei ungültigen Werten
   * @param {Object} filterData - Die zu validierenden Filterkriterien
   */
  validateFilterData(filterData) {
    // Pflichtfelder prüfen
    if (!filterData.name || filterData.name.trim() === '') {
      throw new Error('Filtername ist erforderlich');
    }
    
    // Numerische Werte prüfen
    if (filterData.maxDays !== undefined) {
      const maxDays = parseInt(filterData.maxDays, 10);
      if (isNaN(maxDays) || maxDays < 1) {
        throw new Error('Maximales Alter muss eine positive Zahl sein');
      }
    }
    
    // Inaktivitätsfilter prüfen
    if (filterData.inactivityDays !== undefined) {
      const inactivityDays = parseInt(filterData.inactivityDays, 10);
      if (isNaN(inactivityDays) || inactivityDays < 1) {
        throw new Error('Inaktivitätstage müssen eine positive Zahl sein');
      }
    }
    
    // Arrays prüfen
    if (filterData.platforms && !Array.isArray(filterData.platforms)) {
      throw new Error('Plattformen müssen als Array übergeben werden');
    }
    
    if (filterData.includeSegments && !Array.isArray(filterData.includeSegments)) {
      throw new Error('Zu löschende Segmente müssen als Array übergeben werden');
    }
    
    if (filterData.excludeSegments && !Array.isArray(filterData.excludeSegments)) {
      throw new Error('Zu schützende Segmente müssen als Array übergeben werden');
    }
    
    // Schlüsselwörter prüfen
    if (filterData.keywords && !Array.isArray(filterData.keywords)) {
      throw new Error('Schlüsselwörter müssen als Array übergeben werden');
    }
    
    // Tags prüfen
    if (filterData.includeTags && !Array.isArray(filterData.includeTags)) {
      throw new Error('Zu inkludierende Tags müssen als Array übergeben werden');
    }
    
    if (filterData.excludeTags && !Array.isArray(filterData.excludeTags)) {
      throw new Error('Zu exkludierende Tags müssen als Array übergeben werden');
    }
    
    // E-Mail-Domains prüfen
    if (filterData.emailDomains && !Array.isArray(filterData.emailDomains)) {
      throw new Error('E-Mail-Domains müssen als Array übergeben werden');
    }
    
    // Operatoren prüfen
    if (filterData.operators && !Array.isArray(filterData.operators)) {
      throw new Error('Operatoren müssen als Array übergeben werden');
    }
    
    // Kombinations-Filter-Logik prüfen
    if (filterData.combinationOperation && 
        !VALID_OPERATIONS.includes(filterData.combinationOperation)) {
      throw new Error(`Ungültige Kombinations-Operation. Erlaubt sind: ${VALID_OPERATIONS.join(', ')}`);
    }
    
    // Auto-Zeit prüfen
    if (filterData.autoEnabled && filterData.autoTime) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(filterData.autoTime)) {
        throw new Error('Ungültiges Zeitformat für automatische Löschung');
      }
    }
    
    // Kombinations-Filter Subfilter prüfen
    if (filterData.subfilters) {
      if (!Array.isArray(filterData.subfilters)) {
        throw new Error('Subfilter müssen als Array übergeben werden');
      }
      
      // Jeder Subfilter muss mindestens ein Kriterium haben
      for (const subfilter of filterData.subfilters) {
        if (Object.keys(subfilter).length === 0) {
          throw new Error('Jeder Subfilter muss mindestens ein Kriterium enthalten');
        }
      }
    }
  }

  /**
   * Erstellt einen neuen Filter
   * @param {string} websiteId - Die Website-ID
   * @param {Object} filterData - Die Filterkriterien
   * @returns {Object} Der erstellte Filter oder ein Fehlerobjekt
   */
  createFilter(websiteId, filterData) {
    try {
      this.initWebsiteConfig(websiteId);
      
      // Prüfen, ob das Maximum an Filtern erreicht ist
      if (this.config[websiteId].filters.length >= MAX_FILTERS_PER_WEBSITE) {
        return { 
          success: false, 
          error: `Maximale Anzahl von ${MAX_FILTERS_PER_WEBSITE} Filtern erreicht` 
        };
      }
      
      // Prüfen, ob der Filtername bereits existiert
      if (this.filterNameExists(websiteId, filterData.name)) {
        return { 
          success: false, 
          error: `Ein Filter mit dem Namen "${filterData.name}" existiert bereits` 
        };
      }
      
      // Filterkriterien validieren
      this.validateFilterData(filterData);
      
      // Zufällige Farbe auswählen, falls keine angegeben wurde
      if (!filterData.color) {
        const randomIndex = Math.floor(Math.random() * FILTER_COLORS.length);
        filterData.color = FILTER_COLORS[randomIndex];
      }
      
      // Neuen Filter erstellen
      const newFilter = {
        id: uuidv4(), // Eindeutige ID generieren
        name: filterData.name,
        group: filterData.group || null,
        color: filterData.color,
        
        // Basis-Filterkriterien
        maxDays: parseInt(filterData.maxDays, 10) || 30,
        closedOnly: filterData.closedOnly === true || filterData.closedOnly === 'true',
        platforms: filterData.platforms || ['alle'],
        includeSegments: filterData.includeSegments || [],
        excludeSegments: filterData.excludeSegments || [],
        deleteSegmentsOnly: filterData.deleteSegmentsOnly === true || filterData.deleteSegmentsOnly === 'true',
        
        // NEUE FUNKTIONEN - Erweiterungen
        // 1. Inaktivitätsfilter
        inactivityEnabled: filterData.inactivityEnabled === true || filterData.inactivityEnabled === 'true',
        inactivityDays: parseInt(filterData.inactivityDays, 10) || 14,
        
        // 2. Wort/Phrasenerkennung
        keywordEnabled: filterData.keywordEnabled === true || filterData.keywordEnabled === 'true',
        keywords: filterData.keywords || [],
        keywordMatchType: filterData.keywordMatchType || 'any', // 'any', 'all'
        
        // 3. Benutzermerkmale
        userAttributesEnabled: filterData.userAttributesEnabled === true || filterData.userAttributesEnabled === 'true',
        emailDomains: filterData.emailDomains || [],
        emailDomainMatchType: filterData.emailDomainMatchType || 'include', // 'include', 'exclude'
        
        // 4. Prioritäts-Tags
        tagsEnabled: filterData.tagsEnabled === true || filterData.tagsEnabled === 'true',
        includeTags: filterData.includeTags || [],
        excludeTags: filterData.excludeTags || [],
        
        // 5. Operator-Filter
        operatorsEnabled: filterData.operatorsEnabled === true || filterData.operatorsEnabled === 'true',
        operators: filterData.operators || [],
        operatorMatchType: filterData.operatorMatchType || 'any', // 'any', 'all', 'none'
        
        // 6. Kombinations-Filter
        isCombinationFilter: filterData.isCombinationFilter === true || filterData.isCombinationFilter === 'true',
        combinationOperation: filterData.combinationOperation || 'AND', // 'AND', 'OR'
        subfilters: filterData.subfilters || [],
        
        // Allgemeine Filtereinstellungen
        autoEnabled: filterData.autoEnabled === true || filterData.autoEnabled === 'true',
        autoTime: filterData.autoTime || '03:00',
        active: filterData.active !== false, // Standardmäßig aktiv
        created: Date.now(),
        updated: Date.now()
      };
      
      // Filter zur Konfiguration hinzufügen
      this.config[websiteId].filters.push(newFilter);
      
      // Konfiguration speichern
      this.saveConfig();
      
      if (this.DEBUG_MODE) {
        logDebug(`✅ Neuer Filter "${newFilter.name}" für Website ${websiteId} erstellt`);
      }
      
      return { success: true, filter: newFilter };
    } catch (error) {
      logDebug(`❌ Fehler beim Erstellen des Filters: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Aktualisiert einen bestehenden Filter
   * @param {string} websiteId - Die Website-ID
   * @param {string} filterId - Die ID des zu aktualisierenden Filters
   * @param {Object} filterData - Die neuen Filterkriterien
   * @returns {Object} Der aktualisierte Filter oder ein Fehlerobjekt
   */
  updateFilter(websiteId, filterId, filterData) {
    try {
      this.initWebsiteConfig(websiteId);
      
      // Filter-Index finden
      const filterIndex = this.config[websiteId].filters.findIndex(filter => filter.id === filterId);
      
      if (filterIndex === -1) {
        return { 
          success: false, 
          error: `Filter mit ID ${filterId} nicht gefunden` 
        };
      }
      
      // Prüfen, ob der neue Name bereits existiert (außer bei diesem Filter selbst)
      if (filterData.name && 
          this.filterNameExists(websiteId, filterData.name, filterId)) {
        return { 
          success: false, 
          error: `Ein Filter mit dem Namen "${filterData.name}" existiert bereits` 
        };
      }
      
      // Filterkriterien validieren
      if (filterData.name) {
        this.validateFilterData({ 
          ...this.config[websiteId].filters[filterIndex], 
          ...filterData 
        });
      }
      
      // Filter aktualisieren
      const updatedFilter = {
        ...this.config[websiteId].filters[filterIndex],
        ...filterData,
        updated: Date.now()
      };
      
      // Numerische Werte korrekt konvertieren
      if (filterData.maxDays !== undefined) {
        updatedFilter.maxDays = parseInt(filterData.maxDays, 10);
      }
      
      if (filterData.inactivityDays !== undefined) {
        updatedFilter.inactivityDays = parseInt(filterData.inactivityDays, 10);
      }
      
      // Boolean-Werte korrekt konvertieren
      const booleanFields = [
        'closedOnly', 'deleteSegmentsOnly', 'autoEnabled', 'active',
        'inactivityEnabled', 'keywordEnabled', 'userAttributesEnabled',
        'tagsEnabled', 'operatorsEnabled', 'isCombinationFilter'
      ];
      
      booleanFields.forEach(field => {
        if (filterData[field] !== undefined) {
          updatedFilter[field] = filterData[field] === true || filterData[field] === 'true';
        }
      });
      
      // Aktualisierter Filter in die Konfiguration schreiben
      this.config[websiteId].filters[filterIndex] = updatedFilter;
      
      // Konfiguration speichern
      this.saveConfig();
      
      if (this.DEBUG_MODE) {
        logDebug(`🔄 Filter "${updatedFilter.name}" für Website ${websiteId} aktualisiert`);
      }
      
      return { success: true, filter: updatedFilter };
    } catch (error) {
      logDebug(`❌ Fehler beim Aktualisieren des Filters: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Löscht einen Filter
   * @param {string} websiteId - Die Website-ID
   * @param {string} filterId - Die ID des zu löschenden Filters
   * @returns {Object} Erfolgsstatus und ggf. Fehlermeldung
   */
  deleteFilter(websiteId, filterId) {
    try {
      this.initWebsiteConfig(websiteId);
      
      // Filter-Index finden
      const filterIndex = this.config[websiteId].filters.findIndex(filter => filter.id === filterId);
      
      if (filterIndex === -1) {
        return { 
          success: false, 
          error: `Filter mit ID ${filterId} nicht gefunden` 
        };
      }
      
      // Filtername für Logging merken
      const filterName = this.config[websiteId].filters[filterIndex].name;
      
      // Entfernen des Filters aus Subfiltern anderer Kombinations-Filter
      this.config[websiteId].filters.forEach(filter => {
        if (filter.isCombinationFilter && Array.isArray(filter.subfilters)) {
          filter.subfilters = filter.subfilters.filter(subfilter => subfilter.id !== filterId);
        }
      });
      
      // Filter aus dem Array entfernen
      this.config[websiteId].filters.splice(filterIndex, 1);
      
      // Konfiguration speichern
      this.saveConfig();
      
      if (this.DEBUG_MODE) {
        logDebug(`🗑️ Filter "${filterName}" für Website ${websiteId} gelöscht`);
      }
      
      return { success: true };
    } catch (error) {
      logDebug(`❌ Fehler beim Löschen des Filters: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Klont einen Filter mit neuem Namen
   * @param {string} websiteId - Die Website-ID
   * @param {string} filterId - Die ID des zu klonenden Filters
   * @param {string} newName - Der Name des neuen Filters
   * @returns {Object} Der geklonte Filter oder ein Fehlerobjekt
   */
  cloneFilter(websiteId, filterId, newName) {
    try {
      this.initWebsiteConfig(websiteId);
      
      // Prüfen, ob das Maximum an Filtern erreicht ist
      if (this.config[websiteId].filters.length >= MAX_FILTERS_PER_WEBSITE) {
        return { 
          success: false, 
          error: `Maximale Anzahl von ${MAX_FILTERS_PER_WEBSITE} Filtern erreicht` 
        };
      }
      
      // Prüfen, ob der neue Name bereits existiert
      if (this.filterNameExists(websiteId, newName)) {
        return { 
          success: false, 
          error: `Ein Filter mit dem Namen "${newName}" existiert bereits` 
        };
      }
      
      // Original-Filter finden
      const originalFilter = this.config[websiteId].filters.find(filter => filter.id === filterId);
      
      if (!originalFilter) {
        return { 
          success: false, 
          error: `Filter mit ID ${filterId} nicht gefunden` 
        };
      }
      
      // Neuen Filter erstellen als Kopie des Originals
      const clonedFilter = {
        ...originalFilter,
        id: uuidv4(), // Neue ID generieren
        name: newName,
        created: Date.now(),
        updated: Date.now()
      };
      
      // Bei Kombinations-Filtern müssen wir auch die Subfilter-IDs behandeln
      if (clonedFilter.isCombinationFilter && Array.isArray(clonedFilter.subfilters)) {
        // Hier könnten wir entweder die Subfilter-Referenzen beibehalten oder
        // die Subfilter ebenfalls klonen. In diesem Fall behalten wir die Referenzen bei.
      }
      
      // Filter zur Konfiguration hinzufügen
      this.config[websiteId].filters.push(clonedFilter);
      
      // Konfiguration speichern
      this.saveConfig();
      
      if (this.DEBUG_MODE) {
        logDebug(`🔄 Filter "${originalFilter.name}" als "${newName}" für Website ${websiteId} geklont`);
      }
      
      return { success: true, filter: clonedFilter };
    } catch (error) {
      logDebug(`❌ Fehler beim Klonen des Filters: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Erstellt eine neue Filtergruppe
   * @param {string} websiteId - Die Website-ID
   * @param {string} groupName - Der Name der Gruppe
   * @returns {Object} Die erstellte Gruppe oder ein Fehlerobjekt
   */
  createGroup(websiteId, groupName) {
    try {
      this.initWebsiteConfig(websiteId);
      
      if (!groupName || groupName.trim() === '') {
        return { 
          success: false, 
          error: 'Gruppenname ist erforderlich' 
        };
      }
      
      // Prüfen, ob der Gruppenname bereits existiert
      const groupExists = this.config[websiteId].groups.some(
        group => group.name.toLowerCase() === groupName.toLowerCase()
      );
      
      if (groupExists) {
        return { 
          success: false, 
          error: `Eine Gruppe mit dem Namen "${groupName}" existiert bereits` 
        };
      }
      
      // Neue Gruppe erstellen
      const newGroup = {
        id: uuidv4(),
        name: groupName,
        created: Date.now(),
        updated: Date.now()
      };
      
      // Gruppe zur Konfiguration hinzufügen
      this.config[websiteId].groups.push(newGroup);
      
      // Konfiguration speichern
      this.saveConfig();
      
      if (this.DEBUG_MODE) {
        logDebug(`✅ Neue Filtergruppe "${groupName}" für Website ${websiteId} erstellt`);
      }
      
      return { success: true, group: newGroup };
    } catch (error) {
      logDebug(`❌ Fehler beim Erstellen der Filtergruppe: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Löscht eine Filtergruppe
   * @param {string} websiteId - Die Website-ID
   * @param {string} groupId - Die ID der zu löschenden Gruppe
   * @returns {Object} Erfolgsstatus und ggf. Fehlermeldung
   */
  deleteGroup(websiteId, groupId) {
    try {
      this.initWebsiteConfig(websiteId);
      
      // Gruppen-Index finden
      const groupIndex = this.config[websiteId].groups.findIndex(group => group.id === groupId);
      
      if (groupIndex === -1) {
        return { 
          success: false, 
          error: `Gruppe mit ID ${groupId} nicht gefunden` 
        };
      }
      
      // Gruppenname für Logging merken
      const groupName = this.config[websiteId].groups[groupIndex].name;
      
      // Alle Filter, die zu dieser Gruppe gehören, aktualisieren
      this.config[websiteId].filters.forEach(filter => {
        if (filter.group === groupId) {
          filter.group = null;
          filter.updated = Date.now();
        }
      });
      
      // Gruppe aus dem Array entfernen
      this.config[websiteId].groups.splice(groupIndex, 1);
      
      // Konfiguration speichern
      this.saveConfig();
      
      if (this.DEBUG_MODE) {
        logDebug(`🗑️ Filtergruppe "${groupName}" für Website ${websiteId} gelöscht`);
      }
      
      return { success: true };
    } catch (error) {
      logDebug(`❌ Fehler beim Löschen der Filtergruppe: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lädt alle Filter für eine Website
   * @param {string} websiteId - Die Website-ID
   * @returns {Array} Liste aller Filter
   */
  getFilters(websiteId) {
    this.initWebsiteConfig(websiteId);
    return this.config[websiteId].filters;
  }

  /**
   * Lädt alle aktiven Filter für eine Website
   * @param {string} websiteId - Die Website-ID
   * @returns {Array} Liste aller aktiven Filter
   */
  getActiveFilters(websiteId) {
    this.initWebsiteConfig(websiteId);
    return this.config[websiteId].filters.filter(filter => filter.active);
  }

  /**
   * Lädt alle Filtergruppen für eine Website
   * @param {string} websiteId - Die Website-ID
   * @returns {Array} Liste aller Filtergruppen
   */
  getGroups(websiteId) {
    this.initWebsiteConfig(websiteId);
    return this.config[websiteId].groups;
  }

  /**
   * Findet einen Filter anhand seines Namens oder seiner ID
   * @param {string} websiteId - Die Website-ID
   * @param {string} nameOrId - Name oder ID des Filters
   * @returns {Object|null} Der gefundene Filter oder null
   */
  findFilter(websiteId, nameOrId) {
    this.initWebsiteConfig(websiteId);
    
    // Erst nach ID suchen
    let filter = this.config[websiteId].filters.find(f => f.id === nameOrId);
    
    // Wenn nicht gefunden, nach Name suchen (case-insensitive)
    if (!filter) {
      filter = this.config[websiteId].filters.find(
        f => f.name.toLowerCase() === nameOrId.toLowerCase()
      );
    }
    
    return filter || null;
  }

  /**
   * Prüft, ob ein Text Schlüsselwörter enthält
   * @param {string} text - Der zu prüfende Text
   * @param {string[]} keywords - Die zu suchenden Schlüsselwörter
   * @param {string} matchType - Art der Übereinstimmung ('any' oder 'all')
   * @returns {boolean} True, wenn Schlüsselwörter gefunden wurden
   */
  textContainsKeywords(text, keywords, matchType = 'any') {
    if (!text || !keywords || keywords.length === 0) {
      return false;
    }
    
    // Text in Kleinbuchstaben umwandeln für case-insensitive Suche
    const lowerText = text.toLowerCase();
    
    if (matchType === 'all') {
      // Alle Schlüsselwörter müssen enthalten sein
      return keywords.every(keyword => 
        lowerText.includes(keyword.toLowerCase())
      );
    } else {
      // Mindestens ein Schlüsselwort muss enthalten sein
      return keywords.some(keyword => 
        lowerText.includes(keyword.toLowerCase())
      );
    }
  }

  /**
   * Prüft, ob eine E-Mail-Adresse zu einer der angegebenen Domains gehört
   * @param {string} email - Die zu prüfende E-Mail-Adresse
   * @param {string[]} domains - Die zu prüfenden Domains
   * @param {string} matchType - Art der Übereinstimmung ('include' oder 'exclude')
   * @returns {boolean} True, wenn die E-Mail zur Domain gehört/nicht gehört
   */
  emailMatchesDomains(email, domains, matchType = 'include') {
    if (!email || !domains || domains.length === 0) {
      return matchType === 'exclude'; // Bei leeren Domains: bei 'exclude' true, sonst false
    }
    
    // E-Mail-Adresse extrahieren
    const emailParts = email.toLowerCase().split('@');
    if (emailParts.length !== 2) {
      return false; // Ungültiges E-Mail-Format
    }
    
    const emailDomain = emailParts[1];
    
    // Prüfen, ob die Domain in der Liste ist
    const domainMatches = domains.some(domain => 
      emailDomain === domain.toLowerCase()
    );
    
    // Bei 'include' wollen wir true, wenn die Domain enthalten ist
    // Bei 'exclude' wollen wir true, wenn die Domain NICHT enthalten ist
    return matchType === 'include' ? domainMatches : !domainMatches;
  }

  /**
   * Prüft, ob ein Tag in der Konversation vorhanden ist
   * @param {Object} conversation - Die zu prüfende Konversation
   * @param {string[]} tags - Die zu suchenden Tags
   * @returns {boolean} True, wenn Tags gefunden wurden
   */
  conversationHasTags(conversation, tags) {
    if (!conversation || !conversation.meta || !conversation.meta.tags || !tags || tags.length === 0) {
      return false;
    }
    
    const conversationTags = conversation.meta.tags;
    
    // Prüfen, ob mindestens ein Tag vorhanden ist
    return tags.some(tag => 
      conversationTags.includes(tag)
    );
  }

  /**
   * Prüft, ob ein Operator in der Konversation vorhanden ist
   * @param {Object} conversation - Die zu prüfende Konversation
   * @param {string[]} operators - Die zu suchenden Operatoren
   * @param {string} matchType - Art der Übereinstimmung ('any', 'all', 'none')
   * @returns {boolean} True, wenn die Operator-Bedingung erfüllt ist
   */
  conversationMatchesOperators(conversation, operators, matchType = 'any') {
    if (!conversation || !conversation.meta || !conversation.meta.operators || !operators || operators.length === 0) {
      return matchType === 'none'; // Bei leeren Operatoren: bei 'none' true, sonst false
    }
    
    const conversationOperators = conversation.meta.operators;
    
    if (matchType === 'all') {
      // Alle angegebenen Operatoren müssen vorhanden sein
      return operators.every(operator => 
        conversationOperators.includes(operator)
      );
    } else if (matchType === 'none') {
      // Keiner der angegebenen Operatoren darf vorhanden sein
      return !operators.some(operator => 
        conversationOperators.includes(operator)
      );
    } else {
      // Mindestens ein angegebener Operator muss vorhanden sein
      return operators.some(operator => 
        conversationOperators.includes(operator)
      );
    }
  }

  /**
   * Berechnet die Inaktivität einer Konversation in Tagen
   * @param {Object} conversation - Die zu prüfende Konversation
   * @returns {number} Anzahl der Tage seit der letzten Aktivität
   */
  getInactivityDays(conversation) {
    if (!conversation) {
      return 0;
    }
    
    const lastActive = conversation.updated || conversation.created || 0;
    const now = Date.now();
    const diffMs = now - lastActive;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  /**
   * Prüft, ob eine Konversation den Filterkriterien eines Subfilters entspricht
   * @param {Object} conversation - Die zu prüfende Konversation
   * @param {Object} subfilter - Der anzuwendende Subfilter
   * @returns {boolean} True, wenn die Konversation dem Subfilter entspricht
   */
  conversationMatchesSubfilter(conversation, subfilter) {
    // Diese Methode kann entweder einen vollständigen Filter oder 
    // ein Subset von Filterkriterien als Subfilter verwenden
    
    // Wir können entweder einen vorhandenen Filter referenzieren oder
    // direkt Filterkriterien im Subfilter definieren
    
    // Referenzierter Filter
    if (subfilter.filterId) {
      const websiteId = conversation.website_id;
      const referencedFilter = this.findFilter(websiteId, subfilter.filterId);
      
      if (!referencedFilter) {
        return false;
      }
      
      return this.conversationMatchesFilter(conversation, referencedFilter);
    }
    
    // Direkte Kriterien (vereinfachte Version eines Filters)
    return this.conversationMatchesFilter(conversation, subfilter);
  }

  /**
   * Prüft, ob eine Konversation den Filterkriterien entspricht
   * @param {Object} conversation - Die zu prüfende Konversation
   * @param {Object} filter - Der anzuwendende Filter
   * @returns {boolean} True, wenn die Konversation dem Filter entspricht
   */
  conversationMatchesFilter(conversation, filter) {
    // Spezialfall: Kombinations-Filter
    if (filter.isCombinationFilter && Array.isArray(filter.subfilters) && filter.subfilters.length > 0) {
      // Logik basierend auf der Kombinationsoperation (AND/OR)
      if (filter.combinationOperation === 'AND') {
        // Alle Subfilter müssen zutreffen
        return filter.subfilters.every(subfilter => 
          this.conversationMatchesSubfilter(conversation, subfilter)
        );
      } else {
        // Mindestens ein Subfilter muss zutreffen
        return filter.subfilters.some(subfilter => 
          this.conversationMatchesSubfilter(conversation, subfilter)
        );
      }
    }
    
    // 1. Prüfen, ob die Konversation geschlossen sein muss
    if (filter.closedOnly && conversation.status !== 'closed') {
      return false;
    }
    
    // 2. Prüfen, ob das Alter der Konversation den Kriterien entspricht
    if (filter.maxDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filter.maxDays);
      const cutoffTimestamp = cutoffDate.getTime();
      
      const lastActive = conversation.updated || conversation.created || 0;
      if (lastActive > cutoffTimestamp) {
        return false;
      }
    }
    
    // 3. Prüfen, ob die Plattform übereinstimmt (wenn nicht "alle" ausgewählt)
    if (filter.platforms && filter.platforms.length > 0 && !filter.platforms.includes('alle')) {
      const origin = conversation.meta && conversation.meta.origin;
      if (!origin || !filter.platforms.includes(origin)) {
        return false;
      }
    }
    
    // 4. NEUE FUNKTIONEN - Erweiterte Filterkriterien prüfen
    
    // 4.1 Inaktivitätsfilter
    if (filter.inactivityEnabled && filter.inactivityDays) {
      const inactiveDays = this.getInactivityDays(conversation);
      if (inactiveDays < filter.inactivityDays) {
        return false;
      }
    }
    
    // 4.2 Wort/Phrasenerkennung (vereinfachte Version - tatsächliche Implementierung müsste
    // alle Nachrichten der Konversation durchsuchen)
    if (filter.keywordEnabled && filter.keywords && filter.keywords.length > 0) {
      // Hier würden wir normalerweise alle Nachrichten der Konversation durchsuchen.
      // Da dies aufwändig ist, prüfen wir hier nur die Vorschau als Beispiel.
      if (conversation.preview) {
        const keywordMatch = this.textContainsKeywords(
          conversation.preview,
          filter.keywords,
          filter.keywordMatchType
        );
        
        if (!keywordMatch) {
          return false;
        }
      }
    }
    
    // 4.3 Benutzermerkmale (hier: E-Mail-Domain)
    if (filter.userAttributesEnabled && filter.emailDomains && filter.emailDomains.length > 0) {
      const userEmail = conversation.meta && conversation.meta.email;
      
      if (userEmail) {
        const emailMatch = this.emailMatchesDomains(
          userEmail,
          filter.emailDomains,
          filter.emailDomainMatchType
        );
        
        if (!emailMatch) {
          return false;
        }
      }
    }
    
    // 4.4 Prioritäts-Tags
    if (filter.tagsEnabled) {
      // Zu exkludierende Tags prüfen (wenn vorhanden, abbrechen)
      if (filter.excludeTags && filter.excludeTags.length > 0) {
        if (this.conversationHasTags(conversation, filter.excludeTags)) {
          return false;
        }
      }
      
      // Zu inkludierende Tags prüfen (wenn angegeben, müssen sie vorhanden sein)
      if (filter.includeTags && filter.includeTags.length > 0) {
        if (!this.conversationHasTags(conversation, filter.includeTags)) {
          return false;
        }
      }
    }
    
    // 4.5 Operator-Filter
    if (filter.operatorsEnabled && filter.operators && filter.operators.length > 0) {
      const operatorMatch = this.conversationMatchesOperators(
        conversation,
        filter.operators,
        filter.operatorMatchType
      );
      
      if (!operatorMatch) {
        return false;
      }
    }
    
    // Wenn alle Kriterien erfüllt sind, gibt die Konversation einen Match
    return true;
  }

  /**
   * Findet Segmente, die den Filter-Kriterien entsprechen
   * @param {Object} conversation - Die vollständige Konversation mit Nachrichten
   * @param {Object} filter - Der anzuwendende Filter
   * @returns {Array} IDs der zu löschenden Segmente
   */
  findSegmentsToDelete(conversation, filter) {
    if (!conversation || !conversation.messages || !Array.isArray(conversation.messages)) {
      return [];
    }
    
    // Wenn keine Segment-Filter definiert sind, nichts löschen
    if (!filter.includeSegments || filter.includeSegments.length === 0) {
      return [];
    }
    
    const segmentsToDelete = [];
    
    // Alle Nachrichten durchgehen
    for (const message of conversation.messages) {
      // Prüfen, ob die Nachricht ein zu löschendes Segment enthält
      const matchesInclude = filter.includeSegments.some(segment => {
        if (typeof message.content !== 'string') return false;
        return message.content.toLowerCase().includes(segment.toLowerCase());
      });
      
      // Prüfen, ob die Nachricht ein zu schützendes Segment enthält
      const matchesExclude = filter.excludeSegments && filter.excludeSegments.some(segment => {
        if (typeof message.content !== 'string') return false;
        return message.content.toLowerCase().includes(segment.toLowerCase());
      });
      
      // Wenn die Nachricht zu löschen ist UND nicht geschützt ist
      if (matchesInclude && !matchesExclude) {
        segmentsToDelete.push(message.fingerprint);
      }
    }
    
    return segmentsToDelete;
  }

  /**
   * Führt einen simulierten Cleanup für einen Filter durch
   * @param {string} websiteId - Die Website-ID
   * @param {string} filterId - Die ID des Filters
   * @returns {Promise<Object>} Ergebnis mit betroffenen Konversationen
   */
  async simulateCleanup(websiteId, filterId) {
    try {
      const filter = this.findFilter(websiteId, filterId);
      
      if (!filter) {
        return { 
          success: false, 
          error: `Filter mit ID/Name ${filterId} nicht gefunden` 
        };
      }
      
      if (this.DEBUG_MODE) {
        logDebug(`🧪 Starte Cleanup-Simulation für Filter "${filter.name}"`);
      }
      
      // Simulation über crisp_client durchführen
      const result = await crispClient.simulateCleanup(websiteId, filter);
      
      if (this.DEBUG_MODE) {
        logDebug(`🧪 Simulation ergab ${result.count} zu löschende Konversationen`);
      }
      
      return { 
        success: true, 
        filter: filter.name,
        count: result.count,
        conversations: result.conversations 
      };
    } catch (error) {
      logDebug(`❌ Fehler bei der Cleanup-Simulation: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Führt einen Cleanup für einen Filter durch
   * @param {string} websiteId - Die Website-ID
   * @param {string} filterId - Die ID des Filters
   * @param {boolean} dryRun - Wenn true, werden keine tatsächlichen Löschungen durchgeführt
   * @returns {Promise<Object>} Ergebnis des Cleanups
   */
  async runCleanup(websiteId, filterId, dryRun = false) {
    try {
      const filter = this.findFilter(websiteId, filterId);
      
      if (!filter) {
        return { 
          success: false, 
          error: `Filter mit ID/Name ${filterId} nicht gefunden` 
        };
      }
      
      if (this.DEBUG_MODE) {
        logDebug(`🧹 Starte ${dryRun ? 'Testlauf' : 'Cleanup'} für Filter "${filter.name}"`);
      }
      
      // Schritt 1: Konversationen anhand der Filterkriterien finden
      const matchingConversations = await crispClient.filterConversations(websiteId, filter);
      
      if (this.DEBUG_MODE) {
        logDebug(`🔍 ${matchingConversations.length} passende Konversationen gefunden`);
      }
      
      // Bei Testlauf hier abbrechen und Ergebnis zurückgeben
      if (dryRun) {
        return {
          success: true,
          filter: filter.name,
          count: matchingConversations.length,
          conversations: matchingConversations.map(c => ({
            id: c.session_id,
            preview: c.preview || "(keine Vorschau verfügbar)"
          }))
        };
      }
      
      // Schritt 2: Entweder ganze Konversationen oder nur Segmente löschen
      let deletedCount = 0;
      let errorCount = 0;
      
      if (filter.deleteSegmentsOnly && 
          (filter.includeSegments && filter.includeSegments.length > 0)) {
        // Nur bestimmte Segmente löschen
        for (const conversation of matchingConversations) {
          try {
            // Vollständige Konversation mit Nachrichten laden
            const fullConversation = await crispClient.getConversation(websiteId, conversation.session_id);
            
            if (!fullConversation || !fullConversation.data) {
              continue;
            }
            
            // Segmente identifizieren, die gelöscht werden sollen
            const segmentsToDelete = this.findSegmentsToDelete(fullConversation.data, filter);
            
            if (segmentsToDelete.length > 0) {
              // Segmente löschen
              const deleted = await crispClient.deleteSegments(websiteId, conversation.session_id, segmentsToDelete);
              
              if (deleted > 0) {
                deletedCount++;
              }
            }
          } catch (error) {
            errorCount++;
            logDebug(`❌ Fehler beim Löschen von Segmenten: ${error.message}`);
          }
        }
      } else {
        // Ganze Konversationen löschen
        const sessionIds = matchingConversations.map(c => c.session_id);
        
        if (sessionIds.length > 0) {
          const bulkResult = await crispClient.bulkDeleteConversations(websiteId, sessionIds, progress => {
            if (this.DEBUG_MODE && progress.percent % 10 === 0) {
              logDebug(`⏳ Löschfortschritt: ${progress.percent}% (${progress.current}/${progress.total})`);
            }
          });
          
          deletedCount = bulkResult.successful;
          errorCount = bulkResult.failed;
        }
      }
      
      // Logge das Ergebnis
      log(`Filter "${filter.name}": ${deletedCount} von ${matchingConversations.length} Konversationen gelöscht, ${errorCount} Fehler`);
      
      if (this.DEBUG_MODE) {
        logDebug(`✅ Cleanup abgeschlossen: ${deletedCount} gelöscht, ${errorCount} Fehler`);
      }
      
      return {
        success: true,
        filter: filter.name,
        total: matchingConversations.length,
        deleted: deletedCount,
        errors: errorCount
      };
    } catch (error) {
      logDebug(`❌ Fehler beim Ausführen des Cleanups: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Löscht alle Daten für eine Website (beim Trennen des Plugins)
   * @param {string} websiteId - Die zu löschende Website-ID
   * @returns {Object} Erfolgsstatus und ggf. Fehlermeldung
   */
  removeWebsiteData(websiteId) {
    try {
      if (this.config[websiteId]) {
        delete this.config[websiteId];
        this.saveConfig();
        
        if (this.DEBUG_MODE) {
          logDebug(`🗑️ Alle Daten für Website ${websiteId} gelöscht`);
        }
        
        // Löschung im regulären Log protokollieren
        log(`Alle Filterdaten für Website ${websiteId} wurden gelöscht`);
        
        return { success: true };
      } else {
        return { success: false, error: `Keine Daten für Website ${websiteId} gefunden` };
      }
    } catch (error) {
      logDebug(`❌ Fehler beim Löschen der Website-Daten: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new FilterManager();