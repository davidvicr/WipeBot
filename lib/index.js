const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const path = require("path");
// Auth-Modul importieren statt validateEnv
const auth = require("../auth");
const wipebot = require("./wipebot_plugin");
const { logDebug } = require("../utils/debugLogger");
const { version } = require("../package.json");

dotenv.config();
// Umgebungsvariablen werden bereits beim Import von auth.js validiert

const app = express();
const PORT = process.env.PORT || 1234;
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

// Middleware
app.use(bodyParser.json());

// Statische Dateien bereitstellen
app.use('/public', express.static(path.join(__dirname, '../public')));

// 🧪 Debug-Trigger-Verarbeitung (nur im Debug-Modus aktiv)
app.post("/hook/message", async (req, res) => {
  if (!DEBUG_MODE) return res.status(200).send("OK – Debug-Modus inaktiv");

  const { event, data } = req.body;

  if (!event || !data || event !== "message:created") {
    return res.status(400).send("Invalid webhook payload");
  }

  const { website_id, session_id, user_id, text, origin } = data;

  // Ignoriere Nachrichten ohne Text oder wenn sie nicht vom Nutzer stammen
  if (!text || origin !== "user") {
    return res.status(200).send("Ignored – Kein Triggertext oder nicht vom Nutzer");
  }

  const trimmedText = text.trim().toLowerCase();
  const triggerMatch = trimmedText.match(/^([a-z]+)(?:\s+(.*))?$/);

  if (!triggerMatch) {
    return res.status(200).send("Ignored – Kein passender Trigger");
  }

  const trigger = triggerMatch[1];
  const args = triggerMatch[2] ? triggerMatch[2].split(" ") : [];

  const validTriggers = [
    "ping", "wipe", "preview", "filters", "config", "version",
    "time", "crisp", "log", "disconnect", "debug", "stats"
  ];

  if (!validTriggers.some((t) => trigger.startsWith(t))) {
    return res.status(200).send("Ignored – Kein gültiger Debug-Trigger");
  }

  // 📥 Übergabe an wipebot_plugin zur Triggerverarbeitung
  const context = { website_id, session_id, user_id, message_id: data.id };

  try {
    await wipebot.handleDebugTrigger(trigger, args, context);
    await logDebug(`Trigger empfangen: '${text}' von Website ${website_id}`);
  } catch (err) {
    await logDebug(`Fehler bei Debug-Trigger '${text}': ${err.message}`);
  }

  return res.status(200).send("Trigger verarbeitet");
});

// 🔗 Healthcheck
app.get("/", (_, res) => {
  res.send(`WipeBot läuft! Version ${version} – DEBUG_MODE: ${DEBUG_MODE}`);
});

// Dynamisches Widget-Routing - erkennt automatisch Debug-Modus
app.get("/widget", (req, res) => {
  const debugMode = process.env.DEBUG_MODE === "true";
  
  // Leite entsprechend zum richtigen config.html weiter
  if (debugMode) {
    res.redirect("https://dev.d-vicr.de/public/config.html");
  } else {
    res.redirect("https://wipebot.d-vicr.de/public/config.html");
  }
});

// Alternativ mit direkter Bereitstellung statt Redirect
app.get("/dashboard", (req, res) => {
  const debugMode = process.env.DEBUG_MODE === "true";
  
  // Setze Debug-Info als Header und leite zur config.html weiter
  res.sendFile(path.join(__dirname, "../public/config.html"), {
    headers: {
      "X-Debug-Mode": debugMode ? "true" : "false"
    }
  });
});

// REST API-Endpunkte einrichten
// Hier würden alle API-Endpunkte definiert werden, falls sie nicht
// in wipebot.setupRestApi() definiert sind
wipebot.setupRestApi(app);

// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`WipeBot gestartet auf Port ${PORT} – DEBUG_MODE: ${DEBUG_MODE}`);
  logDebug(`🚀 Server gestartet auf Port ${PORT} – Widget-URL: ${DEBUG_MODE ? 'https://dev.d-vicr.de/widget' : 'https://wipebot.d-vicr.de/widget'}`);
});