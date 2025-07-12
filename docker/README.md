# Docker-Setup für Video-Verarbeitung mit AWS Batch

Diese Dokumentation beschreibt das Docker-Setup für die Video-Verarbeitungs-Pipeline des Ad-Video-Generators. Dieses Docker-Image wird mit AWS Batch verwendet, um Videos zu verarbeiten, Voiceovers hinzuzufügen und Untertitel zu generieren.

## ⚠️ WICHTIG: Plattform-Kompatibilität

**Das Docker-Image MUSS mit expliziter Plattform-Angabe `--platform linux/amd64` gebaut werden!**

```bash
docker buildx build --platform linux/amd64 -t video-processor -f docker/Dockerfile .
```

Ohne diese Plattform-Angabe wird das Image für die lokale Architektur (z.B. Apple Silicon) gebaut und der AWS Batch-Job schlägt mit dem Fehler `CannotPullContainerError: image Manifest does not contain descriptor matching platform 'linux/amd64'` fehl.

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
   - Limitiert auf 18 Zeichen pro Zeile für optimale Lesbarkeit
   - Verwendet entweder präzise Wort-Zeitstempel oder eine feste Anzeigedauer von 2,5 Sekunden pro Untertitel
   - Intelligente Worttrennung mit Bindestrich für extrem lange Wörter
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
docker buildx build --platform linux/amd64 -t video-processor -f docker/Dockerfile .
```

### Docker-Image auf AWS ECR hochladen

**Wichtig**: Achte darauf, die korrekte AWS-Kontonummer zu verwenden. Du kannst deine aktuelle Konto-ID überprüfen mit:

```bash
aws sts get-caller-identity
```

Verwende dann die angezeigte Kontonummer für die folgenden Befehle:

```bash
# Bei ECR anmelden (ersetze 585768181583 durch deine tatsächliche AWS-Kontonummer)
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 585768181583.dkr.ecr.eu-central-1.amazonaws.com

# Image taggen
docker tag video-processor:latest 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest

# Image hochladen
docker push 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest
```

Häufige Fehler beim Pushen:
- **"403 Forbidden"**: Das deutet auf eine falsche Kontonummer oder fehlende Berechtigungen hin
- **"Not Found"**: Das Repository existiert möglicherweise nicht und muss erst erstellt werden
- **"No Basic Auth"**: Du bist nicht korrekt bei ECR angemeldet

## Änderungen am Verarbeitungsskript

Wenn du Änderungen am `process-video.js` Skript oder anderen Teilen des Docker-Images vornimmst, musst du:

1. Die Änderungen im Code-Repository vornehmen und testen
2. Das Docker-Image neu bauen (wie oben beschrieben)
3. Das neue Image auf ECR hochladen (wie oben beschrieben)
4. Die AWS Batch-Jobs verwenden automatisch das neue Image, wenn sie mit dem `:latest` Tag konfiguriert sind

## Untertitel-Generierung

Das Skript enthält eine verbesserte Untertitelgenerierung mit folgenden Funktionen:

- Beschränkung auf maximal 18 Zeichen pro Zeile für optimale Lesbarkeit
- Intelligente Worttrennung, die Wörter grundsätzlich zusammenhält
- Nur sehr lange Wörter (>27 Zeichen) werden mit Bindestrich getrennt
- Anpassbare Anzeigedauer basierend auf Zeichenlänge und Wortanzahl
- Formatierungsoptionen für Schriftart, Größe, Farbe und Position

Anpassungen der Untertitel-Optionen können über die Umgebungsvariablen gesteuert werden:

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| ADD_SUBTITLES | false | Aktiviert die Untertitel |
| SUBTITLE_FONT_NAME | Montserrat | Schriftart |
| SUBTITLE_FONT_SIZE | 18 | Schriftgröße |
| SUBTITLE_POSITION | bottom | Position (bottom, middle, top) |

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



ToDos bevor Launch:
Functional
- Untertitel perfektionieren - DONE
- KI Matching Prompt perfektionieren
- Ladeleiste von Video Editor verbessern mit Email Notification wenn fertig
- Premiumfunktionen anpassen
- Google Login und normaler Login überprüfen
- Sicherheitschecks durchführen: Insbesondere API Keys Schwachstellen prüfen
- Voiceover Upload bei Script Seite ermöglichen
- Perplexity bei Script Matcher Seite für B-Roll adden
- Finaler Testdurchgang

Marketing
- Landingpage optimieren und mit Videos ausstatten (UGGS.io und enhancor als Inspo)
- Linkedin Nachricht formulieren
- Instagram Seite erstellen
- Anzeigen bauen
- YT Video Erklärungen drehen

