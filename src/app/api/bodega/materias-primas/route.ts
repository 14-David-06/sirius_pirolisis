import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import {
  MATERIAS_PRIMAS_ORDENADAS,
  calcularCapacidadBlend,
  minimoPorLoteReferencia,
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
  resolverBiocharDisponible,
  type BacheBiocharCore,
  type BiocharDisponible,
} from '../../../../lib/baches-biochar';
import {
  mensajeDivergenciaBiochar,
  mensajeFuenteBiocharDegradada,
} from '../../../../lib/biochar-divergencia';
import type { BacheBiochar, BodegaData, MateriaPrima } from '../../../../types/bodega';
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
 * Su SALDO pasa por `resolverBiocharDisponible()`, como el de la agenda y el de la
 * verificación previa a producir. Esta ruta era la única que lo leía por su cuenta,
 * y ese atajo hacía que un fallo del Core dejara la bodega en 0 kg mientras la
 * agenda mostraba el total de los baches: la bodega diría "no alcanza" y la agenda
 * "está cubierto", con el mismo inventario detrás.
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
  const [coreResult, bachesCoreResult] = await Promise.allSettled([
    fetchAllStockInsumos(),
    fetchBachesBiocharCore(),
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

  // El saldo del biochar NO se lee aquí: lo resuelve `resolverBiocharDisponible()`,
  // el único punto donde vive la decisión "manda el Core, los baches son el
  // respaldo". La bodega era el último consumidor que elegía su propia fuente, y
  // por eso un fallo leyendo el Core la dejaba en 0 kg mientras la agenda seguía
  // mostrando el total de los baches.
  //
  // Se le pasa el `Stock Insumos` ya leído para no paginar la misma tabla dos veces
  // (5 req/s por base). Si esa lectura falló, `[]` hace que el resolutor caiga a los
  // baches, que es justo lo que se quiere en ese caso.
  const biochar: BiocharDisponible = await resolverBiocharDisponible(stockRecords);

  // El contraste entre las dos vistas se avisa con el MISMO umbral y el MISMO
  // texto que la agenda.
  for (const mensaje of [
    mensajeFuenteBiocharDegradada(biochar),
    mensajeDivergenciaBiochar(biochar),
  ]) {
    if (mensaje) advertencias.push(mensaje);
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

    // El biochar es la excepción: su saldo lo dicta el resolutor compartido, que
    // sabe caer a los baches si el Core no responde. Las otras dos salen de
    // `Stock Insumos` directo, que es su única vista.
    const stock =
      def.key === 'biochar' ? biochar.kg : stockRecord ? getStockActual(stockRecord) : 0;

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
  // La cuenta vive en `calcularCapacidadBlend`, compartida con la agenda: las dos
  // pantallas muestran esta misma conclusión y no deben poder diferir.
  const capacidad = calcularCapacidadBlend(
    Object.fromEntries(materiales.map((m) => [m.key, m.stock]))
  );

  for (const material of materiales) {
    material.kgBlendPosibles = capacidad.porMateria[material.key];
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
    fuenteBiochar: {
      origen: biochar.origen,
      kgBaches: biochar.kgBaches,
      kgCore: biochar.kgCore,
      divergencia: biochar.divergencia,
    },
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
