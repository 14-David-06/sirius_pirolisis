// src/lib/flujo-caja-remisiones.ts
// ⚠️ SERVER-SIDE ONLY. Copia de las remisiones de PiroliApp en la base Flujo de
// caja (finanzas): `Remisiones Pirolisis` y `Productos Remisiones Pirolisis`.
//
// ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
// Finanzas factura y cuadra las ventas desde Flujo de caja, no desde los Core. El
// laboratorio ya deja allí las suyas (`Remisiones Laboratorio`); las de pirólisis
// no llegaban, y el Blend vendido no existía para finanzas. Es el ÚLTIMO paso de
// una remisión: lo dispara la recepción por enlace, y
// `scripts/registrar-remisiones-flujo-caja.ts` trae las anteriores y las que se
// cierran a mano. La fuente de verdad sigue siendo Remisiones Core: esto es una
// copia, y por eso se arma con `construirDatosPdf()`, lo mismo que imprime el
// documento —una copia que dijera otra cosa que el papel sería peor que ninguna—.
//
// ═══ EL ESQUEMA (2026-10-22) ═════════════════════════════════════════════════
// Las dos tablas se clonaron de las del laboratorio (litros, microorganismo,
// tarifas de biológicos) y el mismo día se adaptaron al biochar: kg, producto,
// precio por kg y `Valor Total` = kg × precio. Lo que no se pudo arreglar por API:
//  - Los vínculos del clon siguen apuntando a las tablas del LABORATORIO; quedaron
//    renombrados «(No usar) …» hasta borrarlos en la interfaz. Escribir en ellos
//    mezclaría el Blend con la facturación del laboratorio, y por eso
//    `verificarEsquemaFlujoCaja()` comprueba a qué tabla apunta cada vínculo.
//  - `Cantidad Kg` es un número SIN decimales (heredado): 997,79 kg se ve 998.
//  - Las cédulas son campo NÚMERO: una con letras se omite (va en Observaciones).
// Sin `Precio por Kg`, la línea vale 0: el precio del catálogo (Sirius Product
// Core, `Precio Venta Unitario`) es obligatorio y sin él no se escribe.
//
// Idempotente por `Numero Remision`: repetir actualiza la misma fila (y su línea
// de producto) en vez de duplicarla. Se accede por NOMBRE de campo.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';
import { construirDatosPdf } from './blend-remision-pdf';
import type { RemisionBlend } from './blend-remisiones-core';
import { sanearError } from './log-seguro';
import { ESTADO_REMISION } from './remisiones-core';
import type { StepResult } from '@/types/step-result';

const AT = 'https://api.airtable.com/v0';

/** Los nombres de campo que se escriben. Un renombre en Flujo de caja se corrige aquí. */
export const CAMPOS_FLUJO_CAJA = {
  remision: {
    fecha: 'Fecha Creacion',
    documento: 'Documento Remisión',
    numero: 'Numero Remision',
    responsableEntrega: 'Nombre Responsable Entrega',
    cliente: 'Nombre Cliente',
    codigoCliente: 'Código Cliente',
    nombreRecibe: 'Nombre Recibe',
    cedulaRecibe: 'Cedula Recibe',
    fechaRecibio: 'Fecha Recibio',
    nombreLleva: 'Nombre Lleva',
    cedulaLleva: 'Cedula Lleva',
    fechaLlevo: 'Fecha Llevo',
    observaciones: 'Observaciones Remisión',
    productos: 'Productos Remisiones Pirolisis',
  },
  producto: {
    fecha: 'Fecha Creacion',
    cantidad: 'Cantidad Kg',
    nombre: 'Producto',
    codigo: 'Código Producto',
    precio: 'Precio por Kg',
    remision: 'Remisión Pirolisis',
  },
} as const;

export interface ConfigFlujoCaja {
  baseId: string;
  token: string;
  remisionesTable: string;
  productosTable: string;
}

/** Las variables que faltan, por nombre (nunca su valor). */
export function faltantesFlujoCaja(): string[] {
  const a = config.airtable;
  return [
    !a.flujoCajaBaseId && 'AIRTABLE_FLUJO_CAJA_BASE_ID',
    !a.flujoCajaToken && 'AIRTABLE_FLUJO_CAJA_TOKEN',
    !a.flujoCajaRemisionesTable && 'AIRTABLE_FLUJO_CAJA_REMISIONES_PIROLISIS_TABLE',
    !a.flujoCajaProductosTable && 'AIRTABLE_FLUJO_CAJA_PRODUCTOS_REMISIONES_PIROLISIS_TABLE',
  ].filter((v): v is string => Boolean(v));
}

export function flujoCajaConfig(): ConfigFlujoCaja | null {
  if (faltantesFlujoCaja().length) return null;
  const a = config.airtable;
  return {
    baseId: a.flujoCajaBaseId!,
    token: a.flujoCajaToken!,
    remisionesTable: a.flujoCajaRemisionesTable!,
    productosTable: a.flujoCajaProductosTable!,
  };
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

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se escribe (puro)
// ─────────────────────────────────────────────────────────────────────────────

/** `SIRIUS-REM-0228` → 228. Es la llave de la fila en Flujo de caja. */
export function numeroRemision(codigo: string): number | null {
  const m = /^SIRIUS-REM-(\d+)$/.exec(codigo.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Una cédula para un campo número, o null si no cabe sin perder nada: con letras,
 * o con un cero adelante (el número se lo comería).
 */
export function cedulaNumerica(cedula: string | undefined): number | null {
  const limpia = String(cedula ?? '').replace(/[.\s,-]/g, '');
  if (!/^[1-9]\d{4,14}$/.test(limpia)) return null;
  const n = Number(limpia);
  return Number.isSafeInteger(n) ? n : null;
}

/** `YYYY-MM-DD` → mediodía de ese día en Bogotá, para que ningún huso lo corra de día ni de mes. */
function mediodiaBogota(fecha: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T12:00:00-05:00`).toISOString() : undefined;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface FilaFlujoCaja {
  numero: number;
  remision: Record<string, unknown>;
  producto: Record<string, unknown>;
}

/**
 * Las dos filas para una remisión. Puro: el precio y la URL del documento llegan
 * de afuera. Los campos sin dato se OMITEN, no se mandan vacíos: al actualizar,
 * una remisión todavía sin receptor no debe borrar nada.
 */
export function filasFlujoCaja(
  remision: RemisionBlend,
  o: { precioUnitario: number; urlDocumento?: string }
): FilaFlujoCaja {
  const numero = numeroRemision(remision.codigo);
  if (numero === null) throw new Error(`Código de remisión inesperado: ${remision.codigo}`);
  const d = construirDatosPdf(remision);
  const C = CAMPOS_FLUJO_CAJA;
  const fecha = mediodiaBogota(d.fecha_evento);
  const producto = d.producto ?? remision.productoNombre;
  const kg = r2(d.kg_total);

  const cedulaRecibe = cedulaNumerica(d.receptor?.cedula);
  const cedulaLleva = cedulaNumerica(d.transportista?.cedula);
  const fueraDeCampo = [
    d.receptor?.cedula && cedulaRecibe === null && `Cédula recibe: ${d.receptor.cedula}`,
    d.transportista?.cedula && cedulaLleva === null && `Cédula lleva: ${d.transportista.cedula}`,
  ].filter(Boolean);
  const lotes = remision.lotes.length > 1
    ? remision.lotes.map((l) => `${l.lote} (${l.kg} kg)`).join(', ')
    : remision.lote;
  const personal = remision.personas.map((p) => p.codigo).filter(Boolean);

  // El formato de la línea es el que ya usa `Remisiones Laboratorio`, para que
  // finanzas lea las dos tablas igual.
  const observaciones = [
    remision.codigo,
    remision.idPedido && `Pedido: ${remision.idPedido}`,
    'Área origen: Producción',
    `Productos: ${producto} ${kg} kg`,
    `Total: ${kg} kg`,
    `Estado: ${remision.estado}`,
    lotes && `Lotes: ${lotes}`,
    d.area_cliente && `Área cliente: ${d.area_cliente.nombre}`,
    d.observaciones,
    ...fueraDeCampo,
    personal.length && `Personal: ${personal.join(', ')}`,
  ].filter(Boolean).join(' | ');

  const fila: Record<string, unknown> = {
    [C.remision.numero]: numero,
    [C.remision.cliente]: d.cliente || remision.idCliente,
    [C.remision.observaciones]: observaciones,
  };
  if (fecha) fila[C.remision.fecha] = fecha;
  if (o.urlDocumento) fila[C.remision.documento] = o.urlDocumento;
  if (d.responsable_entrega) fila[C.remision.responsableEntrega] = d.responsable_entrega;
  if (remision.idCliente) fila[C.remision.codigoCliente] = remision.idCliente;
  if (d.receptor) fila[C.remision.nombreRecibe] = d.receptor.nombre;
  if (cedulaRecibe !== null) fila[C.remision.cedulaRecibe] = cedulaRecibe;
  if (d.fecha_recibido) fila[C.remision.fechaRecibio] = d.fecha_recibido;
  if (d.transportista) fila[C.remision.nombreLleva] = d.transportista.nombre;
  if (cedulaLleva !== null) fila[C.remision.cedulaLleva] = cedulaLleva;
  if (d.fecha_evento) fila[C.remision.fechaLlevo] = d.fecha_evento;

  const linea: Record<string, unknown> = {
    [C.producto.cantidad]: kg,
    [C.producto.nombre]: producto,
    [C.producto.codigo]: remision.productoId,
    [C.producto.precio]: o.precioUnitario,
  };
  if (fecha) linea[C.producto.fecha] = fecha;

  return { numero, remision: fila, producto: linea };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `Precio Venta Unitario` del catálogo (Sirius Product Core), o null. Un precio
 * en 0 cuenta como ausente: la línea valdría 0 y la venta desaparecería del
 * flujo de caja sin que nadie lo note.
 */
export async function precioCatalogo(codigoProducto: string): Promise<number | null> {
  const { productsBaseId, productsTableId, productsToken } = config.airtable;
  if (!productsBaseId || !productsTableId || !productsToken) {
    throw new Error('Sirius Product Core no configurado: AIRTABLE_PRODUCTS_BASE_ID / AIRTABLE_PRODUCTS_TABLE_ID');
  }
  const q = new URLSearchParams({
    filterByFormula: `{Codigo Producto} = '${escapeAirtableValue(codigoProducto)}'`,
    maxRecords: '1',
  });
  const data = await at(`${AT}/${productsBaseId}/${productsTableId}?${q}`, productsToken);
  const precio = Number(data.records?.[0]?.fields?.['Precio Venta Unitario']);
  return Number.isFinite(precio) && precio > 0 ? precio : null;
}

/**
 * ¿Los vínculos que se escriben apuntan a donde deben? Lanza con el detalle si
 * no. Es la defensa contra el clon del laboratorio: un vínculo con el nombre
 * correcto que apuntara a la tabla equivocada mezclaría ventas de dos áreas.
 */
export async function verificarEsquemaFlujoCaja(cfg: ConfigFlujoCaja): Promise<void> {
  const data = await at(`${AT}/meta/bases/${cfg.baseId}/tables`, cfg.token);
  const tablas = (data.tables ?? []) as { id: string; name: string; fields: { name: string; type: string; options?: { linkedTableId?: string } }[] }[];
  const rem = tablas.find((t) => t.id === cfg.remisionesTable);
  const prod = tablas.find((t) => t.id === cfg.productosTable);
  if (!rem || !prod) throw new Error('Flujo de caja: no se encontraron las tablas de remisiones o productos de pirólisis');

  const problemas: string[] = [];
  const revisar = (
    tabla: typeof rem,
    campos: Record<string, string>,
    vinculos: Record<string, string>
  ) => {
    for (const nombre of Object.values(campos)) {
      const f = tabla.fields.find((x) => x.name === nombre);
      if (!f) problemas.push(`${tabla.name}: falta el campo «${nombre}»`);
      else if (vinculos[nombre] && f.options?.linkedTableId !== vinculos[nombre]) {
        problemas.push(`${tabla.name}: «${nombre}» no apunta a la tabla esperada`);
      }
    }
  };
  revisar(rem, CAMPOS_FLUJO_CAJA.remision, { [CAMPOS_FLUJO_CAJA.remision.productos]: cfg.productosTable });
  revisar(prod, CAMPOS_FLUJO_CAJA.producto, { [CAMPOS_FLUJO_CAJA.producto.remision]: cfg.remisionesTable });
  if (problemas.length) throw new Error(`Esquema de Flujo de caja inesperado: ${problemas.join('; ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoFlujoCaja {
  accion: 'creada' | 'actualizada';
  recordId: string;
  lineaId: string;
}

/**
 * Crea o actualiza la remisión y su línea de producto. LANZA si algo falla.
 *
 * La línea se vincula desde el lado del PRODUCTO (`Remisión Pirolisis`), nunca
 * con un PATCH del link de la remisión: ese PATCH
 * reemplaza el array y se llevaría las líneas que finanzas haya agregado.
 */
export async function escribirRemisionFlujoCaja(cfg: ConfigFlujoCaja, filas: FilaFlujoCaja): Promise<ResultadoFlujoCaja> {
  const C = CAMPOS_FLUJO_CAJA;
  const base = `${AT}/${cfg.baseId}`;
  const q = new URLSearchParams({ filterByFormula: `{${C.remision.numero}} = ${filas.numero}`, maxRecords: '2' });
  const existentes = (await at(`${base}/${cfg.remisionesTable}?${q}`, cfg.token)).records ?? [];
  if (existentes.length > 1) {
    throw new Error(`Hay ${existentes.length} filas con Numero Remision ${filas.numero} en Flujo de caja: revisar a mano`);
  }

  let recordId: string;
  let accion: ResultadoFlujoCaja['accion'];
  let lineasPrevias: string[] = [];
  if (existentes.length) {
    recordId = existentes[0].id;
    accion = 'actualizada';
    lineasPrevias = (existentes[0].fields?.[C.remision.productos] as string[] | undefined) ?? [];
    await at(`${base}/${cfg.remisionesTable}/${recordId}`, cfg.token, {
      method: 'PATCH',
      body: JSON.stringify({ fields: filas.remision }),
    });
  } else {
    const creada = await at(`${base}/${cfg.remisionesTable}`, cfg.token, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: filas.remision }] }),
    });
    recordId = creada.records?.[0]?.id;
    if (!recordId) throw new Error('Airtable no devolvió el ID de la remisión creada en Flujo de caja');
    accion = 'creada';
  }

  // La línea del mismo producto se actualiza; si no está, se crea. Las demás
  // líneas (si finanzas agregó alguna) no se tocan.
  const nombre = filas.producto[C.producto.nombre];
  let lineaId: string | undefined;
  if (lineasPrevias.length) {
    const ids = new URLSearchParams({
      filterByFormula: `OR(${lineasPrevias.map((id) => `RECORD_ID() = '${escapeAirtableValue(id)}'`).join(',')})`,
    });
    const lineas = (await at(`${base}/${cfg.productosTable}?${ids}`, cfg.token)).records ?? [];
    lineaId = lineas.find((l: { fields?: Record<string, unknown> }) => l.fields?.[C.producto.nombre] === nombre)?.id;
  }
  if (lineaId) {
    await at(`${base}/${cfg.productosTable}/${lineaId}`, cfg.token, {
      method: 'PATCH',
      body: JSON.stringify({ fields: filas.producto }),
    });
  } else {
    const creada = await at(`${base}/${cfg.productosTable}`, cfg.token, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: { ...filas.producto, [C.producto.remision]: [recordId] } }] }),
    });
    lineaId = creada.records?.[0]?.id;
    if (!lineaId) throw new Error('Airtable no devolvió el ID de la línea creada en Flujo de caja');
  }
  return { accion, recordId, lineaId };
}

/** ¿Va a Flujo de caja? Solo las de PiroliApp ya despachadas: ni Borrador ni Cancelada. */
export function motivoParaOmitir(remision: RemisionBlend): string | null {
  if (remision.tipo === 'ajena') return 'no es una remisión de PiroliApp';
  if (remision.estado === ESTADO_REMISION.cancelada) return 'cancelada';
  if (remision.estado === ESTADO_REMISION.borrador) return 'despacho sin terminar (Borrador)';
  if (!remision.productoId) return 'sin producto';
  return null;
}

/** Para `Documento Remisión`: el PDF con sesión de PiroliApp, nunca una URL pública (lleva cédulas). */
export function urlDocumentoRemision(codigo: string): string | undefined {
  const base = config.recepcion.urlBase.replace(/\/+$/, '');
  return base ? `${base}/api/pirolisis/blend/remision/pdf?remision=${encodeURIComponent(codigo)}` : undefined;
}

/**
 * El paso `flujo_caja`, best-effort: nunca lanza. Sin configuración, `skipped`
 * fuera de producción y `ok:false` en producción, con las variables por nombre.
 */
export async function registrarRemisionFlujoCaja(remision: RemisionBlend): Promise<StepResult> {
  const step = 'flujo_caja';
  const omitir = motivoParaOmitir(remision);
  if (omitir) return { step, ok: true, skipped: true, detail: { motivo: omitir } };

  const cfg = flujoCajaConfig();
  if (!cfg) {
    const error = `Flujo de caja no configurado: falta ${faltantesFlujoCaja().join(', ')}`;
    return process.env.VERCEL_ENV === 'production' ? { step, ok: false, error } : { step, ok: true, skipped: true, error };
  }
  try {
    const precio = await precioCatalogo(remision.productoId);
    if (precio === null) {
      return { step, ok: false, error: `${remision.productoId} no tiene Precio Venta Unitario en el catálogo` };
    }
    const filas = filasFlujoCaja(remision, { precioUnitario: precio, urlDocumento: urlDocumentoRemision(remision.codigo) });
    const r = await escribirRemisionFlujoCaja(cfg, filas);
    return { step, ok: true, detail: { accion: r.accion, numero: filas.numero } };
  } catch (err) {
    return { step, ok: false, error: sanearError(err) };
  }
}
