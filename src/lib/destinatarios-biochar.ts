// src/lib/destinatarios-biochar.ts
//
// A qué pedido y a qué cliente fue el biochar de cada Salida del libro mayor.
//
// ═══ SE DERIVA, NO SE GUARDA ══════════════════════════════════════════════════
// La Salida de biochar solo sabe su destino: el lote `BLEND-…` que lo consumió o
// la referencia `SAL-…` de una salida de bache. El pedido y el cliente ya están
// escritos en otra parte, y copiarlos al movimiento sería un segundo dato que
// puede divergir (§5 de CLAUDE.md). Hay tres caminos, según la época:
//
//   · Lote con remisión (desde 2026-09): Remisiones Core lleva `[lote:…]` en las
//     notas y, en sus campos, `ID Pedido` e `ID Cliente`.
//   · Lote histórico (abril y junio de 2026): NO tiene remisión. El cliente está
//     en la Salida de Blend reconstruida, `DESP-<lote>-CL-XXXX`. No tuvo pedido.
//   · Venta de biochar puro (desde 2026-10-21): el destino ES la remisión
//     `SIRIUS-REM-XXXX`, que en el Core lleva `[bache:…]` en las notas y, en sus
//     campos, `ID Pedido` e `ID Cliente`.
//   · Salida de bache (`SAL-…`): su remisión en `Remisiones Baches Pirolisis`,
//     marcada `[SALIDA:<ref>]`, dice quién recibió. No es un cliente de Clients
//     Core —una donación o un ensayo no lo son—, así que va el texto tal cual.
//
// Un lote producido para un pedido y todavía sin despachar se nombra con el
// cliente del pedido y `porDespachar`: el biochar ya salió de bodega, pero el
// Blend sigue ahí, y decir "despachado a" sería falso.
//
// Todo es best-effort: si una base no responde, la tabla se muestra sin esa
// columna, no se cae. Cada tabla se lee UNA vez y el cruce va en JS (rate limit).

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';
import { fetchAll, MOVIMIENTO_PROD_FIELDS } from './inventario-prod-core';
import { credencialesBlend } from './blend-inventario-core';
import { lotesDeNotas } from './blend-remisiones-core';
import { tipoRemision } from './remision-pirolisis.constants';
import { mapaClientes } from './pedidos-blend-core';

export interface Destinatario {
  /** `SIRIUS-PED-XXXX`, o vacío si la salida no tuvo pedido. */
  pedido: string;
  /** Nombre del cliente, o de quien recibió una salida de bache. */
  cliente: string;
  /** `SIRIUS-REM-XXXX` que despachó el lote. Varias si salió en tandas. */
  remisiones: string[];
  /** El lote es de un pedido pero todavía no tiene despacho. */
  porDespachar: boolean;
}

/** `BLEND-<fecha>-SIRIUS-PED-XXXX[-n]` → `SIRIUS-PED-XXXX`. */
const PEDIDO_DE_LOTE = /^BLEND-\d{4}-\d{2}-\d{2}-(SIRIUS-PED-\d+)(?:-\d+)?$/;
/** La Salida de Blend reconstruida de un despacho sin remisión. */
const DESPACHO_HISTORICO = /^DESP-(BLEND-.+)-(CL-\d+)$/;
const MARCA_SALIDA = /\[SALIDA:([^\]]+)\]/g;

/** Lo que las remisiones del Core dicen de un destino: a qué pedidos y clientes fue. */
export interface DatosLote {
  pedidos: Set<string>;
  clientes: Set<string>;
  remisiones: Set<string>;
}

/**
 * Indexa las remisiones del Core por el destino que sus Salidas llevan en
 * `produccion_destino_id`. PURO, para probarlo sin Airtable.
 *
 *   · `[lote:BLEND-…]` → el lote (una remisión de Blend puede llevar varios).
 *   · `[bache:…]`      → la propia remisión `SIRIUS-REM-XXXX`: en una venta de
 *                        biochar puro, ese es el destino de cada Salida.
 *
 * El `[bache:` solo cuenta en una remisión de pirólisis (`tipoRemision()`: Área
 * Producción y la marca antes de « — »): la tabla es compartida y una remisión
 * del laboratorio con esa marca escrita a mano no es una venta de biochar.
 */
export function indexarRemisionesPorDestino(
  registros: Array<{ fields: Record<string, unknown> }>
): Map<string, DatosLote> {
  const out = new Map<string, DatosLote>();
  const agregar = (destino: string, f: Record<string, unknown>) => {
    const d = out.get(destino) ?? { pedidos: new Set(), clientes: new Set(), remisiones: new Set() };
    const pedido = String(f['ID Pedido'] ?? '').trim();
    const cliente = String(f['ID Cliente'] ?? '').trim();
    const codigo = String(f['ID'] ?? '').trim();
    if (pedido) d.pedidos.add(pedido);
    if (cliente) d.clientes.add(cliente);
    if (codigo) d.remisiones.add(codigo);
    out.set(destino, d);
  };

  for (const r of registros) {
    const f = r.fields ?? {};
    const notas = String(f['Notas de Remisión'] ?? '');
    for (const { lote } of lotesDeNotas(notas, 0)) agregar(lote, f);

    const codigo = String(f['ID'] ?? '').trim();
    if (codigo && tipoRemision({ areaOrigen: String(f['Area Origen'] ?? ''), notas }) === 'biochar') {
      agregar(codigo, f);
    }
  }
  return out;
}

async function remisionesPorDestino(): Promise<Map<string, DatosLote>> {
  const { remisionesCoreBaseId: base, remisionesCoreToken: token, remisionesCoreRemisionesTable: tabla } =
    config.airtable;
  if (!base || !token || !tabla) return new Map();

  const registros = await fetchAll(base, tabla, token, {
    filterByFormula:
      `OR(FIND('[lote:', {Notas de Remisión}) > 0, FIND('[bache:', {Notas de Remisión}) > 0)`,
  });
  return indexarRemisionesPorDestino(registros);
}

/** Lote → `CL-XXXX` de los despachos históricos, que no tienen remisión. */
async function despachosHistoricos(): Promise<Map<string, string>> {
  const cred = credencialesBlend();
  const out = new Map<string, string>();
  if (!cred) return out;

  const f = MOVIMIENTO_PROD_FIELDS;
  const registros = await fetchAll(cred.base, cred.movimientos, cred.token, {
    filterByFormula: `AND({${f.productoId}} = '${escapeAirtableValue(cred.producto)}', {${f.tipoMovimiento}} = 'Salida')`,
  });
  for (const r of registros) {
    const m = String(r.fields[f.documentoReferencia] ?? '').match(DESPACHO_HISTORICO);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/** Pedido → `CL-XXXX`, para los lotes de un pedido que aún no se despachan. */
async function clientesDePedidos(pedidos: string[]): Promise<Map<string, string>> {
  const { pedidosCoreBaseId: base, pedidosCorePedidosTable: tabla, pedidosCoreToken: token } = config.airtable;
  const out = new Map<string, string>();
  if (!base || !tabla || !token || !pedidos.length) return out;

  const condiciones = pedidos.map((p) => `{ID Pedido Core} = '${escapeAirtableValue(p)}'`);
  const registros = await fetchAll(base, tabla, token, {
    filterByFormula: condiciones.length === 1 ? condiciones[0] : `OR(${condiciones.join(', ')})`,
  });
  for (const r of registros) {
    const codigo = String(r.fields['ID Pedido Core'] ?? '');
    const cliente = String(r.fields['ID Cliente Core'] ?? '');
    if (codigo && cliente) out.set(codigo, cliente);
  }
  return out;
}

/** Referencia `SAL-…` → quien recibió, según su remisión de bache. */
async function receptoresDeSalidas(): Promise<Map<string, string>> {
  const { baseId, token, remisionesBachesTableId: tabla, remisionesBachesFields: rf } = config.airtable;
  const out = new Map<string, string>();
  if (!baseId || !token || !tabla || !rf.observaciones) return out;

  // Por field ID porque así los guarda `config`: la respuesta normal viene por
  // NOMBRE y `fields[fieldId]` daría siempre undefined (§3 de CLAUDE.md).
  const registros = await fetchAll(baseId, tabla, token, {
    filterByFormula: `FIND('[SALIDA:', {${rf.observaciones}}) > 0`,
    returnFieldsByFieldId: 'true',
  });
  const texto = (r: { fields: Record<string, unknown> }, id?: string) =>
    id ? String(r.fields[id] ?? '').trim() : '';

  for (const r of registros) {
    // En una entrega el campo Cliente dice "Entrega sin contraprestación": el
    // nombre de quien se lo llevó está en Responsable Recibe.
    const quien = texto(r, rf.responsableRecibe) || texto(r, rf.cliente);
    if (!quien) continue;
    for (const m of texto(r, rf.observaciones).matchAll(MARCA_SALIDA)) out.set(m[1], quien);
  }
  return out;
}

function mejorEsfuerzo<T>(promesa: Promise<T>, vacio: T, que: string): Promise<T> {
  return promesa.catch((err) => {
    console.warn(`⚠️ No se pudo leer ${que} para los destinatarios del biochar:`, err);
    return vacio;
  });
}

/**
 * Destinatario de cada destino de Salida (`BLEND-…`, `SAL-…` o `SIRIUS-REM-…`).
 * Los destinos que no se pueden resolver no aparecen en el mapa.
 */
export async function destinatariosDeSalidas(destinos: string[]): Promise<Map<string, Destinatario>> {
  const unicos = [...new Set(destinos.filter(Boolean))];
  const pedidosDeLotes = [
    ...new Set(unicos.map((d) => d.match(PEDIDO_DE_LOTE)?.[1]).filter((p): p is string => !!p)),
  ];

  const [remitidos, historicos, receptores, clientePorPedido, nombres] = await Promise.all([
    mejorEsfuerzo(remisionesPorDestino(), new Map<string, DatosLote>(), 'Remisiones Core'),
    mejorEsfuerzo(despachosHistoricos(), new Map<string, string>(), 'los despachos de Blend'),
    mejorEsfuerzo(receptoresDeSalidas(), new Map<string, string>(), 'las remisiones de baches'),
    mejorEsfuerzo(clientesDePedidos(pedidosDeLotes), new Map<string, string>(), 'Pedidos Core'),
    mapaClientes(),
  ]);
  const nombre = (cl: string) => nombres[cl] ?? cl;

  const out = new Map<string, Destinatario>();
  for (const destino of unicos) {
    if (destino.startsWith('SAL-')) {
      const quien = receptores.get(destino);
      if (quien) out.set(destino, { pedido: '', cliente: quien, remisiones: [], porDespachar: false });
      continue;
    }

    if (destino.startsWith('SIRIUS-REM-')) {
      // Venta de biochar puro: la remisión ya despachó, no hay "por despachar".
      const remision = remitidos.get(destino);
      if (remision && (remision.clientes.size || remision.pedidos.size)) {
        out.set(destino, {
          pedido: [...remision.pedidos].join(', '),
          cliente: [...remision.clientes].map(nombre).join(', '),
          remisiones: [destino],
          porDespachar: false,
        });
      }
      continue;
    }

    const pedidoDelLote = destino.match(PEDIDO_DE_LOTE)?.[1] ?? '';
    const remitido = remitidos.get(destino);
    const historico = historicos.get(destino);

    let clientes: string[] = [];
    if (remitido?.clientes.size) clientes = [...remitido.clientes];
    else if (historico) clientes = [historico];
    else if (pedidoDelLote && clientePorPedido.has(pedidoDelLote)) clientes = [clientePorPedido.get(pedidoDelLote)!];

    const pedidos = remitido?.pedidos.size ? [...remitido.pedidos] : pedidoDelLote ? [pedidoDelLote] : [];
    if (!clientes.length && !pedidos.length) continue;

    out.set(destino, {
      pedido: pedidos.join(', '),
      cliente: clientes.map(nombre).join(', '),
      remisiones: remitido ? [...remitido.remisiones] : [],
      porDespachar: !remitido && !historico,
    });
  }
  return out;
}
