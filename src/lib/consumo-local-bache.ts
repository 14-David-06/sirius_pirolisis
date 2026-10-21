// src/lib/consumo-local-bache.ts
//
// La mitad PiroliApp de un consumo de biochar: una remisión en `Remisiones Baches
// Pirolisis` y un detalle por bache en `Detalle Cantidades Remision Pirolisis`.
//
// ═══ POR QUÉ HACE FALTA ═══════════════════════════════════════════════════════
// El biochar vive en DOS vistas a propósito (§5 de CLAUDE.md): el libro mayor del
// Core dice «cuánto hay y a dónde fue», y la fórmula del bache
// (`Total Cantidad Actual Biochar Seco` = masa seca − SUM(detalles vinculados))
// dice «cuánto queda de ESTE bache». El ÚNICO camino para bajar esa fórmula es un
// detalle vinculado al bache, y un detalle sin su remisión descontaría kg sin decir
// por qué: el «biochar fantasma» de la auditoría del 2026-07-29.
//
// ═══ UNA REMISIÓN POR CONSUMO, NO UNA POR BACHE ═══════════════════════════════
// eUse cuenta cada fila de `Remisiones Baches Pirolisis` como un VIAJE y la cruza
// con Clients Core por el nombre del cliente (`EUseCalculator.ts`). Un despacho de
// cinco baches es un camión, no cinco: una sola remisión, con un detalle por bache.
// Por lo mismo `Cliente` lleva el nombre EXACTO de Clients Core.
//
// ═══ IDEMPOTENCIA ═════════════════════════════════════════════════════════════
// La llave es una marca en `Observaciones` (`[DESPACHO:SIRIUS-REM-0231]`). Un
// reintento lee lo que ya hay y crea SOLO los detalles que faltan: el link del
// detalle hacia la remisión se escribe desde el detalle, así que nunca hace falta
// un PATCH sobre un array de links (que lo REEMPLAZARÍA, §3 de CLAUDE.md).
//
// ⚠️ Esta tabla se ESCRIBE por field ID (`config.airtable.remisionesBachesFields`,
// `detalleCantidadesFields`) y la API devuelve por NOMBRE salvo que se pida
// `returnFieldsByFieldId=true`. Los detalles se leen con ese parámetro.

import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import { CAMPO_ORIGEN_REGISTRO } from './baches-biochar';
import type { StepResult } from '@/types/step-result';

const AT = 'https://api.airtable.com/v0';

/** Airtable acepta como máximo 10 registros por POST. */
const LOTE_ESCRITURA = 10;
/** Un `OR(...)` de 50 términos cabe holgado en la URL. */
const LOTE_LECTURA = 50;

const CODIGO_BACHE = /^S-\d{5}$/;

/** Nombre del link inverso de la remisión hacia sus detalles (la API lee por nombre). */
const CAMPO_DETALLES_DE_REMISION = 'Detalle Cantidades Bache Pirolisis';

export interface BacheLocal {
  /** Record ID en `Baches Pirolisis`. */
  id: string;
  /** `Codigo Bache` (`S-XXXXX`). */
  codigo: string;
  estado: string;
  /** Vacío en los baches nacidos en esta app; `Migrado PiroliApp V2` en los históricos. */
  origenRegistro: string;
}

export interface LineaConsumoLocal {
  bacheId: string;
  codigo: string;
  kg: number;
  /** Solo en una producción de Blend. Vacío en un despacho o una salida, a propósito. */
  idProduccionBlend?: string;
}

export interface ConsumoLocalInput {
  /** Llave de idempotencia, p. ej. `[DESPACHO:SIRIUS-REM-0231]`. */
  marca: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  realizaRegistro: string;
  /** Nombre EXACTO del cliente en Clients Core (eUse cruza por él). */
  cliente: string;
  /** Texto para personas; la marca se agrega al final. */
  descripcion: string;
  lineas: LineaConsumoLocal[];
}

export interface ConsumoLocalExistente {
  remisionId: string;
  /** Kg ya descontados por bache (record ID del bache → kg). */
  kgPorBacheId: Map<string, number>;
}

interface Registro {
  id: string;
  fields: Record<string, unknown>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function toNumber(v: unknown): number {
  const n = typeof v === 'object' && v !== null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function credenciales() {
  const { token, baseId, bachesTableId, remisionesBachesTableId, detalleCantidadesRemisionTableId } =
    config.airtable;
  if (!token || !baseId) throw new Error('Configuración de PiroliApp incompleta: AIRTABLE_TOKEN / AIRTABLE_BASE_ID');
  return { token, baseId, bachesTableId, remisionesBachesTableId, detalleCantidadesRemisionTableId };
}

async function at(url: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Airtable ${init.method ?? 'GET'} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function leerTodos(base: string, tabla: string, token: string, params: Record<string, string>): Promise<Registro[]> {
  const out: Registro[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${AT}/${base}/${tabla}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString(), token);
    out.push(...((data?.records ?? []) as Registro[]));
    offset = data?.offset;
  } while (offset);
  return out;
}

function enLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// Baches por código
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los baches de PiroliApp por `Codigo Bache`, en una lectura por cada 50 y no una
 * por bache (5 req/s por base). El Core no guarda record IDs de PiroliApp —los IDs
 * de Airtable no son intercambiables entre bases—, así que el puente es el código.
 *
 * Incluye los migrados de la era V2: quien llama decide (el despacho los advierte).
 * Un código que no existe simplemente no aparece en el mapa.
 *
 * @throws si un código no tiene la forma `S-XXXXX` (no se consulta lo que no
 *   parece un código) o si la lectura falla.
 */
export async function resolverBachesPorCodigo(codigos: string[]): Promise<Map<string, BacheLocal>> {
  const unicos = [...new Set(codigos.map((c) => String(c ?? '').trim()))];
  for (const c of unicos) {
    if (!CODIGO_BACHE.test(c)) throw new Error(`Código de bache inválido: "${c}"`);
  }
  const mapa = new Map<string, BacheLocal>();
  if (!unicos.length) return mapa;

  const { token, baseId, bachesTableId } = credenciales();
  if (!bachesTableId) throw new Error('AIRTABLE_BACHES_TABLE_ID no configurado');

  for (const lote of enLotes(unicos, LOTE_LECTURA)) {
    const condiciones = lote.map((c) => `{Codigo Bache} = '${escapeAirtableValue(c)}'`);
    const registros = await leerTodos(baseId, bachesTableId, token, {
      filterByFormula: condiciones.length === 1 ? condiciones[0] : `OR(${condiciones.join(', ')})`,
    });
    for (const r of registros) {
      const codigo = String(r.fields?.['Codigo Bache'] ?? '').trim();
      if (!codigo || mapa.has(codigo)) continue;
      mapa.set(codigo, {
        id: r.id,
        codigo,
        estado: String(r.fields?.['Estado Bache'] ?? ''),
        origenRegistro: String(r.fields?.[CAMPO_ORIGEN_REGISTRO] ?? ''),
      });
    }
  }
  return mapa;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura del consumo ya escrito
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El consumo local ya escrito con esa marca, o null si no hay.
 *
 * Si por un duplicado hubiera dos remisiones con la misma marca, se suman sus
 * detalles: lo que importa es cuánto bajó ya la fórmula de cada bache, no en qué
 * fila quedó.
 *
 * @throws si la lectura falla: ante la duda NO se asume que no hay nada, porque
 *   eso escribiría el consumo dos veces.
 */
export async function leerConsumoLocal(marca: string): Promise<ConsumoLocalExistente | null> {
  if (!marca) throw new Error('Falta la marca del consumo local');
  const { token, baseId, remisionesBachesTableId, detalleCantidadesRemisionTableId } = credenciales();
  if (!remisionesBachesTableId || !detalleCantidadesRemisionTableId) {
    throw new Error('Tablas de remisiones o detalles de baches no configuradas');
  }
  const df = config.airtable.detalleCantidadesFields;
  if (!df.cantidadEspecificada || !df.bachePirolisis) {
    throw new Error('Campos del detalle de cantidades no configurados');
  }

  const remisiones = await leerTodos(baseId, remisionesBachesTableId, token, {
    filterByFormula: `FIND('${escapeAirtableValue(marca)}', {Observaciones}) > 0`,
  });
  if (!remisiones.length) return null;

  const detalleIds = remisiones
    .flatMap((r) => (Array.isArray(r.fields?.[CAMPO_DETALLES_DE_REMISION]) ? (r.fields[CAMPO_DETALLES_DE_REMISION] as unknown[]) : []))
    .filter((x): x is string => typeof x === 'string' && esRecordId(x));

  const kgPorBacheId = new Map<string, number>();
  for (const lote of enLotes([...new Set(detalleIds)], LOTE_LECTURA)) {
    const detalles = await leerTodos(baseId, detalleCantidadesRemisionTableId, token, {
      filterByFormula: `OR(${lote.map((id) => `RECORD_ID() = '${escapeAirtableValue(id)}'`).join(', ')})`,
      // `config` guarda field IDs: la respuesta por nombre daría siempre undefined.
      returnFieldsByFieldId: 'true',
    });
    for (const d of detalles) {
      const bache = d.fields?.[df.bachePirolisis];
      const bacheId = Array.isArray(bache) ? String(bache[0] ?? '') : '';
      if (!bacheId) continue;
      kgPorBacheId.set(bacheId, r2((kgPorBacheId.get(bacheId) ?? 0) + toNumber(d.fields?.[df.cantidadEspecificada])));
    }
  }

  return { remisionId: remisiones[0].id, kgPorBacheId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escribe el consumo local. Paso `local`.
 *
 * Sin `previo`: una remisión con todos los baches en `Bache Pirolisis Alterado` y
 * después los detalles en POST de 10. Si el PRIMER lote falla se borra la
 * remisión: sin detalles no descuenta nada y su marca haría que el reintento la
 * tome por escrita (mismo rollback que `salida-bache.ts`). Si falla uno posterior
 * la remisión se queda: ya descuenta lo de los lotes anteriores, y el reintento
 * completa el resto.
 *
 * Con `previo`: solo los detalles de los baches que todavía no tienen. Un bache
 * que ya tiene detalle por OTRA cantidad es un error y no se toca: las dos vistas
 * del biochar tienen que decir el mismo número, y adivinar cuál está bien sería
 * esconder la divergencia.
 */
export async function escribirConsumoLocal(
  i: ConsumoLocalInput,
  previo: ConsumoLocalExistente | null
): Promise<StepResult> {
  const step = 'local';
  const rf = config.airtable.remisionesBachesFields;
  const df = config.airtable.detalleCantidadesFields;

  let cred: ReturnType<typeof credenciales>;
  try {
    cred = credenciales();
  } catch (err) {
    return { step, ok: false, error: mensaje(err) };
  }
  const { token, baseId, remisionesBachesTableId, detalleCantidadesRemisionTableId } = cred;
  if (
    !remisionesBachesTableId ||
    !detalleCantidadesRemisionTableId ||
    !df.cantidadEspecificada ||
    !df.remisionBachePirolisis ||
    !df.bachePirolisis ||
    !rf.bachePirolisisAlterado ||
    !rf.observaciones
  ) {
    return { step, ok: false, error: 'Configuración de remisiones o detalles de baches incompleta' };
  }
  if (!i.lineas.length) return { step, ok: false, error: 'El consumo no tiene baches' };
  if (i.lineas.some((l) => !esRecordId(l.bacheId) || !(l.kg > 0))) {
    return { step, ok: false, error: 'Cada línea del consumo necesita el record ID del bache y kg mayores que 0' };
  }

  // Lo que ya está escrito: igual a lo pedido se salta; distinto es un error.
  const pendientes: LineaConsumoLocal[] = [];
  const divergentes: string[] = [];
  for (const l of i.lineas) {
    const hecho = previo?.kgPorBacheId.get(l.bacheId);
    if (hecho === undefined) pendientes.push(l);
    else if (Math.abs(hecho - r2(l.kg)) > 0.01) divergentes.push(`${l.codigo}: ${hecho} kg escritos, ${r2(l.kg)} kg esperados`);
  }
  if (divergentes.length) {
    return {
      step,
      ok: false,
      error: `El consumo local ${i.marca} ya tiene otra cantidad para: ${divergentes.join('; ')}. Revíselo a mano.`,
    };
  }
  if (previo && !pendientes.length) {
    return { step, ok: true, skipped: true, detail: { remisionId: previo.remisionId, motivo: 'Ya registrado' } };
  }

  let remisionId = previo?.remisionId ?? null;
  const creadaAhora = !remisionId;
  if (!remisionId) {
    const fields: Record<string, unknown> = {
      [rf.bachePirolisisAlterado]: [...new Set(i.lineas.map((l) => l.bacheId))],
      [rf.observaciones]: [i.descripcion.trim(), i.marca].filter(Boolean).join('\n'),
    };
    if (rf.fechaEvento) fields[rf.fechaEvento] = i.fecha;
    if (rf.realizaRegistro) fields[rf.realizaRegistro] = i.realizaRegistro;
    if (rf.cliente) fields[rf.cliente] = i.cliente;
    try {
      const creada = await at(`${AT}/${baseId}/${remisionesBachesTableId}`, token, {
        method: 'POST',
        body: JSON.stringify({ records: [{ fields }] }),
      });
      remisionId = (creada?.records?.[0]?.id as string) ?? null;
      if (!remisionId) throw new Error('Airtable no devolvió el ID de la remisión local');
    } catch (err) {
      return { step, ok: false, error: `No se creó la remisión local: ${mensaje(err)}` };
    }
  }

  const detalleIds: string[] = [];
  const lotes = enLotes(pendientes, LOTE_ESCRITURA);
  for (let n = 0; n < lotes.length; n++) {
    try {
      const res = await at(`${AT}/${baseId}/${detalleCantidadesRemisionTableId}`, token, {
        method: 'POST',
        body: JSON.stringify({
          records: lotes[n].map((l) => {
            const fields: Record<string, unknown> = {
              [df.cantidadEspecificada!]: r2(l.kg),
              [df.remisionBachePirolisis!]: [remisionId],
              [df.bachePirolisis!]: [l.bacheId],
            };
            // `ID Produccion Blend` es la FK al lote: fuera de una producción va
            // VACÍO, o un despacho entraría a la trazabilidad de carbono de un lote.
            if (l.idProduccionBlend && df.idProduccionBlend) fields[df.idProduccionBlend] = l.idProduccionBlend;
            return { fields };
          }),
        }),
      });
      detalleIds.push(...((res?.records ?? []) as Registro[]).map((r) => r.id));
    } catch (err) {
      if (n === 0 && creadaAhora) {
        await at(`${AT}/${baseId}/${remisionesBachesTableId}/${remisionId}`, token, { method: 'DELETE' }).catch(
          (e) => console.error(`❌ No se pudo borrar la remisión local ${remisionId} sin detalles:`, mensaje(e))
        );
        return { step, ok: false, error: `No se crearon los detalles (se borró la remisión local): ${mensaje(err)}` };
      }
      return {
        step,
        ok: false,
        error: `Se escribieron ${detalleIds.length} de ${pendientes.length} detalles; reintente para completar: ${mensaje(err)}`,
        detail: { remisionId, detalleIds },
      };
    }
  }

  return {
    step,
    ok: true,
    detail: { remisionId, detalleIds, baches: pendientes.map((l) => ({ bache: l.codigo, kg: r2(l.kg) })) },
  };
}
