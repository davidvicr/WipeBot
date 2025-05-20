#!/bin/bash

cd /opt/crisp-plugins/wipebot

case "$1" in
  start)
    echo "🚀 Starte WipeBot Plugin & Cron-Scheduler im Produktionsmodus..."
    source .env.prod
    export CRISP_API_IDENTIFIER CRISP_API_KEY CRISP_SIGNING_SECRET CRISP_PLUGIN_URN
    export DEBUG_MODE=false
    pm2 start lib/index.js --name wipebot-server --env production
    pm2 start cron_scheduler.js --name wipebot-cron --env production
    ;;

  "start debug")
    echo "🐞 Starte WipeBot im Debug-Modus..."
    source .env.dev
    export CRISP_API_IDENTIFIER CRISP_API_KEY CRISP_SIGNING_SECRET CRISP_PLUGIN_URN
    export DEBUG_MODE=true
    pm2 start lib/index.js --name wipebot-server --env development
    pm2 start cron_scheduler.js --name wipebot-cron --env development
    ;;
    
  stop)
    echo "🛑 Stoppe WipeBot Plugin & Cron-Scheduler..."
    pm2 stop wipebot-server || true
    pm2 stop wipebot-cron || true
    pm2 delete wipebot-server || true
    pm2 delete wipebot-cron || true
    ;;

  *)
    echo "❓ Nutzung:"
    echo "  ./wipebot.sh start         → Plugin starten (Production-Modus)"
    echo "  ./wipebot.sh \"start debug\" → Plugin im Debug-Modus starten"
    echo "  ./wipebot.sh stop          → Plugin stoppen"
    ;;
esac