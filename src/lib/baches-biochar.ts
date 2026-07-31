// src/lib/baches-biochar.ts
//
// Lectura del biochar seco disponible, y la decisión de QUÉ FUENTE manda.
//
// ⚠️ CAMBIO 2026-07-30: el biochar ya SÍ es un insumo de Sirius Insumos Core
// (`Biochar Puro`), con un movimiento por bache: Entrada al llegar a bodega y
// Salida al consumirse en una producción de Blend, con bache origen y lote
// destino. El Core es desde entonces el libro mayor.
//
// La tabla de baches sigue existiendo y sigue siendo necesaria: su fórmula
// `Total Cantidad Actual Biochar Seco` responde "cuánto queda de ESTE bache",
// que es lo que necesita la UI de selección de baches al producir. No son dos
// inventarios: son dos vistas del mismo, y cada consumo se escribe una vez en
// cada una con el mismo número.
//
// Todos los consumidores deben pasar por `resolverBiocharDisponible()` para ver
// EXACTAMENTE el mismo número: bodega, agenda, dashboard y la verificación de
// stock previa a producir. Si divergieran, la bodega diría que alcanza y la
// producción lo negaría.

import { config } from './config';

const AT = 'https://api.airtable.com/v0';

export interface BacheBiocharRecord {
  id: string;
  /** `Codigo Bache`; el record ID si el bache no tiene código. */
  codigo: string;
  /** KG de biochar seco disponibles ahora en el bache. */
  kg: number;
  estado: string;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Baches con biochar seco disponible (> 0), de mayor a menor cantidad.
 *
 * El orden importa: es el que usa el reparto automático de
 * `planBacheAllocations` cuando el operador no define KG por bache, así que
 * consumir primero los baches más grandes deja menos baches abiertos.
 *
 * @throws Si falta configuración de la base local o de la tabla de baches.
 */
export async function fetchBachesConBiochar(): Promise<BacheBiocharRecord[]> {
  const { token, baseId, bachesTableId } = config.airtable;


  if (!token || !baseId || !bachesTableId) {
    throw new Error(
      'Configuración de baches incompleta: faltan AIRTABLE_TOKEN, AIRTABLE_BASE_ID o AIRTABLE_BACHES_TABLE_ID'
    );
  }

  const baches: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${AT}/${baseId}/${bachesTableId}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Error al leer baches: ${JSON.stringify(data)}`);
    }

    baches.push(...((data.records ?? []) as AirtableRecord[]));
    offset = data.offset;
  } while (offset);

  return baches
    .map((bache) => ({
      id: bache.id,
      codigo: String(bache.fields?.['Codigo Bache'] ?? bache.id),
      kg: toNumber(bache.fields?.['Total Cantidad Actual Biochar Seco']),
      estado: String(bache.fields?.['Estado Bache'] ?? ''),
    }))
    .filter((bache) => bache.kg > 0)
    .sort((a, b) => b.kg - a.kg);
}

/**
 * Estados de `Estado Bache`. Son las opciones reales del singleSelect en Airtable:
 * mandar un valor que no esté aquí devuelve 422.
 */
export const ESTADO_BACHE = {
  agotado: 'Bache Agotado',
  incompleto: 'Bache Incompleto',
  completoBodega: 'Bache Completo Bodega',
  completoPlanta: 'Bache Completo Planta',
  enProceso: 'Bache en proceso',
} as const;

/** Por debajo de esto un bache se considera vacío: son restos de redondeo. */
const TOLERANCIA_VACIO_KG = 0.01;

/**
 * Estado que le corresponde a un bache después de consumirle biochar, o `null`
 * si no hay que cambiarlo.
 *
 * La tabla de baches es el HISTORIAL de la producción de pirólisis: los baches no
 * se borran ni se archivan, cambian de estado a medida que se vacían. Sin esto un
 * bache consumido se queda en "Bache Completo Bodega" con 0 kg, que es justo lo
 * que hacía que la bodega pareciera llena de baches que ya no existen.
 *
 * Se calcula con el disponible ANTES del consumo menos lo consumido, no releyendo
 * el bache: la fórmula de Airtable tarda en recalcular y una relectura inmediata
 * puede devolver el valor viejo.
 */
export function estadoTrasConsumo(
  disponibleAntes: number,
  kgConsumidos: number,
  estadoActual: string
): string | null {
  if (kgConsumidos <= 0) return null;

  const restante = disponibleAntes - kgConsumidos;
  const nuevo = restante <= TOLERANCIA_VACIO_KG ? ESTADO_BACHE.agotado : ESTADO_BACHE.incompleto;

  return nuevo === estadoActual ? null : nuevo;
}

/**
 * Aplica los cambios de estado en lotes de 10 (límite de la API de Airtable).
 *
 * Best-effort: devuelve los que fallaron en vez de lanzar. El estado es
 * metadato de presentación —el stock real ya lo movió el detalle por bache—, así
 * que un fallo aquí no debe tumbar una producción ya deducida.
 */
export async function actualizarEstadoBaches(
  cambios: Array<{ bacheId: string; estado: string }>
): Promise<{ actualizados: number; errores: string[] }> {
  const { token, baseId, bachesTableId } = config.airtable;
  const errores: string[] = [];
  let actualizados = 0;

  if (!cambios.length) return { actualizados, errores };
  if (!token || !baseId || !bachesTableId) {
    return { actualizados, errores: ['Configuración de baches incompleta'] };
  }

  for (let i = 0; i < cambios.length; i += 10) {
    const grupo = cambios.slice(i, i + 10);
    try {
      const response = await fetch(`${AT}/${baseId}/${bachesTableId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: grupo.map((c) => ({ id: c.bacheId, fields: { 'Estado Bache': c.estado } })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        errores.push(JSON.stringify(data));
        continue;
      }
      actualizados += (data.records ?? []).length;
    } catch (err) {
      errores.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { actualizados, errores };
}

/** Total de biochar seco disponible según la fórmula de los baches, en KG. */
export async function getBiocharDisponibleKg(): Promise<number> {
  const baches = await fetchBachesConBiochar();
  return baches.reduce((total, bache) => total + bache.kg, 0);
}

/**
 * Biochar seco disponible según Sirius Insumos Core (insumo `Biochar Puro`).
 *
 * Devuelve `null` si el insumo no está configurado o no tiene registro de stock.
 * NO devuelve 0 en ese caso: 0 sería indistinguible de "no hay biochar" y
 * bloquearía toda producción de Blend.
 */
export async function getBiocharStockCore(): Promise<number | null> {
  const { insumosCoreBaseId, insumosCoreToken, stockInsumosTableId, blendBiocharInsumoRecordId } =
    config.airtable;

  if (!insumosCoreBaseId || !insumosCoreToken || !stockInsumosTableId || !blendBiocharInsumoRecordId) {
    return null;
  }

  const stocks: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${AT}/${insumosCoreBaseId}/${stockInsumosTableId}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${insumosCoreToken}`, 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Error al leer Stock Insumos: ${JSON.stringify(data)}`);
    stocks.push(...((data.records ?? []) as AirtableRecord[]));
    offset = data.offset;
  } while (offset);

  // El match va en JS sobre los record IDs: en una fórmula de Airtable un campo
  // link se evalúa como el texto del campo primario, no como el record ID.
  const registro = stocks.find((stock) => {
    const links = stock.fields['Insumo ID'];
    if (!Array.isArray(links)) return false;
    return links.some((link) =>
      typeof link === 'string'
        ? link === blendBiocharInsumoRecordId
        : (link as { id?: string })?.id === blendBiocharInsumoRecordId
    );
  });

  return registro ? toNumber(registro.fields['stock_actual']) : null;
}

/** Saldo de biochar de un bache, reconstruido desde el libro mayor del Core. */
export interface BacheBiocharCore {
  /** `Codigo Bache` (S-00XXX). El Core no guarda el record ID del bache. */
  codigo: string;
  /** Saldo actual: entradas − salidas de ese bache. */
  kg: number;
  /** Lo que entró a bodega originalmente. */
  kgIngresado: number;
  /** Lo consumido en producciones. */
  kgConsumido: number;
  /** Lotes de Blend a los que fue el biochar de este bache. */
  lotes: string[];
}

/**
 * Biochar por bache según Sirius Insumos Core, no según la tabla de baches.
 *
 * Reconstruye el saldo desde los movimientos de `Biochar Puro`: cada bache tiene
 * una Entrada al llegar a bodega y una Salida por cada producción que lo consumió,
 * ambas con `ID Bache Origen`.
 *
 * Por qué el Core y no los baches, aunque hoy den el mismo número: la tabla de
 * baches es el historial de PRODUCCIÓN de pirólisis y su `Total Cantidad Actual`
 * depende de `Estado Bache` y del monitoreo de masa seca — un bache sin monitoreo
 * aparece en 0 aunque tenga biochar físico. El Core es el libro mayor de BODEGA:
 * lo que dice es lo que se puede despachar, y trae de paso a qué lote fue cada kg.
 *
 * Devuelve `null` si el insumo no está configurado, para que el llamador pueda
 * caer a la tabla de baches sin quedarse sin datos.
 */
export async function fetchBachesBiocharCore(): Promise<BacheBiocharCore[] | null> {
  const {
    insumosCoreBaseId,
    insumosCoreToken,
    movimientosInsumosTableId,
    blendBiocharInsumoRecordId,
    movimientoFields,
  } = config.airtable;

  if (
    !insumosCoreBaseId ||
    !insumosCoreToken ||
    !movimientosInsumosTableId ||
    !blendBiocharInsumoRecordId ||
    !movimientoFields.idBacheOrigen
  ) {
    return null;
  }

  const movimientos: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${AT}/${insumosCoreBaseId}/${movimientosInsumosTableId}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true');
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${insumosCoreToken}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Error al leer Movimientos Insumos: ${JSON.stringify(data)}`);
    movimientos.push(...((data.records ?? []) as AirtableRecord[]));
    offset = data.offset;
  } while (offset);

  const porBache = new Map<string, BacheBiocharCore>();

  for (const mov of movimientos) {
    // El match del insumo va en JS sobre los record IDs: en una fórmula un campo
    // link se evalúa como el texto del campo primario, no como el record ID.
    const links = mov.fields[movimientoFields.insumo!];
    const esBiochar =
      Array.isArray(links) &&
      links.some((link) =>
        typeof link === 'string'
          ? link === blendBiocharInsumoRecordId
          : (link as { id?: string })?.id === blendBiocharInsumoRecordId
      );
    if (!esBiochar) continue;

    const codigo = String(mov.fields[movimientoFields.idBacheOrigen!] ?? '');
    if (!codigo) continue;

    const kg = toNumber(mov.fields[movimientoFields.cantidad!]);
    const tipo = String(mov.fields[movimientoFields.tipoMovimiento!] ?? '');
    const lote = String(mov.fields[movimientoFields.idProduccionDestino ?? ''] ?? '');

    const actual =
      porBache.get(codigo) ?? { codigo, kg: 0, kgIngresado: 0, kgConsumido: 0, lotes: [] };

    if (tipo === 'Entrada') {
      actual.kgIngresado += kg;
      actual.kg += kg;
    } else if (tipo === 'Salida') {
      actual.kgConsumido += kg;
      actual.kg -= kg;
      if (lote && !actual.lotes.includes(lote)) actual.lotes.push(lote);
    }

    porBache.set(codigo, actual);
  }

  return [...porBache.values()]
    .map((b) => ({
      ...b,
      kg: Math.round(b.kg * 100) / 100,
      kgIngresado: Math.round(b.kgIngresado * 100) / 100,
      kgConsumido: Math.round(b.kgConsumido * 100) / 100,
    }))
    .sort((a, b) => b.kg - a.kg);
}

/** De dónde salió el número, y el contraste entre las dos vistas. */
export interface BiocharDisponible {
  /** El número que deben mostrar todas las pantallas. */
  kg: number;
  origen: 'insumos-core' | 'baches';
  kgBaches: number;
  kgCore: number | null;
  /** `kgCore − kgBaches`. `null` si el Core no está disponible. */
  divergencia: number | null;
}

/**
 * Resuelve el biochar disponible: manda el Core, los baches son el respaldo.
 *
 * ÚNICO punto donde vive esta decisión. Cualquier pantalla que muestre "biochar
 * en stock" debe llamar aquí; si cada una eligiera su fuente, la bodega y la
 * producción volverían a contradecirse.
 *
 * `divergencia` se expone a propósito: si las dos vistas se separan, es que un
 * consumo se escribió en una y no en la otra, y ese aviso vale más que esconder
 * la diferencia detrás de un solo número.
 */
export async function resolverBiocharDisponible(): Promise<BiocharDisponible> {
  const [kgBaches, kgCore] = await Promise.all([
    getBiocharDisponibleKg(),
    getBiocharStockCore().catch((err) => {
      console.error('⚠️ No se pudo leer el biochar de Sirius Insumos Core:', err);
      return null;
    }),
  ]);

  return {
    kg: kgCore ?? kgBaches,
    origen: kgCore === null ? 'baches' : 'insumos-core',
    kgBaches,
    kgCore,
    divergencia: kgCore === null ? null : Math.round((kgCore - kgBaches) * 100) / 100,
  };
}
