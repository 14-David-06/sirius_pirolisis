import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import {
  MATERIAS_PRIMAS_ORDENADAS,
  minimoPorLoteReferencia,
  LOTE_BLEND_REFERENCIA_KG,
  type MateriaPrimaDef,
} from '../../../../lib/bodega.constants';
import {
  fetchAllStockInsumos,
  findStockInRecords,
  getStockActual,
  type StockInsumoRecord,
} from '../../../../lib/stock-insumos';
import { fetchBachesConBiochar } from '../../../../lib/baches-biochar';
import type {
  BacheBiochar,
  BodegaData,
  CapacidadProduccion,
  MateriaPrima,
} from '../../../../types/bodega';
import type { EstadoStock } from '../../../../lib/inventario.format';

/**
 * GET /api/bodega/materias-primas
 *
 * Stock de las tres materias primas del Biochar Blend, con la capacidad de
 * producción que permiten.
 *
 * Dos fuentes de verdad, una por naturaleza de la materia prima:
 *   - Bioabono y Biológicos → Insumo + Stock Insumos (Sirius Insumos Core).
 *   - Biochar puro → suma de `Total Cantidad Actual Biochar Seco` de los baches
 *     de la base de Pirólisis. No existe como insumo del Core: se produce, no se
 *     compra, y su trazabilidad es el bache.
 *
 * Los fallos parciales NO tumban la respuesta: si el Core no responde, se
 * devuelve el biochar con una advertencia (y al revés). Una bodega a medias es
 * más útil que un error en pantalla.
 */

const AT = 'https://api.airtable.com/v0';

interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
}

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function estadoDeStock(stock: number, minimo: number): EstadoStock {
  if (stock <= 0) return 'agotado';
  if (minimo > 0 && stock <= minimo) return 'por_agotarse';
  return 'disponible';
}

/** Insumo del Core (nombre, código, stock mínimo) por record ID. */
async function fetchInsumoCore(insumoId: string): Promise<AirtableRecord | null> {
  const token = config.airtable.insumosCoreToken;
  const baseId = config.airtable.insumosCoreBaseId;
  const tableId = config.airtable.insumosTableId;

  if (!token || !baseId || !tableId) {
    throw new Error(
      'Configuración de Sirius Insumos Core incompleta: faltan AIRTABLE_GLOBAL_TOKEN, ' +
      'AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_INSUMOS_TABLE_ID'
    );
  }

  const response = await fetch(`${AT}/${baseId}/${tableId}/${insumoId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 404) return null;

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Error al leer insumo ${insumoId}: ${JSON.stringify(data)}`);
  }

  return data as AirtableRecord;
}

/** Record ID configurado para una materia prima del Core. */
function insumoIdDe(def: MateriaPrimaDef): string | undefined {
  if (def.key === 'bioabono') return config.airtable.blendAbono4gRecordId;
  if (def.key === 'biologicos') return config.airtable.blendBiologicosRecordId;
  return undefined;
}

/** Materia prima sin datos: se muestra en cero y con la advertencia del caso. */
function materiaVacia(def: MateriaPrimaDef): MateriaPrima {
  const stockMinimo = minimoPorLoteReferencia(def.pctBlend);
  return {
    key: def.key,
    nombre: def.nombre,
    nombreCore: def.nombreCore ?? null,
    codigo: '',
    insumoId: null,
    unidad: def.unidad,
    fuente: def.fuente,
    pctBlend: def.pctBlend,
    stock: 0,
    stockMinimo,
    estado: 'agotado',
    permiteEntradaManual: def.permiteEntradaManual,
    descripcion: def.descripcion,
    kgBlendPosibles: 0,
  };
}

export async function GET() {
  const advertencias: string[] = [];

  // Las dos fuentes se leen en paralelo y por separado: el fallo de una no
  // invalida a la otra (`allSettled`, no `all`).
  const [bachesResult, coreResult] = await Promise.allSettled([
    fetchBachesConBiochar(),
    fetchAllStockInsumos(),
  ]);

  const baches: BacheBiochar[] = bachesResult.status === 'fulfilled' ? bachesResult.value : [];
  if (bachesResult.status === 'rejected') {
    console.error('❌ Bodega: no se pudo leer el biochar de los baches:', bachesResult.reason);
    advertencias.push(
      'No se pudo leer el biochar disponible en baches. El stock de biochar se muestra en 0.'
    );
  }

  const stockRecords: StockInsumoRecord[] = coreResult.status === 'fulfilled' ? coreResult.value : [];
  if (coreResult.status === 'rejected') {
    console.error('❌ Bodega: no se pudo leer Stock Insumos del Core:', coreResult.reason);
    advertencias.push(
      'No se pudo leer Sirius Insumos Core. El stock de bioabono y biológicos se muestra en 0.'
    );
  }

  const biocharKg = baches.reduce((total, bache) => total + bache.kg, 0);

  const materiales: MateriaPrima[] = [];

  for (const def of MATERIAS_PRIMAS_ORDENADAS) {
    // ── Biochar: el stock son los baches ──────────────────────────────────────
    if (def.fuente === 'baches') {
      const stockMinimo = minimoPorLoteReferencia(def.pctBlend);
      materiales.push({
        ...materiaVacia(def),
        stock: biocharKg,
        stockMinimo,
        estado: estadoDeStock(biocharKg, stockMinimo),
      });
      continue;
    }

    // ── Bioabono y biológicos: insumos del Core ───────────────────────────────
    const insumoId = insumoIdDe(def);

    if (!insumoId) {
      advertencias.push(
        `${def.nombre}: falta el record ID del insumo en las variables de entorno; no se puede leer su stock.`
      );
      materiales.push(materiaVacia(def));
      continue;
    }

    let insumo: AirtableRecord | null = null;
    try {
      insumo = await fetchInsumoCore(insumoId);
    } catch (err) {
      console.error(`❌ Bodega: error leyendo el insumo ${def.nombre}:`, err);
      advertencias.push(`${def.nombre}: no se pudo leer el insumo en Sirius Insumos Core.`);
    }

    if (!insumo) {
      materiales.push({ ...materiaVacia(def), insumoId });
      continue;
    }

    const { record: stockRecord } = findStockInRecords(insumoId, stockRecords);
    if (!stockRecord && coreResult.status === 'fulfilled') {
      advertencias.push(
        `${def.nombre}: no tiene registro en Stock Insumos del Core, así que no se pueden registrar movimientos.`
      );
    }

    const stock = stockRecord ? getStockActual(stockRecord) : 0;

    // El umbral del Core manda si está definido; si no, lo que consume un lote
    // de referencia de Blend.
    const minimoCore = toNumber(insumo.fields?.['Stock Minimo']);
    const stockMinimo = minimoCore > 0 ? minimoCore : minimoPorLoteReferencia(def.pctBlend);

    materiales.push({
      key: def.key,
      nombre: def.nombre,
      nombreCore: typeof insumo.fields?.['Nombre'] === 'string'
        ? (insumo.fields['Nombre'] as string)
        : def.nombreCore ?? null,
      codigo: String(insumo.fields?.['Código SIRIUS-INS'] ?? ''),
      insumoId,
      unidad: def.unidad,
      fuente: def.fuente,
      pctBlend: def.pctBlend,
      stock,
      stockMinimo,
      estado: estadoDeStock(stock, stockMinimo),
      permiteEntradaManual: def.permiteEntradaManual,
      descripcion: def.descripcion,
      kgBlendPosibles: 0,
    });
  }

  // ── Capacidad de producción ────────────────────────────────────────────────
  // Cada materia prima alcanza para `stock / pctBlend` kg de Blend; la más
  // escasa es la que limita. Una proporción en 0 (materia prima desactivada en
  // la fórmula) no limita nada.
  let capacidad: CapacidadProduccion = {
    kgBlend: 0,
    limitante: null,
    loteReferenciaKg: LOTE_BLEND_REFERENCIA_KG,
  };

  for (const material of materiales) {
    // Proporción en 0: la materia prima no participa en la fórmula, así que no
    // limita la producción ni tiene un "alcanza para X kg" con sentido.
    if (material.pctBlend <= 0) continue;

    material.kgBlendPosibles = Math.floor(material.stock / material.pctBlend);

    if (capacidad.limitante === null || material.kgBlendPosibles < capacidad.kgBlend) {
      capacidad = {
        kgBlend: material.kgBlendPosibles,
        limitante: material.key,
        loteReferenciaKg: LOTE_BLEND_REFERENCIA_KG,
      };
    }
  }

  const payload: BodegaData = {
    materiales,
    capacidad,
    formula: {
      pctBiochar: config.blend.pctBiochar,
      pctAbono: config.blend.pctAbono,
      pctBiologicos: config.blend.pctBiologicos,
      pctAgua: config.blend.pctAgua,
    },
    baches,
    advertencias,
  };

  console.log(
    `🏬 Bodega: biochar=${biocharKg} kg (${baches.length} baches), ` +
    materiales
      .filter((m) => m.fuente === 'insumos_core')
      .map((m) => `${m.nombre}=${m.stock} ${m.unidad}`)
      .join(', ') +
    ` → capacidad ${capacidad.kgBlend} kg de Blend`
  );

  return NextResponse.json(payload, { status: 200 });
}
