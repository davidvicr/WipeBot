"use strict";

const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "..", "logs", "daily");

// Erstellt ein tägliches Logfile mit dem Schema: logs/daily/yyyy-mm-dd.log
function log(entry) {
  const now = new Date();
  const timestamp = now.toISOString();
  const date = now.toISOString().slice(0, 10); // yyyy-mm-dd
  const filename = path.join(logsDir, `${date}.log`);
  const line = `[${timestamp}] ${entry}\n`;

  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(filename, line);
  } catch (err) {
    console.error("❌ Fehler beim Schreiben in tägliches Log:", err.message);
  }
}

// Löscht alle Log-Dateien, die älter als 14 Tage sind
function cleanupOldLogs() {
  try {
    if (!fs.existsSync(logsDir)) return;

    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const cutoff = 1000 * 60 * 60 * 24 * 14; // 14 Tage in ms

    files.forEach((file) => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > cutoff) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Alte Log-Datei gelöscht: ${file}`);
      }
    });
  } catch (err) {
    console.error("❌ Fehler beim Bereinigen der Logdateien:", err.message);
  }
}

module.exports = {
  log,
  cleanupOldLogs
};
