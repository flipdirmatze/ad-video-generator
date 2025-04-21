FROM node:18-slim

# Umgebungsvariablen
ENV DEBIAN_FRONTEND=noninteractive
ENV BATCH_CALLBACK_URL=https://ad-video-generator.vercel.app/api/batch-callback
ENV BATCH_CALLBACK_SECRET=""
ENV BATCH_CALLBACK_ENABLED=true

# WICHTIG: BATCH_CALLBACK_SECRET muss bei der Ausführung mit einem gültigen Wert überschrieben werden

# Installiere notwendige Abhängigkeiten und FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Installiere AWS CLI mit der --break-system-packages Option
RUN pip3 install --no-cache-dir awscli --break-system-packages

# Arbeitsverzeichnis erstellen
WORKDIR /app

# Package.json und package-lock.json kopieren
COPY docker/package.json ./

# Abhängigkeiten installieren
RUN npm install

# Skripte kopieren
COPY docker/scripts/ /app/

# Mache die Skripte ausführbar
RUN chmod +x /app/*.js

# Setze den Ausführungspunkt
ENTRYPOINT ["node", "/app/process-video.js"] 