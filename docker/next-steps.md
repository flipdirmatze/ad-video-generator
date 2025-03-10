# Nächste Schritte für deine AWS-Infrastruktur

## IAM-Berechtigungen

Für den aktuellen IAM-Benutzer `ai-ad-generator-app` müssen die folgenden Berechtigungen hinzugefügt werden:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:CreateRepository",
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    },
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

## Upload des Docker-Images

Sobald die Berechtigungen konfiguriert sind, führe die folgenden Befehle aus:

```bash
# 1. Bei ECR anmelden
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 585768181583.dkr.ecr.eu-central-1.amazonaws.com

# 2. ECR-Repository erstellen (falls nötig)
aws ecr create-repository --repository-name video-processor --region eu-central-1

# 3. Image hochladen
docker push 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest
```

## AWS Batch-Einrichtung

1. **Compute-Umgebung erstellen:**
   - Name: `video-processing-env`
   - Provisioning Model: `MANAGED`
   - Minimum vCPUs: `0`
   - Maximum vCPUs: `8` (oder nach Bedarf anpassen)
   - Instance Types: `optimal`
   - Networking: VPC mit Internetzugang

2. **Job-Queue erstellen:**
   - Name: `video-processing-queue`
   - Priority: `1`
   - Connected Compute Environment: `video-processing-env`

3. **Job-Definition erstellen:**
   - Name: `video-processor-job`
   - Platform Type: `EC2`
   - Execution Role: IAM-Rolle mit S3-Zugriff
   - Container Properties:
     - Image: `585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest`
     - vCPUs: `2`
     - Memory: `4096` (4GB)

## S3-Bucket-Konfiguration

1. **Bucket erstellen** (falls noch nicht existiert):
   ```bash
   aws s3 mb s3://your-bucket-name --region eu-central-1
   ```

2. **CORS-Konfiguration:**
   Erstelle eine Datei `cors.json`:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
       "AllowedOrigins": ["https://deine-domain.com", "http://localhost:3000"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

   Und wende sie an:
   ```bash
   aws s3api put-bucket-cors --bucket your-bucket-name --cors-configuration file://cors.json
   ```

## Umgebungsvariablen für Vercel

Setze die folgenden Umgebungsvariablen in deiner Vercel-Konfiguration:

```
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=eu-central-1
S3_BUCKET_NAME=your-bucket-name
AWS_BATCH_JOB_DEFINITION=video-processor-job
AWS_BATCH_JOB_QUEUE=video-processing-queue
BATCH_CALLBACK_SECRET=dein-geheimer-schlüssel
```

## Testen der Infrastruktur

Nach Abschluss aller Schritte kannst du die Infrastruktur testen, indem du:

1. Ein Video auf die Upload-Seite hochlädst
2. Ein Voiceover generierst
3. Die Editor-Seite verwendest, um ein Video zu erstellen

Das System sollte dann einen AWS Batch-Job starten, der das Video verarbeitet und das Ergebnis in den S3-Bucket hochlädt. 