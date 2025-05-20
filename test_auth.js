const Crisp = require("crisp-api");
const client = new Crisp();

// Lade Umgebungsvariablen aus .env.dev
require('dotenv').config({ path: '.env.dev' });

// Authentifizierung
client.authenticateTier("plugin", {
  identifier: process.env.CRISP_API_IDENTIFIER,
  key: process.env.CRISP_API_KEY,
  tiers: ["websites"],
  version: "1"
});

// Setze die HTTP-Header explizit
client.setHttpHeaders({
  "X-Crisp-Tier": "plugin",
  "X-Crisp-API-Identifier": process.env.CRISP_API_IDENTIFIER,
  "X-Crisp-API-Key": process.env.CRISP_API_KEY
});

// Teste die Authentifizierung
client.website.listConversations("3297e6f7-69b7-4b60-87bd-d22c65bbacc8")
  .then(conversations => {
    console.log("✅ Authentifizierung erfolgreich!");
    console.log(`Anzahl der Konversationen: ${conversations.length}`);
  })
  .catch(error => {
    console.error("❌ Authentifizierungsfehler:", error.message);
    if (error.response && error.response.data) {
      console.error("Details:", JSON.stringify(error.response.data));
    }
  });
