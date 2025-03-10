FROM node:18-slim

# Umgebungsvariablen
ENV DEBIAN_FRONTEND=noninteractive

# Installiere notwendige Abhängigkeiten und FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Installiere AWS CLI für einfachere S3-Interaktion
RUN pip3 install --no-cache-dir awscli

# Arbeitsverzeichnis erstellen
WORKDIR /app

# Package.json und package-lock.json kopieren
COPY package*.json ./

# Abhängigkeiten installieren
RUN npm ci --production

# Skripte kopieren
COPY docker/scripts/ /app/

# Mache die Skripte ausführbar
RUN chmod +x /app/*.js

# Setze den Ausführungspunkt
ENTRYPOINT ["node", "/app/process-video.js"] 