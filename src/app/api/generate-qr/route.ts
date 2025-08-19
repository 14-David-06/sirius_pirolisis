import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const AWS_S3_BUCKET = 'siriuspirolisis';

interface QRRequestData {
  balanceId: string;
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const { balanceId, url }: QRRequestData = await request.json();
    
    console.log('🔗 Generando QR para balance:', balanceId);

    // Crear la URL que contendrá la información completa del balance
    const qrUrl = url;

    // Generar el código QR como buffer
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    });

    // Generar nombre único para el archivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `balance-masa/qr-${balanceId}-${timestamp}.png`;

    // Subir a S3
    const uploadCommand = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: fileName,
      Body: qrBuffer,
      ContentType: 'image/png',
      Metadata: {
        'balance-id': balanceId,
        'generated-date': new Date().toISOString(),
        'qr-content': qrUrl,
      }
    });

    await s3Client.send(uploadCommand);
    
    // Construir URL pública del archivo
    const s3Url = `https://${AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
    
    console.log('✅ QR generado y subido a S3:', s3Url);

    return NextResponse.json({ 
      success: true, 
      qrUrl: s3Url,
      qrDataUrl: qrUrl,
      fileName,
      message: 'QR generado y subido exitosamente'
    });

  } catch (error) {
    console.error('❌ Error en /api/generate-qr:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno del servidor' 
    }, { status: 500 });
  }
}
