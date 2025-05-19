const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const path = require("path");
// Auth-Modul importieren statt validateEnv
const auth = require("../auth");
const wipebot = require("./wipebot_plugin");
const { logDebug } = require("../utils/debugLogger");
const { version } = require("../package.json");

// Debug-Modus aus dem auth-Modul beziehen
const DEBUG_MODE = auth.DEBUG_MODE;

// Ausführliche Debug-Ausgaben, wenn wir im Debug-Modus sind
if (DEBUG_MODE) {
  console.log(`🐞 STARTUP: Debug-Modus ist AKTIV (aus auth.js: ${DEBUG_MODE})`);
  console.log(`🔑 API Credentials: ID=${auth.env.CRISP_API_IDENTIFIER ? 'vorhanden' : 'fehlt'}, KEY=${auth.env.CRISP_API_KEY ? 'vorhanden' : 'fehlt'}`);
  
  logDebug(`🐞 STARTUP: Debug-Modus ist AKTIV (aus auth.js: ${DEBUG_MODE})`);
  logDebug(`🔑 API Credentials: ID=${auth.env.CRISP_API_IDENTIFIER ? 'vorhanden' : 'fehlt'}, KEY=${auth.env.CRISP_API_KEY ? 'vorhanden' : 'fehlt'}`);
}

const app = express();
const PORT = process.env.PORT || 1234;

// Middleware
app.use(bodyParser.json());

// Statische Dateien bereitstellen
app.use('/public', express.static(path.join(__dirname, '../public')));

// 🧪 Debug-Trigger-Verarbeitung (jetzt mit besserer Fehlerbehandlung)
app.post("/hook/message", async (req, res) => {
  try {
    const { event, data } = req.body;
    
    if (!event || !data) {
      return res.status(400).send("Invalid webhook payload: missing event or data");
    }
    
    if (event !== "message:created") {
      return res.status(200).send(`Ignored - Uninteresting event: ${event}`);
    }
    
    const { website_id, session_id, user_id, text, origin } = data;
    
    if (!text) {
      return res.status(200).send("Ignored - No message text");
    }
    
    if (origin !== "user") {
      return res.status(200).send(`Ignored - Origin is not user: ${origin}`);
    }
    
    // Debug-Logging für alle eingehenden Nachrichten 
    logDebug(`📩 Webhook empfangen: "${text}" (website=${website_id}, session=${session_id})`);
    
    // ⭐ Verbesserte Trigger-Erkennung ⭐
    const trimmedText = text.trim().toLowerCase();
    
    const triggerMatch = trimmedText.match(/^([a-z]+)(?:\s+(.*))?$/);
    
    if (!triggerMatch) {
      logDebug(`❓ Keine Trigger-Syntax erkannt: "${trimmedText}"`);
      return res.status(200).send("Ignored - No valid trigger format");
    }
    
    const trigger = triggerMatch[1];
    const args = triggerMatch[2] ? triggerMatch[2].split(/\s+/) : [];
    
    const validTriggers = [
      "ping", "wipe", "preview", "filters", "help", "version",
      "time", "crisp", "log", "disconnect", "debug", "stats"
    ];
    
    const isTrigger = validTriggers.some(t => trigger === t);
    
    if (!isTrigger) {
      logDebug(`❌ Ungültiger Trigger: "${trigger}"`);
      return res.status(200).send(`Ignored - Not a valid trigger: ${trigger}`);
    }
    
    // Debug-Modus-Prüfung nur für DEBUG-kritische Aktionen
    const debugOnlyTriggers = ["disconnect", "wipe", "debug", "stats"];
    if (debugOnlyTriggers.includes(trigger) && !DEBUG_MODE) {
      logDebug(`⚠️ Debug-Only-Trigger "${trigger}" im regulären Modus verwendet`);
      return res.status(200).send("Debug-only trigger ignored in regular mode");
    }
    
    // 📥 Übergabe an wipebot_plugin zur Triggerverarbeitung
    logDebug(`🔧 Verarbeite Trigger: "${trigger}" mit Argumenten: [${args.join(', ')}]`);
    
    const context = { 
      website_id, 
      session_id, 
      user_id, 
      message_id: data.id 
    };
    
    try {
      await wipebot.handleDebugTrigger(trigger, args, context);
      logDebug(`✅ Trigger "${trigger}" erfolgreich verarbeitet`);
    } catch (err) {
      logDebug(`❌ Fehler bei Debug-Trigger '${trigger}': ${err.message}`);
      return res.status(500).send(`Error processing trigger: ${err.message}`);
    }
    
    return res.status(200).send("Trigger verarbeitet");
  } catch (error) {
    logDebug(`❌ Unbehandelter Fehler im /hook/message Handler: ${error.message}`);
    return res.status(500).send("Internal Server Error");
  }
});

// 🔗 Healthcheck mit mehr Informationen
app.get("/", (_, res) => {
  const info = {
    name: "WipeBot",
    version: version,
    mode: DEBUG_MODE ? "DEBUG" : "PRODUCTION",
    status: "running",
    apiStatus: auth.env.CRISP_API_IDENTIFIER && auth.env.CRISP_API_KEY ? "configured" : "missing credentials",
    serverTime: new Date().toISOString()
  };
  
  res.json(info);
});

// Dynamisches Widget-Routing
app.get("/widget", (req, res) => {
  const debugParam = req.query.debug === 'true';
  const debugMode = DEBUG_MODE || debugParam;
  
  // Leite entsprechend zum richtigen config.html weiter
  if (debugMode) {
    res.redirect("https://dev.d-vicr.de/public/config.html");
  } else {
    res.redirect("https://wipebot.d-vicr.de/public/config.html");
  }
});

// Direkte Bereitstellung der Dashboard-Seite
app.get("/dashboard", (req, res) => {
  // Setze Debug-Info als Header und leite zur config.html weiter
  res.sendFile(path.join(__dirname, "../public/config.html"), {
    headers: {
      "X-Debug-Mode": DEBUG_MODE ? "true" : "false"
    }
  });
});

// REST API-Endpunkte einrichten
wipebot.setupRestApi(app);

// 🚀 Start Server
app.listen(PORT, '0.0.0.0', () => {
  const dashboardUrl = DEBUG_MODE 
    ? 'https://dev.d-vicr.de/dashboard' 
    : 'https://wipebot.d-vicr.de/dashboard';
  
  const webhookUrl = DEBUG_MODE 
    ? 'https://dev.d-vicr.de/hook/message' 
    : 'https://wipebot.d-vicr.de/hook/message';
  
  console.log(`🚀 WipeBot v${version} gestartet auf Port ${PORT} (0.0.0.0)`);
  console.log(`🔧 Modus: ${DEBUG_MODE ? 'DEBUG' : 'PRODUKTION'}`);
  console.log(`🌐 Dashboard: ${dashboardUrl}`);
  console.log(`🔗 Webhook: ${webhookUrl}`);
  
  logDebug(`🚀 WipeBot v${version} gestartet auf Port ${PORT} (0.0.0.0)`);
  logDebug(`🔧 Modus: ${DEBUG_MODE ? 'DEBUG' : 'PRODUKTION'}`);
  logDebug(`🌐 Dashboard: ${dashboardUrl}`);
  logDebug(`🔗 Webhook: ${webhookUrl}`);
});