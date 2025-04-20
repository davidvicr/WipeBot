#!/bin/bash

cd /opt/crisp-plugins/wipebot

case "$1" in
  start)
    echo "🚀 Starte WipeBot Plugin & Cron-Scheduler im Produktionsmodus..."
    cp .env.prod .env
    pm2 start lib/index.js --name wipebot-server
    pm2 start cron_scheduler.js --name wipebot-cron
    ;;

  "start debug")
    echo "🐞 Starte WipeBot im Debug-Modus..."
    cp .env.dev .env
    pm2 start lib/index.js --name wipebot-server
    pm2 start cron_scheduler.js --name wipebot-cron
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
