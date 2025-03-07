FROM node:18-alpine

# Zeitzone setzen
ENV TZ=Europe/Berlin

# FFmpeg und andere Abhängigkeiten installieren
RUN apk add --no-cache ffmpeg python3 tzdata

# Arbeitsverzeichnis erstellen
WORKDIR /app

# Abhängigkeiten zuerst kopieren und installieren (für besseres Caching)
COPY package*.json ./
RUN npm ci

# App-Code kopieren
COPY . .

# Next.js-App bauen
RUN npm run build

# Anwendung starten
CMD ["npm", "start"] 