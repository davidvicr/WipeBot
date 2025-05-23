<<<<<<< HEAD
#!/bin/bash

cd /opt/crisp-plugins/wipebot

# Funktion zum Starten im Produktionsmodus
wipebot-start() {
    echo "🚀 Starte WipeBot Plugin & Cron-Scheduler im Produktionsmodus..."
    # Kopiere .env.prod nach .env
    cp .env.prod .env
    # Starte mit PM2
    pm2 start lib/index.js --name wipebot-server --env production
    pm2 start cron_scheduler.js --name wipebot-cron --env production
    echo "✅ WipeBot im Produktionsmodus gestartet"
}

# Funktion zum Starten im Debug-Modus
wipebot-start-debug() {
    echo "🐞 Starte WipeBot im Debug-Modus..."
    # Kopiere .env.dev nach .env
    cp .env.dev .env
    # Starte mit PM2 und stelle sicher, dass DEBUG_MODE gesetzt ist
    DEBUG_MODE=true pm2 start lib/index.js --name wipebot-server --env development --update-env
    DEBUG_MODE=true pm2 start cron_scheduler.js --name wipebot-cron --env development --update-env
    echo "✅ WipeBot im Debug-Modus gestartet"
}

# Funktion zum Stoppen
wipebot-stop() {
    echo "🛑 Stoppe WipeBot Plugin & Cron-Scheduler..."
    pm2 stop wipebot-server || true
    pm2 stop wipebot-cron || true
    pm2 delete wipebot-server || true
    pm2 delete wipebot-cron || true
    echo "✅ WipeBot gestoppt"
}

# Kommando-Verarbeitung
case "$1" in
  start)
    wipebot-start
    ;;
  start-debug)
    wipebot-start-debug
    ;;
  stop)
    wipebot-stop
    ;;
  *)
    echo "❓ Nutzung:"
    echo "  ./wipebot.sh start         → Plugin starten (Production-Modus mit .env.prod)"
    echo "  ./wipebot.sh start-debug   → Plugin im Debug-Modus starten (mit .env.dev)"
    echo "  ./wipebot.sh stop          → Plugin stoppen"
    ;;
=======
#!/bin/bash

cd /opt/crisp-plugins/wipebot

# Funktion zum Starten im Produktionsmodus
wipebot-start() {
    echo "🚀 Starte WipeBot Plugin & Cron-Scheduler im Produktionsmodus..."
    # Kopiere .env.prod nach .env
    cp .env.prod .env
    # Starte mit PM2
    pm2 start lib/index.js --name wipebot-server --env production
    pm2 start cron_scheduler.js --name wipebot-cron --env production
    echo "✅ WipeBot im Produktionsmodus gestartet"
}

# Funktion zum Starten im Debug-Modus
wipebot-start-debug() {
    echo "🐞 Starte WipeBot im Debug-Modus..."
    # Kopiere .env.dev nach .env
    cp .env.dev .env
    # Starte mit PM2 und stelle sicher, dass DEBUG_MODE gesetzt ist
    DEBUG_MODE=true pm2 start lib/index.js --name wipebot-server --env development --update-env
    DEBUG_MODE=true pm2 start cron_scheduler.js --name wipebot-cron --env development --update-env
    echo "✅ WipeBot im Debug-Modus gestartet"
}

# Funktion zum Stoppen
wipebot-stop() {
    echo "🛑 Stoppe WipeBot Plugin & Cron-Scheduler..."
    pm2 stop wipebot-server || true
    pm2 stop wipebot-cron || true
    pm2 delete wipebot-server || true
    pm2 delete wipebot-cron || true
    echo "✅ WipeBot gestoppt"
}

# Kommando-Verarbeitung
case "$1" in
  start)
    wipebot-start
    ;;
  start-debug)
    wipebot-start-debug
    ;;
  stop)
    wipebot-stop
    ;;
  *)
    echo "❓ Nutzung:"
    echo "  ./wipebot.sh start         → Plugin starten (Production-Modus mit .env.prod)"
    echo "  ./wipebot.sh start-debug   → Plugin im Debug-Modus starten (mit .env.dev)"
    echo "  ./wipebot.sh stop          → Plugin stoppen"
    ;;
>>>>>>> 6c37b311c7f7e56bf7fa000060925659981899eb
esac