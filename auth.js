const fs = require('fs');
const path = require('path');
const { cleanEnv, str, bool } = require("envalid");
const { logDebug } = require("./utils/debugLogger");

// DEBUG_MODE Erkennung
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

// Passende .env-Datei basierend auf Modus laden
function loadEnvFile() {
  try {
    const envFile = DEBUG_MODE ? '.env.dev' : '.env.prod';
    const envPath = path.join(__dirname, envFile);
    
    if (fs.existsSync(envPath)) {
      const dotenv = require('dotenv');
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      
      // Umgebungsvariablen setzen
      for (const key in envConfig) {
        process.env[key] = envConfig[key];
      }
      
      if (DEBUG_MODE) {
        console.log(`🔧 Debug-Modus: ${envFile} geladen mit Development Token`);
        logDebug(`🔑 Authentifizierungs-Status: CRISP_API_IDENTIFIER=${!!process.env.CRISP_API_IDENTIFIER}, CRISP_API_KEY=${!!process.env.CRISP_API_KEY}`);
      }
    } else {
      console.warn(`⚠️ ${envFile} existiert nicht, nutze bestehende Umgebungsvariablen`);
    }
  } catch (error) {
    console.error(`❌ Fehler beim Laden der Umgebungsvariablen: ${error.message}`);
  }
}

// Beim Importieren der Datei direkt die passende .env-Datei laden
loadEnvFile();

// Alle kritischen Umgebungsvariablen anzeigen (nur für Debugging)
if (DEBUG_MODE) {
  console.log("================================");
  console.log(" Umgebungsvariablen Status:");
  console.log(`    CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? "gesetzt" : "undefined"}`);
  console.log(`    CRISP_API_KEY: ${process.env.CRISP_API_KEY ? "gesetzt" : "undefined"}`);
  console.log(`    CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN ? "gesetzt" : "undefined"}`);
  console.log(`    CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? "gesetzt" : "undefined"}`);
  console.log("================================");
}

// Umgebungsvariablen validieren
try {
  const env = cleanEnv(process.env, {
    CRISP_API_IDENTIFIER: str(),
    CRISP_API_KEY: str(),
    CRISP_SIGNING_SECRET: str(),
    CRISP_PLUGIN_URN: str(),
    DEBUG_MODE: bool({ default: false }),
  });

  // Rest des Codes...
  // Authentifizierungsmiddleware für den Plugin-Endpunkt
  function authenticate(req) {
    // Bestehender Code...
  }

  // Gibt zurück, ob wir im Debug-Modus sind
  function isDebugMode() {
    return env.DEBUG_MODE;
  }

  // Gibt den Web-Hook-Endpunkt basierend auf dem Modus zurück
  function getWebHook() {
    return env.DEBUG_MODE 
      ? "https://dev.d-vicr.de/hook/message"
      : "https://wipebot.d-vicr.de/hook/message";
  }

  module.exports = { authenticate, isDebugMode, getWebHook, env };
} catch (error) {
  console.error("================================");
  console.error(" Missing environment variables:");
  console.error(`    CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER}`);
  console.error(`    CRISP_API_KEY: ${process.env.CRISP_API_KEY}`);
  console.error(`    CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN}`);
  console.error(`    CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET}`);
  console.error("================================");
  console.error();
  console.error(" Exiting with error code 1");
  process.exit(1);
}