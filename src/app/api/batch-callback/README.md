# AWS Batch Callback API

Diese API ermöglicht es AWS Batch-Jobs, den Status von Videobearbeitungsaufgaben an die Anwendung zurückzumelden. Dadurch kann der Benutzer über den Fortschritt und das Ergebnis seiner Videobearbeitungsaufgaben informiert werden.

## Endpunkt

```
POST /api/batch-callback
```

## Payload

```json
{
  "jobId": "string",           // Erforderlich: Die ID des AWS Batch-Jobs
  "status": "success|failed",  // Erforderlich: Der Status des Jobs
  "outputKey": "string",       // Erforderlich bei Erfolg: Der S3-Schlüssel der Ausgabedatei
  "error": "string",           // Optional bei Fehler: Fehlerbeschreibung
  "callbackSecret": "string"   // Erforderlich: Geheimer Schlüssel zur Authentifizierung
}
```

## Beispiele

### Erfolgreicher Job

```json
{
  "jobId": "569dbdb0-c8cb-4121-be44-35aa7bb8ef30",
  "status": "success",
  "outputKey": "output/processed-video.mp4",
  "callbackSecret": "dein-geheimer-schlüssel"
}
```

### Fehlgeschlagener Job

```json
{
  "jobId": "569dbdb0-c8cb-4121-be44-35aa7bb8ef30",
  "status": "failed",
  "error": "FFmpeg failed with exit code 1: File not found",
  "callbackSecret": "dein-geheimer-schlüssel"
}
```

## Konfiguration

### 1. Umgebungsvariablen in der Next.js-Anwendung

- `BATCH_CALLBACK_SECRET`: Geheimer Schlüssel zur Authentifizierung der Callback-Anfragen

### 2. Umgebungsvariablen im Docker-Container

- `CALLBACK_URL`: Die URL des Callback-Endpunkts, z.B. `https://deine-app.vercel.app/api/batch-callback`
- `BATCH_CALLBACK_SECRET`: Der gleiche geheime Schlüssel wie in der Next.js-Anwendung

## AWS Batch Job-Definition

Bei der Erstellung einer AWS Batch-Job-Definition müssen die folgenden Umgebungsvariablen berücksichtigt werden:

```json
{
  "environment": [
    {
      "name": "CALLBACK_URL",
      "value": "https://deine-app.vercel.app/api/batch-callback"
    },
    {
      "name": "BATCH_CALLBACK_SECRET",
      "value": "dein-geheimer-schlüssel"
    }
  ]
}
```

## Testen des Endpunkts

1. Verwende das Testskript in `src/scripts/test-batch-callback.js`

```bash
# Erfolgreichen Job simulieren
node src/scripts/test-batch-callback.js abc123 success output/test-video.mp4

# Fehlgeschlagenen Job simulieren
node src/scripts/test-batch-callback.js abc123 failed "Video processing failed"
```

2. Stelle sicher, dass die folgenden Umgebungsvariablen gesetzt sind:
   - `NEXT_PUBLIC_APP_URL`: Die URL deiner Anwendung
   - `BATCH_CALLBACK_SECRET`: Der geheime Schlüssel für die Authentifizierung

## Fehlercodes

- `400`: Fehlende erforderliche Parameter
- `401`: Ungültiger oder fehlender Authentifizierungsschlüssel
- `404`: Projekt mit der angegebenen Job-ID nicht gefunden
- `500`: Serverfehler bei der Verarbeitung der Anfrage 