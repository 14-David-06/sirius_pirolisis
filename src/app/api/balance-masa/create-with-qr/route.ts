import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUrl } from '@/lib/url-resolver';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BALANCE_MASA_TABLE = process.env.AIRTABLE_BALANCE_MASA_TABLE;

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

    // ✅ VALIDACIÓN MEJORADA DE VARIABLES DE ENTORNO
    const missingVars = [];
    if (!AIRTABLE_TOKEN) missingVars.push('AIRTABLE_TOKEN');
    if (!AIRTABLE_BASE_ID) missingVars.push('AIRTABLE_BASE_ID');
    if (!AIRTABLE_BALANCE_MASA_TABLE) missingVars.push('AIRTABLE_BALANCE_MASA_TABLE');

    if (missingVars.length > 0) {
      console.error('❌ Variables de entorno faltantes:', missingVars);
      
      return NextResponse.json({
        success: false,
        error: 'Configuración de Airtable incompleta',
        missingVariables: missingVars,
        details: {
          hasToken: !!AIRTABLE_TOKEN,
          hasBaseId: !!AIRTABLE_BASE_ID,
          hasBalanceTable: !!AIRTABLE_BALANCE_MASA_TABLE,
          balanceTable: AIRTABLE_BALANCE_MASA_TABLE || 'NO_CONFIGURADO'
        }
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

    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_BALANCE_MASA_TABLE}`, {
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

    // 1.5. Gestionar agrupación en baches (no crítico - no fallar si hay error)
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
      console.error('❌ Error en gestión de baches (no crítico):', bacheError);
      // Continuar con la generación de PDF/QR aunque falle la gestión de baches
    }

    // ✅ MANEJO MEJORADO DE PDF Y QR - Continuar aunque fallen
    let pdfGenerationResult: { success: boolean; pdfUrl?: string; error?: string } = { success: false };
    let qrGenerationResult: { success: boolean; qrUrl?: string; error?: string } = { success: false };
    
    // Verificar si AWS está configurado antes de intentar
    const hasAwsConfig = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
    
    if (!hasAwsConfig) {
      console.warn('⚠️ AWS no configurado - saltando generación de PDF y QR');
      
      return NextResponse.json({
        success: true,
        balanceId: balanceId,
        pdfGenerated: false,
        qrGenerated: false,
        message: 'Balance creado exitosamente (PDF/QR omitidos por falta de configuración AWS)',
        warnings: ['AWS_ACCESS_KEY_ID o AWS_SECRET_ACCESS_KEY no configurados']
      });
    }

    // 2. Generar PDF del informe y subirlo a S3
    console.log('📄 Generando PDF del informe...');
    
    try {
      // Usar el URL resolver para generar la URL correcta
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

      if (pdfResponse.ok) {
        const pdfResult = await pdfResponse.json();
        if (pdfResult.success) {
          pdfGenerationResult = { success: true, pdfUrl: pdfResult.pdfUrl };
          console.log('✅ PDF generado y subido a S3:', pdfResult.pdfUrl);
        } else {
          pdfGenerationResult = { success: false, error: pdfResult.error };
          console.error('❌ Error en resultado PDF:', pdfResult.error);
        }
      } else {
        pdfGenerationResult = { success: false, error: `HTTP ${pdfResponse.status}` };
        console.error('❌ Error HTTP generando PDF:', pdfResponse.status);
      }
    } catch (pdfError) {
      pdfGenerationResult = { success: false, error: pdfError instanceof Error ? pdfError.message : 'Error desconocido' };
      console.error('❌ Error en catch PDF:', pdfError);
    }

    // 3. Generar QR con la URL del PDF (solo si el PDF se generó exitosamente)
    if (pdfGenerationResult.success && pdfGenerationResult.pdfUrl) {
      console.log('📱 Generando QR con URL del PDF...');       

      try {
        const qrApiUrl = resolveApiUrl('/api/generate-qr');
        const qrResponse = await fetch(qrApiUrl, {   
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            balanceId: balanceId,
            url: pdfGenerationResult.pdfUrl  // URL del PDF
          }),
        });

        if (qrResponse.ok) {
          const qrResult = await qrResponse.json();
          if (qrResult.success) {
            qrGenerationResult = { success: true, qrUrl: qrResult.qrUrl };
            console.log('✅ QR generado:', qrResult.qrUrl);

            // 4. Actualizar el registro con la URL del QR
            try {
              const updatePayload = {
                fields: {
                  'QR_lona': [{
                    url: qrResult.qrUrl,
                    filename: `qr-balance-${balanceId}.png`
                  }]
                }
              };

              const updateResponse = await fetch(
                `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_BALANCE_MASA_TABLE}/${balanceId}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(updatePayload),
                }
              );

              if (updateResponse.ok) {
                console.log('✅ QR actualizado en registro');
              } else {
                console.error('❌ Error actualizando QR en Airtable (no crítico)');
              }
            } catch (updateError) {
              console.error('❌ Error en catch actualización QR (no crítico):', updateError);
            }
          } else {
            qrGenerationResult = { success: false, error: qrResult.error };
            console.error('❌ Error en resultado QR:', qrResult.error);
          }
        } else {
          qrGenerationResult = { success: false, error: `HTTP ${qrResponse.status}` };
          console.error('❌ Error HTTP generando QR:', qrResponse.status);
        }
      } catch (qrError) {
        qrGenerationResult = { success: false, error: qrError instanceof Error ? qrError.message : 'Error desconocido' };
        console.error('❌ Error en catch QR:', qrError);
      }
    } else {
      console.warn('⚠️ Saltando generación de QR porque el PDF falló');
    }

    // Respuesta final con información completa
    const responseData: any = {
      success: true,
      balanceId: balanceId,
      pdfGenerated: pdfGenerationResult.success,
      qrGenerated: qrGenerationResult.success,
      message: 'Balance creado exitosamente'
    };

    if (pdfGenerationResult.success) {
      responseData.pdfUrl = pdfGenerationResult.pdfUrl;
    }

    if (qrGenerationResult.success) {
      responseData.qrUrl = qrGenerationResult.qrUrl;
    }

    const warnings = [];
    if (!pdfGenerationResult.success) {
      warnings.push(`PDF no generado: ${pdfGenerationResult.error}`);
    }
    if (!qrGenerationResult.success) {
      warnings.push(`QR no generado: ${qrGenerationResult.error}`);
    }

    if (warnings.length > 0) {
      responseData.warnings = warnings;
      responseData.message += ' (con advertencias)';
    }

    return NextResponse.json(responseData);

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
      hasBalanceTable: !!AIRTABLE_BALANCE_MASA_TABLE,
      balanceTable: AIRTABLE_BALANCE_MASA_TABLE,
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
      if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_BALANCE_MASA_TABLE) {
        return {
          ...baseError,
          error: 'Error de configuración',
          details: 'Variables de entorno faltantes para Airtable'
        };
      }

      // Si es un error de tabla faltante (redundante pero por claridad)
      if (!AIRTABLE_BALANCE_MASA_TABLE) {
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