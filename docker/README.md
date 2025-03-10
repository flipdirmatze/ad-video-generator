# Video-Verarbeitungs-Docker für AWS Batch

Dieses Docker-Image enthält FFmpeg und ein Node.js-Skript zur Verarbeitung von Videos in AWS Batch-Jobs.

## Funktionen

- Trimmen von Videos
- Verkettung mehrerer Videos
- Hinzufügen von Voiceover zu Videos
- Komplette Videogenerierung mit mehreren Schritten

## Voraussetzungen

- Docker installiert
- AWS CLI konfiguriert
- AWS ECR-Repository erstellt
- AWS Batch eingerichtet
- S3-Bucket für Medien

## Docker-Image erstellen

1. Navigiere zum Projektverzeichnis:

```bash
cd ai-ad-generator
```

2. Erstelle das Docker-Image:

```bash
docker build -t video-processor -f docker/Dockerfile .
```

3. Teste das Image lokal (optional):

```bash
docker run -it --rm \
  -e JOB_TYPE="trim" \
  -e INPUT_KEYS='["uploads/test.mp4"]' \
  -e OUTPUT_KEY="processed/output.mp4" \
  -e USER_ID="123" \
  -e JOB_PARAMS='{"startTime":0,"duration":10}' \
  -e S3_BUCKET="your-bucket-name" \
  -e AWS_REGION="eu-central-1" \
  -e AWS_ACCESS_KEY_ID="your-access-key" \
  -e AWS_SECRET_ACCESS_KEY="your-secret-key" \
  video-processor
```

## Auf AWS ECR hochladen

1. Logge dich bei ECR ein:

```bash
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin your-account-id.dkr.ecr.eu-central-1.amazonaws.com
```

2. Tagge das Image für ECR:

```bash
docker tag video-processor:latest your-account-id.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest
```

3. Lade das Image hoch:

```bash
docker push your-account-id.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest
```

## AWS Batch einrichten

### 1. Compute-Umgebung erstellen

1. Gehe zur AWS Batch Konsole
2. Wähle "Compute Environments" → "Create"
3. Einstellungen:
   - Name: `video-processing-env`
   - Provisioning Model: `MANAGED`
   - Minimum vCPUs: `0`
   - Maximum vCPUs: `8` (oder nach Bedarf anpassen)
   - Instance Types: `optimal`
   - Networking: VPC mit Internetzugang

### 2. Job-Queue erstellen

1. Gehe zur AWS Batch Konsole
2. Wähle "Job Queues" → "Create"
3. Einstellungen:
   - Name: `video-processing-queue`
   - Priority: `1`
   - Connected Compute Environment: `video-processing-env`

### 3. Job-Definition erstellen

1. Gehe zur AWS Batch Konsole
2. Wähle "Job Definitions" → "Create"
3. Einstellungen:
   - Name: `video-processor-job`
   - Platform Type: `EC2`
   - Execution Role: IAM-Rolle mit S3-Zugriff
   - Container Properties:
     - Image: `your-account-id.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest`
     - vCPUs: `2`
     - Memory: `4096` (4GB)

## Umgebungsvariablen in deiner Anwendung

Setze diese Umgebungsvariablen in deiner Next.js-Anwendung:

```
AWS_BATCH_JOB_DEFINITION=video-processor-job
AWS_BATCH_JOB_QUEUE=video-processing-queue
BATCH_CALLBACK_SECRET=your-secret-key
```

## S3-Bucket-Struktur

Hier ist die empfohlene Struktur für deinen S3-Bucket:

```
bucket-name/
├── uploads/        # Originale Video-Uploads
├── processed/      # Zwischenverarbeitete Videos
├── final/          # Finale, zusammengesetzte Videos
└── audio/          # Voiceover-Audiodateien
```

## IAM-Rollen

### 1. IAM-Rolle für den AWS Batch-Job

Diese Rolle benötigt:
- S3 Lese-/Schreibzugriff
- CloudWatch Logs-Berechtigungen

Beispiel-Policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. IAM-Rolle für die Next.js-Anwendung

Diese Rolle benötigt:
- S3 Lese-/Schreibzugriff
- AWS Batch-Berechtigungen zum Starten von Jobs

Beispiel-Policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "batch:SubmitJob",
        "batch:DescribeJobs",
        "batch:TerminateJob"
      ],
      "Resource": "*"
    }
  ]
}
``` 