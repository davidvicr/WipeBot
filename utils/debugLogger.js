const fs = require("fs");
const path = require("path");

const DEBUG_MODE = process.env.DEBUG_MODE === "true";
const LOG_DIR = path.join(__dirname, "../logs");
const ARCHIVE_DIR = path.join(__dirname, "../logs/archive");
const LOG_FILE = path.join(LOG_DIR, "debug.log");
const API_LOG_FILE = path.join(LOG_DIR, "api.log");

// Log-Level Konstanten
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

// Aktuelles Log-Level (kann über Umgebungsvariable gesteuert werden)
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] || 
  (DEBUG_MODE ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO);

function ensureLogDirExists() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
  } catch (error) {
    console.error("❌ Fehler beim Erstellen des Log-Verzeichnisses:", error.message);
  }
}

/**
 * Archiviert das aktuelle Debug-Log (nur im Debug-Modus)
 */
function archiveDebugLog() {
  if (!DEBUG_MODE) return;
  
  try {
    if (fs.existsSync(LOG_FILE)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveFileName = `debug-${timestamp}.log`;
      const archivePath = path.join(ARCHIVE_DIR, archiveFileName);
      
      // Kopiere die aktuelle Debug-Log-Datei ins Archiv
      fs.copyFileSync(LOG_FILE, archivePath);
      
      // Leere die aktuelle Debug-Log-Datei
      fs.writeFileSync(LOG_FILE, "", "utf8");
      
      console.log(`📦 Debug-Log archiviert: ${archiveFileName}`);
    }
  } catch (error) {
    console.error("❌ Fehler beim Archivieren des Debug-Logs:", error.message);
  }
}

/**
 * Bereinigt alte Archive (älter als 30 Tage)
 */
function cleanupOldArchives() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return;

    const files = fs.readdirSync(ARCHIVE_DIR);
    const now = Date.now();
    const cutoff = 1000 * 60 * 60 * 24 * 30; // 30 Tage in ms

    files.forEach((file) => {
      const filePath = path.join(ARCHIVE_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > cutoff) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Altes Archiv gelöscht: ${file}`);
      }
    });
  } catch (err) {
    console.error("❌ Fehler beim Bereinigen der Archive:", err.message);
  }
}

/**
 * Prüft, ob ein Log-Level aktiv ist
 * @param {number} level - Das zu prüfende Log-Level
 * @returns {boolean} True, wenn das Level aktiv ist
 */
function shouldLog(level) {
  return level <= CURRENT_LOG_LEVEL;
}

/**
 * Schreibt eine Debug-Nachricht (nur im DEBUG_MODE)
 * @param {string} message - Die Log-Nachricht
 * @param {number} level - Das Log-Level (optional, Standard: DEBUG)
 */
function logDebug(message, level = LOG_LEVELS.DEBUG) {
  if (!DEBUG_MODE || !shouldLog(level)) return;

  try {
    ensureLogDirExists();

    const timestamp = new Date().toISOString();
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'DEBUG';
    const logMessage = `[${timestamp}] [${levelName}] ${message}\n`;

    fs.appendFileSync(LOG_FILE, logMessage, "utf8");
  } catch (error) {
    console.error("❌ Fehler beim Schreiben in die Debug-Logdatei:", error.message);
  }
}

/**
 * Schreibt eine API-spezifische Log-Nachricht
 * @param {string} message - Die API-Log-Nachricht
 * @param {number} level - Das Log-Level (optional, Standard: INFO)
 */
function logAPI(message, level = LOG_LEVELS.INFO) {
  if (!shouldLog(level)) return;

  try {
    ensureLogDirExists();

    const timestamp = new Date().toISOString();
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'INFO';
    const logMessage = `[${timestamp}] [API-${levelName}] ${message}\n`;

    // Schreibe in beide Log-Dateien wenn DEBUG_MODE aktiv ist
    if (DEBUG_MODE) {
      fs.appendFileSync(LOG_FILE, logMessage, "utf8");
    }
    
    // Schreibe immer in die API-Log-Datei
    fs.appendFileSync(API_LOG_FILE, logMessage, "utf8");
  } catch (error) {
    console.error("❌ Fehler beim Schreiben in die API-Logdatei:", error.message);
  }
}

/**
 * Log-Level spezifische Funktionen für einfachere Nutzung
 */
function logError(message) {
  logDebug(message, LOG_LEVELS.ERROR);
}

function logWarn(message) {
  logDebug(message, LOG_LEVELS.WARN);
}

function logInfo(message) {
  logDebug(message, LOG_LEVELS.INFO);
}

function logVerbose(message) {
  logDebug(message, LOG_LEVELS.VERBOSE);
}

/**
 * API-spezifische Log-Level Funktionen
 */
function logAPIError(message) {
  logAPI(message, LOG_LEVELS.ERROR);
}

function logAPIWarn(message) {
  logAPI(message, LOG_LEVELS.WARN);
}

function logAPIInfo(message) {
  logAPI(message, LOG_LEVELS.INFO);
}

function logAPIDebug(message) {
  logAPI(message, LOG_LEVELS.DEBUG);
}

function logAPIVerbose(message) {
  logAPI(message, LOG_LEVELS.VERBOSE);
}

function readLog() {
  try {
    return fs.existsSync(LOG_FILE)
      ? fs.readFileSync(LOG_FILE, "utf8")
      : "🔍 Noch keine Debug-Einträge vorhanden.";
  } catch (error) {
    return "❌ Fehler beim Lesen der Logdatei: " + error.message;
  }
}

function readAPILog() {
  try {
    return fs.existsSync(API_LOG_FILE)
      ? fs.readFileSync(API_LOG_FILE, "utf8")
      : "🔍 Noch keine API-Log-Einträge vorhanden.";
  } catch (error) {
    return "❌ Fehler beim Lesen der API-Logdatei: " + error.message;
  }
}

function clearLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "", "utf8");
    }
  } catch (error) {
    console.error("❌ Fehler beim Leeren der Debug-Logdatei:", error.message);
  }
}

function clearAPILog() {
  try {
    if (fs.existsSync(API_LOG_FILE)) {
      fs.writeFileSync(API_LOG_FILE, "", "utf8");
    }
  } catch (error) {
    console.error("❌ Fehler beim Leeren der API-Logdatei:", error.message);
  }
}

// Beim Modulstart Archive bereinigen und ggf. aktuelles Log archivieren
if (DEBUG_MODE) {
  cleanupOldArchives();
  // Archiviere das aktuelle Log nur wenn es nicht leer ist
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 0) {
      archiveDebugLog();
    }
  } catch (error) {
    // Ignoriere Fehler beim ersten Start
  }
}

module.exports = {
  // Bestehende Funktionen
  logDebug,
  readLog,
  clearLog,
  
  // Neue Log-Level Funktionen
  logError,
  logWarn,
  logInfo,
  logVerbose,
  
  // API-spezifische Funktionen
  logAPI,
  logAPIError,
  logAPIWarn,
  logAPIInfo,
  logAPIDebug,
  logAPIVerbose,
  readAPILog,
  clearAPILog,
  
  // Archivierungsfunktionen
  archiveDebugLog,
  cleanupOldArchives,
  
  // Log-Level Konstanten für externe Nutzung
  LOG_LEVELS,
  shouldLog
};