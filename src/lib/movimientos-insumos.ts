// src/lib/movimientos-insumos.ts
// Campos "ID core" de Movimientos Insumos (Sirius Insumos Core).
//
// La tabla Movimientos Insumos tiene tres campos de identificadores simbólicos
// del Core que deben ir SIEMPRE completos en cada entrada y cada salida:
//
//   - ID Responsable Core → SIRIUS-PER-XXXX (persona que registra)
//   - ID Area Origen      → SIRIUS-AREA-XXXX (de dónde sale)
//   - ID Area Destino     → SIRIUS-AREA-XXXX (a dónde entra)
//
// Decisión (2026-07-27): tanto en entradas como en salidas, origen y destino son
// PIROLISIS. El área administra su propio inventario, así que un ingreso entra a
// Pirólisis y un consumo se gasta dentro de Pirólisis.

import { config } from './config';
import { ServerSessionManager } from './serverSession';

const AT = 'https://api.airtable.com/v0';

/** Formato de los identificadores simbólicos de persona en Nomina Core. */
const ID_PERSONA_CORE = /^SIRIUS-PER-\d{4,}$/;

/** Nombres canónicos de los campos de `Movimientos Insumos`. */
export const MOVIMIENTO_FIELD_NAMES = {
  codigo: 'Código Movimiento Insumo',
  insumo: 'Insumo',
  tipoMovimiento: 'Tipo Movimiento',
  id: 'ID',
} as const;

/**
 * Resuelve el SIRIUS-PER del responsable.
 *
 * Prioridad: valor explícito del caller → sesión del servidor. Nunca cae al
 * nombre de la persona: escribir "Juan Pérez" en un campo de ID rompe la
 * federación con Nomina Core, que es justo lo que estos campos resuelven.
 *
 * @param explicito Valor recibido del cliente (se ignora si no es un SIRIUS-PER).
 * @returns El código SIRIUS-PER, o null si no se pudo resolver.
 */
export async function resolveIdResponsableCore(explicito?: unknown): Promise<string | null> {
  if (typeof explicito === 'string' && ID_PERSONA_CORE.test(explicito.trim())) {
    return explicito.trim();
  }

  try {
    const session = await ServerSessionManager.getSession();
    const idCore = session?.user?.idPersonalCore?.trim();
    if (idCore && ID_PERSONA_CORE.test(idCore)) {
      return idCore;
    }
  } catch (err) {
    console.warn('⚠️ No se pudo leer la sesión para resolver ID Responsable Core:', err);
  }

  return null;
}

/**
 * Construye los tres campos "ID core" de un movimiento, listos para mezclar en
 * el payload de Airtable.
 *
 * Omite un campo solo si su field ID no está configurado o si el responsable no
 * se pudo resolver; en ese último caso deja un warning en logs, porque un
 * movimiento sin responsable es un hueco de trazabilidad.
 *
 * @param idResponsableCore Resultado de {@link resolveIdResponsableCore}.
 * @param contexto Etiqueta para los logs (ej. "salida de insumo").
 */
export function buildCamposIdCore(
  idResponsableCore: string | null,
  contexto: string
): Record<string, string> {
  const movFields = config.airtable.movimientoFields;
  const areaPirolisis = config.airtable.pirolisisAreaCode;
  const campos: Record<string, string> = {};

  if (!areaPirolisis) {
    console.warn(`⚠️ [${contexto}] AIRTABLE_PIROLISIS_AREA_CODE no configurado: el movimiento quedará sin áreas.`);
  } else {
    if (movFields.idAreaOrigen) campos[movFields.idAreaOrigen] = areaPirolisis;
    if (movFields.idAreaDestino) campos[movFields.idAreaDestino] = areaPirolisis;
  }

  if (idResponsableCore && movFields.idResponsable) {
    campos[movFields.idResponsable] = idResponsableCore;
  } else if (!idResponsableCore) {
    console.warn(`⚠️ [${contexto}] Sin SIRIUS-PER del responsable (sesión sin idPersonalCore): el movimiento quedará sin ID Responsable Core.`);
  }

  return campos;
}

/** Máximo de páginas a recorrer buscando la salida más reciente de un insumo. */
const MAX_PAGINAS_BUSQUEDA = 10;

/**
 * Devuelve el código `MOV-INS-XXXX` de la salida más reciente de un insumo.
 *
 * El match del insumo se hace en JS sobre los record IDs: en una fórmula de
 * Airtable un campo link se evalúa como el texto del campo primario del
 * registro vinculado, no como el record ID, así que `filterByFormula` no sirve
 * para comparar contra un `recXXX`. Ver src/lib/stock-insumos.ts.
 *
 * @param insumoRecordId Record ID del insumo en Sirius Insumos Core.
 * @returns El código del movimiento, o null si no hay salidas de ese insumo.
 */
export async function findUltimaSalidaCodigo(insumoRecordId: string): Promise<string | null> {
  const token = config.airtable.insumosCoreToken;
  const baseId = config.airtable.insumosCoreBaseId;
  const tableId = config.airtable.movimientosInsumosTableId;

  if (!token || !baseId || !tableId) {
    console.warn('⚠️ Config de Movimientos Insumos incompleta: no se puede buscar la última salida.');
    return null;
  }

  let offset: string | undefined;
  let paginas = 0;

  do {
    const url = new URL(`${AT}/${baseId}/${tableId}`);
    url.searchParams.set('pageSize', '100');
    // Solo salidas, de la más reciente a la más antigua (ID es autonumber).
    url.searchParams.set('filterByFormula', `{${MOVIMIENTO_FIELD_NAMES.tipoMovimiento}}='Salida'`);
    url.searchParams.set('sort[0][field]', MOVIMIENTO_FIELD_NAMES.id);
    url.searchParams.set('sort[0][direction]', 'desc');
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) {
      console.warn(`⚠️ Error buscando la última salida de ${insumoRecordId}:`, JSON.stringify(data));
      return null;
    }

    for (const record of data.records ?? []) {
      const vinculados: string[] = Array.isArray(record.fields?.[MOVIMIENTO_FIELD_NAMES.insumo])
        ? record.fields[MOVIMIENTO_FIELD_NAMES.insumo]
        : [];
      if (vinculados.includes(insumoRecordId)) {
        const codigo = record.fields?.[MOVIMIENTO_FIELD_NAMES.codigo];
        return typeof codigo === 'string' ? codigo : null;
      }
    }

    offset = data.offset;
    paginas++;
  } while (offset && paginas < MAX_PAGINAS_BUSQUEDA);

  return null;
}
