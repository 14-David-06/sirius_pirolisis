// src/lib/despacho-biochar.calculos.ts
//
// Las cuentas del despacho comercial de biochar puro, sin una sola lectura.
//
// PURO a propósito (solo importa otros módulos puros): el despacho real, el
// ensayo, «completar» y los tests tienen que llegar al MISMO número de
// «disponible», y la única forma de garantizarlo es que la cuenta no dependa de
// cuándo ni cómo se leyó cada tabla. La orquestación vive en `despacho-biochar.ts`.
//
// ═══ LO DESPACHABLE NO ES EL SALDO ═══════════════════════════════════════════
// El saldo de un bache en el Core baja cuando se escribe su Salida. Pero un
// despacho se ancla primero en una remisión `Borrador` y escribe las Salidas
// después: entre esos dos momentos —o para siempre, si el despacho quedó a
// medias— hay kg prometidos a un cliente que el libro mayor todavía muestra como
// libres. Si no se descuentan, otro despacho (o la producción) los vuelve a
// vender. Es la misma lectura conservadora del Blend (`lotesDisponiblesBlend()`:
// el mayor entre lo que dice el libro y lo remitido).

import { esCorreoValido, normalizarCedula, normalizarCorreo } from './recepcion/datos-personales';
import {
  bachesDeNotas,
  esIdDespacho,
  kgRemitidoDeRemision,
  referenciaDespachoBache,
  tipoRemision,
  type BacheDeRemision,
  type RemisionCruda,
} from './remision-pirolisis.constants';

/** Restos de redondeo: por debajo de esto, dos cantidades son la misma. */
export const TOLERANCIA_KG = 0.01;

/** Tope de baches por despacho: 60 Salidas son 6 POST de 10, holgado en 60 s. */
export const MAX_BACHES_DESPACHO = 60;

const CANCELADA = 'Cancelada';
const CODIGO_BACHE = /^S-\d{5}$/;

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface SaldoDespachable {
  /** `S-XXXXX`. */
  bache: string;
  /** Saldo del bache en el libro mayor (entradas − salidas). */
  saldoCore: number;
  /** Kg ya prometidos en remisiones de biochar cuya Salida todavía no está escrita. */
  comprometido: number;
  /** Lo que se puede despachar hoy: `saldoCore − comprometido`, nunca negativo. */
  disponible: number;
}

/**
 * Lo despachable de cada bache.
 *
 * Una remisión de biochar compromete los kg de sus marcas `[bache:S=kg]` mientras
 * su Salida `DESP-<REM>-<S>` NO esté en el Core. Cuando la Salida existe, esos kg
 * ya bajaron el saldo: contarlos otra vez los descontaría dos veces. Una
 * `Cancelada` no compromete nada. El `Borrador` sí: es justo el caso que esto
 * existe para cubrir.
 *
 * @param saldos saldo por bache del Core (`saldosPorBache()`).
 * @param remisiones remisiones del Core; las que no son de biochar se ignoran.
 * @param documentosSalida `documento_referencia` que ya existen en el Core.
 * @param o.excluirRemision la remisión que se está completando: sus propios kg no
 *   se le pueden cobrar a ella misma.
 * @returns un renglón por bache con saldo o con algo comprometido, por código.
 */
export function saldosDespachables(
  saldos: ReadonlyArray<{ codigo: string; kg: number }>,
  remisiones: ReadonlyArray<RemisionCruda>,
  documentosSalida: ReadonlySet<string>,
  o: { excluirRemision?: string } = {}
): SaldoDespachable[] {
  const comprometido = new Map<string, number>();
  for (const r of remisiones) {
    // Las de biochar y las mixtas (Blend con biochar puro): las dos llevan `[bache:]`.
    if (r.estado === CANCELADA || !tipoRemision(r)) continue;
    if (o.excluirRemision && r.codigo === o.excluirRemision) continue;
    for (const { bache, kg } of bachesDeNotas(r.notas)) {
      // Sin código de remisión no hay referencia que buscar: se asume pendiente,
      // que es la lectura que no promete dos veces.
      const escrita = r.codigo ? documentosSalida.has(referenciaSeguro(r.codigo, bache)) : false;
      if (escrita) continue;
      comprometido.set(bache, r2((comprometido.get(bache) ?? 0) + kg));
    }
  }

  const porBache = new Map<string, SaldoDespachable>();
  for (const { codigo, kg } of saldos) {
    if (!codigo) continue;
    const previo = porBache.get(codigo);
    const saldoCore = r2((previo?.saldoCore ?? 0) + kg);
    porBache.set(codigo, { bache: codigo, saldoCore, comprometido: 0, disponible: 0 });
  }
  for (const [bache, kg] of comprometido) {
    if (!porBache.has(bache)) porBache.set(bache, { bache, saldoCore: 0, comprometido: 0, disponible: 0 });
    porBache.get(bache)!.comprometido = kg;
  }

  return [...porBache.values()]
    .map((s) => ({ ...s, disponible: r2(Math.max(0, s.saldoCore - s.comprometido)) }))
    .filter((s) => s.saldoCore > TOLERANCIA_KG || s.comprometido > TOLERANCIA_KG)
    .sort((a, b) => a.bache.localeCompare(b.bache));
}

/** `referenciaDespachoBache` lanza ante un código raro; aquí eso no debe tumbar la cuenta. */
function referenciaSeguro(codigoRemision: string, bache: string): string {
  try {
    return referenciaDespachoBache(codigoRemision, bache);
  } catch {
    return '';
  }
}

/**
 * ¿El reparto que reenvía la confirmación todavía cabe? Null si sí; si no, el
 * motivo en palabras del operador.
 *
 * La confirmación escribe EXACTAMENTE el reparto del ensayo y no lo recalcula:
 * recalcular caería en otros baches si el saldo se movió, y el operador confirmó
 * lo que vio. Pero entre el ensayo y la confirmación otro flujo pudo consumir
 * esos baches; por eso se revalida bache a bache contra lecturas frescas.
 */
export function validarRepartoConfirmado(
  reparto: ReadonlyArray<BacheDeRemision>,
  disponibles: ReadonlyArray<SaldoDespachable>,
  kgTotal: number
): string | null {
  if (!reparto.length) return 'El reparto por bache está vacío.';
  if (reparto.length > MAX_BACHES_DESPACHO) {
    return `Un despacho admite como máximo ${MAX_BACHES_DESPACHO} baches (vienen ${reparto.length}).`;
  }

  const vistos = new Set<string>();
  for (const { bache, kg } of reparto) {
    if (!CODIGO_BACHE.test(bache)) return `Código de bache inválido: "${bache}".`;
    if (vistos.has(bache)) return `El bache ${bache} está dos veces en el reparto.`;
    vistos.add(bache);
    if (!Number.isFinite(kg) || kg <= 0) return `Los kg del bache ${bache} deben ser mayores que cero.`;
  }

  const suma = r2(reparto.reduce((t, b) => t + b.kg, 0));
  if (Math.abs(suma - r2(kgTotal)) > TOLERANCIA_KG) {
    return `El reparto suma ${formatoKg(suma)} kg y el despacho es de ${formatoKg(kgTotal)} kg.`;
  }

  const porBache = new Map(disponibles.map((d) => [d.bache, d]));
  for (const { bache, kg } of reparto) {
    const d = porBache.get(bache);
    const hay = d?.disponible ?? 0;
    if (kg > hay + TOLERANCIA_KG) {
      return (
        `El saldo cambió: al bache ${bache} le quedan ${formatoKg(hay)} kg despachables ` +
        `y el reparto le saca ${formatoKg(kg)} kg. Ensaye el despacho de nuevo.`
      );
    }
  }
  return null;
}

/**
 * Kg de biochar ya despachados contra un pedido: la suma de las marcas de sus
 * remisiones de biochar no canceladas, `Borrador` incluido (un despacho en curso
 * ya le quitó esos kg a lo pendiente; si no contara, se ofrecería despacharlos
 * otra vez). Es la misma regla de `clasificarPedidos()`.
 */
export function kgDespachadosBiochar(remisionesDelPedido: ReadonlyArray<RemisionCruda>): number {
  let total = 0;
  for (const r of remisionesDelPedido) {
    if (r.estado === CANCELADA) continue;
    const kr = kgRemitidoDeRemision(r);
    if (kr?.tipo === 'biochar') total += kr.kg;
  }
  return r2(total);
}

/** `1234.5` → `1.234,50`: como lee los números el operador (y el cliente, en el PDF). */
export function formatoKg(kg: number): string {
  const [entero, decimales] = Math.abs(r2(kg)).toFixed(2).split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${kg < 0 ? '-' : ''}${conMiles},${decimales}`;
}

/**
 * La nota de la fila de `Productos Remitidos`: «Baches S-00140 (75,00 kg), …».
 *
 * Es texto para personas (la fila del Core la ven las otras apps). La
 * trazabilidad que lee la app vive en las marcas de la remisión, no aquí.
 */
export function notasProductoRemitido(reparto: ReadonlyArray<BacheDeRemision>): string {
  const partes = reparto.map(({ bache, kg }) => `${bache} (${formatoKg(kg)} kg)`);
  return `${partes.length === 1 ? 'Bache' : 'Baches'} ${partes.join(', ')}`;
}

/**
 * A qué estado pasa la remisión al activarse. Con transportista identificado el
 * producto ya va en camino; sin él queda esperando que lo recojan. Es la misma
 * regla que usa el Blend al emitir.
 */
export function estadoActivacion(tieneCedulaTransportista: boolean): 'En Tránsito' | 'Pendiente' {
  return tieneCedulaTransportista ? 'En Tránsito' : 'Pendiente';
}

// ─────────────────────────────────────────────────────────────────────────────
// Forma del cuerpo de las rutas de despacho (D.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que la ruta acepta del cuerpo, ya validado y normalizado. Vive aquí y no en
 * `route.ts` porque un archivo de ruta de Next solo puede exportar handlers, y lo
 * comparten la ruta del biochar y la del Blend.
 */
export interface FormaDespacho {
  idPedido: string;
  dryRun: boolean;
  kg?: number;
  idDespacho?: string;
  reparto?: BacheDeRemision[];
  responsableEntrega: string;
  transportista?: { nombre: string; cedula: string; telefono?: string; email?: string };
  idAreaCliente?: string;
  fechaDespacho?: string;
  observaciones?: string;
}

const PEDIDO = /^SIRIUS-PED-\d{4,}$/;
const AREA = /^AC-\d{4,}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const TELEFONO = /^[+0-9 ()-]{7,20}$/;

function textoOpcional(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  return t ? t : undefined;
}

/**
 * Valida la FORMA del cuerpo de un despacho. Devuelve los datos limpios o el
 * primer error (→ 400). No sabe nada del inventario ni del pedido: eso es un 409
 * que decide el despacho.
 *
 * @param o.exigirReparto el biochar exige `idDespacho` y `reparto` al confirmar;
 *   el Blend no (sale de lotes, y su llave es opcional).
 */
export function validarFormaDespacho(
  body: unknown,
  o: { exigirReparto: boolean }
): { ok: true; datos: FormaDespacho } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'El cuerpo debe ser un objeto JSON.' };
  }
  const b = body as Record<string, unknown>;
  const dryRun = b.dryRun === true;

  const idPedido = String(b.idPedido ?? '').trim();
  if (!PEDIDO.test(idPedido)) return { ok: false, error: 'idPedido debe ser un código SIRIUS-PED-XXXX.' };

  let kg: number | undefined;
  if (b.kg !== undefined && b.kg !== null && b.kg !== '') {
    kg = Number(b.kg);
    if (!Number.isFinite(kg) || kg <= 0) return { ok: false, error: 'kg debe ser un número mayor que 0.' };
    kg = r2(kg);
  }

  let idDespacho: string | undefined;
  if (b.idDespacho !== undefined && b.idDespacho !== null && b.idDespacho !== '') {
    if (!esIdDespacho(b.idDespacho)) return { ok: false, error: 'idDespacho debe ser el UUID v4 del ensayo.' };
    idDespacho = b.idDespacho;
  }

  let reparto: BacheDeRemision[] | undefined;
  if (b.reparto !== undefined && b.reparto !== null) {
    if (!Array.isArray(b.reparto) || !b.reparto.length || b.reparto.length > MAX_BACHES_DESPACHO) {
      return { ok: false, error: `reparto debe tener entre 1 y ${MAX_BACHES_DESPACHO} baches.` };
    }
    reparto = [];
    for (const item of b.reparto as unknown[]) {
      const x = (item ?? {}) as Record<string, unknown>;
      const bache = String(x.bache ?? '').trim();
      const kgBache = Number(x.kg);
      if (!CODIGO_BACHE.test(bache)) return { ok: false, error: `Bache inválido en el reparto: "${bache}".` };
      if (!Number.isFinite(kgBache) || kgBache <= 0) {
        return { ok: false, error: `Los kg del bache ${bache} deben ser mayores que 0.` };
      }
      reparto.push({ bache, kg: r2(kgBache) });
    }
  }

  if (!dryRun && o.exigirReparto) {
    if (!idDespacho) return { ok: false, error: 'Confirmar exige el idDespacho del ensayo.' };
    if (!reparto) return { ok: false, error: 'Confirmar exige el reparto por bache del ensayo.' };
  }

  const responsableEntrega = String(b.responsableEntrega ?? '').trim();
  if (responsableEntrega.length < 2 || responsableEntrega.length > 120 || CONTROL.test(responsableEntrega)) {
    return { ok: false, error: 'responsableEntrega debe tener entre 2 y 120 caracteres.' };
  }

  let transportista: FormaDespacho['transportista'];
  if (b.transportista !== undefined && b.transportista !== null) {
    if (typeof b.transportista !== 'object' || Array.isArray(b.transportista)) {
      return { ok: false, error: 'transportista debe ser un objeto.' };
    }
    const t = b.transportista as Record<string, unknown>;
    const nombre = textoOpcional(t.nombre);
    const cedulaCruda = textoOpcional(t.cedula);
    const telefono = textoOpcional(t.telefono);
    const email = textoOpcional(t.email);
    // Un transportista vacío (el formulario manda el objeto aunque nadie lo llene)
    // es lo mismo que no mandarlo.
    if (nombre || cedulaCruda || telefono || email) {
      if (!nombre || nombre.length < 2 || nombre.length > 120 || CONTROL.test(nombre)) {
        return { ok: false, error: 'El nombre del transportista debe tener entre 2 y 120 caracteres.' };
      }
      const cedula = normalizarCedula(cedulaCruda);
      if (!cedula) return { ok: false, error: 'La cédula del transportista no es válida.' };
      if (telefono && !TELEFONO.test(telefono)) return { ok: false, error: 'El teléfono del transportista no es válido.' };
      // `Correo Electrónico` es un campo email en Personas: un valor inválido es un
      // 422 que tumba el registro de la persona.
      if (email && !esCorreoValido(email)) return { ok: false, error: 'El correo del transportista no es válido.' };
      transportista = { nombre, cedula, ...(telefono ? { telefono } : {}), ...(email ? { email: normalizarCorreo(email) } : {}) };
    }
  }

  const idAreaCliente = textoOpcional(b.idAreaCliente);
  if (idAreaCliente && !AREA.test(idAreaCliente)) {
    return { ok: false, error: 'idAreaCliente debe ser un código AC-XXXX.' };
  }

  const fechaDespacho = textoOpcional(b.fechaDespacho);
  if (fechaDespacho && (!FECHA.test(fechaDespacho) || Number.isNaN(Date.parse(`${fechaDespacho}T12:00:00Z`)))) {
    return { ok: false, error: 'fechaDespacho debe ser YYYY-MM-DD.' };
  }

  const observaciones = textoOpcional(b.observaciones);
  if (observaciones && (observaciones.length > 500 || CONTROL.test(observaciones))) {
    return { ok: false, error: 'observaciones admite 500 caracteres como máximo, sin caracteres de control.' };
  }

  return {
    ok: true,
    datos: {
      idPedido,
      dryRun,
      kg,
      idDespacho,
      reparto,
      responsableEntrega,
      transportista,
      idAreaCliente,
      fechaDespacho,
      observaciones,
    },
  };
}
