# Vercel Umgebungsvariablen

Dieses Dokument beschreibt alle Umgebungsvariablen, die für die Bereitstellung der Anwendung auf Vercel erforderlich sind.

## Grundlegende Umgebungsvariablen

- `NEXT_PUBLIC_APP_URL`: Die öffentliche URL deiner Anwendung (z.B. `https://ai-ad-generator.vercel.app`)
- `MONGODB_URI`: Die Verbindungs-URL für deine MongoDB-Datenbank

## AWS-Konfiguration

### AWS-Zugangsdaten

- `AWS_ACCESS_KEY_ID`: Der Zugriffsschlüssel für deinen AWS-Benutzer
- `AWS_SECRET_ACCESS_KEY`: Der geheime Schlüssel für deinen AWS-Benutzer
- `AWS_REGION`: Die AWS-Region, in der deine Ressourcen bereitgestellt werden (z.B. `eu-central-1`)

### S3-Konfiguration

- `S3_BUCKET_NAME`: Der Name deines S3-Buckets für Mediendateien

### AWS Batch-Konfiguration

- `AWS_BATCH_JOB_DEFINITION`: Der Name oder ARN deiner AWS Batch-Job-Definition (z.B. `video-processor-job-fargate`)
- `AWS_BATCH_JOB_QUEUE`: Der Name oder ARN deiner AWS Batch-Job-Queue (z.B. `video-processing-queue`)
- `BATCH_CALLBACK_SECRET`: Ein geheimer Schlüssel zur Authentifizierung von AWS Batch-Callbacks
- `BATCH_CALLBACK_URL`: Die URL für Batch-Callbacks (standardmäßig `${NEXT_PUBLIC_APP_URL}/api/batch-callback`)

## Authentication (NextAuth)

- `NEXTAUTH_SECRET`: Ein geheimer Schlüssel für NextAuth.js (für die JWT-Verschlüsselung)
- `NEXTAUTH_URL`: Die URL deiner Anwendung für NextAuth.js (in der Regel gleich wie `NEXT_PUBLIC_APP_URL`)

### Google OAuth (optional)

- `GOOGLE_CLIENT_ID`: Die Client-ID für die Google OAuth-Integration
- `GOOGLE_CLIENT_SECRET`: Das Client-Secret für die Google OAuth-Integration

## Externe API-Integrationen

### ElevenLabs Voiceover (optional)

- `ELEVENLABS_API_KEY`: Der API-Schlüssel für die ElevenLabs-Integration zur Voiceover-Generierung

## Beispiel für eine .env.local-Datei für die lokale Entwicklung

```
# Grundlegende Konfiguration
NEXT_PUBLIC_APP_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/your-database

# AWS-Konfiguration
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
AWS_REGION=eu-central-1
S3_BUCKET_NAME=ad-video-generator-bucket

# AWS Batch
AWS_BATCH_JOB_DEFINITION=video-processor-job-fargate
AWS_BATCH_JOB_QUEUE=video-processing-queue
BATCH_CALLBACK_SECRET=your-secret-key
BATCH_CALLBACK_URL=${NEXT_PUBLIC_APP_URL}/api/batch-callback

# NextAuth
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000

# Externe APIs
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

## Hinweise zur Sicherheit

- Halte deine Umgebungsvariablen geheim und teile sie niemals in öffentlichen Repositories oder Anwendungen
- Verwende unterschiedliche Geheimnisse für Entwicklung, Staging und Produktion
- Stelle sicher, dass deine AWS-Benutzer nur die notwendigen Berechtigungen haben (Principle of Least Privilege)
- Rotiere deine Zugangsdaten regelmäßig, besonders nach Verdacht auf Kompromittierung 