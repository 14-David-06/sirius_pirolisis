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
import {
  fetchBachesBiocharCore,
  fetchBachesConBiochar,
  type BacheBiocharCore,
} from '../../../../lib/baches-biochar';
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
 * ⚠️ MIGRACIÓN 2026-07-30: UNA sola fuente de verdad, Sirius Insumos Core. Las
 * tres materias primas son insumos del Core (`Abono 4G`, `Biochar Puro`,
 * `Biológicos DataLab`) y su saldo es `stock_actual` de `Stock Insumos`. Antes el
 * biochar era la excepción y salía de la tabla de baches de PiroliApp, lo que
 * ponía dos fuentes del mismo número en la misma pantalla.
 *
 * El biochar conserva su desglose BACHE POR BACHE, reconstruido del libro mayor
 * del Core (`ID Bache Origen` de cada movimiento). La tabla de baches se sigue
 * leyendo SOLO para contrastar: si las dos vistas se separan, es que un consumo se
 * escribió en una y no en la otra, y eso se avisa en vez de esconderse.
 *
 * Los fallos parciales NO tumban la respuesta: se devuelve lo que se pudo leer con
 * su advertencia. Una bodega a medias es más útil que un error en pantalla.
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
  if (def.key === 'biochar') return config.airtable.blendBiocharInsumoRecordId;
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

  // Todo en paralelo y con `allSettled`: el fallo de una lectura no invalida a las
  // otras. Los baches son solo el contraste del biochar, no su fuente.
  const [coreResult, bachesCoreResult, bachesLocalResult] = await Promise.allSettled([
    fetchAllStockInsumos(),
    fetchBachesBiocharCore(),
    fetchBachesConBiochar(),
  ]);

  const stockRecords: StockInsumoRecord[] =
    coreResult.status === 'fulfilled' ? coreResult.value : [];
  if (coreResult.status === 'rejected') {
    console.error('❌ Bodega: no se pudo leer Stock Insumos del Core:', coreResult.reason);
    advertencias.push(
      'No se pudo leer Sirius Insumos Core. El stock de las materias primas se muestra en 0.'
    );
  }

  // Desglose por bache desde el libro mayor del Core.
  const bachesCore: BacheBiocharCore[] =
    bachesCoreResult.status === 'fulfilled' ? bachesCoreResult.value ?? [] : [];
  if (bachesCoreResult.status === 'rejected') {
    console.error('❌ Bodega: no se pudo reconstruir el biochar por bache:', bachesCoreResult.reason);
    advertencias.push('No se pudo reconstruir el detalle de biochar por bache desde el Core.');
  }

  // Solo con saldo > 0: es lo que hay en bodega hoy. Los agotados quedan en el
  // historico de movimientos, no en la lista de existencias.
  const baches: BacheBiochar[] = bachesCore
    .filter((b) => b.kg > 0)
    .map((b) => ({
      id: b.codigo,
      codigo: b.codigo,
      kg: b.kg,
      // El Core no guarda `Estado Bache`: el estado de BODEGA se deriva del saldo.
      estado: b.kgConsumido > 0 ? 'Parcialmente consumido' : 'Completo en bodega',
    }));

  // Contraste con la tabla de baches de PiroliApp. No alimenta ningun numero: si
  // las dos vistas del mismo inventario se separan, hay un consumo escrito en una
  // sola. 1 kg de tolerancia por el redondeo a 2 decimales en cientos de movimientos.
  if (bachesLocalResult.status === 'fulfilled') {
    const kgLocal = bachesLocalResult.value.reduce((total, b) => total + b.kg, 0);
    const kgCore = bachesCore.reduce((total, b) => total + b.kg, 0);
    if (bachesCore.length && Math.abs(kgCore - kgLocal) > 1) {
      advertencias.push(
        `El biochar de Sirius Insumos Core (${kgCore.toFixed(2)} kg) y el de la tabla de baches ` +
          `(${kgLocal.toFixed(2)} kg) no coinciden. Algun consumo quedo registrado en una sola de ` +
          `las dos vistas: revisa que cada Salida de biochar del Core tenga su fila de detalle por bache.`
      );
    }
  } else {
    console.warn('⚠️ Bodega: no se pudo contrastar contra la tabla de baches:', bachesLocalResult.reason);
  }

  const materiales: MateriaPrima[] = [];

  // Las tres materias primas por el MISMO camino: insumo del Core + Stock Insumos.
  for (const def of MATERIAS_PRIMAS_ORDENADAS) {
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
        `${def.nombre}: no tiene registro en Stock Insumos del Core, asi que no se pueden registrar movimientos.`
      );
    }

    const stock = stockRecord ? getStockActual(stockRecord) : 0;

    // El umbral del Core manda si esta definido; si no, lo que consume un lote
    // de referencia de Blend.
    const minimoCore = toNumber(insumo.fields?.['Stock Minimo']);
    const stockMinimo = minimoCore > 0 ? minimoCore : minimoPorLoteReferencia(def.pctBlend);

    materiales.push({
      key: def.key,
      nombre: def.nombre,
      nombreCore:
        typeof insumo.fields?.['Nombre'] === 'string'
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
      tieneDesglosePorBache: def.tieneDesglosePorBache ?? false,
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
    `🏬 Bodega (Core): ` +
      materiales.map((m) => `${m.nombre}=${m.stock} ${m.unidad}`).join(', ') +
      ` · ${baches.length} baches con biochar` +
      ` → capacidad ${capacidad.kgBlend} kg de Blend`
  );

  return NextResponse.json(payload, { status: 200 });
}
