/**
 * api.js
 * Frontend-Kommunikationsmodul für die WipeBot-REST-API
 * 
 * Dieses Modul stellt umfassende Funktionen für das WipeBot-Frontend bereit:
 * - CRUD-Operationen für Filter und Gruppen
 * - Cleanup-Operationen (Test und Ausführung)
 * - System- und Statusabfragen
 * - Import/Export von Konfigurationen
 * - Erweiterte Statistik-Funktionen
 * - Validierung und Vorschau
 */

// Cache-Speicher für häufig abgefragte Daten
const cache = {
  platforms: null,
  mailboxes: null,
  platformsTimestamp: 0,
  mailboxesTimestamp: 0,
  statisticsTimestamp: 0,
  statistics: null,
  CACHE_DURATION: 5 * 60 * 1000 // 5 Minuten in Millisekunden
};

// Maximale Anzahl an Wiederholungsversuchen bei Netzwerkfehlern
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 Sekunde zwischen Wiederholungsversuchen

// Statusindikator für Benutzer-Feedback
const statusIndicator = {
  show: (message) => {
    const indicator = document.getElementById('statusIndicator') || createStatusIndicator();
    indicator.textContent = message;
    indicator.style.display = 'block';
    return indicator;
  },
  hide: () => {
    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  },
  error: (message) => {
    const indicator = statusIndicator.show(message);
    indicator.classList.add('error');
    setTimeout(() => {
      statusIndicator.hide();
      indicator.classList.remove('error');
    }, 5000);
  },
  success: (message) => {
    const indicator = statusIndicator.show(message);
    indicator.classList.add('success');
    setTimeout(() => {
      statusIndicator.hide();
      indicator.classList.remove('success');
    }, 3000);
  },
  progress: (percentage) => {
    const indicator = statusIndicator.show(`${percentage}% abgeschlossen`);
    // Optional: Fortschrittsbalken hinzufügen
    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    progress.style.width = `${percentage}%`;
    indicator.appendChild(progress);
    return indicator;
  }
};

// Hilfsfunktion zum Erstellen des Statusindikators
function createStatusIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'statusIndicator';
  indicator.style.position = 'fixed';
  indicator.style.bottom = '20px';
  indicator.style.right = '20px';
  indicator.style.padding = '12px 20px';
  indicator.style.background = '#2a2a2a';
  indicator.style.color = 'white';
  indicator.style.borderRadius = '4px';
  indicator.style.zIndex = '10000';
  indicator.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  indicator.style.transition = 'all 0.3s ease';
  indicator.style.display = 'none';
  document.body.appendChild(indicator);
  
  // Styles für Erfolgs- und Fehlerzustände
  const style = document.createElement('style');
  style.textContent = `
    #statusIndicator.success {
      background: #10b981;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
    }
    #statusIndicator.error {
      background: #ef4444;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
    }
    .progress-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 4px;
      background: rgba(255, 255, 255, 0.7);
      border-radius: 0 0 4px 4px;
      transition: width 0.3s ease;
    }
  `;
  document.head.appendChild(style);
  
  return indicator;
}

/**
 * Erweiterte Fehlerbehandlung mit automatischer Klassifizierung
 * @param {Error} error - Der aufgetretene Fehler
 * @returns {Object} Klassifizierter Fehler mit Benutzerhinweisen
 */
function classifyError(error) {
  // Netzwerkfehler
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Netzwerkfehler: Bitte überprüfe deine Internetverbindung',
      original: error,
      retry: true
    };
  }
  
  // API-Fehler mit Status-Code
  if (error.status) {
    if (error.status === 401 || error.status === 403) {
      return {
        type: 'auth',
        message: 'Authentifizierungsfehler: Bitte lade die Seite neu und melde dich erneut an',
        original: error,
        retry: false
      };
    }
    
    if (error.status === 429) {
      return {
        type: 'rateLimit',
        message: 'Zu viele Anfragen: Bitte warte einen Moment und versuche es erneut',
        original: error,
        retry: true
      };
    }
    
    if (error.status >= 500) {
      return {
        type: 'server',
        message: 'Serverfehler: Das WipeBot-Backend ist derzeit nicht verfügbar',
        original: error,
        retry: true
      };
    }
  }
  
  // Validierungsfehler
  if (error.message && error.message.includes('Validierung')) {
    return {
      type: 'validation',
      message: error.message,
      original: error,
      retry: false
    };
  }
  
  // Allgemeiner Fehler
  return {
    type: 'unknown',
    message: error.message || 'Ein unbekannter Fehler ist aufgetreten',
    original: error,
    retry: false
  };
}

/**
 * Verbesserte HTTP-Anfragen mit Wiederholungslogik und Fehlerklassifizierung
 * @param {string} url - Die URL für die Anfrage
 * @param {Object} options - Optionen für fetch (Methode, Body, etc.)
 * @param {number} retryCount - Aktuelle Anzahl der Wiederholungsversuche (intern)
 * @returns {Promise<Object>} - Die Antwort als JSON
 */
async function fetchWithErrorHandling(url, options = {}, retryCount = 0) {
  const indicator = options.silent ? null : statusIndicator.show('Wird geladen...');
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { error: 'Ungültiges JSON in der Antwort' };
    }
    
    if (!response.ok) {
      const error = new Error(data.error || `HTTP Fehler ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    
    if (indicator && !options.silent) {
      statusIndicator.hide();
    }
    
    return data;
  } catch (error) {
    console.error('API Fehler:', error);
    
    // Fehler klassifizieren und Wiederholungslogik anwenden
    const classifiedError = classifyError(error);
    
    if (classifiedError.retry && retryCount < MAX_RETRIES) {
      if (indicator && !options.silent) {
        statusIndicator.show(`Wiederhole Anfrage (${retryCount + 1}/${MAX_RETRIES})...`);
      }
      
      // Exponentielles Backoff für Wiederholungen
      const delay = RETRY_DELAY * Math.pow(2, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return fetchWithErrorHandling(url, options, retryCount + 1);
    }
    
    if (indicator && !options.silent) {
      statusIndicator.error(classifiedError.message);
    }
    
    throw classifiedError;
  }
}

/**
 * Lädt die Konfiguration für die aktuelle Website
 * @returns {Promise<Object>} Konfigurationsobjekt mit Filtern und Gruppen
 */
export async function loadConfig() {
  try {
    statusIndicator.show('Lade Konfiguration...');
    
    // Website-ID holen
    const websiteId = getWebsiteId();
    
    // Filter und Gruppen parallel laden
    const [filtersResponse, groupsResponse] = await Promise.all([
      fetchWithErrorHandling(`/api/filters/${websiteId}`, { silent: true }),
      fetchWithErrorHandling(`/api/groups/${websiteId}`, { silent: true })
    ]);
    
    statusIndicator.success('Konfiguration geladen');
    
    return {
      filters: filtersResponse.filters || [],
      groups: groupsResponse.groups || []
    };
  } catch (error) {
    statusIndicator.error(`Konfiguration konnte nicht geladen werden: ${error.message}`);
    
    // Leere Konfiguration zurückgeben, damit das UI nicht crasht
    return {
      filters: [],
      groups: []
    };
  }
}

/**
 * Speichert einen neuen oder aktualisierten Filter
 * @param {Object} filter - Der zu speichernde Filter
 * @param {boolean} isNew - Gibt an, ob es ein neuer Filter ist
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function saveFilter(filter, isNew = true) {
  try {
    // Zuerst Filter validieren
    const validationResult = await validateFilter(filter);
    if (!validationResult.valid) {
      throw new Error(`Validierungsfehler: ${validationResult.errors.join(', ')}`);
    }
    
    const websiteId = getWebsiteId();
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew 
      ? `/api/filters/${websiteId}`
      : `/api/filters/${websiteId}/${filter.id}`;
    
    statusIndicator.show(isNew ? 'Filter wird erstellt...' : 'Filter wird aktualisiert...');
    
    const response = await fetchWithErrorHandling(url, {
      method,
      body: JSON.stringify(filter)
    });
    
    statusIndicator.success(isNew ? 'Filter erstellt' : 'Filter aktualisiert');
    return response;
  } catch (error) {
    throw new Error(`Filter konnte nicht gespeichert werden: ${error.message}`);
  }
}

/**
 * Löscht einen Filter
 * @param {string} filterId - Die ID des zu löschenden Filters
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function deleteFilter(filterId) {
  try {
    const websiteId = getWebsiteId();
    
    statusIndicator.show('Filter wird gelöscht...');
    
    const response = await fetchWithErrorHandling(`/api/filters/${websiteId}/${filterId}`, {
      method: 'DELETE'
    });
    
    statusIndicator.success('Filter gelöscht');
    return response;
  } catch (error) {
    throw new Error(`Filter konnte nicht gelöscht werden: ${error.message}`);
  }
}

/**
 * Klont einen bestehenden Filter
 * @param {string} filterId - Die ID des zu klonenden Filters
 * @param {string} newName - Der Name des neuen Filters
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function cloneFilter(filterId, newName) {
  try {
    const websiteId = getWebsiteId();
    
    statusIndicator.show('Filter wird geklont...');
    
    const response = await fetchWithErrorHandling(`/api/filters/${websiteId}/${filterId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ newName })
    });
    
    statusIndicator.success('Filter geklont');
    return response;
  } catch (error) {
    throw new Error(`Filter konnte nicht geklont werden: ${error.message}`);
  }
}

/**
 * Erstellt eine neue Filtergruppe
 * @param {string} name - Der Name der neuen Gruppe
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function createGroup(name) {
  try {
    const websiteId = getWebsiteId();
    
    statusIndicator.show('Gruppe wird erstellt...');
    
    const response = await fetchWithErrorHandling(`/api/groups/${websiteId}`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    
    statusIndicator.success('Gruppe erstellt');
    return response;
  } catch (error) {
    throw new Error(`Gruppe konnte nicht erstellt werden: ${error.message}`);
  }
}

/**
 * Löscht eine Filtergruppe
 * @param {string} groupId - Die ID der zu löschenden Gruppe
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function deleteGroup(groupId) {
  try {
    const websiteId = getWebsiteId();
    
    statusIndicator.show('Gruppe wird gelöscht...');
    
    const response = await fetchWithErrorHandling(`/api/groups/${websiteId}/${groupId}`, {
      method: 'DELETE'
    });
    
    statusIndicator.success('Gruppe gelöscht');
    return response;
  } catch (error) {
    throw new Error(`Gruppe konnte nicht gelöscht werden: ${error.message}`);
  }
}

/**
 * Führt einen Cleanup-Test für einen Filter durch
 * @param {string} filterId - Die ID des Filters
 * @returns {Promise<Object>} Das Ergebnis mit betroffenen Konversationen
 */
export async function testCleanup(filterId) {
  try {
    const websiteId = getWebsiteId();
    
    statusIndicator.show('Testlauf wird durchgeführt...');
    
    const response = await fetchWithErrorHandling(`/api/cleanup/${websiteId}/${filterId}/test`, {
      method: 'POST'
    });
    
    statusIndicator.success('Testlauf abgeschlossen');
    return response;
  } catch (error) {
    throw new Error(`Testlauf konnte nicht durchgeführt werden: ${error.message}`);
  }
}

/**
 * Führt einen echten Cleanup für einen Filter durch
 * @param {string} filterId - Die ID des Filters
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function runCleanupNow(filterId) {
  try {
    const websiteId = getWebsiteId();
    
    // Bestätigung vom Benutzer einholen
    if (!confirm('Möchtest du wirklich alle passenden Chats löschen? Diese Aktion kann nicht rückgängig gemacht werden!')) {
      return { success: false, canceled: true };
    }
    
    statusIndicator.show('Cleanup wird ausgeführt...');
    
    const response = await fetchWithErrorHandling(`/api/cleanup/${websiteId}/${filterId}`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true })
    });
    
    statusIndicator.success('Cleanup abgeschlossen');
    return response;
  } catch (error) {
    throw new Error(`Cleanup konnte nicht durchgeführt werden: ${error.message}`);
  }
}

/**
 * Lädt alle verfügbaren Plattformen für die aktuelle Website
 * @param {boolean} forceRefresh - Erzwingt ein Neuladen der Daten
 * @returns {Promise<Array>} Liste der verfügbaren Plattformen
 */
export async function loadPlatforms(forceRefresh = false) {
  try {
    const now = Date.now();
    
    // Cache verwenden, wenn nicht abgelaufen und kein Neuladen erzwungen
    if (
      cache.platforms && 
      !forceRefresh && 
      now - cache.platformsTimestamp < cache.CACHE_DURATION
    ) {
      return cache.platforms;
    }
    
    const websiteId = getWebsiteId();
    
    const response = await fetchWithErrorHandling(`/api/platforms/${websiteId}`, {
      silent: true
    });
    
    // Cache aktualisieren
    cache.platforms = response.platforms || [];
    cache.platformsTimestamp = now;
    
    return cache.platforms;
  } catch (error) {
    console.error('Fehler beim Laden der Plattformen:', error);
    return [];
  }
}

/**
 * Lädt alle verfügbaren Mailboxes für die aktuelle Website
 * @param {boolean} forceRefresh - Erzwingt ein Neuladen der Daten
 * @returns {Promise<Array>} Liste der verfügbaren Mailboxes
 */
export async function loadMailboxes(forceRefresh = false) {
  try {
    const now = Date.now();
    
    // Cache verwenden, wenn nicht abgelaufen und kein Neuladen erzwungen
    if (
      cache.mailboxes && 
      !forceRefresh && 
      now - cache.mailboxesTimestamp < cache.CACHE_DURATION
    ) {
      return cache.mailboxes;
    }
    
    const websiteId = getWebsiteId();
    
    const response = await fetchWithErrorHandling(`/api/mailboxes/${websiteId}`, {
      silent: true
    });
    
    // Cache aktualisieren
    cache.mailboxes = response.mailboxes || [];
    cache.mailboxesTimestamp = now;
    
    return cache.mailboxes;
  } catch (error) {
    console.error('Fehler beim Laden der Mailboxes:', error);
    return [];
  }
}

/**
 * Trennt das Plugin von der aktuellen Website
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function disconnectPlugin() {
  try {
    const websiteId = getWebsiteId();
    
    // Bestätigung vom Benutzer einholen
    if (!confirm('WARNUNG: Möchtest du wirklich das WipeBot-Plugin von dieser Website trennen? Alle Filter und Einstellungen werden unwiderruflich gelöscht!')) {
      return { success: false, canceled: true };
    }
    
    // Zusätzliche Sicherheitsabfrage
    if (!confirm('Bist du WIRKLICH sicher? Diese Aktion kann nicht rückgängig gemacht werden!')) {
      return { success: false, canceled: true };
    }
    
    statusIndicator.show('Plugin wird getrennt...');
    
    const response = await fetchWithErrorHandling(`/api/plugin/${websiteId}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true })
    });
    
    statusIndicator.success('Plugin erfolgreich getrennt');
    
    // Nach kurzer Verzögerung Seite neu laden oder schließen
    setTimeout(() => {
      window.location.reload();
    }, 2000);
    
    return response;
  } catch (error) {
    throw new Error(`Plugin konnte nicht getrennt werden: ${error.message}`);
  }
}

/**
 * Lädt Statistiken für das Plugin
 * @param {boolean} forceRefresh - Erzwingt ein Neuladen der Daten
 * @returns {Promise<Object>} Statistiken über Filterausführungen
 */
export async function loadStatistics(forceRefresh = false) {
  try {
    const now = Date.now();
    
    // Cache verwenden, wenn nicht abgelaufen und kein Neuladen erzwungen
    if (
      cache.statistics && 
      !forceRefresh && 
      now - cache.statisticsTimestamp < cache.CACHE_DURATION
    ) {
      return cache.statistics;
    }
    
    const websiteId = getWebsiteId();
    
    const response = await fetchWithErrorHandling(`/api/statistics/${websiteId}`, {
      silent: true
    });
    
    // Cache aktualisieren
    cache.statistics = response.statistics || {};
    cache.statisticsTimestamp = now;
    
    return cache.statistics;
  } catch (error) {
    console.error('Fehler beim Laden der Statistiken:', error);
    return {};
  }
}

/**
 * Setzt die Statistiken für eine Website zurück
 * @returns {Promise<Object>} Ergebnis des Zurücksetzens
 */
export async function resetStatistics() {
  try {
    // Website-ID holen
    const websiteId = getWebsiteId();
    
    // Bestätigungsabfrage wurde bereits in der UI vorgenommen
    const response = await fetchWithErrorHandling(`/api/statistics/${websiteId}/reset`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true })
    });
    
    statusIndicator.success('Statistiken wurden zurückgesetzt');
    return response;
  } catch (error) {
    console.error("Fehler beim Zurücksetzen der Statistiken:", error);
    statusIndicator.error(`Statistiken konnten nicht zurückgesetzt werden: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Hilfsfunktion zum Extrahieren der Website-ID
 * @returns {string} Die aktuelle Website-ID
 */
function getWebsiteId() {
  // Versuch, die Website-ID aus der URL zu extrahieren
  const urlParams = new URLSearchParams(window.location.search);
  const websiteId = urlParams.get('website_id');
  
  if (websiteId) {
    return websiteId;
  }
  
  // Fallback: Versuchen, die Website-ID aus dem Crisp-Kontext zu bekommen
  if (window.$crisp && window.$crisp.get) {
    return window.$crisp.get('website:id');
  }
  
  // Fallback für Testumgebung
  return '3297e6f7-69b7-4b60-87bd-d22c65bbacc8';
}

/**
 * NEUE FUNKTION: Holt eine Live-Vorschau, wie viele Chats von einem Filter betroffen wären
 * @param {string} filterId - Die ID des Filters
 * @returns {Promise<Object>} Anzahl und Beispiele betroffener Konversationen
 */
export async function getFilterPreview(filterId) {
  try {
    const websiteId = getWebsiteId();
    
    statusIndicator.show('Vorschau wird geladen...');
    
    const response = await fetchWithErrorHandling(
      `/api/filters/${websiteId}/${filterId}/preview`, 
      { silent: true }
    );
    
    statusIndicator.hide();
    return response;
  } catch (error) {
    console.error('Fehler beim Laden der Filtervorschau:', error);
    return { count: 0, conversations: [] };
  }
}

/**
 * NEUE FUNKTION: Aktualisiert die Reihenfolge von Filtern in einer Gruppe
 * @param {string} groupId - Die ID der Gruppe
 * @param {Array<string>} filterIds - Die sortierten Filter-IDs in neuer Reihenfolge
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function updateFilterOrder(groupId, filterIds) {
  try {
    const websiteId = getWebsiteId();
    
    const response = await fetchWithErrorHandling(`/api/groups/${websiteId}/${groupId}/order`, {
      method: 'PUT',
      body: JSON.stringify({ filterIds }),
      silent: true
    });
    
    return response;
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Filterreihenfolge:', error);
    throw new Error(`Reihenfolge konnte nicht aktualisiert werden: ${error.message}`);
  }
}

/**
 * NEUE FUNKTION: Lädt detaillierte Statistiken für einen bestimmten Zeitraum
 * @param {string} period - Der Zeitraum ('day', 'week', 'month', 'all')
 * @returns {Promise<Object>} Detaillierte Statistikdaten
 */
export async function getDetailedStatistics(period = 'week') {
  try {
    const websiteId = getWebsiteId();
    
    const response = await fetchWithErrorHandling(
      `/api/statistics/${websiteId}/detailed?period=${period}`,
      { silent: true }
    );
    
    return response.statistics || {};
  } catch (error) {
    console.error('Fehler beim Laden detaillierter Statistiken:', error);
    return {};
  }
}

/**
 * NEUE FUNKTION: Exportiert alle Filter und Gruppen als JSON-Datei
 * @returns {Promise<void>} Initiiert den Download der Exportdatei
 */
export async function exportFiltersAndGroups() {
  try {
    const websiteId = getWebsiteId();
    statusIndicator.show('Exportiere Filter...');
    
    const response = await fetchWithErrorHandling(`/api/export/${websiteId}`, {
      method: 'GET'
    });
    
    // Erzeuge Download
    const blob = new Blob([JSON.stringify(response.data, null, 2)], 
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wipebot-config-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    statusIndicator.success('Export abgeschlossen');
  } catch (error) {
    statusIndicator.error(`Export fehlgeschlagen: ${error.message}`);
  }
}

/**
 * NEUE FUNKTION: Importiert Filter und Gruppen aus einer JSON-Datei
 * @param {File} file - Die hochgeladene JSON-Datei
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function importFiltersAndGroups(file) {
  try {
    const websiteId = getWebsiteId();
    statusIndicator.show('Importiere Filter...');
    
    // Datei lesen
    const content = await file.text();
    const data = JSON.parse(content);
    
    // An API senden
    const response = await fetchWithErrorHandling(`/api/import/${websiteId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    statusIndicator.success('Import abgeschlossen');
    return response;
  } catch (error) {
    statusIndicator.error(`Import fehlgeschlagen: ${error.message}`);
    throw new Error(`Import fehlgeschlagen: ${error.message}`);
  }
}

/**
 * NEUE FUNKTION: Aktiviert oder deaktiviert mehrere Filter gleichzeitig
 * @param {Array<string>} filterIds - Liste der Filter-IDs
 * @param {boolean} active - Der neue Aktivierungsstatus
 * @returns {Promise<Object>} Das Ergebnis der Operation
 */
export async function batchUpdateFilterStatus(filterIds, active) {
  try {
    const websiteId = getWebsiteId();
    statusIndicator.show(`Filter werden ${active ? 'aktiviert' : 'deaktiviert'}...`);
    
    const response = await fetchWithErrorHandling(`/api/filters/${websiteId}/batch/status`, {
      method: 'PUT',
      body: JSON.stringify({ filterIds, active })
    });
    
    statusIndicator.success(`${filterIds.length} Filter ${active ? 'aktiviert' : 'deaktiviert'}`);
    return response;
  } catch (error) {
    throw new Error(`Statusaktualisierung fehlgeschlagen: ${error.message}`);
  }
}

/**
 * NEUE FUNKTION: Validiert Filtereinstellungen, bevor sie gespeichert werden
 * @param {Object} filter - Der zu validierende Filter
 * @returns {Promise<Object>} Validierungsergebnis mit etwaigen Fehlern
 */
export async function validateFilter(filter) {
  try {
    const websiteId = getWebsiteId();
    
    const response = await fetchWithErrorHandling(`/api/filters/${websiteId}/validate`, {
      method: 'POST',
      body: JSON.stringify(filter),
      silent: true
    });
    
    return response;
  } catch (error) {
    console.error('Validierungsfehler:', error);
    return { 
      valid: false, 
      errors: [error.message]
    };
  }
}

/**
 * NEUE FUNKTION: Ruft Informationen über den Status des Cron-Schedulers ab
 * @returns {Promise<Object>} Status des Schedulers und geplante Jobs
 */
export async function getSchedulerStatus() {
  try {
    const response = await fetchWithErrorHandling('/api/system/scheduler', {
      silent: true
    });
    
    return response;
  } catch (error) {
    console.error('Fehler beim Abrufen des Scheduler-Status:', error);
    return { running: false, error: error.message };
  }
}

/**
 * NEUE FUNKTION: Aktiviert oder deaktiviert Feedback-Modus für UI-Verbesserungen
 * @param {boolean} enabled - Ob der Feedback-Modus aktiviert sein soll
 */
export function toggleFeedbackMode(enabled) {
  if (enabled) {
    // Feedback-UI aktivieren
    const feedbackButton = document.createElement('button');
    feedbackButton.id = 'feedbackButton';
    feedbackButton.textContent = '💬 Feedback geben';
    feedbackButton.style.position = 'fixed';
    feedbackButton.style.bottom = '20px';
    feedbackButton.style.left = '20px';
    feedbackButton.style.zIndex = '9999';
    feedbackButton.style.padding = '8px 16px';
    feedbackButton.style.borderRadius = '4px';
    feedbackButton.style.background = '#4f46e5';
    feedbackButton.style.color = 'white';
    feedbackButton.style.border = 'none';
    feedbackButton.style.cursor = 'pointer';
    feedbackButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    
    feedbackButton.addEventListener('click', () => {
      // Einfaches Feedback-Modal öffnen
      const feedbackModal = document.createElement('div');
      feedbackModal.style.position = 'fixed';
      feedbackModal.style.top = '0';
      feedbackModal.style.left = '0';
      feedbackModal.style.width = '100%';
      feedbackModal.style.height = '100%';
      feedbackModal.style.background = 'rgba(0,0,0,0.7)';
      feedbackModal.style.zIndex = '10000';
      feedbackModal.style.display = 'flex';
      feedbackModal.style.alignItems = 'center';
      feedbackModal.style.justifyContent = 'center';
      
      const modalContent = document.createElement('div');
      modalContent.style.background = 'white';
      modalContent.style.padding = '24px';
      modalContent.style.borderRadius = '8px';
      modalContent.style.width = '500px';
      modalContent.style.maxWidth = '90%';
      
      modalContent.innerHTML = `
        <h3 style="margin-top: 0;">Dein Feedback zu WipeBot</h3>
        <p>Was funktioniert gut, und was könnte verbessert werden?</p>
        <textarea id="feedbackText" style="width: 100%; min-height: 150px; padding: 8px; margin-bottom: 16px;"></textarea>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button id="cancelFeedback" style="padding: 8px 16px;">Abbrechen</button>
          <button id="submitFeedback" style="padding: 8px 16px; background: #4f46e5; color: white; border: none;">Senden</button>
        </div>
      `;
      
      feedbackModal.appendChild(modalContent);
      document.body.appendChild(feedbackModal);
      
      document.getElementById('cancelFeedback').addEventListener('click', () => {
        document.body.removeChild(feedbackModal);
      });
      
      document.getElementById('submitFeedback').addEventListener('click', async () => {
        const feedbackText = document.getElementById('feedbackText').value;
        if (!feedbackText.trim()) {
          alert('Bitte gib ein Feedback ein.');
          return;
        }
        
        try {
          const websiteId = getWebsiteId();
          await fetchWithErrorHandling(`/api/feedback/${websiteId}`, {
            method: 'POST',
            body: JSON.stringify({ feedback: feedbackText })
          });
          
          document.body.removeChild(feedbackModal);
          statusIndicator.success('Vielen Dank für dein Feedback!');
        } catch (error) {
          statusIndicator.error(`Feedback konnte nicht gesendet werden: ${error.message}`);
        }
      });
    });
    
    document.body.appendChild(feedbackButton);
  } else {
    // Feedback-UI deaktivieren
    const feedbackButton = document.getElementById('feedbackButton');
    if (feedbackButton) {
      document.body.removeChild(feedbackButton);
    }
  }
}

/**
 * NEUE FUNKTION: Ruft die aktuelle Version des WipeBot-Plugins ab
 * @returns {Promise<Object>} Versionsinformationen
 */
export async function getPluginVersion() {
  try {
    const response = await fetchWithErrorHandling('/api/system/version', {
      silent: true
    });
    
    return response;
  } catch (error) {
    console.error('Fehler beim Abrufen der Plugin-Version:', error);
    return { version: 'unbekannt', error: error.message };
  }
}

/**
 * NEUE FUNKTION: Registriert einen Websocket für Echtzeit-Updates
 * Erfordert Server-seitige Implementierung von Websockets
 */
export function registerForRealTimeUpdates(onUpdate) {
  try {
    const websiteId = getWebsiteId();
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/updates/${websiteId}`;
    
    const socket = new WebSocket(wsUrl);
    
    socket.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (typeof onUpdate === 'function') {
          onUpdate(update);
        }
      } catch (error) {
        console.error('Fehler bei Websocket-Nachricht:', error);
      }
    };
    
    socket.onopen = () => {
      console.log('Websocket-Verbindung hergestellt');
    };
    
    socket.onerror = (error) => {
      console.error('Websocket-Fehler:', error);
    };
    
    // Rückgabefunktion zum Schließen der Verbindung
    return () => {
      socket.close();
    };
  } catch (error) {
    console.error('Websocket konnte nicht initialisiert werden:', error);
    return () => {}; // Leere Funktion zurückgeben
  }
}

// Export aller Funktionen für die Verwendung in anderen Modulen
export default {
  // Basisfunktionen
  loadConfig,
  saveFilter,
  deleteFilter,
  cloneFilter,
  createGroup,
  deleteGroup,
  testCleanup,
  runCleanupNow,
  loadPlatforms,
  loadMailboxes,
  disconnectPlugin,
  loadStatistics,
  
  // Neue erweiterte Funktionen
  getFilterPreview,
  updateFilterOrder,
  getDetailedStatistics,
  exportFiltersAndGroups,
  importFiltersAndGroups,
  batchUpdateFilterStatus,
  validateFilter,
  getSchedulerStatus,
  toggleFeedbackMode,
  getPluginVersion,
  registerForRealTimeUpdates,
  resetStatistics  // Neue Funktion hinzugefügt
};