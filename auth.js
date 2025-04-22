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
      const envConfig = require('dotenv').parse(fs.readFileSync(envPath));
      
      // Umgebungsvariablen setzen
      for (const key in envConfig) {
        process.env[key] = envConfig[key];
      }
      
      if (DEBUG_MODE) {
        console.log(`🔧 Debug-Modus: ${envFile} geladen mit Development Token`);
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

// Umgebungsvariablen validieren
const env = cleanEnv(process.env, {
  CRISP_API_IDENTIFIER: str(),
  CRISP_API_KEY: str(),
  CRISP_SIGNING_SECRET: str(),
  CRISP_PLUGIN_URN: str(),
  DEBUG_MODE: bool({ default: false }),
});

// Authentifizierungsmiddleware für den Plugin-Endpunkt
function authenticate(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    if (env.DEBUG_MODE) logDebug("❌ Keine oder ungültige Authorization-Header gefunden");
    return false;
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const [identifier, apiKey] = credentials.split(":");

  const isValid =
    identifier === env.CRISP_API_IDENTIFIER &&
    apiKey === env.CRISP_API_KEY;

  if (!isValid && env.DEBUG_MODE) {
    logDebug(`❌ Authentifizierungsfehler: Erhalten: ${identifier}:${apiKey}`);
  }

  return isValid;
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