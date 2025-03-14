import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListBucketsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Definiere Typen für die Diagnosestrukturen
type DiagnosticsConnection = {
  status: string;
  error: string | null;
  buckets: string[];
  bucketExists?: boolean;
  warning?: string;
};

type Diagnostics = {
  timestamp: string;
  environment: string | undefined;
  aws: {
    region: string;
    hasAccessKey: boolean;
    hasSecretKey: boolean;
    bucketName: string;
  };
  connection: DiagnosticsConnection;
  presignedUrlTest?: {
    success: boolean;
    url?: string;
    key?: string;
    error?: string;
  };
};

export async function GET(request: NextRequest) {
  try {
    // Nur für authentifizierte Benutzer
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    // HINWEIS: Temporär für Debugging erlaubt - Nach Fehlerbehebung wieder auf Admin-Only setzen!
    // if (session.user.role !== 'admin') {
    //   return NextResponse.json(
    //     { error: 'Unauthorized - Admin access required' },
    //     { status: 401 }
    //   );
    // }

    // Sammle Diagnoseinformationen
    const diagnostics: Diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      aws: {
        region: process.env.AWS_REGION || 'nicht konfiguriert',
        hasAccessKey: Boolean(process.env.AWS_ACCESS_KEY_ID),
        hasSecretKey: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
        bucketName: process.env.S3_BUCKET_NAME || 'nicht konfiguriert',
      },
      connection: {
        status: 'unbekannt',
        error: null,
        buckets: [],
      }
    };

    // Teste die tatsächliche AWS-Verbindung
    try {
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'eu-central-1',
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
      });
      
      // Versuche, die Bucket-Liste abzurufen
      const command = new ListBucketsCommand({});
      const response = await s3Client.send(command);
      
      diagnostics.connection.status = 'erfolgreich';
      diagnostics.connection.buckets = (response.Buckets || []).map(b => b.Name || '');
      
      // Prüfe, ob der konfigurierte Bucket existiert
      const bucketExists = diagnostics.connection.buckets.includes(process.env.S3_BUCKET_NAME || '');
      diagnostics.connection.bucketExists = bucketExists;
      
      if (!bucketExists) {
        diagnostics.connection.warning = `Der konfigurierte Bucket '${process.env.S3_BUCKET_NAME}' wurde nicht in der Liste gefunden!`;
      }

      // TEST: Versuche, eine Presigned URL zu erstellen
      try {
        // Einzigartiger Test-Schlüssel
        const testKey = `diagnostics/test-${Date.now()}.txt`;
        
        // Erstelle eine Presigned URL für einen Upload
        const putCommand = new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: testKey,
          ContentType: 'text/plain',
        });
        
        const presignedUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 60 });
        
        // Füge die Presigned-URL-Informationen zu den Diagnostics hinzu
        diagnostics.presignedUrlTest = {
          success: true,
          url: presignedUrl.substring(0, 100) + '...', // Zeige nur Teile der URL aus Sicherheitsgründen
          key: testKey,
        };
      } catch (presignedError) {
        // Füge Fehlerinformationen zu den Diagnostics hinzu
        diagnostics.presignedUrlTest = {
          success: false,
          error: presignedError instanceof Error ? presignedError.message : String(presignedError),
        };
      }
    } catch (error) {
      diagnostics.connection.status = 'fehlgeschlagen';
      diagnostics.connection.error = error instanceof Error ? error.message : String(error);
    }

    return NextResponse.json(diagnostics);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Diagnostics failed',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
} 