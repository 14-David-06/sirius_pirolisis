// src/lib/baches-biochar.ts
//
// Lectura del biochar seco disponible en los baches de Pirólisis.
//
// El biochar puro NO es un insumo de Sirius Insumos Core: se produce en la
// planta y su stock vive en la tabla de baches, en el campo fórmula
// `Total Cantidad Actual Biochar Seco` (producción − salidas por remisión).
//
// Existe como módulo compartido porque hay dos consumidores que deben ver
// EXACTAMENTE el mismo número: la bodega (`/api/bodega/materias-primas`) y la
// verificación de stock previa a producir Blend
// (`/api/pirolisis/inventario/verificar-stock-blend`). Si divergieran, la bodega
// diría que alcanza y la producción lo negaría.

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

/** Total de biochar seco disponible en todos los baches, en KG. */
export async function getBiocharDisponibleKg(): Promise<number> {
  const baches = await fetchBachesConBiochar();
  return baches.reduce((total, bache) => total + bache.kg, 0);
}
