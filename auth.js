const fs = require('fs');
const path = require('path');
const { cleanEnv, str, bool } = require("envalid");
const { logDebug } = require("./utils/debugLogger");

// SCHRITT 1: Debug-Modus direkt aus Umgebungsvariable erkennen
let DEBUG_MODE = process.env.DEBUG_MODE === "true";

// SCHRITT 2: Synchrones Laden der .env-Datei VOR allen anderen Operationen
const envFile = DEBUG_MODE ? '.env.dev' : '.env.prod';
const envPath = path.join(__dirname, envFile);

console.log(`Lade Umgebungsvariablen aus: ${envPath}`);

// Dotenv synchron laden
require('dotenv').config({ path: envPath });

// Debug-Modus nach dem Laden der .env-Datei erneut prüfen
DEBUG_MODE = process.env.DEBUG_MODE === "true";

// SCHRITT 3: Sofortige Validierung der kritischen Umgebungsvariablen
if (!process.env.CRISP_API_IDENTIFIER || !process.env.CRISP_API_KEY) {
  const errorMsg = "❌ FEHLER: CRISP_API_IDENTIFIER oder CRISP_API_KEY fehlen in der .env-Datei!";
  console.error(errorMsg);
  logDebug(errorMsg);
  // Nicht beenden, aber warnen
}

// SCHRITT 4: Debug-Ausgaben
if (DEBUG_MODE) {
  console.log("================================");
  console.log(" 🔍 Umgebungsvariablen Status:");
  console.log(`    CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    CRISP_API_KEY: ${process.env.CRISP_API_KEY ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    DEBUG_MODE: ${process.env.DEBUG_MODE}`);
  console.log("================================");
}

// SCHRITT 5: Umgebungsvariablen validieren
let validatedEnv;
try {
  validatedEnv = cleanEnv(process.env, {
    CRISP_API_IDENTIFIER: str(),
    CRISP_API_KEY: str(),
    CRISP_SIGNING_SECRET: str({ default: '' }),
    CRISP_PLUGIN_URN: str(),
    DEBUG_MODE: bool({ default: false }),
  });
  
  if (DEBUG_MODE) {
    logDebug("✅ Umgebungsvariablen erfolgreich validiert");
  }
} catch (error) {
  console.error(`❌ Validierungsfehler: ${error.message}`);
  
  // Fallback für Entwicklung
  validatedEnv = {
    DEBUG_MODE,
    CRISP_API_IDENTIFIER: process.env.CRISP_API_IDENTIFIER || '',
    CRISP_API_KEY: process.env.CRISP_API_KEY || '',
    CRISP_SIGNING_SECRET: process.env.CRISP_SIGNING_SECRET || '',
    CRISP_PLUGIN_URN: process.env.CRISP_PLUGIN_URN || ''
  };
}

// Hilfsfunktionen
function authenticate(req) {
  if (!req || !req.headers) {
    return false;
  }
  
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== validatedEnv.CRISP_API_KEY) {
    return false;
  }
  
  return true;
}

function isDebugMode() {
  return validatedEnv.DEBUG_MODE;
}

function getWebHook() {
  return validatedEnv.DEBUG_MODE 
    ? "https://dev.d-vicr.de/hook/message"
    : "https://wipebot.d-vicr.de/hook/message";
}

// Exportieren der Funktionen und Variablen
module.exports = { 
  authenticate, 
  isDebugMode, 
  getWebHook, 
  env: validatedEnv,
  DEBUG_MODE
};