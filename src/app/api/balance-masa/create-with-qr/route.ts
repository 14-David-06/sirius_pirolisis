import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

interface BalanceMasaData {
  pesoBiochar: number;
  temperaturaR1: number;
  temperaturaR2: number;
  temperaturaR3: number;
  temperaturaH1: number;
  temperaturaH2: number;
  temperaturaH3: number;
  temperaturaH4: number;
  temperaturaG9: number;
  realizaRegistro?: string;
  turnoPirolisis?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const data: BalanceMasaData = await request.json();

    console.log('📊 Creando balance completo con QR:', data);      

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de Airtable faltante'
      }, { status: 500 });
    }

    // Validar datos requeridos
    if (!data.pesoBiochar || !data.temperaturaR1 || !data.temperaturaR2 || !data.temperaturaR3) {
      return NextResponse.json({
        success: false,
        error: 'Faltan datos requeridos para crear el balance de masa'
      }, { status: 400 });
    }

    // 1. Crear el balance en Airtable primero
    const airtablePayload = {
      fields: {
        'Peso Biochar (KG)': data.pesoBiochar,
        'Temperatura Reactor (R1)': data.temperaturaR1,
        'Temperatura Reactor (R2)': data.temperaturaR2,
        'Temperatura Reactor (R3)': data.temperaturaR3,
        'Temperatura Horno (H1)': data.temperaturaH1,
        'Temperatura Horno (H2)': data.temperaturaH2,
        'Temperatura Horno (H3)': data.temperaturaH3,
        'Temperatura Horno (H4)': data.temperaturaH4,
        'Temperatura Ducto (G9)': data.temperaturaG9,
        'Realiza Registro': data.realizaRegistro,
        'Turno Pirolisis': data.turnoPirolisis || []
      }
    };

    console.log('📤 Enviando a Airtable...');

    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${process.env.AIRTABLE_BALANCE_MASA_TABLE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(airtablePayload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Error creando balance en Airtable:', errorData);
      return NextResponse.json({
        success: false,
        error: 'Error al crear el balance en Airtable'
      }, { status: response.status });
    }

    const balanceResult = await response.json();
    const balanceId = balanceResult.id;

    console.log('✅ Balance creado con ID:', balanceId);

    // 2. Generar PDF del informe y subirlo a S3
    console.log('📄 Generando PDF del informe...');
    
    const pdfResponse = await fetch(`http://localhost:3000/api/generate-pdf-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        balanceId: balanceId,
        balanceData: balanceResult.fields
      }),
    });

    if (!pdfResponse.ok) {
      console.error('❌ Error generando PDF');
      
      return NextResponse.json({
        success: true,
        balanceId: balanceId,
        pdfGenerated: false,
        message: 'Balance creado pero error generando PDF'
      });
    }

    const pdfResult = await pdfResponse.json();

    if (!pdfResult.success) {
      console.error('❌ Error en resultado PDF:', pdfResult.error);    

      return NextResponse.json({
        success: true,
        balanceId: balanceId,
        pdfGenerated: false,
        message: 'Balance creado pero error generando PDF'
      });
    }

    console.log('✅ PDF generado y subido a S3:', pdfResult.pdfUrl);

    // 3. Generar QR con la URL del PDF
    console.log('📱 Generando QR con URL del PDF...');       

    const qrResponse = await fetch(`http://localhost:3000/api/generate-qr`, {   
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        balanceId: balanceId,
        url: pdfResult.pdfUrl  // ← URL del PDF, no de la página web
      }),
    });

    if (!qrResponse.ok) {
      console.error('❌ Error generando QR');
      
      // Aún así retornamos el balance creado exitosamente
      return NextResponse.json({
        success: true,
        balanceId: balanceId,
        qrGenerated: false,
        message: 'Balance creado pero error generando QR'
      });
    }

    const qrResult = await qrResponse.json();

    if (!qrResult.success) {
      console.error('❌ Error en resultado QR:', qrResult.error);    

      return NextResponse.json({
        success: true,
        balanceId: balanceId,
        qrGenerated: false,
        message: 'Balance creado pero error generando QR'
      });
    }

    console.log('✅ QR generado:', qrResult.qrUrl);

    // 3. Actualizar el registro con la URL del QR
    const updatePayload = {
      fields: {
        'QR_lona': [{
          url: qrResult.qrUrl,
          filename: `qr-balance-${balanceId}.png`
        }]
      }
    };

    const updateResponse = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${process.env.AIRTABLE_BALANCE_MASA_TABLE}/${balanceId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!updateResponse.ok) {
      console.error('❌ Error actualizando QR en Airtable');
      
      return NextResponse.json({
        success: true,
        balanceId: balanceId,
        qrUrl: qrResult.qrUrl,
        qrUpdated: false,
        message: 'Balance y QR creados pero no se pudo actualizar el registro'
      });
    }

    console.log('✅ QR actualizado en registro');

    return NextResponse.json({
      success: true,
      balanceId: balanceId,
      qrUrl: qrResult.qrUrl,
      pdfUrl: pdfResult.pdfUrl,
      message: 'Balance creado exitosamente con PDF y QR generados'
    });

  } catch (error) {
    console.error('❌ Error en POST /api/balance-masa/create-with-qr:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 });
  }
}