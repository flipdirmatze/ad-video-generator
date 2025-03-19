# Docker-Setup für Video-Verarbeitung mit AWS Batch

Diese Dokumentation beschreibt das Docker-Setup für die Video-Verarbeitungs-Pipeline des Ad-Video-Generators. Dieses Docker-Image wird mit AWS Batch verwendet, um Videos zu verarbeiten, Voiceovers hinzuzufügen und Untertitel zu generieren.

## Architektur-Übersicht

Die Verarbeitungspipeline verwendet:

1. **Docker-Container**: Führt ein Node.js-Skript mit FFmpeg aus
2. **AWS Batch**: Verwaltet die Ausführung des Containers
3. **S3**: Speichert Eingabe- und Ausgabevideos
4. **MongoDB**: Speichert Metadaten über Projekte und Voiceovers
5. **Callback-API**: Aktualisiert den Projektstatus nach Abschluss

## Verzeichnisstruktur

```
docker/
  ├── Dockerfile             # Docker-Image-Definition
  ├── package.json           # Node.js-Abhängigkeiten
  ├── scripts/               # Verarbeitungsskripte
  │   └── process-video.js   # Hauptverarbeitungsskript
  └── README.md              # Diese Dokumentation
```

## Das Docker-Image

Das Docker-Image basiert auf `node:18-slim` und enthält:

- FFmpeg für Videoverarbeitung
- AWS CLI für S3-Interaktionen
- Node.js für die Ausführung des Verarbeitungsskripts
- Notwendige Abhängigkeiten für HTTP-Anfragen und S3-Zugriff

## Wichtige Funktionen

Das Verarbeitungsskript (`process-video.js`) bietet:

1. **Videosegmentierung und -verkettung**: Schneidet und verbindet Videosegmente
2. **Voiceover-Integration**: Fügt Audiovoiceover zu Videos hinzu
3. **Untertitelerstellung**: Generiert und fügt Untertitel basierend auf dem Voiceover-Text hinzu
4. **Callback-Mechanismus**: Benachrichtigt die Anwendung über den Verarbeitungsfortschritt

## Docker-Image bauen und aktualisieren

### Voraussetzungen

- Docker Desktop installiert
- AWS CLI konfiguriert mit Zugriff auf ECR
- Repository-Zugang

### Docker-Image lokal bauen

Wichtig: Das Image muss für die Plattform `linux/amd64` gebaut werden, da AWS Batch diese Plattform verwendet.

```bash
# Navigiere zum Projektverzeichnis
cd ai-ad-generator

# Baue das Docker-Image mit buildx für die richtige Plattform
cd docker
docker buildx build --platform linux/amd64 -t video-processor -f Dockerfile .
```

### Docker-Image auf AWS ECR hochladen

```bash
# Bei ECR anmelden
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 585768181583.dkr.ecr.eu-central-1.amazonaws.com

# Image taggen
docker tag video-processor:latest 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest

# Image hochladen
docker push 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest
```

## Änderungen am Verarbeitungsskript

Wenn du Änderungen am `process-video.js` Skript oder anderen Teilen des Docker-Images vornimmst, musst du:

1. Die Änderungen im Code-Repository vornehmen und testen
2. Das Docker-Image neu bauen (wie oben beschrieben)
3. Das neue Image auf ECR hochladen (wie oben beschrieben)
4. Ggf. die AWS Batch Job-Definition aktualisieren, falls sich Umgebungsvariablen geändert haben

## Wichtige Umgebungsvariablen

Das Verarbeitungsskript verwendet folgende Umgebungsvariablen:

| Variable | Beschreibung |
|----------|-------------|
| JOB_TYPE | Art der Verarbeitung ('generate-final') |
| INPUT_VIDEO_URL | URL des Eingabevideos |
| OUTPUT_KEY | S3-Schlüssel für die Ausgabedatei |
| USER_ID | ID des Benutzers, der den Job gestartet hat |
| PROJECT_ID | ID des Projekts in der Datenbank |
| TEMPLATE_DATA | JSON-String mit Template-Daten inkl. Segmenten |
| S3_BUCKET | Name des S3-Buckets |
| AWS_REGION | AWS-Region |
| BATCH_CALLBACK_SECRET | Secret für die Callback-API |
| BATCH_CALLBACK_URL | URL für Callback-API |
| VOICEOVER_URL | Direkte URL zum Voiceover |
| VOICEOVER_ID | ID des Voiceovers in der Datenbank |
| VOICEOVER_TEXT | Text für die Untertitel |
| ADD_SUBTITLES | Flag für Untertitelanzeige |
| SUBTITLE_OPTIONS | Formatierungsoptionen für Untertitel |

## AWS Batch-Setup

Das Batch-Setup umfasst:

1. **Compute-Umgebung**: Konfiguriert in AWS Batch als `video-processing-env`
2. **Job-Queue**: Konfiguriert als `video-processing-queue`
3. **Job-Definition**: Konfiguriert als `video-processor-job`

## S3-Bucket-Struktur

Die Dateien werden in folgendem Format gespeichert:

```
bucket-name/
├── uploads/              # Originale Video-Uploads
├── audio/                # Voiceover-Audio-Dateien
├── voiceovers/           # Alternative Pfad für Voiceovers
├── processed/            # Zwischenverarbeitete Videos
└── final/                # Finale Videos
    └── user-id/          # Nach Benutzer organisiert
```

## Debugging und Fehlerbehebung

### Logs prüfen

Die Logs des Containers sind in CloudWatch Logs verfügbar. Prüfe:

```
/aws/batch/job/job-id
```

### Häufige Probleme und Lösungen

1. **Plattformprobleme**: Verwende immer `--platform linux/amd64` beim Bauen des Images
2. **Voiceover nicht gefunden**: 
   - Prüfe, ob die Voiceover-URL oder Voiceover-ID korrekt übergeben wird
   - Das Skript versucht mehrere mögliche Pfade für das Voiceover:
     - `audio/{voiceoverId}.mp3`
     - `audio/voiceover_{voiceoverId}.mp3`
     - `audio/{voiceoverId}`
     - `voiceovers/{voiceoverId}.mp3`
     - `voiceovers/voiceover_{voiceoverId}.mp3`
3. **Callback-Fehler**: 
   - Prüfe, ob die PROJECT_ID korrekt übergeben wird
   - Stelle sicher, dass der BATCH_CALLBACK_SECRET korrekt ist
   - Prüfe, ob die BATCH_CALLBACK_URL erreichbar ist

## Fehlerbehebung für AWS Batch-Jobs

1. **Job startet nicht**:
   - Prüfe die AWS Batch-Warteschlange
   - Stelle sicher, dass die Compute-Umgebung aktiv ist
   - Prüfe die IAM-Rollen/Berechtigungen

2. **Job schlägt fehl**:
   - Prüfe die CloudWatch-Logs
   - Stelle sicher, dass alle benötigten Umgebungsvariablen gesetzt sind
   - Überprüfe die S3-Berechtigungen

3. **Video hat kein Voiceover/Untertitel**:
   - Prüfe, ob VOICEOVER_URL oder VOICEOVER_ID korrekt gesetzt ist
   - Stelle sicher, dass die Voiceover-Datei im S3-Bucket existiert
   - Prüfe, ob ADD_SUBTITLES=true und VOICEOVER_TEXT vorhanden ist

## Aktuelle Konfigurationswerte

- **AWS Region**: eu-central-1
- **ECR Repository**: 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor
- **Batch Job Definition**: video-processor-job
- **Batch Job Queue**: video-processing-queue
- **Callback URL**: https://ad-video-generator.vercel.app/api/batch-callback 