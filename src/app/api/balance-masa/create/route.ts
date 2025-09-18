import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// Interfaz para el tipo de datos del balance de masa
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
  qrLona?: string;
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
    
    console.log('📊 Datos recibidos para balance de masa:', data);

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

    // Preparar el cuerpo de la petición para Airtable
    const airtableData = {
      records: [
        {
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
            ...(data.realizaRegistro && { 'Realiza Registro': data.realizaRegistro }),
            ...(data.qrLona && { 'QR_lona': data.qrLona }),
            ...(data.turnoPirolisis && { 'Turno Pirolisis': data.turnoPirolisis })
          }
        }
      ]
    };

    console.log('📤 Enviando datos a Airtable:', JSON.stringify(airtableData, null, 2));

    // Crear el registro en Airtable
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${process.env.AIRTABLE_BALANCE_MASA_TABLE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(airtableData)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Error de Airtable:', response.status, errorData);
      return NextResponse.json({ 
        success: false, 
        error: `Error de Airtable: ${response.status} - ${errorData}` 
      }, { status: response.status });
    }

    const result = await response.json();
    console.log('✅ Balance de masa creado exitosamente:', result);

    // Extraer el ID del registro creado para el QR
    const balanceId = result.records[0].id;

    // Gestionar agrupación en baches
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

    return NextResponse.json({ 
      success: true, 
      data: result,
      balanceId: balanceId,
      message: 'Balance de masa registrado exitosamente'
    });

  } catch (error) {
    console.error('❌ Error en POST /api/balance-masa/create:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno del servidor' 
    }, { status: 500 });
  }
}
