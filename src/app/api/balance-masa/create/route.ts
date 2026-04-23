import { NextRequest, NextResponse } from 'next/server';

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
    
    const warnings: Record<string, boolean> = {};
    
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

          // Auto-deducción de Big Bag al completar bache (nunca bloquea)
          const bigBagInsumoId = process.env.AIRTABLE_BIG_BAG_INSUMO_ID;
          if (bigBagInsumoId) {
            try {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
              const deductRes = await fetch(`${baseUrl}/api/inventario/remove-quantity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  itemId: bigBagInsumoId,
                  cantidad: 1,
                  tipo_uso: 'balance_de_masa',
                  balance_masa_id: balanceId,
                  observaciones: `Auto-deducción por bache completo: ${lastBache.id}`
                }),
              });
              if (!deductRes.ok) {
                warnings.big_bag_sin_stock = true;
                const errData = await deductRes.json().catch(() => ({}));
                console.warn('⚠️ Big Bag auto-deducción falló (no crítico):', errData);
              } else {
                console.log('✅ Big Bag auto-deducido por bache completo');
              }
            } catch (deductError) {
              warnings.big_bag_sin_stock = true;
              console.warn('⚠️ Big Bag auto-deducción error (no crítico):', deductError);
            }
          }
          
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

    // --- Vincular paquete de lonas activo al balance ---
    const PAQUETES_TABLE_ID = process.env.AIRTABLE_PAQUETES_LONAS_TABLE_ID;
    const PAQUETE_ACTIVO_FIELD = process.env.AIRTABLE_FIELD_PAQUETE_LONAS_ACTIVO;

    if (PAQUETES_TABLE_ID && PAQUETE_ACTIVO_FIELD && balanceId) {
      try {
        // Buscar paquete activo
        const paqUrl = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PAQUETES_TABLE_ID}`);
        paqUrl.searchParams.set('filterByFormula', `{Estado} = 'activo'`);
        paqUrl.searchParams.set('maxRecords', '1');

        const paqRes = await fetch(paqUrl.toString(), {
          headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` },
        });
        const paqData = await paqRes.json();
        const paqueteActivo = paqData.records?.[0];

        if (paqueteActivo) {
          // Vincular paquete al balance via Paquete Lonas Activo field
          const linkRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_BALANCE_MASA_TABLE}/${balanceId}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: {
                  [PAQUETE_ACTIVO_FIELD]: [paqueteActivo.id],
                },
              }),
            }
          );
          if (linkRes.ok) {
            console.log(`✅ Paquete de lonas ${paqueteActivo.id} vinculado al balance ${balanceId}`);
          } else {
            console.warn('⚠️ Error vinculando paquete de lonas:', await linkRes.text());
          }
        } else {
          warnings.lonas_sin_paquete_activo = true;
          console.warn('⚠️ No hay paquete de lonas activo para vincular al balance');
        }
      } catch (lonaErr) {
        console.warn('⚠️ Error en vinculación de paquete de lonas (no crítico):', lonaErr);
      }
    }

    // ✅ Balance creado exitosamente en la base de datos
    console.log('✅ Balance de masa registrado exitosamente:', balanceId);

    // Respuesta final
    const responsePayload: Record<string, unknown> = {
      success: true,
      balanceId: balanceId,
      message: 'Balance creado exitosamente',
    };

    if (Object.keys(warnings).length > 0) {
      responsePayload.warnings = warnings;
    }

    return NextResponse.json(responsePayload);



  } catch (error) {
    console.error('❌ Error en POST /api/balance-masa/create:', error);
    
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