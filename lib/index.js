const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const path = require("path");
// Auth-Modul importieren statt validateEnv
const auth = require("../auth");
const wipebot = require("./wipebot_plugin");
const { logDebug } = require("../utils/debugLogger");
const { version } = require("../package.json");

// Globale Fehlerbehandlung für unbehandelte Ausnahmen
process.on('uncaughtException', (error) => {
  console.error(`❌ Unbehandelter Fehler: ${error.message}`);
  logDebug(`❌ Unbehandelter Fehler: ${error.message}`);
  // Server nicht beenden, nur Fehler loggen
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`❌ Unbehandelte Promise-Ablehnung: ${reason}`);
  logDebug(`❌ Unbehandelte Promise-Ablehnung: ${reason}`);
  // Server nicht beenden, nur Fehler loggen
});

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
app.use(bodyParser.json({
  limit: '1mb',
  verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));

// Erhöhte Timeouts für Express
app.use((req, res, next) => {
  res.setTimeout(30000); // 30 Sekunden Timeout
  next();
});

// Statische Dateien bereitstellen
app.use('/public', express.static(path.join(__dirname, '../public')));

// 🧪 Debug-Trigger-Verarbeitung (jetzt mit besserer Fehlerbehandlung)
app.post("/hook/message", async (req, res) => {
  try {
    // Logging der eingehenden Anfrage
    logDebug(`📥 Webhook-Anfrage empfangen: ${req.rawBody ? req.rawBody.substring(0, 200) : 'Keine Daten'}`);
    
    // Im Debug-Modus die Signatur-Prüfung überspringen
    if (DEBUG_MODE) {
      logDebug(`🐞 Debug-Modus: Signatur-Prüfung wird übersprungen`);
    } else if (auth.env.CRISP_SIGNING_SECRET) {
      // Nur im Production-Modus die Signatur prüfen
      const signature = req.headers['x-crisp-signature'];
      if (!signature) {
        logDebug(`⚠️ Webhook ohne Signatur abgelehnt`);
        return res.status(401).send("Unauthorized: Missing signature");
      }
      
      // Signatur-Prüfung gemäß Crisp-Dokumentation
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', auth.env.CRISP_SIGNING_SECRET);
      hmac.update(req.rawBody);
      const expectedSignature = hmac.digest('hex');
      
      if (signature !== expectedSignature) {
        logDebug(`⚠️ Webhook mit ungültiger Signatur abgelehnt`);
        return res.status(401).send("Unauthorized: Invalid signature");
      }
      
      logDebug(`✅ Webhook-Signatur erfolgreich validiert`);
    }
    
    const { event, data } = req.body;
    
    if (!event || !data) {
      logDebug(`❌ Ungültiger Webhook-Payload: Event oder Daten fehlen`);
      return res.status(400).send("Invalid webhook payload: missing event or data");
    }
    
    // Im Debug-Modus auch auf "message:received" reagieren (für Operator-Nachrichten)
    const validEvents = DEBUG_MODE ? ["message:created", "message:received"] : ["message:created"];
    
    if (!validEvents.includes(event)) {
      logDebug(`⏭️ Ignoriertes Event: ${event}`);
      return res.status(200).send(`Ignored - Uninteresting event: ${event}`);
    }
    
    const { website_id, session_id, user_id, content, from, origin } = data;
    
    // Text-Inhalt aus verschiedenen Feldern extrahieren
    const text = content || data.text || "";
    
    if (!text) {
      logDebug(`⏭️ Ignoriert - Keine Nachricht`);
      return res.status(200).send("Ignored - No message text");
    }
    
    // Im Debug-Modus akzeptieren wir auch Operator-Nachrichten
    if (!DEBUG_MODE && origin !== "user" && from !== "user") {
      logDebug(`⏭️ Ignoriert - Ursprung ist nicht Benutzer: ${origin || from}`);
      return res.status(200).send(`Ignored - Origin is not user: ${origin || from}`);
    }
    
    // Debug-Logging für alle eingehenden Nachrichten 
    logDebug(`📩 Webhook empfangen: "${text}" (website=${website_id}, session=${session_id}, from=${from || origin})`);
    
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
      return res.status(200).send("Trigger verarbeitet");
    } catch (err) {
      logDebug(`❌ Fehler bei Debug-Trigger '${trigger}': ${err.message}`);
      return res.status(500).send(`Error processing trigger: ${err.message}`);
    }
  } catch (error) {
    console.error(`❌ Unbehandelter Fehler im /hook/message Handler: ${error.message}`);
    logDebug(`❌ Unbehandelter Fehler im /hook/message Handler: ${error.message}`);
    logDebug(`📚 Fehler-Stack: ${error.stack}`);
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
    serverTime: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
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