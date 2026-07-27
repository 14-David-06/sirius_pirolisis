/**
 * Script para identificar insumos sin Stock y crear los registros faltantes
 * Uso: npx tsx scripts/fix-missing-stock.ts
 */

import 'dotenv/config';

const CORE_BASE_ID = process.env.AIRTABLE_INSUMOS_CORE_BASE_ID;
const TOKEN = process.env.AIRTABLE_GLOBAL_TOKEN;
const INSUMOS_TABLE_ID = process.env.AIRTABLE_INSUMOS_TABLE_ID;
const STOCK_TABLE_ID = process.env.AIRTABLE_STOCK_INSUMOS_TABLE_ID;
const STOCK_INSUMO_ID_FIELD = process.env.AIRTABLE_STOCK_INSUMO_ID_FIELD_ID;

interface InsumoRecord {
  id: string;
  fields: {
    'Nombre del Insumo'?: string;
    'ID Area Origen'?: string;
  };
}

interface StockRecord {
  id: string;
  fields: {
    'Insumo ID'?: string[];
  };
}

async function main() {
  if (!CORE_BASE_ID || !TOKEN || !INSUMOS_TABLE_ID || !STOCK_TABLE_ID || !STOCK_INSUMO_ID_FIELD) {
    console.error('❌ Faltan variables de entorno necesarias');
    process.exit(1);
  }

  console.log('🔍 Buscando insumos sin Stock...\n');

  // 1. Obtener todos los insumos
  const insumosUrl = `https://api.airtable.com/v0/${CORE_BASE_ID}/${INSUMOS_TABLE_ID}`;
  const insumosResponse = await fetch(insumosUrl, {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });
  const insumosData = await insumosResponse.json();
  const insumos: InsumoRecord[] = insumosData.records || [];

  console.log(`📦 Total insumos en Core: ${insumos.length}`);

  // 2. Obtener todos los stocks
  const stocksUrl = `https://api.airtable.com/v0/${CORE_BASE_ID}/${STOCK_TABLE_ID}`;
  const stocksResponse = await fetch(stocksUrl, {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });
  const stocksData = await stocksResponse.json();
  const stocks: StockRecord[] = stocksData.records || [];

  console.log(`📊 Total registros de Stock: ${stocks.length}\n`);

  // 3. Crear set de insumos que ya tienen stock
  const insumosConStock = new Set<string>();
  stocks.forEach(stock => {
    const insumoIds = stock.fields['Insumo ID'] || [];
    insumoIds.forEach(id => insumosConStock.add(id));
  });

  // 4. Identificar insumos sin stock
  const insumosSinStock = insumos.filter(insumo => !insumosConStock.has(insumo.id));

  if (insumosSinStock.length === 0) {
    console.log('✅ Todos los insumos tienen Stock configurado');
    return;
  }

  console.log(`⚠️  Insumos SIN Stock (${insumosSinStock.length}):\n`);
  insumosSinStock.forEach(insumo => {
    console.log(`  • ${insumo.fields['Nombre del Insumo'] || 'Sin nombre'}`);
    console.log(`    ID: ${insumo.id}`);
    console.log(`    Área: ${insumo.fields['ID Area Origen'] || 'Sin área'}\n`);
  });

  // 5. Preguntar si crear los stocks
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 ¿Deseas crear los registros de Stock faltantes?');
  console.log('   Esto creará un Stock inicial (sin movimientos) para cada insumo.');
  console.log('   Presiona Ctrl+C para cancelar, o Enter para continuar...');

  // Esperar confirmación del usuario
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  console.log('\n📝 Creando registros de Stock...\n');

  // 6. Crear stocks faltantes
  let creados = 0;
  let errores = 0;

  for (const insumo of insumosSinStock) {
    try {
      const stockFields: Record<string, any> = {
        [STOCK_INSUMO_ID_FIELD]: [insumo.id],
      };

      const createResponse = await fetch(
        `https://api.airtable.com/v0/${CORE_BASE_ID}/${STOCK_TABLE_ID}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            records: [{ fields: stockFields }]
          }),
        }
      );

      if (createResponse.ok) {
        console.log(`✅ Stock creado para: ${insumo.fields['Nombre del Insumo']}`);
        creados++;
      } else {
        const error = await createResponse.json();
        console.error(`❌ Error en: ${insumo.fields['Nombre del Insumo']}`);
        console.error(`   ${JSON.stringify(error)}`);
        errores++;
      }

      // Rate limiting: esperar 200ms entre requests
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (err) {
      console.error(`❌ Error creando Stock para ${insumo.fields['Nombre del Insumo']}:`, err);
      errores++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Registros de Stock creados: ${creados}`);
  if (errores > 0) {
    console.log(`❌ Errores: ${errores}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
