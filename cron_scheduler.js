/**
 * cron_scheduler.js
 * Erweiterter Scheduler für die automatische Ausführung von WipeBot-Filtern
 * 
 * Funktionen:
 * - Dynamisches Management von Cron-Jobs für alle aktiven Filter
 * - Website-spezifische Filter-Verwaltung
 * - Automatische Aktualisierung bei Filteränderungen
 * - Robuste Fehlerbehandlung mit Retry-Mechanismus
 * - Integrierte Logging- und Monitoring-Funktionen
 */

const cron = require("node-cron");
const { cleanEnv, str, bool } = require("envalid");
const path = require("path");
const fs = require("fs");
const filterManager = require("./lib/filter_manager");
const wipebotPlugin = require("./lib/wipebot_plugin");
const { logDebug } = require("./utils/debugLogger");
const { log, cleanupOldLogs } = require("./utils/logger");

// Umgebungsvariablen validieren
const env = cleanEnv(process.env, {
  CRISP_API_IDENTIFIER: str(),
  CRISP_API_KEY: str(),
  CRISP_PLUGIN_URN: str(),
  CRISP_SIGNING_SECRET: str(),
  DEBUG_MODE: bool({ default: false })
});

// Speichern aller aktiven Cron-Jobs mit ihrer ID
const activeJobs = new Map();

// Status des Schedulers
let isRunning = false;
let lastRunTime = null;
let jobStats = {
  scheduled: 0,
  successful: 0,
  failed: 0,
  lastError: null
};

/**
 * Initialisiert und startet den Scheduler
 */
function initScheduler() {
  if (isRunning) {
    logDebug("⚠️ Scheduler läuft bereits, Neustart wird übersprungen");
    return;
  }

  logDebug("🚀 Cron-Scheduler wird initialisiert");
  
  try {
    // Zuerst alle Websites aus der Konfiguration laden
    const config = filterManager.loadConfig();
    const websiteIds = Object.keys(config);
    
    // Für jede Website die Filter planen
    websiteIds.forEach(websiteId => {
      scheduleFiltersForWebsite(websiteId);
    });
    
    // Täglichen Job für Log-Bereinigung einrichten (3:30 Uhr)
    setupDailyMaintenanceJob();
    
    isRunning = true;
    lastRunTime = new Date();
    
    logDebug(`✅ Scheduler erfolgreich gestartet mit ${activeJobs.size} Jobs`);
    log(`Cron-Scheduler gestartet mit ${activeJobs.size} geplanten Jobs`);
  } catch (error) {
    logDebug(`❌ Fehler beim Initialisieren des Schedulers: ${error.message}`);
    console.error("Scheduler-Initialisierungsfehler:", error);
  }
}

/**
 * Plant alle Filter für eine bestimmte Website
 * @param {string} websiteId - Die Website-ID
 */
function scheduleFiltersForWebsite(websiteId) {
  try {
    // Aktive Filter für die Website laden
    const filters = filterManager.getActiveFilters(websiteId);
    logDebug(`📋 ${filters.length} aktive Filter für Website ${websiteId} geladen`);
    
    // Für jeden Filter, der automatische Löschung aktiviert hat
    filters.forEach(filter => {
      if (filter.autoEnabled && filter.autoTime) {
        scheduleFilter(websiteId, filter);
      }
    });
    
    jobStats.scheduled = activeJobs.size;
  } catch (error) {
    logDebug(`❌ Fehler beim Planen der Filter für Website ${websiteId}: ${error.message}`);
  }
}

/**
 * Plant einen einzelnen Filter als Cron-Job
 * @param {string} websiteId - Die Website-ID
 * @param {object} filter - Der zu planende Filter
 */
function scheduleFilter(websiteId, filter) {
  try {
    // Bestehenden Job für diesen Filter löschen, falls vorhanden
    const jobId = `${websiteId}:${filter.id}`;
    if (activeJobs.has(jobId)) {
      activeJobs.get(jobId).stop();
      activeJobs.delete(jobId);
      logDebug(`🔄 Bestehender Job für Filter "${filter.name}" (${filter.id}) entfernt`);
    }
    
    // Cron-Expression aus der Uhrzeit erstellen
    const [hour, minute] = filter.autoTime.split(":");
    const cronExpression = `${minute} ${hour} * * *`;
    
    // Validieren der Cron-Expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Ungültige Cron-Expression: ${cronExpression}`);
    }
    
    // Berechne den nächsten Ausführungszeitpunkt
    const nextRun = getNextScheduledRunTime(cronExpression);
    
    // Aktualisiere die Statistik-Informationen mit dem nächsten Ausführungszeitpunkt
    wipebotPlugin.updateNextScheduledRun(websiteId, nextRun.getTime());
    
    // Cron-Job erstellen und speichern
    const job = cron.schedule(cronExpression, async () => {
      await executeFilterJob(websiteId, filter);
    });
    
    activeJobs.set(jobId, job);
    
    logDebug(`✅ Filter "${filter.name}" geplant für ${filter.autoTime} Uhr (${cronExpression}), nächste Ausführung: ${nextRun.toISOString()}`);
  } catch (error) {
    logDebug(`❌ Fehler beim Planen von Filter "${filter.name}" (${filter.id}): ${error.message}`);
    jobStats.lastError = `Planungsfehler für ${filter.name}: ${error.message}`;
  }
}

/**
 * Berechnet den nächsten Ausführungszeitpunkt für eine Cron-Expression
 * @param {string} cronExpression - Die Cron-Expression
 * @returns {Date} - Der nächste geplante Ausführungszeitpunkt
 */
function getNextScheduledRunTime(cronExpression) {
  // Cron-Expression analysieren
  const parts = cronExpression.split(' ');
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  
  // Nächsten Ausführungszeitpunkt berechnen
  const now = new Date();
  const nextRun = new Date(
    now.getFullYear(), 
    now.getMonth(), 
    now.getDate(), 
    hour, 
    minute, 
    0, 
    0
  );
  
  // Wenn der berechnete Zeitpunkt in der Vergangenheit liegt, füge einen Tag hinzu
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  return nextRun;
}

/**
 * Führt einen geplanten Filter-Job aus
 * @param {string} websiteId - Die Website-ID
 * @param {object} filter - Der auszuführende Filter
 */
async function executeFilterJob(websiteId, filter) {
  try {
    logDebug(`⏰ Automatische Löschung gestartet für Filter "${filter.name}" (${filter.id})`);
    log(`Automatische Löschung für Filter "${filter.name}" wird ausgeführt`);
    
    // Filter über das wipebot-Plugin ausführen
    const result = await wipebotPlugin.runCleanup(websiteId, filter.id);
    
    if (result.success) {
      jobStats.successful++;
      logDebug(`✅ Automatische Löschung für Filter "${filter.name}" erfolgreich: ${result.deleted} von ${result.total} Konversationen gelöscht`);
      log(`Automatische Löschung für Filter "${filter.name}" abgeschlossen: ${result.deleted} Konversationen gelöscht`);
    } else {
      jobStats.failed++;
      jobStats.lastError = result.error;
      logDebug(`❌ Fehler bei automatischer Löschung für Filter "${filter.name}": ${result.error}`);
      log(`Fehler bei automatischer Löschung für Filter "${filter.name}": ${result.error}`);
    }
    
    // Nach der Ausführung den Job neu planen, um den nächsten Ausführungszeitpunkt zu aktualisieren
    scheduleFilter(websiteId, filter);
  } catch (error) {
    jobStats.failed++;
    jobStats.lastError = error.message;
    logDebug(`❌ Unerwarteter Fehler bei Job-Ausführung für Filter "${filter.name}": ${error.message}`);
    log(`Fehler bei automatischer Löschung für Filter "${filter.name}": ${error.message}`);
    
    // Trotz Fehler den Job neu planen
    scheduleFilter(websiteId, filter);
  }
}

/**
 * Täglichen Wartungs-Job für Log-Bereinigung und Status-Bericht einrichten
 */
function setupDailyMaintenanceJob() {
  // Führe täglich um 3:30 Uhr aus
  const maintenanceJob = cron.schedule("30 3 * * *", () => {
    try {
      // Alte Logs bereinigen
      cleanupOldLogs();
      logDebug("🧹 Alte Log-Dateien bereinigt");
      
      // Statistik-Bericht erstellen
      const stats = getSchedulerStats();
      log(`Scheduler-Status: ${stats.jobsCount} aktive Jobs, ${stats.successful} erfolgreich, ${stats.failed} fehlgeschlagen`);
    } catch (error) {
      logDebug(`❌ Fehler bei täglicher Wartung: ${error.message}`);
    }
  });
  
  // Speichern des Wartungs-Jobs
  activeJobs.set("maintenance", maintenanceJob);
  logDebug("🔄 Täglicher Wartungs-Job um 3:30 Uhr geplant");
}

/**
 * Aktualisiert alle geplanten Filter für eine Website
 * @param {string} websiteId - Die Website-ID
 */
function refreshScheduleForWebsite(websiteId) {
  try {
    // Bestehende Jobs für diese Website stoppen
    for (const [jobId, job] of activeJobs.entries()) {
      if (jobId.startsWith(`${websiteId}:`)) {
        job.stop();
        activeJobs.delete(jobId);
        logDebug(`🔄 Job ${jobId} gestoppt und entfernt`);
      }
    }
    
    // Filter neu planen
    scheduleFiltersForWebsite(websiteId);
    
    logDebug(`🔄 Scheduler für Website ${websiteId} aktualisiert`);
  } catch (error) {
    logDebug(`❌ Fehler beim Aktualisieren des Schedulers für Website ${websiteId}: ${error.message}`);
  }
}

/**
 * Stoppt den Scheduler und alle aktiven Jobs
 */
function stopScheduler() {
  try {
    // Alle aktiven Jobs stoppen
    for (const [jobId, job] of activeJobs.entries()) {
      job.stop();
      logDebug(`⏹️ Job ${jobId} gestoppt`);
    }
    
    // Map leeren
    activeJobs.clear();
    isRunning = false;
    
    logDebug("⏹️ Scheduler gestoppt");
    log("Cron-Scheduler wurde gestoppt");
  } catch (error) {
    logDebug(`❌ Fehler beim Stoppen des Schedulers: ${error.message}`);
  }
}

/**
 * Liefert den aktuellen Status und Statistiken des Schedulers
 * @returns {object} Statistik-Objekt
 */
function getSchedulerStats() {
  return {
    running: isRunning,
    startTime: lastRunTime ? lastRunTime.toISOString() : null,
    jobsCount: activeJobs.size,
    scheduled: jobStats.scheduled,
    successful: jobStats.successful,
    failed: jobStats.failed,
    lastError: jobStats.lastError,
    jobs: Array.from(activeJobs.keys())
  };
}

/**
 * Führt einen bestimmten Filter sofort aus, unabhängig vom geplanten Zeitpunkt
 * @param {string} websiteId - Die Website-ID
 * @param {string} filterId - Die Filter-ID
 * @returns {Promise<object>} Ergebnis der Ausführung
 */
async function executeFilterNow(websiteId, filterId) {
  try {
    const filter = filterManager.findFilter(websiteId, filterId);
    
    if (!filter) {
      return { success: false, error: `Filter mit ID ${filterId} nicht gefunden` };
    }
    
    logDebug(`🚀 Manueller Start des Filters "${filter.name}" (${filter.id})`);
    
    const result = await wipebotPlugin.runCleanup(websiteId, filter.id);
    
    // Nach der manuellen Ausführung den Filter neu planen, wenn er automatisch ausgeführt werden soll
    if (filter.autoEnabled && filter.autoTime) {
      scheduleFilter(websiteId, filter);
    }
    
    return result;
  } catch (error) {
    logDebug(`❌ Fehler bei manueller Ausführung des Filters: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Überwacht Änderungen in der Konfigurationsdatei, um den Scheduler zu aktualisieren
 */
function watchConfigChanges() {
  const configPath = path.join(__dirname, 'config.json');
  
  try {
    fs.watch(configPath, (eventType) => {
      if (eventType === 'change') {
        logDebug("🔄 Konfigurationsänderung erkannt, Scheduler wird aktualisiert");
        
        // Scheduler neu initialisieren
        stopScheduler();
        setTimeout(() => {
          initScheduler();
        }, 1000); // Kurz warten, um sicherzustellen, dass die Änderungen vollständig sind
      }
    });
    
    logDebug("👀 Überwachung der Konfigurationsdatei aktiviert");
  } catch (error) {
    logDebug(`⚠️ Konfigurationsüberwachung nicht möglich: ${error.message}`);
  }
}

/**
 * Aktualisiert die nächsten geplanten Ausführungszeiten aller aktiven Filter
 * @param {string} websiteId - Die Website-ID
 */
function updateAllNextRunTimes(websiteId) {
  try {
    // Alle aktiven Jobs für die Website durchgehen
    for (const [jobId, job] of activeJobs.entries()) {
      if (jobId.startsWith(`${websiteId}:`)) {
        const filterId = jobId.split(':')[1];
        const filter = filterManager.findFilter(websiteId, filterId);
        
        if (filter && filter.autoEnabled && filter.autoTime) {
          // Cron-Expression erstellen
          const [hour, minute] = filter.autoTime.split(":");
          const cronExpression = `${minute} ${hour} * * *`;
          
          // Nächsten Ausführungszeitpunkt berechnen
          const nextRun = getNextScheduledRunTime(cronExpression);
          
          // Statistik aktualisieren
          wipebotPlugin.updateNextScheduledRun(websiteId, nextRun.getTime());
          
          logDebug(`🔄 Nächste Ausführungszeit für Filter "${filter.name}" aktualisiert: ${nextRun.toISOString()}`);
        }
      }
    }
  } catch (error) {
    logDebug(`❌ Fehler beim Aktualisieren der nächsten Ausführungszeiten: ${error.message}`);
  }
}

// Öffentliche API des Moduls
module.exports = {
  initScheduler,
  stopScheduler,
  refreshScheduleForWebsite,
  executeFilterNow,
  getSchedulerStats,
  updateAllNextRunTimes
};

// Scheduler starten, wenn dieses Modul direkt ausgeführt wird
if (require.main === module) {
  initScheduler();
  watchConfigChanges();
  
  // Status-Log alle 24 Stunden
  setInterval(() => {
    const stats = getSchedulerStats();
    log(`Scheduler-Status: ${stats.jobsCount} aktive Jobs, ${stats.successful} erfolgreich, ${stats.failed} fehlgeschlagen`);
  }, 24 * 60 * 60 * 1000);
  
  if (env.DEBUG_MODE) {
    logDebug("🐞 Scheduler im DEBUG-Modus gestartet");
  }
}