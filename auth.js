const fs = require('fs');
const path = require('path');
const { cleanEnv, str, bool } = require("envalid");
const { logDebug } = require("./utils/debugLogger");

// SCHRITT 1: Debug-Modus erkennen - ÜBERARBEITET
// Prüfe zuerst direkt die Umgebungsvariable
let DEBUG_MODE = process.env.DEBUG_MODE === "true";

// SCHRITT 2: Korrekte .env-Datei laden basierend auf Modus
function loadEnvFile() {
  try {
    // Debug-Modus-Variable in der Konsole ausgeben (zur Diagnose)
    console.log(`INITIAL DEBUG_MODE DETECTION: ${DEBUG_MODE}`);
    
    // Entsprechende .env-Datei basierend auf Debug-Modus wählen
    const envFile = DEBUG_MODE ? '.env.dev' : '.env.prod';
    const envPath = path.join(__dirname, envFile);
    
    console.log(`Versuche .env-Datei zu laden: ${envPath}`);
    
    if (fs.existsSync(envPath)) {
      console.log(`${envFile} gefunden, lade Umgebungsvariablen...`);
      
      // .env-Datei einlesen und parsen
      const dotenv = require('dotenv');
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      
      // Manuelles Debugging der geladenen Umgebungsvariablen
      const safeConfig = { ...envConfig };
      // Sensitive Daten für die Konsole maskieren
      if (safeConfig.CRISP_API_KEY) safeConfig.CRISP_API_KEY = safeConfig.CRISP_API_KEY.substring(0, 5) + '...';
      if (safeConfig.CRISP_API_IDENTIFIER) safeConfig.CRISP_API_IDENTIFIER = safeConfig.CRISP_API_IDENTIFIER.substring(0, 5) + '...';
      console.log('Geladene Umgebungsvariablen:', safeConfig);
      
      // Umgebungsvariablen in process.env übertragen
      for (const key in envConfig) {
        process.env[key] = envConfig[key];
      }
      
      // DEBUG_MODE nach dem Laden der .env-Datei erneut prüfen
      DEBUG_MODE = process.env.DEBUG_MODE === "true";
      console.log(`DEBUG_MODE nach Laden der .env-Datei: ${DEBUG_MODE}`);
      
      if (DEBUG_MODE) {
        // Bestätige in Logs, welche Datei geladen wurde
        console.log(`🔧 Debug-Modus: ${envFile} geladen für Debug-Modus mit Development Token`);
        logDebug(`🔧 Debug-Modus: ${envFile} geladen mit Development Token`);
        logDebug(`🔑 Crisp-API-Credentials: IDENTIFIER=${!!process.env.CRISP_API_IDENTIFIER}, KEY=${!!process.env.CRISP_API_KEY}`);
      }
    } else {
      console.warn(`⚠️ ${envFile} nicht gefunden in ${__dirname}, verwende bestehende Umgebungsvariablen`);
      logDebug(`⚠️ ${envFile} nicht gefunden, verwende bestehende Umgebungsvariablen`);
    }
    
    // KRITISCH: Diese Prüfung nach dem Laden durchführen
    if (!process.env.CRISP_API_IDENTIFIER || !process.env.CRISP_API_KEY) {
      const errorMsg = "❌ FEHLER: CRISP_API_IDENTIFIER oder CRISP_API_KEY nicht gefunden in Umgebungsvariablen!";
      console.error(errorMsg);
      logDebug(errorMsg);
    } else {
      console.log("✅ CRISP-API-Credentials erfolgreich geladen");
      logDebug("✅ CRISP-API-Credentials erfolgreich geladen");
    }
  } catch (error) {
    console.error(`❌ Fehler beim Laden der Umgebungsvariablen: ${error.message}`);
    logDebug(`❌ Fehler beim Laden der Umgebungsvariablen: ${error.message}`);
  }
}

// WICHTIG: Lade die .env-Datei SOFORT beim Import dieser Datei
loadEnvFile();

// SCHRITT 3: Anzeigen aller kritischen Umgebungsvariablen für Debugging
if (DEBUG_MODE) {
  console.log("================================");
  console.log(" 🔍 Umgebungsvariablen Status:");
  console.log(`    CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    CRISP_API_KEY: ${process.env.CRISP_API_KEY ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? "✅ gesetzt" : "❌ undefined"}`);
  console.log(`    DEBUG_MODE: ${process.env.DEBUG_MODE}`);
  console.log("================================");
  
  logDebug("================================");
  logDebug(" 🔍 Umgebungsvariablen Status:");
  logDebug(`    CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? "✅ gesetzt" : "❌ undefined"}`);
  logDebug(`    CRISP_API_KEY: ${process.env.CRISP_API_KEY ? "✅ gesetzt" : "❌ undefined"}`);
  logDebug(`    CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN ? "✅ gesetzt" : "❌ undefined"}`);
  logDebug(`    CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? "✅ gesetzt" : "❌ undefined"}`);
  logDebug(`    DEBUG_MODE: ${process.env.DEBUG_MODE}`);
  logDebug("================================");
}

// SCHRITT 4: Umgebungsvariablen validieren und exportieren
let validatedEnv;
try {
  validatedEnv = cleanEnv(process.env, {
    CRISP_API_IDENTIFIER: str(),
    CRISP_API_KEY: str(),
    CRISP_SIGNING_SECRET: str({ default: '' }),
    CRISP_PLUGIN_URN: str(),
    DEBUG_MODE: bool({ default: false }),
  });
  
  logDebug("✅ Umgebungsvariablen erfolgreich validiert");
} catch (error) {
  console.error("================================");
  console.error(" ⚠️ Fehlende oder fehlerhafte Umgebungsvariablen:");
  console.error(`    CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? "vorhanden" : "fehlt"}`);
  console.error(`    CRISP_API_KEY: ${process.env.CRISP_API_KEY ? "vorhanden" : "fehlt"}`);
  console.error(`    CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN ? "vorhanden" : "fehlt"}`);
  console.error(`    CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? "vorhanden" : "fehlt"}`);
  console.error("================================");
  console.error(` ❌ Validierungsfehler: ${error.message}`);
  
  logDebug("================================");
  logDebug(" ⚠️ Fehlende oder fehlerhafte Umgebungsvariablen:");
  logDebug(`    CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? "vorhanden" : "fehlt"}`);
  logDebug(`    CRISP_API_KEY: ${process.env.CRISP_API_KEY ? "vorhanden" : "fehlt"}`);
  logDebug(`    CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN ? "vorhanden" : "fehlt"}`);
  logDebug(`    CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? "vorhanden" : "fehlt"}`);
  logDebug("================================");
  logDebug(` ❌ Validierungsfehler: ${error.message}`);
  
  console.error(" Fehler bei Umgebungsvariablen, aber Anwendung wird fortgesetzt");
  
  // Für Entwicklungszwecke setzen wir dennoch einen Standardwert
  validatedEnv = {
    DEBUG_MODE,
    CRISP_API_IDENTIFIER: process.env.CRISP_API_IDENTIFIER || '',
    CRISP_API_KEY: process.env.CRISP_API_KEY || '',
    CRISP_SIGNING_SECRET: process.env.CRISP_SIGNING_SECRET || '',
    CRISP_PLUGIN_URN: process.env.CRISP_PLUGIN_URN || ''
  };
}

// Hilfsfunktionen für die Authentifizierung und Modus-Erkennung
function authenticate(req) {
  // Einfache Authentifizierungsprüfung
  if (!req || !req.headers) {
    return false;
  }
  
  // API-Schlüssel aus Header extrahieren
  const apiKey = req.headers['x-api-key'];
  
  // Prüfen, ob der API-Schlüssel vorhanden ist und mit dem konfigurierten Schlüssel übereinstimmt
  if (!apiKey || apiKey !== process.env.CRISP_API_KEY) {
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