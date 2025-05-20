const Crisp = require("crisp-api");
const axios = require("axios");
const { logDebug } = require("./utils/debugLogger");

// Lade Umgebungsvariablen aus .env.dev
require('dotenv').config({ path: '.env.dev' });

// Überprüfe, ob die erforderlichen Umgebungsvariablen vorhanden sind
if (!process.env.CRISP_API_IDENTIFIER || !process.env.CRISP_API_KEY) {
  console.error("❌ Fehler: API-Anmeldedaten fehlen in der .env.dev Datei");
  process.exit(1);
}

// Debug-Ausgabe der Umgebungsvariablen (ohne sensible Daten vollständig anzuzeigen)
console.log("🔍 Umgebungsvariablen:");
console.log(`  CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? process.env.CRISP_API_IDENTIFIER.substring(0, 8) + '...' : 'nicht gesetzt'}`);
console.log(`  CRISP_API_KEY: ${process.env.CRISP_API_KEY ? process.env.CRISP_API_KEY.substring(0, 8) + '...' : 'nicht gesetzt'}`);
console.log(`  CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN || 'nicht gesetzt'}`);
console.log(`  CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? 'gesetzt' : 'nicht gesetzt'}`);

// Authentifizierung mit Crisp-API-Client
try {
  console.log("🔐 Versuche Authentifizierung mit neuer Methode...");
  
  // Neue Authentifizierungsmethode für Crisp-API v9.10.0
  const client = new Crisp();
  client.authenticate(process.env.CRISP_API_IDENTIFIER, process.env.CRISP_API_KEY);

  console.log("✅ Authentifizierungskonfiguration erfolgreich");
  
  // Teste die Authentifizierung mit einer sicheren Website-ID
  const testWebsiteId = process.env.TEST_WEBSITE_ID || "3297e6f7-69b7-4b60-87bd-d22c65bbacc8";
  console.log(`🌐 Teste Authentifizierung mit Website-ID: ${testWebsiteId}`);
  
  // Prüfe, ob die Website-Methoden existieren
  if (!client.website) {
    console.error("❌ FEHLER: client.website ist nicht definiert!");
    console.log("📊 Client-Struktur:", Object.keys(client));
    testWithAxios(testWebsiteId);
  } else {
    // Prüfe, ob die listConversations-Methode existiert
    if (!client.website.listConversations) {
      console.error("❌ FEHLER: client.website.listConversations ist nicht definiert!");
      console.log("📊 Website-Methoden:", Object.keys(client.website));
      testWithAxios(testWebsiteId);
    } else {
      client.website.listConversations(testWebsiteId)
        .then(conversations => {
          console.log("✅ Authentifizierung erfolgreich!");
          console.log(`Anzahl der Konversationen: ${conversations.length}`);
          logDebug("✅ Authentifizierungstest erfolgreich abgeschlossen");
        })
        .catch(error => {
          console.error("❌ Authentifizierungsfehler mit Crisp-Client:", error.message);
          // Bei Fehler mit dem Crisp-Client, versuche es mit Axios
          testWithAxios(testWebsiteId);
        });
    }
  }
} catch (error) {
  console.error("❌ Fehler bei der Authentifizierungskonfiguration:", error.message);
  console.error("Fehlerdetails:", error);
  console.error("Stack Trace:", error.stack);
  
  // Bei Fehler mit dem Crisp-Client, versuche es mit Axios
  const testWebsiteId = process.env.TEST_WEBSITE_ID || "3297e6f7-69b7-4b60-87bd-d22c65bbacc8";
  testWithAxios(testWebsiteId);
}

// Alternative Testmethode mit Axios
function testWithAxios(websiteId) {
  console.log("\n🔄 Versuche direkten API-Zugriff mit Axios...");
  
  // Erstelle Basic Auth Token
  const authString = `${process.env.CRISP_API_IDENTIFIER}:${process.env.CRISP_API_KEY}`;
  const base64Auth = Buffer.from(authString).toString('base64');
  
  // Erstelle Axios-Instance
  const api = axios.create({
    baseURL: "https://api.crisp.chat/v1/",
    headers: {
      "Authorization": `Basic ${base64Auth}`,
      "X-Crisp-Tier": "plugin",
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    timeout: 15000
  });
  
  // Teste API-Zugriff
  api.get(`website/${websiteId}/conversations`)
    .then(response => {
      console.log("✅ Direkter API-Zugriff erfolgreich!");
      console.log(`Statuscode: ${response.status}`);
      console.log(`Daten: ${JSON.stringify(response.data).substring(0, 100)}...`);
      logDebug("✅ Direkter API-Authentifizierungstest erfolgreich");
    })
    .catch(error => {
      console.error("❌ Fehler beim direkten API-Zugriff:", error.message);
      
      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Status Text:", error.response.statusText);
        console.error("Daten:", JSON.stringify(error.response.data, null, 2));
      }
      
      // Versuche es mit alternativer Authentifizierungsmethode
      console.log("\n🔄 Versuche alternative Authentifizierungsmethode...");
      
      const altApi = axios.create({
        baseURL: "https://api.crisp.chat/v1/",
        headers: {
          "X-Crisp-API-Identifier": process.env.CRISP_API_IDENTIFIER,
          "X-Crisp-API-Key": process.env.CRISP_API_KEY,
          "X-Crisp-Tier": "plugin",
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 15000
      });
      
      altApi.get(`website/${websiteId}/conversations`)
        .then(response => {
          console.log("✅ Alternative Authentifizierung erfolgreich!");
          console.log(`Statuscode: ${response.status}`);
          console.log(`Daten: ${JSON.stringify(response.data).substring(0, 100)}...`);
          logDebug("✅ Alternative Authentifizierung erfolgreich");
        })
        .catch(altError => {
          console.error("❌ Fehler bei alternativer Authentifizierung:", altError.message);
          
          if (altError.response) {
            console.error("Status:", altError.response.status);
            console.error("Status Text:", altError.response.statusText);
            console.error("Daten:", JSON.stringify(altError.response.data, null, 2));
          }
          
          logDebug("❌ Alle Authentifizierungsversuche fehlgeschlagen");
        });
    });
}
