import { S3Client, PutObjectCommand, GetObjectCommand, S3ClientConfig, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3 Bucket-Folder-Struktur für die Anwendung:
 * - uploads/: Ursprüngliche Video-Uploads der Benutzer
 * - processed/: Zwischenverarbeitete Videosegmente
 * - final/: Endgültige zusammengesetzte Videos
 * - audio/: Audiodateien und Voiceovers
 */

// Typ für Bucket-Kategorien
export type S3BucketFolder = 'uploads' | 'processed' | 'final' | 'audio';

// S3 Client Konfiguration
const s3Config: S3ClientConfig = {
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
};

// S3 Client erstellen
const s3Client = new S3Client(s3Config);

// Bucket Name aus Umgebungsvariablen
const bucketName = process.env.S3_BUCKET_NAME!;

/**
 * Upload einer Datei direkt zu S3
 */
export async function uploadToS3(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  folder: S3BucketFolder = 'uploads'
) {
  const key = `${folder}/${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  return getS3Url(key);
}

/**
 * Generiert einen vorausgefüllten URL für direktes Hochladen durch den Client
 */
export async function getPresignedUploadUrl(
  fileName: string,
  contentType: string,
  folder: S3BucketFolder = 'uploads',
  expiresIn: number = 3600
) {
  const key = `${folder}/${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  
  return {
    url,
    key,
    fileUrl: getS3Url(key),
  };
}

/**
 * Generiert einen vorausgefüllten URL zum Herunterladen einer Datei
 */
export async function getSignedDownloadUrl(key: string, expiresIn: number = 3600) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generiert einen öffentlichen S3-URL für eine Datei
 */
export function getS3Url(key: string): string {
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Listet Dateien in einem S3-Bucket-Ordner auf
 */
export async function listFiles(
  folder: S3BucketFolder,
  prefix: string = '',
  maxKeys: number = 100
) {
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix ? `${folder}/${prefix}` : `${folder}/`,
    MaxKeys: maxKeys,
  });

  const response = await s3Client.send(command);

  // Dateiobjekte mit zusätzlichen Informationen wie URL zurückgeben
  return (response.Contents || []).map(item => ({
    key: item.Key,
    lastModified: item.LastModified,
    size: item.Size,
    url: getS3Url(item.Key!),
  }));
}

/**
 * Erzeugt einen S3-Key basierend auf Ordner und Dateiname
 */
export function generateS3Key(
  fileName: string, 
  folder: S3BucketFolder = 'uploads',
  userId?: string
): string {
  // Optional: Füge Benutzer-ID für bessere Organisation hinzu
  const userPath = userId ? `${userId}/` : '';
  return `${folder}/${userPath}${fileName}`;
}

/**
 * Hilfsfunktion, um Dateierweiterung aus einem Dateinamen zu extrahieren
 */
export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

/**
 * Hilfsfunktion, um einen eindeutigen Dateinamen zu generieren
 */
export function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  const extension = getFileExtension(originalName);
  
  return `${timestamp}-${randomStr}.${extension}`;
} 