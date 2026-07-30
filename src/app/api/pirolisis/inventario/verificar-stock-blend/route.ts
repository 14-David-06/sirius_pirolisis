import { NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';
import {
  fetchAllStockInsumos,
  findStockInRecords,
  getStockActual,
} from '../../../../../lib/stock-insumos';
import { getBiocharDisponibleKg } from '../../../../../lib/baches-biochar';

/**
 * GET /api/pirolisis/inventario/verificar-stock-blend?kgTotal=1000
 *
 * Verifica si hay materia prima suficiente para producir una cantidad dada de
 * Biochar Blend. Cubre las TRES materias primas de la fórmula:
 *
 *   - Biochar puro  → suma de `Total Cantidad Actual Biochar Seco` de los baches
 *   - Bioabono      → Stock Insumos del Core (Abono 4G)
 *   - Biológicos    → Stock Insumos del Core
 *
 * El agua no se verifica: no se inventaría (se registra en el turno).
 *
 * BIOCHAR AÑADIDO (2026-07-29): antes solo se verificaban abono y biológicos, así
 * que un pedido pasaba la verificación y después `runBlendDeduction` lo rechazaba
 * al no encontrar biochar en los baches. La verificación aquí es GLOBAL (todos los
 * baches); el reparto sobre los baches concretos que elige el operador lo sigue
 * validando `validateBacheAllocations`.
 *
 * Query params (se acepta cualquiera de los dos nombres):
 * - kgTotal / kg_total: KG totales de Blend a producir (requerido)
 *
 * Respuesta:
 * {
 *   suficiente, kgTotal,
 *   requerido:  { biochar, abono, biologicos },
 *   disponible: { biochar, abono, biologicos },
 *   faltante:   { biochar, abono, biologicos }
 * }
 */
export async function GET(request: Request) {
  // Validar configuración
  if (!config.airtable.insumosCoreBaseId || !config.airtable.stockInsumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      error: 'Configuración de Sirius Insumos Core incompleta',
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;

    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
      }, { status: 500 });
    }

    // Se aceptan ambos nombres: los callers internos usaban `kg_total` y este
    // endpoint solo leía `kgTotal`, lo que rompía iniciar-produccion y aprobar
    // con un 400 silencioso. Tolerar los dos evita repetir esa clase de fallo.
    const { searchParams } = new URL(request.url);
    const kgTotalStr = searchParams.get('kgTotal') ?? searchParams.get('kg_total');

    if (!kgTotalStr) {
      return NextResponse.json({
        error: 'Parámetro requerido faltante',
        details: 'Se requiere kgTotal (KG totales de Blend a producir)',
      }, { status: 400 });
    }

    const kgTotal = parseFloat(kgTotalStr);
    if (isNaN(kgTotal) || kgTotal <= 0) {
      return NextResponse.json({
        error: 'kgTotal inválido',
        details: 'kgTotal debe ser un número positivo',
      }, { status: 400 });
    }

    // Proporciones del Blend (las mismas que aplica runBlendDeduction)
    const { pctBiochar, pctAbono, pctBiologicos } = config.blend;
    const kgBiochar = kgTotal * pctBiochar;
    const kgAbono = kgTotal * pctAbono;
    const kgBiologicos = kgTotal * pctBiologicos;

    console.log(
      `🔍 Verificando stock para ${kgTotal} kg de Blend: ` +
      `biochar=${kgBiochar.toFixed(2)} kg, abono=${kgAbono.toFixed(2)} kg, biologicos=${kgBiologicos.toFixed(2)} L`
    );

    // Las dos fuentes en paralelo: baches (base local) e insumos (Core).
    // NOTA: Campo {Area} no existe en Stock Insumos
    // NOTA 2: Insumo ID es multipleRecordLinks; el match se hace en JS sobre los
    //         record IDs. Ver src/lib/stock-insumos.ts
    const [stockBiochar, stockRecords] = await Promise.all([
      getBiocharDisponibleKg(),
      fetchAllStockInsumos(),
    ]);

    const stockDe = (insumoRecordId: string) => {
      const { record } = findStockInRecords(insumoRecordId, stockRecords);
      return record ? getStockActual(record) : 0;
    };

    const stockAbono = stockDe(config.airtable.blendAbono4gRecordId!);
    const stockBiologicos = stockDe(config.airtable.blendBiologicosRecordId!);

    console.log(
      `📦 Stock disponible: biochar=${stockBiochar} kg, abono=${stockAbono} kg, biologicos=${stockBiologicos} L`
    );

    const suficienteBiochar = stockBiochar >= kgBiochar;
    const suficienteAbono = stockAbono >= kgAbono;
    const suficienteBiologicos = stockBiologicos >= kgBiologicos;
    const suficiente = suficienteBiochar && suficienteAbono && suficienteBiologicos;

    const resultado = {
      suficiente,
      kgTotal,
      requerido: {
        biochar: Number(kgBiochar.toFixed(2)),
        abono: Number(kgAbono.toFixed(2)),
        biologicos: Number(kgBiologicos.toFixed(2)),
      },
      disponible: {
        biochar: stockBiochar,
        abono: stockAbono,
        biologicos: stockBiologicos,
      },
      faltante: {
        biochar: suficienteBiochar ? 0 : Number((kgBiochar - stockBiochar).toFixed(2)),
        abono: suficienteAbono ? 0 : Number((kgAbono - stockAbono).toFixed(2)),
        biologicos: suficienteBiologicos ? 0 : Number((kgBiologicos - stockBiologicos).toFixed(2)),
      },
    };

    if (!suficiente) {
      console.warn('⚠️ Materia prima insuficiente:', resultado.faltante);
    } else {
      console.log('✅ Materia prima suficiente para la producción');
    }

    return NextResponse.json(resultado, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en verificar-stock-blend:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
