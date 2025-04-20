const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const { validateEnv } = require("./validateEnv");
const wipebot = require("./wipebot_plugin");
const { logDebug } = require("../utils/debugLogger");
const { version } = require("../package.json");

dotenv.config();
validateEnv();

const app = express();
const PORT = process.env.PORT || 1234;
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

// Middleware
app.use(bodyParser.json());

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
    "time", "crisp", "log", "disconnect", "debug"
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

// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`WipeBot gestartet auf Port ${PORT} – DEBUG_MODE: ${DEBUG_MODE}`);
});
