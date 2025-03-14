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
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
};

// S3 Client erstellen - mit Fehlerprüfung
let s3Client: S3Client;
try {
  if (!process.env.AWS_REGION) {
    console.warn('AWS_REGION ist nicht definiert. Bitte Umgebungsvariablen überprüfen.');
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('AWS Credentials sind nicht vollständig. Bitte Umgebungsvariablen überprüfen.');
  }
  s3Client = new S3Client(s3Config);
  console.log('S3 Client erfolgreich konfiguriert mit Region:', process.env.AWS_REGION);
} catch (err) {
  console.error('Fehler bei der Initialisierung des S3 Clients:', err);
  // Fallback für Tests/Entwicklung
  s3Client = new S3Client({ region: 'us-east-1' });
}

// Bucket Name aus Umgebungsvariablen mit Fallback für Entwicklung
const bucketName = process.env.S3_BUCKET_NAME || 'dummy-bucket-for-development';

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
  // Prüfe AWS Konfiguration
  if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !bucketName) {
    throw new Error('AWS Konfiguration ist unvollständig. Bitte AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY und S3_BUCKET_NAME definieren.');
  }
  
  console.log(`Generating presigned URL for ${fileName} in folder ${folder}`);
  
  const key = `${folder}/${fileName}`;
  
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    console.log(`PutObjectCommand erstellt für Bucket: ${bucketName}, Key: ${key}`);
    
    // Erhöhe Timeout für große Dateien
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    
    console.log(`Presigned URL erfolgreich generiert für ${key}`);
    
    return {
      url,
      key,
      fileUrl: getS3Url(key),
    };
  } catch (error) {
    console.error(`Fehler beim Generieren der Presigned URL für ${key}:`, error);
    throw new Error(`Konnte keine Presigned URL generieren: ${error instanceof Error ? error.message : String(error)}`);
  }
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