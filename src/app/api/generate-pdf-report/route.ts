import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_S3_BUCKET = 'siriuspirolisis';

// Configurar cliente S3
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID!,
    secretAccessKey: AWS_SECRET_ACCESS_KEY!,
  },
});

function generateHTMLReport(balanceData: any, balanceId: string): string {
  const currentDate = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informe Balance de Masa - ${balanceId}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: white;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
        }
        
        .header {
            text-align: center;
            border-bottom: 3px solid #5A7836;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            color: #5A7836;
        }
        
        .header .subtitle {
            font-size: 18px;
            color: #666;
            margin-bottom: 10px;
        }
        
        .report-id {
            background: #f5f5f5;
            padding: 8px 16px;
            border-radius: 5px;
            display: inline-block;
            font-size: 14px;
            font-family: monospace;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .info-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid #5A7836;
        }
        
        .info-card h3 {
            color: #5A7836;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .info-card p {
            font-size: 18px;
            font-weight: 500;
            color: #2c3e50;
        }
        
        .temperatures-section {
            margin-top: 30px;
        }
        
        .section-title {
            font-size: 20px;
            color: #5A7836;
            margin-bottom: 20px;
            font-weight: 600;
            border-bottom: 2px solid #5A7836;
            padding-bottom: 10px;
        }
        
        .temp-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .temp-item {
            background: #fff;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }
        
        .temp-item.reactor {
            border-color: #ff6b35;
        }
        
        .temp-item.horno {
            border-color: #f7931e;
        }
        
        .temp-item.ducto {
            border-color: #00a8cc;
        }
        
        .temp-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
            font-weight: 600;
        }
        
        .temp-value {
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        
        .footer {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 40px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏭 SIRIUS PIRÓLISIS</h1>
            <div class="subtitle">Informe de Balance de Masa</div>
            <div class="report-id">ID: ${balanceId}</div>
        </div>
        
        <div class="info-grid">
            <div class="info-card">
                <h3>👤 Registrado por</h3>
                <p>${balanceData['Realiza Registro'] || 'No especificado'}</p>
            </div>
            
            <div class="info-card">
                <h3>⚖️ Peso Biochar</h3>
                <p>${balanceData['Peso Biochar (KG)'] || 'N/A'} kg</p>
            </div>
        </div>
        
        <div class="temperatures-section">
            <h2 class="section-title">🔥 Temperaturas de Reactores</h2>
            <div class="temp-grid">
                <div class="temp-item reactor">
                    <div class="temp-label">Reactor R1</div>
                    <div class="temp-value">${balanceData['Temperatura Reactor (R1)'] || 'N/A'}°C</div>
                </div>
                <div class="temp-item reactor">
                    <div class="temp-label">Reactor R2</div>
                    <div class="temp-value">${balanceData['Temperatura Reactor (R2)'] || 'N/A'}°C</div>
                </div>
                <div class="temp-item reactor">
                    <div class="temp-label">Reactor R3</div>
                    <div class="temp-value">${balanceData['Temperatura Reactor (R3)'] || 'N/A'}°C</div>
                </div>
            </div>
        </div>
        
        <div class="temperatures-section">
            <h2 class="section-title">🔥 Temperaturas de Hornos</h2>
            <div class="temp-grid">
                <div class="temp-item horno">
                    <div class="temp-label">Horno H1</div>
                    <div class="temp-value">${balanceData['Temperatura Horno (H1)'] || 'N/A'}°C</div>
                </div>
                <div class="temp-item horno">
                    <div class="temp-label">Horno H2</div>
                    <div class="temp-value">${balanceData['Temperatura Horno (H2)'] || 'N/A'}°C</div>
                </div>
                <div class="temp-item horno">
                    <div class="temp-label">Horno H3</div>
                    <div class="temp-value">${balanceData['Temperatura Horno (H3)'] || 'N/A'}°C</div>
                </div>
                <div class="temp-item horno">
                    <div class="temp-label">Horno H4</div>
                    <div class="temp-value">${balanceData['Temperatura Horno (H4)'] || 'N/A'}°C</div>
                </div>
            </div>
        </div>
        
        <div class="temperatures-section">
            <h2 class="section-title">🌡️ Temperatura de Ducto</h2>
            <div class="temp-item ducto" style="max-width: 200px; margin: 0 auto;">
                <div class="temp-label">Ducto G9</div>
                <div class="temp-value">${balanceData['Temperatura Ducto (G9)'] || 'N/A'}°C</div>
            </div>
        </div>
        
        <div class="footer">
            <p><strong>Sirius Pirólisis</strong> - Sistema de Gestión de Procesos</p>
            <p>Documento generado el ${currentDate}</p>
        </div>
    </div>
</body>
</html>
  `;
}

export async function POST(request: NextRequest) {
  try {
    const { balanceId, balanceData } = await request.json();

    console.log('📄 Generando PDF para balance:', balanceId);

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de AWS no encontrada'
      }, { status: 500 });
    }

    // Generar HTML del informe
    const htmlContent = generateHTMLReport(balanceData, balanceId);

    // Por ahora, convertir HTML a "PDF" como HTML
    // En producción deberías usar puppeteer o similar
    const pdfBuffer = Buffer.from(htmlContent, 'utf-8');
    
    // Subir a S3
    const fileName = `informes/balance-${balanceId}.html`; // .html por ahora, .pdf en producción
    
    const uploadCommand = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: fileName,
      Body: pdfBuffer,
      ContentType: 'text/html', // 'application/pdf' en producción
    });

    await s3Client.send(uploadCommand);
    
    const pdfUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${fileName}`;
    
    console.log('✅ PDF generado y subido a S3:', pdfUrl);

    return NextResponse.json({
      success: true,
      pdfUrl: pdfUrl,
      message: 'PDF generado y subido exitosamente'
    });

  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 });
  }
}
