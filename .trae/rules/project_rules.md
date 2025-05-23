# WipeBot - Technische Dokumentation

## Überblick

WipeBot ist ein spezialisiertes Crisp-Plugin zur automatisierten Verwaltung von Konversationen im Crisp-Postfach. Das Plugin ermöglicht die regelbasierte Löschung von Konversationen – entweder vollständig oder nur bestimmter Segmente. Es wurde primär für das LIQUIDROM Berlin entwickelt, um deren Crisp-Postfach effizient zu verwalten.

### Kernfunktionalitäten

- **Regelbasierte Löschung**: Konfigurierbare Filter bestimmen, welche Chats gelöscht werden
- **Segmentbasierte Bereinigung**: Gezielte Entfernung bestimmter Nachrichtensegmente
- **Multi-Website-Unterstützung**: Funktioniert mit mehreren Crisp-Websites gleichzeitig
- **Automatisierte Zeitpläne**: Zeitgesteuerte Ausführung von Filteroperationen
- **Umfangreiche Filter-Kriterien**: Alter, Status, Plattform, Schlagworte, Benutzermerkmale, etc.
- **Statistik und Analyse**: Tracking von Löschaktivitäten
- **Modernes UI**: Intuitive Benutzeroberfläche mit Dark Mode und Glow-Effekten

### Betriebsmodi

- **Regulärer Modus**: Produktive Nutzung mit Production Token
- **Debug-Modus**: Entwicklungs- und Testumgebung mit speziellen Befehlen und Development Token

## Systemarchitektur

### Server-Umgebung

- **Hosting**: ZAP-Hosting vServer
- **Betriebssystem**: Debian 12 (64bit)
- **Hardware**: 2 CPU-Kerne, 8GB RAM, 25GB Speicher
- **IP**: 134.255.232.14
- **SSH-Zugang**: Port 22, Benutzer: Root
- **SSH-Key**: WipeBot-spezifischer SSH-Key

### Domains

- **Hauptdomain**: d-vicr.de
- **Produktion**: wipebot.d-vicr.de
- **Entwicklung**: dev.d-vicr.de

### Crisp-Integration

- **Website-ID (Test)**: 3297e6f7-69b7-4b60-87bd-d22c65bbacc8
- **Plugin-ID**: 3dbf2559-f8c3-48c3-8fd0-894fa32fa29f
- **Plugin-URN**: urn:david.crump:wipebot:0

**Development Token**:
- Identifier: f8ba1524-7b28-419f-9585-6682ae0ccbb4
- Key: dadf8fd2aee4ea561f5c3ac5867d3d4c3271cc9c044215334e13b16bae18e8e1
- Signing Secret: 7ea6d546a07a3332a0cabdb3dd91ee6f
- Web Hook: https://dev.d-vicr.de/hook/message

**Production Token**:
- Identifier: 750798c3-89f4-4587-989d-326a21dbbcd0
- Key: a1181a626029b2c6e38e2e905353af74257b0a06fd227761b27b1d09817b797d
- Signing Secret: 1fefbcb42f666df05cb457934b62c843
- Web Hook: https://wipebot.d-vicr.de/hook/message

## Projektstruktur

### Hauptverzeichnis

Basispfad: `/opt/crisp-plugins/wipebot`

### Backend-Komponenten (CommonJS)

1. **lib/index.js**
   - Express-Server-Initialisierung
   - Webhook-Verarbeitung für Crisp-Nachrichten
   - REST-API-Endpunkte Einrichtung
   - Anfragenweiterleitung an wipebot_plugin.js

2. **lib/wipebot_plugin.js**
   - Zentrale Steuerungslogik des Plugins
   - Debug-Trigger-Verarbeitung
   - Statistik-Management
   - REST-API-Handler für UI-Interaktion
   - Integration mit crisp_client.js und filter_manager.js

3. **lib/crisp_client.js**
   - Wrapper für die offizielle Crisp-API
   - Robuste Authentifizierung und API-Kommunikation
   - Rate-Limiting-Behandlung mit exponentieller Backoff-Strategie
   - Funktionen für Konversations-CRUD und Segmentoperationen
   - Simulationsfunktionen für Test-Durchläufe

4. **lib/filter_manager.js**
   - Verwaltung von Filtern und Filtergruppen
   - CRUD-Operationen für Filter
   - Filterkriterien-Validierung und -Anwendung
   - Laden und Speichern von Filter-Konfigurationen
   - Cleanup-Operationen (Simulation und Echtzeitausführung)

5. **cron_scheduler.js**
   - Automatisierte zeitgesteuerte Filterausführung
   - Dynamisches Management von Cron-Jobs
   - Website-spezifische Filterplanung
   - Automatische Aktualisierung bei Konfigurationsänderungen
   - Tägliche Wartungsaufgaben (Logbereinigung, Statistik)

6. **auth.js**
   - Umgebungsvariablen-Validierung
   - Token-Management und Authentifizierungslogik
   - Dynamisches Laden der richtigen .env-Datei (dev/prod)
   - Debug-Modus-Erkennung

### Frontend-Komponenten (ES6-Module)

1. **public/config.html**
   - Hauptansicht des WipeBot-UI
   - Tabbed Interface (Gruppen, Filter, Statistik, Einstellungen)
   - Moderne UI mit Dark Mode und Glow-Effekten
   - Tag-System für Segment-Verwaltung
   - Modale Filter-Vorschau

2. **public/ui/config-ui.js**
   - Dynamisches UI-Management
   - Filter- und Gruppen-Rendering
   - Formularinteraktionen
   - Integration mit der Frontend-API
   - Drag-and-Drop für Filter-Sortierung

3. **public/ui/api.js**
   - Frontend-Backend-Kommunikation
   - REST-API-Aufrufe mit Fehlerbehandlung
   - Caching-Mechanismen für bessere Performance
   - Statusanzeigen für Benutzer-Feedback
   - Filter-Vorschau und Import/Export-Funktionalität

### Datenspeicherung und Konfiguration

1. **config.json**
   - Speicherung aller Filter und Filtergruppen
   - Website-spezifische Konfigurationen
   - JSON-Struktur, organisiert nach Website-IDs

2. **data/statistics.json**
   - Speicherung von Löschstatistiken
   - Historische Daten für Reporting
   - Tägliche und kumulative Metriken

3. **.env.dev/.env.prod**
   - Umgebungsvariablen für Development/Production
   - API-Tokens und Credentials
   - Debug-Modus-Konfiguration

### Utility-Module

1. **utils/logger.js**
   - Standard-Logging im Tagesrhythmus
   - Automatische Rotation und Bereinigung alter Logs
   - Datumbasierte Logdateien

2. **utils/debugLogger.js**
   - Erweitertes Logging für Debug-Zwecke
   - Detaillierte Ausgabe mit Zeitstempeln
   - Separate debug.log-Datei

### Prozesssteuerung

1. **wipebot.sh**
   - Shell-Skript für Prozesssteuerung
   - Befehle: start, "start debug", stop
   - PM2-Integration für Prozess-Management
   - Umgebungsvariablen-Konfiguration

## Filterfunktionalitäten

### Allgemeine Filtereinstellungen

- **Grundeinstellungen**: Name, Gruppe, Farbe
- **Maximale Anzahl**: 30 Filter pro Website
- **Aktivierung/Deaktivierung**: Jeder Filter kann einzeln aktiviert/deaktiviert werden

### Filterkriterien

1. **Basis-Filterkriterien**:
   - Maximales Alter (in Tagen)
   - Status (geschlossen, offen, etc.)
   - Plattformen (WhatsApp, Webchat, Email, etc.)

2. **Erweiterte Kriterien**:
   - **Inaktivitätsfilter**: Löschung nach X Tagen Inaktivität
   - **Schlüsselwortfilterung**: Suche nach bestimmten Phrasen oder Wörtern
   - **Benutzermerkmale**: E-Mail-Domain-Filter
   - **Tag-basierte Filterung**: Inklusions-/Exklusionslisten für Tags
   - **Operator-Filter**: Filterung nach zuständigen Agenten
   - **Kombinationsfilter**: Komplexe Filterlogik mit UND/ODER-Verknüpfungen

3. **Segmentfilterung**:
   - Zu löschende Segmente (benutzerdefinierte Textpassagen)
   - Zu schützende Segmente (werden nicht gelöscht)
   - Option zum selektiven Löschen nur der Segmente

4. **Automatisierungseinstellungen**:
   - Zeitgesteuerte Ausführung (Uhrzeit)
   - Tagesbasierte Planung

## Debug-Modus und Befehle

Der Debug-Modus ermöglicht erweiterte Kontrolle und Monitoring über das Plugin. Er kann nur über die Konsole aktiviert werden und reagiert auf spezifische Trigger-Befehle:

- **ping**: Prüft die Verbindung zum Server (sendet "pong" zurück)
- **wipe test**: Simuliert Löschung ohne tatsächliche Änderungen
- **wipe [filtername]**: Führt einen bestimmten Filter aus
- **preview [filtername]**: Zeigt Details eines Filters an
- **filters**: Listet alle verfügbaren Filter auf
- **version**: Zeigt die Plugin-Version an
- **time**: Zeigt die aktuelle Serverzeit
- **crisp id**: Zeigt die Website-ID der aktuellen Installation
- **log test/view/clear**: Log-Management-Befehle
- **disconnect**: Trennt das Plugin von der Website (mit Bestätigung)
- **debug off**: Deaktiviert den Debug-Modus
- **stats view/reset**: Statistik-Verwaltungsbefehle

## Webserver-Konfiguration

### NGINX-Konfiguration

Die NGINX-Konfiguration befindet sich in `/etc/nginx` und ist für die Weiterleitung von HTTP-Anfragen an die Node.js-Anwendung verantwortlich. Es existieren zwei Virtual Hosts:

1. **wipebot.d-vicr.de** (Produktion)
   - SSL-Zertifikat über Let's Encrypt
   - Proxy-Weiterleitung an den lokalen Node.js-Server (Port 1234)
   - Statische Dateien aus dem public-Verzeichnis

2. **dev.d-vicr.de** (Entwicklung)
   - Ähnliche Konfiguration, aber mit Debug-Parametern
   - Zugriff auf Debug-Endpunkte

### Prozessverwaltung mit PM2

Das Plugin wird über PM2 als Daemon-Prozess verwaltet:

- **wipebot-server**: Hauptprozess für den Express-Server
- **wipebot-cron**: Cron-Scheduler-Prozess

## Startskripte und Prozessverwaltung

### wipebot.sh

Dieses Shell-Skript bietet eine einfache Schnittstelle zur Prozessverwaltung:

```bash
./wipebot.sh start         # Plugin im Produktionsmodus starten
./wipebot.sh "start debug" # Plugin im Debug-Modus starten
./wipebot.sh stop          # Plugin stoppen
```

Im Hintergrund werden folgende Aktionen ausgeführt:

1. **start**: 
   - Kopiert .env.prod nach .env
   - Startet lib/index.js und cron_scheduler.js über PM2 im Produktionsmodus

2. **start debug**:
   - Kopiert .env.dev nach .env
   - Setzt DEBUG_MODE=true
   - Startet beide Prozesse im Development-Modus mit speziellen Umgebungsvariablen

3. **stop**:
   - Stoppt und entfernt beide PM2-Prozesse

## REST-API-Endpunkte

Das Plugin bietet eine umfangreiche REST-API für die UI-Integration:

### Filter-Endpunkte

- `GET /api/filters/:websiteId` - Alle Filter abrufen
- `POST /api/filters/:websiteId` - Neuen Filter erstellen
- `PUT /api/filters/:websiteId/:filterId` - Filter aktualisieren
- `DELETE /api/filters/:websiteId/:filterId` - Filter löschen
- `POST /api/filters/:websiteId/:filterId/clone` - Filter klonen

### Gruppen-Endpunkte

- `GET /api/groups/:websiteId` - Alle Gruppen abrufen
- `POST /api/groups/:websiteId` - Neue Gruppe erstellen
- `DELETE /api/groups/:websiteId/:groupId` - Gruppe löschen

### Cleanup-Endpunkte

- `POST /api/cleanup/:websiteId/:filterId` - Cleanup ausführen
- `POST /api/cleanup/:websiteId/:filterId/test` - Testlauf durchführen

### Statistik-Endpunkte

- `GET /api/statistics/:websiteId` - Statistiken abrufen
- `GET /api/statistics/:websiteId/detailed` - Detaillierte Statistiken
- `POST /api/statistics/:websiteId/reset` - Statistiken zurücksetzen

### System-Endpunkte

- `GET /api/system/scheduler` - Scheduler-Status abrufen
- `GET /api/system/version` - Plugin-Version abrufen

## Zusammenspiel der Komponenten

1. **Eingangsschicht**:
   - HTTP-Anfragen gelangen über NGINX zum Express-Server (index.js)
   - Webhooks von Crisp werden über `/hook/message` empfangen und verarbeitet

2. **Steuerungslogik**:
   - wipebot_plugin.js fungiert als zentraler Controller
   - Leitet Anfragen an spezialisierte Module weiter
   - Verarbeitet Debug-Befehle und REST-API-Anfragen

3. **Crisp-Integration**:
   - crisp_client.js kommuniziert mit der Crisp-API
   - Stellt robuste Fehlerbehandlung und Wiederholungslogik bereit

4. **Filterverwaltung**:
   - filter_manager.js verwaltet und wendet Filter an
   - Speichert und lädt Konfigurationen aus config.json

5. **Zeitplansteuerung**:
   - cron_scheduler.js überwacht aktive Filter
   - Plant zeitgesteuerte Ausführungen und führt sie durch

6. **Benutzeroberfläche**:
   - config.html bietet die Hauptansicht
   - config-ui.js steuert die UI-Logik
   - api.js verbindet Frontend mit Backend-Endpunkten

7. **Datenfluss**:
   - Benutzerinteraktionen → Frontend → api.js → REST-Endpunkte → Backend-Module
   - Filteranwendung: filter_manager.js → crisp_client.js → Crisp-API
   - Zeitgesteuerte Operationen: cron_scheduler.js → filter_manager.js → crisp_client.js

## Sicherheitsaspekte

1. **Token-Schutz**:
   - Separate Tokens für Development und Production
   - Sichere Authentifizierung gegenüber Crisp-API

2. **Umgebungstrennung**:
   - Strikte Trennung zwischen Debug- und Produktionsmodus
   - Separate Domains und Umgebungsvariablen

3. **Bestätigungsdialoge**:
   - Kritische Operationen erfordern Bestätigung
   - Zweistufige Bestätigung für Trennungsoperationen

4. **Rate-Limiting**:
   - Intelligentes Backoff bei API-Limits
   - Schutz vor übermäßigen API-Anfragen

## Fehlerbehandlung und Logging

1. **Mehrstufiges Logging**:
   - Standard-Logs für reguläre Operationen (logger.js)
   - Detaillierte Debug-Logs im Debug-Modus (debugLogger.js)

2. **Robuste Fehlerbehandlung**:
   - Umfassende Try-Catch-Blöcke
   - Gradueller Fallback bei API-Fehlern
   - Retries mit exponentiellem Backoff

3. **Benutzer-Feedback**:
   - Statusanzeigen für laufende Operationen
   - Klare Fehlermeldungen und Erfolgsmeldungen

## Ressourcenverwaltung

1. **Caching-Mechanismen**:
   - Frontend-Cache für häufig abgerufene Daten
   - Vermeidung redundanter API-Aufrufe

2. **Log-Rotation**:
   - Automatische Bereinigung alter Logs
   - Effiziente Speichernutzung

3. **Bulk-Operationen**:
   - Effiziente Batch-Verarbeitung für Massenoperationen
   - Optimierte Datenbankzugriffe

## Erweiterungsmöglichkeiten

1. **Multi-Mandantenfähigkeit**:
   - Bereits vorbereitet für mehrere Websites
   - Website-spezifische Konfigurationen und Statistiken

2. **Filter-Erweiterungen**:
   - Framework unterstützt neue Filterkriterien
   - Modulare Filterlogik für einfache Erweiterungen

3. **API-Integration**:
   - REST-API ermöglicht Integration mit anderen Systemen
   - Webhook-Support für Event-basierte Automatisierung

4. **Reporting**:
   - Statistische Datenerfassung für zukünftige Reporting-Funktionen
   - Export-Funktionalität bereits vorhanden