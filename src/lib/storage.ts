import { S3Client, PutObjectCommand, GetObjectCommand, S3ClientConfig, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3 Bucket-Folder-Struktur für die Anwendung:
 * - users/{userId}/uploads/: Benutzerspezifische Uploads
 * - users/{userId}/processed/: Benutzerspezifische verarbeitete Segmente
 * - users/{userId}/final/: Benutzerspezifische fertige Videos
 * - users/{userId}/audio/: Benutzerspezifische Audiodateien
 * - users/{userId}/config/: Benutzerspezifische Konfigurationen
 * 
 * Legacy-Struktur (für Abwärtskompatibilität):
 * - uploads/: Ursprüngliche Video-Uploads der Benutzer
 * - processed/: Zwischenverarbeitete Videosegmente
 * - final/: Endgültige zusammengesetzte Videos
 * - audio/: Audiodateien und Voiceovers
 * - config/: Konfigurationsdateien für Video-Verarbeitung
 */

// Typ für Bucket-Kategorien
export type S3BucketFolder = 'uploads' | 'processed' | 'final' | 'audio' | 'config';

// S3 Client Konfiguration
const s3Config: S3ClientConfig = {
  region: process.env.AWS_REGION || 'eu-central-1', // Fallback auf eu-central-1
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },
};

// S3 Client erstellen - mit Fehlerprüfung
let s3Client: S3Client;
try {
  if (!process.env.AWS_REGION) {
    console.warn('AWS_REGION ist nicht definiert. Fallback auf eu-central-1.');
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('AWS Credentials sind nicht vollständig. S3-Operationen könnten fehlschlagen.');
  }
  s3Client = new S3Client(s3Config);
  console.log('S3 Client erfolgreich konfiguriert mit Region:', s3Config.region);
} catch (err) {
  console.error('Fehler bei der Initialisierung des S3 Clients:', err);
  // Fallback für Tests/Entwicklung - mit expliziten Werten
  s3Client = new S3Client({ 
    region: 'eu-central-1',
    // Keine Credentials hier, um keine sensiblen Daten zu loggen
  });
  console.warn('S3 Client mit Fallback-Konfiguration initialisiert - kann im Produktionsmodus fehlschlagen');
}

// Bucket Name aus Umgebungsvariablen mit Fallback für Entwicklung
const bucketName = process.env.S3_BUCKET_NAME || 'ad-video-generator-bucket';

/**
 * Generiert einen S3-Pfad mit Berücksichtigung der Mandantentrennung
 */
export function generateUserScopedPath(
  folder: S3BucketFolder,
  fileName: string,
  userId?: string
): string {
  if (!userId) {
    // Legacy-Pfad für Abwärtskompatibilität
    return `${folder}/${fileName}`;
  }
  return `users/${userId}/${folder}/${fileName}`;
}

/**
 * Upload einer Datei direkt zu S3 mit Mandantentrennung
 */
export async function uploadToS3(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  folder: S3BucketFolder = 'uploads',
  userId?: string
) {
  // Generiere den richtigen Pfad mit Mandantentrennung
  const key = generateUserScopedPath(folder, fileName, userId);
  
  console.log(`Uploading to S3 with key: ${key}${userId ? ' (mandantensicher)' : ' (legacy)'}`);
  
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
  expiresIn: number = 3600,
  userId?: string
) {
  // Prüfe AWS Konfiguration
  if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !bucketName) {
    throw new Error('AWS Konfiguration ist unvollständig. Bitte AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY und S3_BUCKET_NAME definieren.');
  }
  
  // Generiere den richtigen Pfad mit Mandantentrennung
  const key = generateUserScopedPath(folder, fileName, userId);
  
  console.log(`Generating presigned URL for ${key}`);
  
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
export const getS3Url = (key: string): string => {
  if (!key) return '';
  const region = process.env.AWS_REGION || 'eu-central-1'; // Fallback auf eu-central-1 wenn keine Region gesetzt ist
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
};

/**
 * Generiert einen öffentlichen S3-URL für eine Datei
 * Verwendet jetzt signierte URLs für autorisierten Zugriff
 */
export async function getS3UrlSigned(key: string): Promise<string> {
  try {
    // Generate a signed URL that works for 1 day
    return await getSignedDownloadUrl(key, 86400); 
  } catch (error) {
    console.error(`Failed to generate signed URL for ${key}:`, error);
    // Fallback to the direct URL (which will likely fail with 403)
    const region = process.env.AWS_REGION || 'eu-central-1';
    return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  }
}

/**
 * Listet Dateien in einem S3-Bucket-Ordner auf
 */
export async function listFiles(
  folder: S3BucketFolder,
  prefix: string = '',
  maxKeys: number = 100,
  userId?: string
) {
  // Mandantentrennung für die Auflistung von Dateien
  const folderPrefix = userId 
    ? `users/${userId}/${folder}/` 
    : `${folder}/`;
    
  const fullPrefix = prefix 
    ? `${folderPrefix}${prefix}` 
    : folderPrefix;

  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: fullPrefix,
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
 * Diese Funktion wird durch generateUserScopedPath ersetzt, bleibt aber für Abwärtskompatibilität
 */
export function generateS3Key(
  fileName: string, 
  folder: S3BucketFolder = 'uploads',
  userId?: string
): string {
  return generateUserScopedPath(folder, fileName, userId);
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

export async function getSignedVideoUrl(key: string, expiresIn: number = 3600): Promise<string> {
  // Entferne führenden Schrägstrich, falls vorhanden
  const cleanKey = key.startsWith('/') ? key.slice(1) : key;
  
  // Verwende den Key direkt, da er jetzt möglicherweise eine Benutzer-ID enthält
  const fullKey = cleanKey;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: fullKey,
  });

  try {
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    console.log(`Generated signed URL for video: ${fullKey}`);
    return signedUrl;
  } catch (error) {
    console.error(`Error generating signed URL for ${fullKey}:`, error);
    throw error;
  }
}

/**
 * Löscht ein Objekt aus dem S3 Bucket anhand seines Keys.
 */
export async function deleteS3Object(key: string): Promise<boolean> {
  if (!key) {
    console.error('[S3 Delete] Received empty key, cannot delete.');
    return false;
  }
  
  console.log(`[S3 Delete] Attempting to delete object with key: ${key}`);
  
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    await s3Client.send(command);
    console.log(`[S3 Delete] Successfully deleted object: ${key}`);
    return true;
  } catch (error) {
    console.error(`[S3 Delete] Failed to delete object ${key}:`, error);
    // Wir geben false zurück, aber werfen den Fehler nicht unbedingt weiter,
    // damit der aufrufende Code entscheiden kann, wie er damit umgeht (z.B. DB-Eintrag trotzdem löschen?)
    return false;
  }
}