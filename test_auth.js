const Crisp = require("crisp-api");
const client = new Crisp();
const { logDebug } = require("./utils/debugLogger");

// Lade Umgebungsvariablen aus .env.dev
require('dotenv').config({ path: '.env.dev' });

// Überprüfe, ob die erforderlichen Umgebungsvariablen vorhanden sind
if (!process.env.CRISP_API_IDENTIFIER || !process.env.CRISP_API_KEY) {
  console.error("❌ Fehler: API-Anmeldedaten fehlen in der .env.dev Datei");
  process.exit(1);
}

// Authentifizierung
try {
  client.authenticateTier("plugin", {
    identifier: process.env.CRISP_API_IDENTIFIER,
    key: process.env.CRISP_API_KEY,
    tiers: ["websites"],
    version: "1"
  });
  // Die Zeile mit setHttpHeaders entfernen, da diese Methode nicht mehr existiert
  
  console.log("✅ Authentifizierungskonfiguration erfolgreich");
} catch (error) {
  console.error("❌ Fehler bei der Authentifizierungskonfiguration:", error.message);
  process.exit(1);
}

// Teste die Authentifizierung mit einer sicheren Website-ID
const testWebsiteId = process.env.TEST_WEBSITE_ID || "3297e6f7-69b7-4b60-87bd-d22c65bbacc8";

client.website.listConversations(testWebsiteId)
  .then(conversations => {
    console.log("✅ Authentifizierung erfolgreich!");
    console.log(`Anzahl der Konversationen: ${conversations.length}`);
    logDebug("✅ Authentifizierungstest erfolgreich abgeschlossen");
  })
  .catch(error => {
    console.error("❌ Authentifizierungsfehler:", error.message);
    if (error.response && error.response.data) {
      console.error("Details:", JSON.stringify(error.response.data));
    }
    logDebug(`❌ Authentifizierungstest fehlgeschlagen: ${error.message}`);
  });
