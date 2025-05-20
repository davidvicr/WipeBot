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

// Debug-Ausgabe der Umgebungsvariablen (ohne sensible Daten vollständig anzuzeigen)
console.log("🔍 Umgebungsvariablen:");
console.log(`  CRISP_API_IDENTIFIER: ${process.env.CRISP_API_IDENTIFIER ? process.env.CRISP_API_IDENTIFIER.substring(0, 8) + '...' : 'nicht gesetzt'}`);
console.log(`  CRISP_API_KEY: ${process.env.CRISP_API_KEY ? process.env.CRISP_API_KEY.substring(0, 8) + '...' : 'nicht gesetzt'}`);
console.log(`  CRISP_PLUGIN_URN: ${process.env.CRISP_PLUGIN_URN || 'nicht gesetzt'}`);
console.log(`  CRISP_SIGNING_SECRET: ${process.env.CRISP_SIGNING_SECRET ? 'gesetzt' : 'nicht gesetzt'}`);

// Authentifizierung
try {
  console.log("🔐 Versuche Authentifizierung mit neuer Methode...");
  
  // Neue Authentifizierungsmethode für Crisp-API v9.10.0
  client.authenticate(process.env.CRISP_API_IDENTIFIER, process.env.CRISP_API_KEY);

  console.log("✅ Authentifizierungskonfiguration erfolgreich");
} catch (error) {
  console.error("❌ Fehler bei der Authentifizierungskonfiguration:", error.message);
  console.error("Fehlerdetails:", error);
  console.error("Stack Trace:", error.stack);
  process.exit(1);
}

// Teste die Authentifizierung mit einer sicheren Website-ID
const testWebsiteId = process.env.TEST_WEBSITE_ID || "3297e6f7-69b7-4b60-87bd-d22c65bbacc8";
console.log(`🌐 Teste Authentifizierung mit Website-ID: ${testWebsiteId}`);

// Prüfe, ob die Website-Methoden existieren
if (!client.website) {
  console.error("❌ FEHLER: client.website ist nicht definiert!");
  console.log("📊 Client-Struktur:", Object.keys(client));
  process.exit(1);
}

// Prüfe, ob die listConversations-Methode existiert
if (!client.website.listConversations) {
  console.error("❌ FEHLER: client.website.listConversations ist nicht definiert!");
  console.log("📊 Website-Methoden:", Object.keys(client.website));
  process.exit(1);
}

client.website.listConversations(testWebsiteId)
  .then(conversations => {
    console.log("✅ Authentifizierung erfolgreich!");
    console.log(`Anzahl der Konversationen: ${conversations.length}`);
    logDebug("✅ Authentifizierungstest erfolgreich abgeschlossen");
  })
  .catch(error => {
    console.error("❌ Authentifizierungsfehler:", error.message);
    console.error("Fehlertyp:", error.name);
    
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Status Text:", error.response.statusText);
      console.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      console.error("Daten:", JSON.stringify(error.response.data, null, 2));
    }
    
    console.error("Stack Trace:", error.stack);
    
    // Prüfe auf spezifische Fehlermeldungen
    if (error.message === 'invalid_session') {
      console.error("\n🔍 DIAGNOSE für 'invalid_session':");
      console.error("1. Möglicherweise ist die Crisp-API-Version nicht kompatibel");
      console.error("2. Die Authentifizierungsmethode könnte sich geändert haben");
      console.error("3. Der Development Token könnte falsch konfiguriert sein");
      console.error("4. Die Website-ID könnte nicht mit dem Token verknüpft sein");
      
      // Prüfe die Crisp-API-Version
      console.error("\n📦 Crisp-API-Version:", require("crisp-api/package.json").version);
    }
    
    logDebug(`❌ Authentifizierungstest fehlgeschlagen: ${error.message}`);
  });
