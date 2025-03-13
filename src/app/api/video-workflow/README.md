# Video-Workflow API

Diese API bietet einen umfassenden Endpunkt, der den gesamten Videogenerierungsprozess koordiniert - vom Hochladen der Videos über Voiceover-Generierung bis hin zur FFmpeg-basierten Videobearbeitung auf AWS Batch.

## Endpunkte

### 1. Neuen Workflow starten

```
POST /api/video-workflow
```

Dieser Endpunkt startet einen neuen Workflow zur Videogenerierung. Er orchestriert:
- Verknüpfung bereits hochgeladener Videos
- Generierung eines Voiceovers (optional)
- Erstellung eines Projekts in der Datenbank
- Starten eines AWS Batch-Jobs zur Videobearbeitung

#### Request Body

```json
{
  "title": "Mein Werbevideo",
  "description": "Ein tolles Werbevideo für mein Produkt",
  "voiceoverScript": "Hier ist der Text für das Voiceover. Es wird automatisch generiert.",
  "voiceoverUrl": "https://bucket.s3.region.amazonaws.com/audio/voiceover.mp3", // Optional, falls bereits ein Voiceover existiert
  "videos": [
    {
      "id": "videoId1", // ID des bereits hochgeladenen Videos
      "segments": [
        {
          "videoId": "videoId1",
          "startTime": 0,
          "duration": 10,
          "position": 0
        }
      ]
    },
    {
      "id": "videoId2",
      "segments": [
        {
          "videoId": "videoId2",
          "startTime": 5,
          "duration": 15,
          "position": 1
        }
      ]
    }
  ],
  "options": {
    "resolution": "1080p",
    "aspectRatio": "16:9",
    "addSubtitles": true,
    "addWatermark": true,
    "watermarkText": "MeineMarke",
    "outputFormat": "mp4"
  }
}
```

**Anmerkungen:**
- Für `videos` musst du zunächst die Videos über `/api/upload-video` hochladen und erhältst die Video-IDs
- Die `segments` sind optional. Wenn keine angegeben sind, wird das gesamte Video verwendet
- Entweder `voiceoverScript` oder `voiceoverUrl` kann angegeben werden

#### Response

```json
{
  "success": true,
  "message": "Videogenerierungs-Workflow gestartet",
  "projectId": "project-uuid",
  "jobId": "aws-batch-job-id",
  "status": "processing",
  "estimatedTime": "Dein Video wird in wenigen Minuten fertig sein"
}
```

### 2. Workflow-Status abrufen

```
GET /api/video-workflow?projectId=project-uuid
```

Ruft den Status eines laufenden Workflows ab.

#### Response

```json
{
  "success": true,
  "project": {
    "id": "project-uuid",
    "title": "Mein Werbevideo",
    "description": "Ein tolles Werbevideo für mein Produkt",
    "status": "processing", // "pending", "processing", "completed", "failed"
    "progress": 65, // 0-100 Prozent
    "outputUrl": "https://bucket.s3.region.amazonaws.com/final/user-id/output.mp4",
    "batchJobId": "aws-batch-job-id",
    "batchJobName": "generate-final-12345",
    "error": null,
    "createdAt": "2023-08-10T12:34:56.789Z",
    "updatedAt": "2023-08-10T12:40:56.789Z"
  }
}
```

### 3. Alle Projekte abrufen

```
GET /api/video-workflow
```

Gibt eine Liste aller Projekte des angemeldeten Benutzers zurück.

#### Response

```json
{
  "success": true,
  "projects": [
    {
      "id": "project-uuid-1",
      "title": "Mein erstes Werbevideo",
      "status": "completed",
      "outputUrl": "https://bucket.s3.region.amazonaws.com/final/user-id/output1.mp4",
      "createdAt": "2023-08-10T12:34:56.789Z",
      "updatedAt": "2023-08-10T12:40:56.789Z"
    },
    {
      "id": "project-uuid-2",
      "title": "Mein zweites Werbevideo",
      "status": "processing",
      "outputUrl": null,
      "createdAt": "2023-08-11T12:34:56.789Z",
      "updatedAt": "2023-08-11T12:35:56.789Z"
    }
  ]
}
```

## Kompletter Workflow-Prozess

1. **Vorbereitung:**
   - Lade Videos hoch mit `POST /api/upload-video`
   - Erhalte die Video-IDs für den nächsten Schritt

2. **Workflow starten:**
   - Sende eine Anfrage an `POST /api/video-workflow` mit den Video-IDs und optional einem Voiceover-Skript
   - Erhalte eine Projekt-ID zurück

3. **Status überwachen:**
   - Rufe regelmäßig `GET /api/video-workflow?projectId=xxx` auf, um den Fortschritt zu überprüfen
   - Die API gibt den aktuellen Status und Fortschritt zurück

4. **Ergebnis verwenden:**
   - Sobald der Status "completed" ist, kannst du die `outputUrl` verwenden, um das fertige Video herunterzuladen oder in deiner Anwendung einzubetten

## Fehlerbehandlung

Die API kann folgende Fehler zurückgeben:

- **400 Bad Request**: Fehlende oder ungültige Parameter
- **401 Unauthorized**: Benutzer ist nicht authentifiziert
- **404 Not Found**: Video oder Projekt nicht gefunden
- **500 Internal Server Error**: Serverfehler beim Verarbeiten der Anfrage 