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

// Funciones auxiliares para gestión de baches
async function findLastBache() {
  const response = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Baches%20Pirolisis?sort[0][field]=Fecha%20Creacion&sort[0][direction]=desc&maxRecords=1`,
    {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Error al consultar el último bache');
  }

  const data = await response.json();
  return data.records?.[0] || null;
}

async function updateBache(bacheId: string, updates: any) {
  const response = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Baches%20Pirolisis/${bacheId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: updates }),
    }
  );

  if (!response.ok) {
    throw new Error('Error al actualizar bache');
  }

  return await response.json();
}

async function createNewBache(balanceId: string) {
  const response = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Baches%20Pirolisis`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: {
            'Estado Bache': 'Bache en proceso',
            'Balances Masa': [balanceId]
          }
        }]
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Error al crear nuevo bache');
  }

  const data = await response.json();
  return data.records?.[0] || null;
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

    // 1.5. Gestionar agrupación en baches
    console.log('📦 Gestionando agrupación en baches...');
    
    try {
      const lastBache = await findLastBache();
      
      if (lastBache) {
        const currentCount = lastBache.fields['Recuento Lonas'] || 0;
        const estadoBache = lastBache.fields['Estado Bache'];
        console.log(`📊 Último bache encontrado: ${lastBache.id}, estado: ${estadoBache}, lonas actuales: ${currentCount}`);
        
        if (estadoBache === 'Bache en proceso' && currentCount < 20) {
          // Agregar balance al bache existente
          const existingBalances = lastBache.fields['Balances Masa'] || [];
          await updateBache(lastBache.id, {
            'Balances Masa': [...existingBalances, balanceId]
          });
          console.log(`✅ Balance agregado al bache existente: ${lastBache.id}`);
        } else if (estadoBache === 'Bache en proceso' && currentCount >= 20) {
          // Marcar bache como completo y crear nuevo
          await updateBache(lastBache.id, {
            'Estado Bache': 'Bache Completo Planta'
          });
          console.log(`✅ Bache completado: ${lastBache.id}`);
          
          const newBache = await createNewBache(balanceId);
          console.log(`✅ Nuevo bache creado: ${newBache?.id}`);
        } else {
          // Bache completo o estado diferente, crear uno nuevo
          const newBache = await createNewBache(balanceId);
          console.log(`✅ Nuevo bache creado: ${newBache?.id}`);
        }
      } else {
        // No hay baches, crear uno nuevo
        const newBache = await createNewBache(balanceId);
        console.log(`✅ Primer bache creado: ${newBache?.id}`);
      }
    } catch (bacheError) {
      console.error('❌ Error en gestión de baches:', bacheError);
      // No fallar la creación del balance por error en baches
    }

    // 2. Generar PDF del informe y subirlo a S3
    console.log('📄 Generando PDF del informe...');
    
    // Usar el URL resolver para generar la URL correcta
    const { resolveApiUrl } = await import('@/lib/url-resolver');
    const pdfApiUrl = resolveApiUrl('/api/generate-pdf-report');
    const pdfResponse = await fetch(pdfApiUrl, {
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

    const qrApiUrl = resolveApiUrl('/api/generate-qr');
    const qrResponse = await fetch(qrApiUrl, {   
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
    
    // Logging detallado para diagnóstico
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      hasAirtableConfig: !!(AIRTABLE_TOKEN && AIRTABLE_BASE_ID),
      hasBalanceTable: !!process.env.AIRTABLE_BALANCE_MASA_TABLE,
      balanceTable: process.env.AIRTABLE_BALANCE_MASA_TABLE,
      hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      appUrl: process.env.NEXT_PUBLIC_APP_URL
    });

    // Determinar tipo de error y respuesta más detallada
    const getErrorResponse = () => {
      const baseError = {
        success: false,
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido',
        timestamp: new Date().toISOString()
      };

      // Si es un error de configuración
      if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
        return {
          ...baseError,
          error: 'Error de configuración',
          details: 'Variables de entorno faltantes para Airtable'
        };
      }

      // Si es un error de tabla faltante
      if (!process.env.AIRTABLE_BALANCE_MASA_TABLE) {
        return {
          ...baseError,
          error: 'Error de configuración',
          details: 'Variable AIRTABLE_BALANCE_MASA_TABLE no configurada'
        };
      }

      return baseError;
    };

    const errorResponse = getErrorResponse();
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}