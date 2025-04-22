// config-ui.js - Überarbeitete Version mit vollständiger API-Integration
import { 
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
  loadStatistics,
  resetStatistics
} from './api.js';

// Konstanten für die Plattform-Mapping-Logik
const PLATFORM_PLUGIN_MAPPING = {
  "plugin:whatsapp": "whatsapp",
  "plugin:messenger": "messenger",
  "plugin:telegram": "telegram",
  "plugin:email": "email",
  "plugin:instagram": "instagram",
  "plugin:website": "webchat"
};

// Globale State-Variablen
let currentConfig = null;
let currentFilter = null;
let editMode = false;
let dragSortEnabled = false;

/**
 * Initialisiert die WipeBot UI
 * Lädt die Konfiguration, rendert Filter und Gruppen und richtet Event-Handler ein
 */
export async function initWipeBotUI() {
  try {
    // UI-Elemente für Feedback aktivieren
    toggleFeedbackMode(true);
    
    // Zeige Lade-Indikator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'loadingIndicator';
    loadingIndicator.innerHTML = '<div class="spinner"></div><p>WipeBot wird geladen...</p>';
    loadingIndicator.style.position = 'absolute';
    loadingIndicator.style.top = '50%';
    loadingIndicator.style.left = '50%';
    loadingIndicator.style.transform = 'translate(-50%, -50%)';
    loadingIndicator.style.background = 'rgba(0,0,0,0.8)';
    loadingIndicator.style.padding = '20px';
    loadingIndicator.style.borderRadius = '8px';
    loadingIndicator.style.color = 'white';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.zIndex = '1000';
    document.body.appendChild(loadingIndicator);
    
    // UI-Elemente abrufen
    const filterList = document.getElementById("filterList");
    const addFilterBtn = document.getElementById("addFilterBtn");
    const resetBtn = document.getElementById("resetBtn");
    const cleanupBtn = document.getElementById("cleanupBtn");
    const disconnectBtn = document.getElementById("disconnectBtn");
    const groupList = document.getElementById("groupList");
    const createGroupBtn = document.getElementById("createGroupBtn");
    
    // App-Version anzeigen
    try {
      const versionInfo = await getPluginVersion();
      if (versionInfo.version) {
        const versionElement = document.createElement('div');
        versionElement.className = 'version-info';
        versionElement.textContent = `v${versionInfo.version}`;
        versionElement.style.position = 'absolute';
        versionElement.style.bottom = '10px';
        versionElement.style.right = '10px';
        versionElement.style.fontSize = '12px';
        versionElement.style.opacity = '0.6';
        document.querySelector('.modal-content').appendChild(versionElement);
      }
    } catch (err) {
      console.warn("Versionsinformation konnte nicht geladen werden:", err);
    }
    
    // Konfiguration laden
    currentConfig = await loadConfig();
    
    // Verfügbare Plattformen laden
    await loadAvailablePlatforms();
    
    // Gruppen und Filter rendern
    renderGroups(currentConfig.groups);
    renderFilters(currentConfig.filters, currentConfig.groups);
    
    // Formularinteraktionen einrichten
    setupFormInteractions(currentConfig.filters, currentConfig.groups);
    
    // Drag & Drop für Filter einrichten
    setupDragAndDrop(currentConfig.filters);
    
    // Event-Listener hinzufügen
    addFilterBtn.addEventListener("click", () => handleAddOrUpdate(currentConfig));
    resetBtn.addEventListener("click", () => resetForm());
    cleanupBtn.addEventListener("click", () => handleCleanupNow());
    disconnectBtn.addEventListener("click", () => handleDisconnectPlugin(currentConfig));
    createGroupBtn.addEventListener("click", () => handleCreateGroup(currentConfig));
    
    // Statistik-Tab initialisieren
    await initStatisticsTab(currentConfig);
    
    // Lade-Indikator entfernen
    document.body.removeChild(loadingIndicator);
    
    // Scheduler-Status anzeigen (nur im Debug-Modus)
    try {
      const schedulerStatus = await getSchedulerStatus();
      if (schedulerStatus.running) {
        console.log("Scheduler aktiv mit", schedulerStatus.jobsCount, "Jobs");
      }
    } catch (err) {
      console.warn("Scheduler-Status konnte nicht abgerufen werden");
    }
    
  } catch (error) {
    console.error("Fehler beim Initialisieren der UI:", error);
    alert("Fehler beim Laden der Konfiguration. Bitte versuche es erneut.");
  }
}

/**
 * Initialisiert das Statistik-Dashboard
 * @param {Object} config - Aktuelle Konfiguration
 */
async function initStatisticsTab(config) {
  try {
    // Statistiken laden
    const statistics = await loadStatistics();
    
    // UI-Elemente aktualisieren
    updateStatisticsDisplay(statistics);
    
    // Export-Button einrichten (falls noch nicht geschehen)
    document.getElementById('exportBtn').addEventListener('click', exportFiltersAndGroups);
    
    // Import-Button-Logik ist bereits in der Hauptdatei implementiert
    
    // Aktualisierungsintervall einrichten (alle 60 Sekunden)
    setInterval(async () => {
      const updatedStats = await loadStatistics(true); // Force refresh
      updateStatisticsDisplay(updatedStats);
    }, 60000);
    
  } catch (error) {
    console.error("Fehler beim Initialisieren des Statistik-Tabs:", error);
  }
}

/**
 * Aktualisiert die Anzeige des Statistik-Dashboards
 * @param {Object} statistics - Die anzuzeigenden Statistiken
 */
function updateStatisticsDisplay(statistics) {
  // Statistik-Karten aktualisieren
  document.getElementById('totalDeleted').textContent = statistics.totalDeletedChats || 0;
  document.getElementById('activeFilters').textContent = statistics.activeFilters || 0;
  
  // Nächste geplante Ausführung
  if (statistics.nextScheduledRun) {
    const nextDate = new Date(statistics.nextScheduledRun);
    // Kurze Darstellung für die Karte
    document.getElementById('nextCleanup').textContent = nextDate.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    document.getElementById('nextCleanup').textContent = '-';
  }
  
  // Letzte Ausführung
  if (statistics.lastRun) {
    const lastDate = new Date(statistics.lastRun);
    // Kurze Darstellung für die Karte
    document.getElementById('lastRun').textContent = lastDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit'
    });
  } else {
    document.getElementById('lastRun').textContent = '-';
  }
  
  // Weitere Statistik-Elemente hinzufügen
  addDetailedStatistics(statistics);
}

/**
 * Fügt detaillierte Statistiken zum Dashboard hinzu
 * @param {Object} statistics - Die anzuzeigenden Statistiken
 */
function addDetailedStatistics(statistics) {
  const statsContainer = document.getElementById('statistikTab');
  
  // Bestehende detaillierte Statistiken entfernen
  const existingDetails = document.getElementById('detailedStats');
  if (existingDetails) {
    existingDetails.remove();
  }
  
  // Container für detaillierte Statistiken erstellen
  const detailsContainer = document.createElement('div');
  detailsContainer.id = 'detailedStats';
  detailsContainer.className = 'filter-form';
  
  // Überschrift
  const heading = document.createElement('h2');
  heading.textContent = 'Detaillierte Statistiken';
  detailsContainer.appendChild(heading);
  
  // Chat-Informationen
  const chatInfo = document.createElement('div');
  chatInfo.className = 'stats-row';
  chatInfo.innerHTML = `
    <div class="stats-item">
      <div class="stats-label">Aktuelle Chats:</div>
      <div class="stats-value">${statistics.currentChats || 0}</div>
    </div>
    <div class="stats-item">
      <div class="stats-label">Betroffene Chats:</div>
      <div class="stats-value">${statistics.affectedChats || 0}</div>
    </div>
  `;
  detailsContainer.appendChild(chatInfo);
  
  // Lösch-Informationen
  const deleteInfo = document.createElement('div');
  deleteInfo.className = 'stats-row';
  deleteInfo.innerHTML = `
    <div class="stats-item">
      <div class="stats-label">Gelöschte Chats (14 Tage):</div>
      <div class="stats-value">${statistics.lastTwoWeeks?.deletedChats || 0}</div>
    </div>
    <div class="stats-item">
      <div class="stats-label">Gelöschte Segmente (14 Tage):</div>
      <div class="stats-value">${statistics.lastTwoWeeks?.deletedSegments || 0}</div>
    </div>
  `;
  detailsContainer.appendChild(deleteInfo);
  
  // Zusätzliche Infos
  const totalInfo = document.createElement('div');
  totalInfo.className = 'stats-row';
  totalInfo.innerHTML = `
    <div class="stats-item">
      <div class="stats-label">Gesamt gelöschte Chats:</div>
      <div class="stats-value">${statistics.totalDeletedChats || 0}</div>
    </div>
    <div class="stats-item">
      <div class="stats-label">Gesamt gelöschte Segmente:</div>
      <div class="stats-value">${statistics.totalDeletedSegments || 0}</div>
    </div>
  `;
  detailsContainer.appendChild(totalInfo);
  
  // Zeitpunkt-Informationen
  const timeInfo = document.createElement('div');
  timeInfo.className = 'stats-row';
  
  // Formatiere die Zeitpunkte
  const lastRunDate = statistics.lastRun 
    ? new Date(statistics.lastRun).toLocaleString('de-DE')
    : 'Nie';
    
  const nextRunDate = statistics.nextScheduledRun 
    ? new Date(statistics.nextScheduledRun).toLocaleString('de-DE')
    : 'Keine geplant';
  
  timeInfo.innerHTML = `
    <div class="stats-item">
      <div class="stats-label">Letzte Ausführung:</div>
      <div class="stats-value">${lastRunDate}</div>
    </div>
    <div class="stats-item">
      <div class="stats-label">Nächste geplante Ausführung:</div>
      <div class="stats-value">${nextRunDate}</div>
    </div>
  `;
  detailsContainer.appendChild(timeInfo);
  
  // Zeitraum-Auswahl hinzufügen
  const periodSelector = document.createElement('div');
  periodSelector.className = 'period-selector';
  periodSelector.innerHTML = `
    <div class="stats-label">Zeitraum:</div>
    <div class="period-buttons">
      <button class="period-btn" data-period="day">Tag</button>
      <button class="period-btn active" data-period="week">Woche</button>
      <button class="period-btn" data-period="month">Monat</button>
      <button class="period-btn" data-period="all">Alle</button>
    </div>
  `;
  detailsContainer.appendChild(periodSelector);
  
  // Event-Listener für Zeitraum-Buttons
  periodSelector.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Aktiven Button markieren
      periodSelector.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Detaillierte Statistiken für den gewählten Zeitraum laden
      const period = btn.getAttribute('data-period');
      try {
        const detailedStats = await getDetailedStatistics(period);
        // UI aktualisieren (vereinfachte Version - in der Praxis würde man hier mehr machen)
        updateStatisticsDisplay(detailedStats);
      } catch (error) {
        console.error('Fehler beim Laden der Statistiken für Zeitraum:', period, error);
      }
    });
  });
  
  // Reset-Button hinzufügen
  const resetButton = document.createElement('button');
  resetButton.id = 'resetStatsBtn';
  resetButton.className = 'btn-danger';
  resetButton.textContent = 'Statistiken zurücksetzen';
  resetButton.addEventListener('click', async () => {
    if (confirm('Möchtest du wirklich alle Statistiken zurücksetzen? Diese Aktion kann nicht rückgängig gemacht werden!')) {
      try {
        await resetStatistics();
        // Statistiken neu laden und anzeigen
        const updatedStats = await loadStatistics(true);
        updateStatisticsDisplay(updatedStats);
      } catch (error) {
        console.error('Fehler beim Zurücksetzen der Statistiken:', error);
        alert(`Fehler beim Zurücksetzen: ${error.message}`);
      }
    }
  });
  detailsContainer.appendChild(resetButton);
  
  // Container zum Statistik-Tab hinzufügen
  statsContainer.appendChild(detailsContainer);
  
  // CSS für detaillierte Statistiken hinzufügen, falls noch nicht vorhanden
  if (!document.getElementById('stats-styles')) {
    const style = document.createElement('style');
    style.id = 'stats-styles';
    style.textContent = `
      .stats-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: var(--spacing-md);
        flex-wrap: wrap;
      }
      
      .stats-item {
        flex: 1;
        min-width: 200px;
        margin-bottom: var(--spacing-sm);
      }
      
      .stats-label {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        margin-bottom: var(--spacing-xs);
      }
      
      .stats-value {
        color: var(--text-primary);
        font-size: var(--font-size-lg);
        font-weight: bold;
      }
      
      #resetStatsBtn {
        margin-top: var(--spacing-lg);
      }
      
      .period-selector {
        margin-top: var(--spacing-lg);
        margin-bottom: var(--spacing-md);
      }
      
      .period-buttons {
        display: flex;
        gap: var(--spacing-xs);
        margin-top: var(--spacing-xs);
      }
      
      .period-btn {
        background-color: var(--bg-tertiary);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: var(--text-secondary);
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--border-radius-sm);
        cursor: pointer;
        transition: var(--transition-normal);
      }
      
      .period-btn:hover {
        background-color: rgba(54, 181, 211, 0.1);
        color: var(--text-primary);
      }
      
      .period-btn.active {
        background-color: rgba(54, 181, 211, 0.2);
        color: var(--accent-primary);
        border-color: var(--accent-primary);
        box-shadow: 0 0 8px var(--glow-primary);
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Lädt alle verfügbaren Plattformen von der API
 * und aktualisiert die Plattform-Checkboxen im UI
 */
async function loadAvailablePlatforms() {
  const platformContainer = document.querySelectorAll("input.platform, label[for='platform']");

  // Alte Plattformen entfernen
  platformContainer.forEach((el) => el.remove());

  const parent = document.querySelector("#autoTime").parentNode;
  const label = document.createElement("label");
  label.textContent = "Plattformen";
  parent.insertBefore(label, document.getElementById("includeTagContainer"));

  const checkboxContainer = document.createElement("div");
  checkboxContainer.classList.add("platform-container");

  try {
    // Plattformen über die API laden
    const platforms = await loadPlatforms();
    
    // "Alle Plattformen"-Checkbox
    checkboxContainer.appendChild(createCheckbox("alle", "Alle Plattformen"));

    // Für jede Plattform eine Checkbox erstellen
    platforms.forEach((platform) => {
      const label = platform.name || platform.id.charAt(0).toUpperCase() + platform.id.slice(1);
      checkboxContainer.appendChild(createCheckbox(platform.id, label));
    });

    parent.insertBefore(checkboxContainer, document.getElementById("includeTagContainer"));
  } catch (err) {
    console.warn("Plattformen konnten nicht geladen werden:", err);
    
    // Fallback: Statische Plattformliste verwenden
    const fallback = ["whatsapp", "webchat", "email", "messenger", "instagram", "telegram"];
    checkboxContainer.appendChild(createCheckbox("alle", "Alle Plattformen"));
    fallback.forEach((platform) => {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      checkboxContainer.appendChild(createCheckbox(platform, label));
    });
    parent.insertBefore(checkboxContainer, document.getElementById("includeTagContainer"));
  }
}

/**
 * Erstellt eine Checkbox für eine Plattform
 * @param {string} value - Wert der Checkbox
 * @param {string} labelText - Anzeigename für die Checkbox
 * @returns {HTMLLabelElement} - Label-Element mit Checkbox
 */
function createCheckbox(value, labelText) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "platform";
  input.value = value;
  label.appendChild(input);
  label.append(` ${labelText}`);
  return label;
}

/**
 * Rendert alle Filtergruppen im UI
 * @param {Array} groups - Liste aller Filtergruppen
 */
function renderGroups(groups) {
  const groupList = document.getElementById("groupList");
  const filterGroupSelect = document.getElementById("filterGroup");
  
  // Gruppen-Liste leeren
  groupList.innerHTML = "";
  
  // Filtergruppen-Auswahl leeren und Standardoption setzen
  filterGroupSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "(Keine Gruppe)";
  filterGroupSelect.appendChild(defaultOption);
  
  // Keine Gruppen vorhanden
  if (!groups || groups.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-list";
    emptyItem.textContent = "Keine Gruppen vorhanden";
    groupList.appendChild(emptyItem);
    return;
  }
  
  // Gruppen rendern
  groups.forEach(group => {
    // Gruppeneintrag für die Liste erstellen
    const groupItem = document.createElement("li");
    groupItem.className = "group-item";
    groupItem.dataset.id = group.id;
    
    const groupName = document.createElement("span");
    groupName.textContent = group.name;
    groupItem.appendChild(groupName);
    
    // Löschen-Button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.title = "Gruppe löschen";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`Möchtest du die Gruppe "${group.name}" wirklich löschen?`)) {
        try {
          await deleteGroup(group.id);
          // UI aktualisieren
          currentConfig = await loadConfig();
          renderGroups(currentConfig.groups);
          renderFilters(currentConfig.filters, currentConfig.groups);
        } catch (error) {
          console.error("Fehler beim Löschen der Gruppe:", error);
          alert(`Fehler beim Löschen der Gruppe: ${error.message}`);
        }
      }
    });
    groupItem.appendChild(deleteBtn);
    
    groupList.appendChild(groupItem);
    
    // Option für die Filtergruppen-Auswahl
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    filterGroupSelect.appendChild(option);
  });
}

/**
 * Rendert alle Filter im UI
 * @param {Array} filters - Liste aller Filter
 * @param {Array} groups - Liste aller Filtergruppen
 */
function renderFilters(filters, groups) {
  const filterList = document.getElementById("filterList");
  filterList.innerHTML = "";
  
  // Keine Filter vorhanden
  if (!filters || filters.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-list";
    emptyItem.textContent = "Keine Filter vorhanden";
    filterList.appendChild(emptyItem);
    return;
  }
  
  // Filter nach Gruppen organisieren
  const filtersByGroup = {
    null: [] // Filter ohne Gruppe
  };
  
  // Filtergruppen initialisieren
  if (groups && groups.length > 0) {
    groups.forEach(group => {
      filtersByGroup[group.id] = [];
    });
  }
  
  // Filter in Gruppen einsortieren
  filters.forEach(filter => {
    const groupId = filter.group || null;
    if (filtersByGroup[groupId]) {
      filtersByGroup[groupId].push(filter);
    } else {
      filtersByGroup[null].push(filter);
    }
  });
  
  // Filter ohne Gruppe zuerst rendern
  if (filtersByGroup[null].length > 0) {
    const groupHeader = document.createElement("div");
    groupHeader.className = "filter-group-header";
    groupHeader.textContent = "Ohne Gruppe";
    filterList.appendChild(groupHeader);
    
    const groupContainer = document.createElement("ul");
    groupContainer.className = "filter-group-container";
    groupContainer.dataset.groupId = "null";
    
    filtersByGroup[null].forEach(filter => {
      groupContainer.appendChild(createFilterItem(filter, groups));
    });
    
    filterList.appendChild(groupContainer);
  }
  
  // Filter nach Gruppen rendern
  if (groups && groups.length > 0) {
    groups.forEach(group => {
      if (filtersByGroup[group.id] && filtersByGroup[group.id].length > 0) {
        const groupHeader = document.createElement("div");
        groupHeader.className = "filter-group-header";
        groupHeader.textContent = group.name;
        filterList.appendChild(groupHeader);
        
        const groupContainer = document.createElement("ul");
        groupContainer.className = "filter-group-container";
        groupContainer.dataset.groupId = group.id;
        
        filtersByGroup[group.id].forEach(filter => {
          groupContainer.appendChild(createFilterItem(filter, groups));
        });
        
        filterList.appendChild(groupContainer);
      }
    });
  }
  
  // Drag & Drop Sortierung aktivieren, wenn verfügbar
  if (typeof Sortable !== 'undefined') {
    document.querySelectorAll('.filter-group-container').forEach(container => {
      new Sortable(container, {
        group: 'filters',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: async function(evt) {
          // Nach dem Sortieren die neue Reihenfolge speichern
          const groupId = evt.to.dataset.groupId;
          if (groupId && groupId !== "null") {
            const filterIds = Array.from(evt.to.children).map(item => item.dataset.id);
            try {
              await updateFilterOrder(groupId, filterIds);
            } catch (error) {
              console.error("Fehler beim Aktualisieren der Filterreihenfolge:", error);
            }
          }
        }
      });
    });
  }
}

/**
 * Erstellt ein Listenelement für einen Filter
 * @param {Object} filter - Filter-Objekt
 * @param {Array} groups - Liste aller Filtergruppen
 * @returns {HTMLLIElement} - Filter-Listenelement
 */
function createFilterItem(filter, groups) {
  const item = document.createElement("li");
  item.className = "filter-item";
  item.dataset.id = filter.id;
  
  // Filter-Farbindikator
  const colorIndicator = document.createElement("span");
  colorIndicator.className = "color-indicator";
  colorIndicator.style.backgroundColor = filter.color || "#3498db";
  item.appendChild(colorIndicator);
  
  // Filter-Name
  const nameSpan = document.createElement("span");
  nameSpan.className = "filter-name";
  nameSpan.textContent = filter.name;
  item.appendChild(nameSpan);
  
  // Filter-Status (aktiv/inaktiv)
  const statusToggle = document.createElement("label");
  statusToggle.className = "switch";
  
  const statusInput = document.createElement("input");
  statusInput.type = "checkbox";
  statusInput.checked = filter.active;
  statusInput.addEventListener("change", async () => {
    try {
      // Filter-Status aktualisieren
      await saveFilter({
        ...filter,
        active: statusInput.checked
      }, false);
      
      // Config aktualisieren
      currentConfig = await loadConfig();
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Filter-Status:", error);
      statusInput.checked = filter.active; // Zurücksetzen bei Fehler
    }
  });
  
  const statusSlider = document.createElement("span");
  statusSlider.className = "slider";
  
  statusToggle.appendChild(statusInput);
  statusToggle.appendChild(statusSlider);
  item.appendChild(statusToggle);
  
  // Vorschau-Button
  const previewBtn = document.createElement("button");
  previewBtn.className = "preview-btn";
  previewBtn.innerHTML = "👁️";
  previewBtn.title = "Filter-Vorschau anzeigen";
  previewBtn.addEventListener("click", async () => {
    try {
      const preview = await getFilterPreview(filter.id);
      showFilterPreviewModal(filter, preview);
    } catch (error) {
      console.error("Fehler beim Laden der Vorschau:", error);
      alert("Vorschau konnte nicht geladen werden.");
    }
  });
  item.appendChild(previewBtn);
  
  // Clone-Button
  const cloneBtn = document.createElement("button");
  cloneBtn.className = "clone-btn";
  cloneBtn.innerHTML = "🔄";
  cloneBtn.title = "Filter klonen";
  cloneBtn.addEventListener("click", async () => {
    const newName = prompt("Name für den geklonten Filter:", `${filter.name} (Kopie)`);
    if (newName) {
      try {
        await cloneFilter(filter.id, newName);
        
        // Config aktualisieren und neu rendern
        currentConfig = await loadConfig();
        renderFilters(currentConfig.filters, currentConfig.groups);
      } catch (error) {
        console.error("Fehler beim Klonen des Filters:", error);
        alert(`Fehler beim Klonen: ${error.message}`);
      }
    }
  });
  item.appendChild(cloneBtn);
  
  // Edit-Button
  const editBtn = document.createElement("button");
  editBtn.className = "edit-btn";
  editBtn.innerHTML = "✏️";
  editBtn.title = "Filter bearbeiten";
  editBtn.addEventListener("click", () => {
    editFilter(filter);
  });
  item.appendChild(editBtn);
  
  // Delete-Button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.innerHTML = "🗑️";
  deleteBtn.title = "Filter löschen";
  deleteBtn.addEventListener("click", async () => {
    if (confirm(`Möchtest du den Filter "${filter.name}" wirklich löschen?`)) {
      try {
        await deleteFilter(filter.id);
        
        // Config aktualisieren und neu rendern
        currentConfig = await loadConfig();
        renderFilters(currentConfig.filters, currentConfig.groups);
      } catch (error) {
        console.error("Fehler beim Löschen des Filters:", error);
        alert(`Fehler beim Löschen: ${error.message}`);
      }
    }
  });
  item.appendChild(deleteBtn);
  
  // Wenn der Filter inaktiv ist, entsprechend markieren
  if (!filter.active) {
    item.classList.add("inactive");
  }
  
  return item;
}

/**
 * Zeigt eine Vorschau für einen Filter an
 * @param {Object} filter - Filter-Objekt
 * @param {Object} previewData - Vorschaudaten vom Server
 */
function showFilterPreviewModal(filter, previewData) {
  // Falls bereits eine Vorschau angezeigt wird, diese entfernen
  const existingModal = document.getElementById("previewModal");
  if (existingModal) {
    document.body.removeChild(existingModal);
  }
  
  // Modal-Container erstellen
  const modal = document.createElement("div");
  modal.id = "previewModal";
  modal.className = "preview-modal";
  
  // Modal-Inhalt
  const modalContent = document.createElement("div");
  modalContent.className = "preview-modal-content";
  
  // Header
  const header = document.createElement("div");
  header.className = "preview-header";
  
  const title = document.createElement("h3");
  title.textContent = `Vorschau: ${filter.name}`;
  header.appendChild(title);
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.innerHTML = "×";
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(modal);
  });
  header.appendChild(closeBtn);
  
  modalContent.appendChild(header);
  
  // Inhalt
  const content = document.createElement("div");
  content.className = "preview-content";
  
  const summary = document.createElement("div");
  summary.className = "preview-summary";
  
  const count = document.createElement("div");
  count.className = "preview-count";
  count.innerHTML = `<span>${previewData.count}</span> betroffene Konversation(en)`;
  summary.appendChild(count);
  
  const infoText = document.createElement("p");
  infoText.textContent = "Diese Konversationen würden durch den Filter gelöscht werden:";
  summary.appendChild(infoText);
  
  content.appendChild(summary);
  
  // Liste der betroffenen Konversationen
  if (previewData.conversations && previewData.conversations.length > 0) {
    const list = document.createElement("ul");
    list.className = "preview-conversation-list";
    
    previewData.conversations.forEach(conversation => {
      const item = document.createElement("li");
      
      const preview = document.createElement("div");
      preview.className = "conversation-preview";
      preview.textContent = conversation.preview || "(Keine Vorschau verfügbar)";
      item.appendChild(preview);
      
      const date = document.createElement("div");
      date.className = "conversation-date";
      if (conversation.created) {
        const createdDate = new Date(conversation.created);
        date.textContent = createdDate.toLocaleString();
      }
      item.appendChild(date);
      
      list.appendChild(item);
    });
    
    content.appendChild(list);
  } else {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-preview";
    emptyMessage.textContent = "Keine betroffenen Konversationen gefunden.";
    content.appendChild(emptyMessage);
  }
  
  modalContent.appendChild(content);
  
  // Footer mit Aktionen
  const footer = document.createElement("div");
  footer.className = "preview-footer";
  
  const runBtn = document.createElement("button");
  runBtn.className = "run-btn";
  runBtn.textContent = "Jetzt ausführen";
  runBtn.addEventListener("click", async () => {
    if (confirm(`Möchtest du wirklich ${previewData.count} Konversation(en) jetzt löschen?`)) {
      try {
        document.body.removeChild(modal);
        await runCleanupNow(filter.id);
      } catch (error) {
        console.error("Fehler beim Ausführen des Cleanups:", error);
        alert(`Fehler beim Ausführen: ${error.message}`);
      }
    }
  });
  footer.appendChild(runBtn);
  
  modalContent.appendChild(footer);
  
  // Modal zum DOM hinzufügen
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Event-Listener für Klick außerhalb des Modals
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

/**
 * Lädt einen Filter zum Bearbeiten in das Formular
 * @param {Object} filter - Zu bearbeitender Filter
 */
function editFilter(filter) {
  // Aktuellen Filter für späteres Speichern merken
  currentFilter = filter;
  editMode = true;
  
  // Formularfelder befüllen
  document.getElementById("filterName").value = filter.name;
  
  // Gruppe auswählen
  const groupSelect = document.getElementById("filterGroup");
  if (filter.group) {
    groupSelect.value = filter.group;
  } else {
    groupSelect.value = "";
  }
  
  // Maximales Alter
  document.getElementById("maxDays").value = filter.maxDays || 30;
  
  // Nur geschlossene Chats
  document.getElementById("closedOnly").value = filter.closedOnly ? "true" : "false";
  
  // Plattformen
  document.querySelectorAll("input.platform").forEach(checkbox => {
    if (filter.platforms) {
      if (filter.platforms.includes("alle") && checkbox.value === "alle") {
        checkbox.checked = true;
      } else if (filter.platforms.includes(checkbox.value) && checkbox.value !== "alle") {
        checkbox.checked = true;
      } else {
        checkbox.checked = false;
      }
    } else {
      checkbox.checked = false;
    }
  });
  
  // Zu löschende Segmente
  const includeTagContainer = document.getElementById("includeTagContainer");
  const includeInput = document.getElementById("includeInput");
  
  // Vorhandene Tags entfernen
  Array.from(includeTagContainer.querySelectorAll(".tag")).forEach(tag => {
    includeTagContainer.removeChild(tag);
  });
  
  // Neue Tags hinzufügen
  if (filter.includeSegments && filter.includeSegments.length > 0) {
    filter.includeSegments.forEach(segment => {
      addTag(segment, includeTagContainer, includeInput);
    });
  }
  
  // Zu schützende Segmente
  const excludeTagContainer = document.getElementById("excludeTagContainer");
  const excludeInput = document.getElementById("excludeInput");
  
  // Vorhandene Tags entfernen
  Array.from(excludeTagContainer.querySelectorAll(".tag")).forEach(tag => {
    excludeTagContainer.removeChild(tag);
  });
  
  // Neue Tags hinzufügen
  if (filter.excludeSegments && filter.excludeSegments.length > 0) {
    filter.excludeSegments.forEach(segment => {
      addTag(segment, excludeTagContainer, excludeInput);
    });
  }
  
  // Nur ausgewählte Segmente löschen
  document.getElementById("deleteSegmentsOnly").checked = filter.deleteSegmentsOnly || false;
  
  // Automatische Löschung
  document.getElementById("autoEnabled").checked = filter.autoEnabled || false;
  document.getElementById("autoTime").value = filter.autoTime || "03:00";
  
  // Formularansicht aktualisieren
  updateFormView();
  
  // Reset-Button anzeigen und Filter-Preview aktualisieren
  document.getElementById("resetBtn").style.display = "inline-block";
  updateFilterPreview();
  
  // Zu Formular scrollen
  document.querySelector(".filter-section").scrollIntoView({ behavior: "smooth" });
}

/**
 * Fügt ein Tag/Segment zu einem Container hinzu
 * @param {string} text - Text des Tags
 * @param {HTMLElement} container - Container-Element
 * @param {HTMLInputElement} input - Eingabefeld
 */
function addTag(text, container, input) {
  if (!text || text.trim() === "") return;
  
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  
  const removeBtn = document.createElement("span");
  removeBtn.className = "remove-tag";
  removeBtn.innerHTML = "×";
  removeBtn.addEventListener("click", () => {
    container.removeChild(tag);
    updateFilterPreview();
  });
  
  tag.appendChild(removeBtn);
  container.insertBefore(tag, input);
  input.value = "";
  
  updateFilterPreview();
}

/**
 * Aktualisiert die Vorschau für den aktuellen Filter
 */
function updateFilterPreview() {
  const previewText = document.getElementById("previewText");
  
  // Aktuelle Werte aus dem Formular sammeln
  const filterData = getFormData();
  
  // Vorschau anzeigen
  if (!filterData.name) {
    previewText.textContent = "Fülle Felder aus, um Vorschau zu sehen...";
    return;
  }
  
  // Formatierte Vorschau erstellen
  let preview = `Filter "${filterData.name}":\n`;
  preview += `- Maximales Alter: ${filterData.maxDays} Tage\n`;
  preview += `- Nur geschlossene Chats: ${filterData.closedOnly ? "Ja" : "Nein"}\n`;
  
  if (filterData.platforms && filterData.platforms.length > 0) {
    if (filterData.platforms.includes("alle")) {
      preview += "- Plattformen: Alle\n";
    } else {
      preview += `- Plattformen: ${filterData.platforms.join(", ")}\n`;
    }
  }
  
  if (filterData.includeSegments && filterData.includeSegments.length > 0) {
    preview += `- Zu löschende Segmente: ${filterData.includeSegments.join(", ")}\n`;
  }
  
  if (filterData.excludeSegments && filterData.excludeSegments.length > 0) {
    preview += `- Zu schützende Segmente: ${filterData.excludeSegments.join(", ")}\n`;
  }
  
  preview += `- Nur Segmente löschen: ${filterData.deleteSegmentsOnly ? "Ja" : "Nein"}\n`;
  preview += `- Automatische Löschung: ${filterData.autoEnabled ? `Ja (${filterData.autoTime} Uhr)` : "Nein"}`;
  
  previewText.textContent = preview;
}

/**
 * Sammelt alle Formulardaten in ein Filter-Objekt
 * @returns {Object} - Filter-Objekt mit allen Formulardaten
 */
function getFormData() {
  const filterData = {};
  
  // Grundlegende Daten
  filterData.name = document.getElementById("filterName").value;
  filterData.group = document.getElementById("filterGroup").value || null;
  filterData.maxDays = parseInt(document.getElementById("maxDays").value, 10);
  filterData.closedOnly = document.getElementById("closedOnly").value === "true";
  
  // Plattformen
  const platformCheckboxes = document.querySelectorAll("input.platform:checked");
  filterData.platforms = Array.from(platformCheckboxes).map(cb => cb.value);
  
  // Wenn "alle" ausgewählt ist, andere ignorieren
  if (filterData.platforms.includes("alle")) {
    filterData.platforms = ["alle"];
  }
  
  // Zu löschende Segmente
  const includeTags = document.querySelectorAll("#includeTagContainer .tag");
  filterData.includeSegments = Array.from(includeTags).map(tag => tag.textContent.replace("×", "").trim());
  
  // Zu schützende Segmente
  const excludeTags = document.querySelectorAll("#excludeTagContainer .tag");
  filterData.excludeSegments = Array.from(excludeTags).map(tag => tag.textContent.replace("×", "").trim());
  
  // Nur Segmente löschen
  filterData.deleteSegmentsOnly = document.getElementById("deleteSegmentsOnly").checked;
  
  // Automatische Löschung
  filterData.autoEnabled = document.getElementById("autoEnabled").checked;
  filterData.autoTime = document.getElementById("autoTime").value;
  
  // Im Bearbeitungsmodus die Filter-ID beibehalten
  if (editMode && currentFilter) {
    filterData.id = currentFilter.id;
    filterData.color = currentFilter.color;
  }
  
  return filterData;
}

/**
 * Aktualisiert die Ansicht des Formulars basierend auf dem aktuellen Status
 */
function updateFormView() {
  const addFilterBtn = document.getElementById("addFilterBtn");
  
  if (editMode) {
    addFilterBtn.textContent = "✓ Filter aktualisieren";
  } else {
    addFilterBtn.textContent = "➕ Filter speichern";
  }
}

/**
 * Setzt das Formular zurück
 */
function resetForm() {
  document.getElementById("filterName").value = "";
  document.getElementById("filterGroup").value = "";
  document.getElementById("maxDays").value = "30";
  document.getElementById("closedOnly").value = "true";
  
  // Plattformen zurücksetzen
  document.querySelectorAll("input.platform").forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Zu löschende Segmente zurücksetzen
  const includeTagContainer = document.getElementById("includeTagContainer");
  Array.from(includeTagContainer.querySelectorAll(".tag")).forEach(tag => {
    includeTagContainer.removeChild(tag);
  });
  
  // Zu schützende Segmente zurücksetzen
  const excludeTagContainer = document.getElementById("excludeTagContainer");
  Array.from(excludeTagContainer.querySelectorAll(".tag")).forEach(tag => {
    excludeTagContainer.removeChild(tag);
  });
  
  // Checkboxen zurücksetzen
  document.getElementById("deleteSegmentsOnly").checked = false;
  document.getElementById("autoEnabled").checked = false;
  
  // Uhrzeit zurücksetzen
  document.getElementById("autoTime").value = "03:00";
  
  // Vorschau zurücksetzen
  document.getElementById("previewText").textContent = "Fülle Felder aus, um Vorschau zu sehen...";
  
  // Reset-Button ausblenden
  document.getElementById("resetBtn").style.display = "none";
  
  // Bearbeitungsmodus zurücksetzen
  editMode = false;
  currentFilter = null;
  updateFormView();
}

/**
 * Richtet Interaktionen für das Filterformular ein
 * @param {Array} filters - Liste aller Filter
 * @param {Array} groups - Liste aller Filtergruppen
 */
function setupFormInteractions(filters, groups) {
  // Eingabefelder überwachen für Live-Vorschau
  const formInputs = document.querySelectorAll("input, select");
  formInputs.forEach(input => {
    input.addEventListener("change", updateFilterPreview);
    input.addEventListener("input", updateFilterPreview);
  });
  
  // Tag-Eingabefelder
  setupTagInput("includeInput", "includeTagContainer");
  setupTagInput("excludeInput", "excludeTagContainer");
  
  // Plattform-Checkboxen: "Alle" Checkbox steuert andere
  const alleCheckbox = document.querySelector('input.platform[value="alle"]');
  if (alleCheckbox) {
    alleCheckbox.addEventListener("change", function() {
      const otherCheckboxes = document.querySelectorAll('input.platform:not([value="alle"])');
      otherCheckboxes.forEach(cb => {
        cb.disabled = this.checked;
        if (this.checked) {
          cb.checked = false;
        }
      });
      updateFilterPreview();
    });
  }
  
  // Andere Plattform-Checkboxen deaktivieren "Alle"
  const platformCheckboxes = document.querySelectorAll('input.platform:not([value="alle"])');
  platformCheckboxes.forEach(checkbox => {
    checkbox.addEventListener("change", function() {
      const alleCheckbox = document.querySelector('input.platform[value="alle"]');
      if (alleCheckbox && this.checked) {
        alleCheckbox.checked = false;
      }
      updateFilterPreview();
    });
  });
}

/**
 * Richtet ein Eingabefeld für Tags/Segmente ein
 * @param {string} inputId - ID des Eingabefelds
 * @param {string} containerId - ID des Tag-Containers
 */
function setupTagInput(inputId, containerId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const text = this.value.trim();
      if (text) {
        addTag(text, container, this);
      }
    }
  });
  
  // Klick auf Container fokussiert das Eingabefeld
  container.addEventListener("click", function(e) {
    if (e.target === container) {
      input.focus();
    }
  });
}

/**
 * Richtet Drag & Drop für Filter ein
 * @param {Array} filters - Liste aller Filter
 */
function setupDragAndDrop(filters) {
  if (typeof Sortable === 'undefined') {
    console.warn("Sortable.js nicht geladen, Drag & Drop deaktiviert");
    return;
  }
  
  // Wird in renderFilters implementiert
}

/**
 * Fügt einen neuen Filter hinzu oder aktualisiert einen bestehenden
 * @param {Object} config - Aktuelle Konfiguration
 */
async function handleAddOrUpdate(config) {
  try {
    const filterData = getFormData();
    
    // Validierung
    if (!filterData.name) {
      alert("Bitte gib einen Filternamen ein.");
      return;
    }
    
    // Validierung auf Server-Seite
    const validationResult = await validateFilter(filterData);
    if (!validationResult.valid) {
      alert(`Validierungsfehler: ${validationResult.errors.join('\n')}`);
      return;
    }
    
    // Speichern oder Aktualisieren
    if (editMode && currentFilter) {
      await saveFilter(filterData, false);
    } else {
      await saveFilter(filterData, true);
    }
    
    // Formular zurücksetzen
    resetForm();
    
    // Konfiguration neu laden und UI aktualisieren
    currentConfig = await loadConfig();
    renderFilters(currentConfig.filters, currentConfig.groups);
    renderGroups(currentConfig.groups);
    
  } catch (error) {
    console.error("Fehler beim Speichern des Filters:", error);
    alert(`Fehler beim Speichern: ${error.message}`);
  }
}

/**
 * Erstellt eine neue Filtergruppe
 * @param {Object} config - Aktuelle Konfiguration
 */
async function handleCreateGroup(config) {
  try {
    const groupName = document.getElementById("newGroupName").value;
    
    if (!groupName || groupName.trim() === "") {
      alert("Bitte gib einen Gruppennamen ein.");
      return;
    }
    
    await createGroup(groupName);
    
    // Eingabefeld zurücksetzen
    document.getElementById("newGroupName").value = "";
    
    // Konfiguration neu laden und UI aktualisieren
    currentConfig = await loadConfig();
    renderGroups(currentConfig.groups);
    renderFilters(currentConfig.filters, currentConfig.groups);
    
  } catch (error) {
    console.error("Fehler beim Erstellen der Gruppe:", error);
    alert(`Fehler beim Erstellen der Gruppe: ${error.message}`);
  }
}

/**
 * Führt einen Cleanup für alle aktiven Filter durch
 */
async function handleCleanupNow() {
  try {
    if (!confirm("Möchtest du wirklich alle aktiven Filter jetzt ausführen? Diese Aktion kann nicht rückgängig gemacht werden!")) {
      return;
    }
    
    // Jeden aktiven Filter ausführen
    const activeFilters = currentConfig.filters.filter(filter => filter.active);
    
    if (activeFilters.length === 0) {
      alert("Es sind keine aktiven Filter vorhanden.");
      return;
    }
    
    for (const filter of activeFilters) {
      await runCleanupNow(filter.id);
    }
    
    // Nach dem Cleanup Statistiken aktualisieren
    const updatedStats = await loadStatistics(true);
    updateStatisticsDisplay(updatedStats);
    
  } catch (error) {
    console.error("Fehler beim Ausführen des Cleanups:", error);
    alert(`Fehler beim Ausführen: ${error.message}`);
  }
}

/**
 * Trennt das Plugin von der Website
 * @param {Object} config - Aktuelle Konfiguration
 */
async function handleDisconnectPlugin(config) {
  try {
    await disconnectPlugin();
  } catch (error) {
    console.error("Fehler beim Trennen des Plugins:", error);
    alert(`Fehler beim Trennen: ${error.message}`);
  }
}