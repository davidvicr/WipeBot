const { cleanEnv, str, bool } = require("envalid");
const { logDebug } = require("./utils/debugLogger");

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

module.exports = { authenticate };
