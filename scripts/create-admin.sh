#!/bin/bash

# Create Admin User Script
# Führt das Node.js-Skript aus und übergibt die Parameter

if [ "$#" -lt 3 ]; then
  echo "Verwendung: $0 <email> <passwort> <name>"
  exit 1
fi

# Hole die aktuelle Verzeichnis des Skripts
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PARENT_DIR="$(dirname "$DIR")"

# Führe das Node-Skript aus
cd "$PARENT_DIR" && node scripts/create-admin.js "$@" 