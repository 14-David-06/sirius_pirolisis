import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

/**
 * POST /api/inventario/create
 *
 * Crea un nuevo insumo en Sirius Insumos Core y su registro de stock inicial.
 *
 * MIGRADO (2026-07-27): Antes creaba en Inventario Insumos Pirolisis (local).
 * Ahora crea en Insumo + Stock Insumos del Core.
 *
 * Body esperado:
 * - Nombre del Insumo (string, requerido)
 * - Categoría (string, requerido)
 * - Presentación (string, opcional)
 * - Cantidad Presentacion Insumo (number, opcional)
 * - Realiza Registro (string, opcional)
 * - Ficha Seguridad URL (string, opcional - solo para químicos)
 */
export async function POST(request: Request) {
  // Validar configuración
  if (!config.airtable.insumosCoreBaseId || !config.airtable.insumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      error: 'Configuración de Sirius Insumos Core incompleta',
      details: 'Faltan AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_INSUMOS_TABLE_ID'
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;
    const coreBaseId = config.airtable.insumosCoreBaseId;
    const insumosTableId = config.airtable.insumosTableId;
    const stockInsumosTableId = config.airtable.stockInsumosTableId;
    const pirolisisAreaCode = config.airtable.pirolisisAreaCode;
    const insumoFields = config.airtable.insumoFields;
    const stockFields = config.airtable.stockFields;

    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
        details: 'Falta AIRTABLE_GLOBAL_TOKEN'
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('📥 Datos recibidos en API create:', body);

    const {
      'Nombre del Insumo': nombreInsumo,
      'Categoría': categoria,
      'Presentación': presentacion,
      'Cantidad Presentacion Insumo': cantidadPresentacion,
      'Realiza Registro': realizaRegistro,
      'Ficha Seguridad URL': fichaSeguridadUrl,
    } = body;

    // Validar campos requeridos
    if (!nombreInsumo || !categoria) {
      return NextResponse.json({
        error: 'Campos requeridos faltantes',
        details: 'Se requieren: Nombre del Insumo y Categoría'
      }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Crear el insumo en Sirius Insumos Core
    // ═══════════════════════════════════════════════════════════════════════════
    const fields: Record<string, any> = {};

    // Nombre del insumo
    if (insumoFields.nombre) {
      fields[insumoFields.nombre] = nombreInsumo;
    }

    // Área de origen (Pirólisis)
    if (insumoFields.idAreaOrigen) {
      fields[insumoFields.idAreaOrigen] = pirolisisAreaCode;
    }

    // Responsable/Creador del insumo
    if (insumoFields.idResponsableCore && realizaRegistro) {
      fields[insumoFields.idResponsableCore] = realizaRegistro;
    }

    // Stock mínimo (0 por defecto)
    if (insumoFields.stockMinimo) {
      fields[insumoFields.stockMinimo] = 0;
    }

    // Categoría: buscar record ID en Categoria Insumo por nombre
    // TODO: Implementar búsqueda de categoría
    // Por ahora dejamos el campo vacío y se debe asignar manualmente en Airtable
    // if (insumoFields.categoria) {
    //   // Buscar categoría por nombre
    //   fields[insumoFields.categoria] = [categoriaRecordId];
    // }

    // Presentación/Unidad: buscar record ID en Unidades de Medida
    // TODO: Implementar búsqueda de unidad
    // Por ahora dejamos el campo vacío
    // if (insumoFields.unidadBase && presentacion) {
    //   fields[insumoFields.unidadBase] = [unidadRecordId];
    // }

    // Ficha de seguridad (solo URL como texto, no attachment)
    if (fichaSeguridadUrl && insumoFields.fichaTecnica) {
      fields[insumoFields.fichaTecnica] = `Ficha de seguridad: ${fichaSeguridadUrl}`;
    }

    console.log('📤 Creando insumo en Core con campos:', fields);

    const createInsumoResponse = await fetch(
      `https://api.airtable.com/v0/${coreBaseId}/${insumosTableId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{
            fields
          }]
        }),
      }
    );

    const insumoData = await createInsumoResponse.json();

    if (!createInsumoResponse.ok) {
      console.error('❌ Error al crear insumo en Core:', insumoData);
      return NextResponse.json({
        error: insumoData?.error || 'Error al crear insumo',
        details: insumoData
      }, { status: createInsumoResponse.status });
    }

    const nuevoInsumoId = insumoData.records[0].id;
    console.log(`✅ Insumo creado en Core: ${nuevoInsumoId}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Crear registro de Stock Insumos con stock inicial = 0
    // ═══════════════════════════════════════════════════════════════════════════
    const newStockFields: Record<string, any> = {};

    // Link al insumo recién creado
    if (stockFields.insumoId) {
      newStockFields[stockFields.insumoId] = [nuevoInsumoId];
    }

    // NOTA: NO se llena campo "Area" porque no existe en Stock Insumos.
    // El área viene del Insumo vinculado (campo ID Area Origen).

    // stock_actual NO se escribe (es fórmula que se calcula sola)

    console.log('📤 Creando Stock Insumos con campos:', newStockFields);

    const createStockResponse = await fetch(
      `https://api.airtable.com/v0/${coreBaseId}/${stockInsumosTableId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{
            fields: newStockFields
          }]
        }),
      }
    );

    const stockData = await createStockResponse.json();

    if (!createStockResponse.ok) {
      console.warn('⚠️ Error al crear Stock Insumos (insumo creado pero sin stock):', stockData);
      // No falla el endpoint, pero advertimos
      return NextResponse.json({
        ...insumoData,
        warning: 'Insumo creado pero faltó crear su registro de stock',
        stockError: stockData
      }, { status: 201 });
    }

    console.log(`✅ Stock Insumos creado: ${stockData.records[0].id}`);

    return NextResponse.json({
      ...insumoData,
      stock: stockData.records[0]
    }, { status: 201 });

  } catch (err: any) {
    console.error('❌ Error en API create inventario:', err);
    return NextResponse.json({
      error: String(err.message || err)
    }, { status: 500 });
  }
}
