import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_S3_BUCKET = 'siriuspirolisis';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = process.env.AIRTABLE_BALANCE_MASA_TABLE;

// Configurar cliente S3
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID!,
    secretAccessKey: AWS_SECRET_ACCESS_KEY!,
  },
});

interface BalanceData {
  id: string;
  fechaCreacion: string;
  pesoBiochar: number;
  temperaturas: {
    reactorR1: number;
    reactorR2: number;
    reactorR3: number;
    hornoH1?: number;
    hornoH2?: number;
    hornoH3?: number;
    hornoH4?: number;
    ductoG9?: number;
  };
  realizaRegistro?: string;
  turnoPirolisis?: string[];
}

// Función para generar HTML del informe
function generateHTMLReport(data: BalanceData): string {
  const fechaFormateada = new Date(data.fechaCreacion).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Informe Balance de Masa - ${data.id}</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #333;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                max-width: 800px;
                margin: 0 auto;
            }
            .header {
                text-align: center;
                border-bottom: 3px solid #5A7836;
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .company-name {
                font-size: 24px;
                font-weight: bold;
                color: #5A7836;
                margin-bottom: 5px;
            }
            .report-title {
                font-size: 20px;
                color: #333;
                margin-bottom: 10px;
            }
            .balance-id {
                font-size: 14px;
                color: #666;
                font-family: monospace;
                background: #f5f5f5;
                padding: 5px 10px;
                border-radius: 5px;
                display: inline-block;
            }
            .section {
                margin-bottom: 25px;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: #fafafa;
            }
            .section-title {
                font-size: 18px;
                font-weight: bold;
                color: #5A7836;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
            }
            .section-title .icon {
                margin-right: 10px;
                font-size: 20px;
            }
            .info-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
            }
            .info-item {
                background: white;
                padding: 15px;
                border-radius: 5px;
                border-left: 4px solid #5A7836;
            }
            .info-label {
                font-weight: bold;
                color: #333;
                margin-bottom: 5px;
            }
            .info-value {
                font-size: 18px;
                color: #5A7836;
            }
            .temp-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 10px;
            }
            .temp-item {
                background: white;
                padding: 12px;
                border-radius: 5px;
                text-align: center;
                border: 2px solid #e0e0e0;
            }
            .temp-item.reactor { border-color: #ff6b35; }
            .temp-item.horno { border-color: #f7931e; }
            .temp-item.ducto { border-color: #00a8cc; }
            .temp-label {
                font-size: 12px;
                font-weight: bold;
                color: #666;
                margin-bottom: 5px;
            }
            .temp-value {
                font-size: 16px;
                font-weight: bold;
                color: #333;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 2px solid #5A7836;
                color: #666;
                font-size: 12px;
            }
            .qr-notice {
                background: #e8f5e8;
                border: 1px solid #4caf50;
                padding: 15px;
                border-radius: 5px;
                text-align: center;
                color: #2e7d32;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="company-name">🏭 Sirius Pirólisis</div>
                <div class="report-title">Informe de Balance de Masa</div>
                <div class="balance-id">ID: ${data.id}</div>
            </div>

            <div class="section">
                <div class="section-title">
                    <span class="icon">📋</span>
                    Información General
                </div>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Fecha de Creación</div>
                        <div class="info-value">${fechaFormateada}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Peso Biochar</div>
                        <div class="info-value">${data.pesoBiochar} KG</div>
                    </div>
                    ${data.realizaRegistro ? `
                    <div class="info-item">
                        <div class="info-label">Registrado por</div>
                        <div class="info-value">${data.realizaRegistro}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="section">
                <div class="section-title">
                    <span class="icon">🔥</span>
                    Temperaturas de Reactores
                </div>
                <div class="temp-grid">
                    <div class="temp-item reactor">
                        <div class="temp-label">Reactor R1</div>
                        <div class="temp-value">${data.temperaturas.reactorR1}°C</div>
                    </div>
                    <div class="temp-item reactor">
                        <div class="temp-label">Reactor R2</div>
                        <div class="temp-value">${data.temperaturas.reactorR2}°C</div>
                    </div>
                    <div class="temp-item reactor">
                        <div class="temp-label">Reactor R3</div>
                        <div class="temp-value">${data.temperaturas.reactorR3}°C</div>
                    </div>
                </div>
            </div>

            ${data.temperaturas.hornoH1 || data.temperaturas.hornoH2 || data.temperaturas.hornoH3 || data.temperaturas.hornoH4 ? `
            <div class="section">
                <div class="section-title">
                    <span class="icon">🔥</span>
                    Temperaturas de Hornos
                </div>
                <div class="temp-grid">
                    ${data.temperaturas.hornoH1 ? `<div class="temp-item horno"><div class="temp-label">Horno H1</div><div class="temp-value">${data.temperaturas.hornoH1}°C</div></div>` : ''}
                    ${data.temperaturas.hornoH2 ? `<div class="temp-item horno"><div class="temp-label">Horno H2</div><div class="temp-value">${data.temperaturas.hornoH2}°C</div></div>` : ''}
                    ${data.temperaturas.hornoH3 ? `<div class="temp-item horno"><div class="temp-label">Horno H3</div><div class="temp-value">${data.temperaturas.hornoH3}°C</div></div>` : ''}
                    ${data.temperaturas.hornoH4 ? `<div class="temp-item horno"><div class="temp-label">Horno H4</div><div class="temp-value">${data.temperaturas.hornoH4}°C</div></div>` : ''}
                </div>
            </div>
            ` : ''}

            ${data.temperaturas.ductoG9 ? `
            <div class="section">
                <div class="section-title">
                    <span class="icon">🌡️</span>
                    Temperatura de Ducto
                </div>
                <div class="temp-item ducto" style="max-width: 200px; margin: 0 auto;">
                    <div class="temp-label">Ducto G9</div>
                    <div class="temp-value">${data.temperaturas.ductoG9}°C</div>
                </div>
            </div>
            ` : ''}

            <div class="qr-notice">
                ✅ Este documento fue generado automáticamente por el sistema de pirólisis
                <br>Documento válido y verificable
            </div>

            <div class="footer">
                <p><strong>Sirius Pirólisis</strong> - Sistema de Gestión de Procesos</p>
                <p>Documento generado el ${new Date().toLocaleString('es-CO')}</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: balanceId } = await params;
    console.log('📄 Generando PDF para balance:', balanceId);

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de Airtable no encontrada'
      }, { status: 500 });
    }

    // Obtener datos del balance desde Airtable
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}/${balanceId}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: 'Error al obtener datos del balance'
      }, { status: response.status });
    }

    const data = await response.json();
    
    if (!data.id) {
      return NextResponse.json({
        success: false,
        error: 'Balance no encontrado'
      }, { status: 404 });
    }

    // Formatear datos del balance
    const balanceData: BalanceData = {
      id: data.id,
      fechaCreacion: data.fields['Fecha de Creación'] || data.createdTime,
      pesoBiochar: data.fields['Peso Biochar (KG)'],
      temperaturas: {
        reactorR1: data.fields['Temperatura Reactor (R1)'],
        reactorR2: data.fields['Temperatura Reactor (R2)'],
        reactorR3: data.fields['Temperatura Reactor (R3)'],
        hornoH1: data.fields['Temperatura Horno (H1)'],
        hornoH2: data.fields['Temperatura Horno (H2)'],
        hornoH3: data.fields['Temperatura Horno (H3)'],
        hornoH4: data.fields['Temperatura Horno (H4)'],
        ductoG9: data.fields['Temperatura Ducto (G9)'],
      },
      realizaRegistro: data.fields['Realiza Registro'],
      turnoPirolisis: data.fields['Turno Pirolisis'],
    };

    // Generar HTML del informe
    const htmlContent = generateHTMLReport(balanceData);

    // Por ahora retornamos el HTML directamente con funcionalidad de descarga
    const htmlWithDownload = htmlContent.replace(
      '</body>',
      `
        <script>
          // Función para descargar como PDF (simulado con impresión)
          function downloadPDF() {
            window.print();
          }
          
          // Agregar botón de descarga
          document.addEventListener('DOMContentLoaded', function() {
            const container = document.querySelector('.container');
            const downloadBtn = document.createElement('div');
            downloadBtn.innerHTML = \`
              <div style="text-align: center; margin: 20px 0;">
                <button onclick="downloadPDF()" style="
                  background: #5A7836; 
                  color: white; 
                  border: none; 
                  padding: 12px 24px; 
                  border-radius: 5px; 
                  font-size: 16px; 
                  cursor: pointer;
                  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                ">
                  📄 Descargar PDF
                </button>
                <p style="color: #666; font-size: 12px; margin-top: 10px;">
                  Use Ctrl+P o el botón de descarga para guardar como PDF
                </p>
              </div>
            \`;
            container.appendChild(downloadBtn);
          });
        </script>
        <style>
          @media print {
            .download-section { display: none; }
            body { background: white !important; }
            .container { box-shadow: none; }
          }
        </style>
      </body>`
    );

    return new Response(htmlWithDownload, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="balance-${balanceId}.html"`,
      },
    });

  } catch (error) {
    console.error('❌ Error generando informe:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 });
  }
}
