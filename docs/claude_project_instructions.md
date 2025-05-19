
# 📘 Projektanweisungen für Claude AI

## 🔧 Projektname: *Crisp / WipeBot*

Dieses Projekt wird über dein GitHub-Repository gepflegt und in Trae mit Claude AI weiterentwickelt.  
Claude soll eigenständig arbeiten, anhand der bereitgestellten Informationen im Projektwissen.  

---

## 🧠 Arbeitsweise & Verhaltensregeln für Claude

- **Codes werden niemals im Chat gesendet.** Du nimmst alle Inhalte **ausschließlich aus dem GitHub-Projekt**.
- **Du stellst niemals Fragen nach Code-Inhalten.** Du findest alle relevanten Informationen im Projekt.
- Für jede bearbeitete Datei erstellst du ein **eigenständiges Artifact**, das:
  - **den vollständigen, ungekürzten Code enthält**
  - **kommentierte Anpassungen oder Ergänzungen** beinhaltet
  - **niemals nur Teilabschnitte** liefert

- Auch bei kleineren Änderungen (z. B. nur einer Funktion) **generierst du stets den gesamten Dateicode**.
- Du **entfernst niemals bestehende Funktionen oder Strukturen** ohne vorherige ausdrückliche Zustimmung.
- Deine Änderungen müssen:
  - den bestehenden Code analysieren
  - bestehende Probleme beheben
  - optimieren & erweitern – jedoch niemals destruktiv eingreifen

---

## ✅ Vorgehensweise

- **Du arbeitest Schritt für Schritt.**  
  Vor jedem neuen Schritt frage ich dich:  
  `Ich bin bereit für den nächsten Schritt. Was brauchst du von mir?`

- **Bis zur finalen Freigabe** durch den Satz  
  `JETZT HAST DU ALLE INFORMATIONEN.`  
  antwortest du nur mit:  
  `Verstanden. Informationen wurden analysiert und gespeichert.`

- **Halte alle Zwischenantworten kurz**, um die maximale Chatlänge zu schonen.

---

## 🔐 Projekt- und Systemdetails

- Server: Debian 12 (ZAP-Hosting)
- Speicher: 25 GB / 8 GB RAM / 5000 GB Traffic
- IP: `134.255.232.14` – SSH Port: `22` – Nutzer: `root`
- Domain: `d-vicr.de`  
  Subdomains:  
  - Debug: `dev.d-vicr.de`  
  - Production: `wipebot.d-vicr.de`

- Crisp Test-Website ID: `3297e6f7-69b7-4b60-87bd-d22c65bbacc8`  
- Plugin URN: `urn:david.crump:wipebot:0`  
- Projektpfad: `/opt/crisp-plugins/wipebot`

---

## 🧱 Struktur & Technologien

### Backend
- Node.js (CommonJS)
- Express Server (`index.js`)
- REST-API + Cron-Jobs (`cron_scheduler.js`)
- Filter-, Cleanup- & Debug-Logik (`wipebot_plugin.js`, `filter_manager.js`)
- Logging & Debugging (`logger.js`, `debugLogger.js`)
- Shell-Skripte für Prozesssteuerung (`wipebot.sh`, `wipebot-start`, `wipebot-stop`)

### Frontend (ES6-Module)
- UI als Modal in Crisp (`config.html`)
- UI-Logik & Filterverwaltung (`config-ui.js`, `api.js`)
- UI-Stil: Dunkel, modern, mit Glow-Effekten & Toggle-Switches

---

## 🧩 WipeBot Plugin-Funktionen

- Konfigurierbare Filter für das Löschen von Konversationen (30 je Website)
- Kriterien: Alter, Status, Plattform, Segmente, Uhrzeit, Postfach-Zuordnung
- Segmentweises Löschen möglich
- Gruppierung von Filtern mit Drag & Drop, Farben & Vorschauen
- Filter-Vorschau, Editieren, Duplizieren, Aktivieren/Deaktivieren
- Alles in Echtzeit pro Website speicherbar & löschbar
- Automatische Cron-Ausführung optional aktivierbar

---

## 🐞 Debug-Modus

- Aktivierung nur manuell via Konsole mit `.env.dev`
- Erlaubte Befehle:
  - `ping`, `wipe test`, `wipe [name]`, `preview [name]`, `filters`, `time`, `crisp id`, `version`
  - `log test`, `log view`, `log clear`, `disconnect`, `debug off`
- Keine Reaktion auf andere Trigger
- Kein Debug-Modus im Production-Betrieb

---

## 🚀 Weitere Ressourcen

- [LIQUIDROM Website](https://www.liquidrom-berlin.de/de/index.php)
- [Crisp Homepage](https://crisp.chat/de/)
- [Crisp Developer Hub](https://docs.crisp.chat/)
- [Crisp Integrationen](https://crisp.chat/en/integrations/)
- [Crisp Marketplace](https://marketplace.crisp.chat/plugins/)
- [Zap-Hosting](https://zap-hosting.com/de/)

---

## 📋 Hinweis

Claude soll alle Informationen aus diesem Dokument und dem Projektkontext berücksichtigen, bevor er reagiert oder generiert.  
Unvollständige Antworten, unvollständige Dateien oder das Entfernen bestehender Codestrukturen sind **ausdrücklich verboten**.

---

📌 **Letzter Hinweis:**  
Immer vollständige Artefakte. Immer vollständige Analyse. Niemals Chat-Code. Niemals Teilantworten. Immer strukturierter Fortschritt.
