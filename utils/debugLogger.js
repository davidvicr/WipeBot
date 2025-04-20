const fs = require("fs");
const path = require("path");

const DEBUG_MODE = process.env.DEBUG_MODE === "true";
const LOG_DIR = path.join(__dirname, "../logs");
const LOG_FILE = path.join(LOG_DIR, "debug.log");

function ensureLogDirExists() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    console.error("❌ Fehler beim Erstellen des Log-Verzeichnisses:", error.message);
  }
}

function logDebug(message) {
  if (!DEBUG_MODE) return;

  try {
    ensureLogDirExists();

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    fs.appendFileSync(LOG_FILE, logMessage, "utf8");
  } catch (error) {
    console.error("❌ Fehler beim Schreiben in die Debug-Logdatei:", error.message);
  }
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

function clearLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "", "utf8");
    }
  } catch (error) {
    console.error("❌ Fehler beim Leeren der Debug-Logdatei:", error.message);
  }
}

module.exports = {
  logDebug,
  readLog,
  clearLog,
};
