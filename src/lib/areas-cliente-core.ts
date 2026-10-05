// src/lib/areas-cliente-core.ts
//
// Las áreas de la organización de un cliente (Sanidad, Fertilización, Cultivo…),
// leídas de Sirius Clients Core (`Areas Cliente`).
//
// Un pedido de Blend no va "a GUAICARAMO": va a un área de GUAICARAMO, y es esa
// área la que lo recibe y lo aplica. Viven en Clients Core y no en una lista fija
// porque cada cliente se organiza distinto; una lista común terminaría mezclando
// las de todos. Pedidos y Remisiones Core las apuntan por `AC-XXXX` en
// `ID Area Cliente` (FK simbólica, §1 de CLAUDE.md).
//
// ⚠️ No confundir con `ID Area Core` de Pedidos Core: ese es un área INTERNA de
// Sirius (`SIRIUS-AREA-XXXX`, de Nómina Core).
//
// El cruce va por el link `Areas Cliente` del registro del CLIENTE, igual que el
// personal (ver `personal-cliente-core.ts`): una fórmula sobre el link se
// evaluaría contra el primario del cliente, que no conviene dar por estable.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';

const AT = 'https://api.airtable.com/v0';

export interface AreaCliente {
  recordId: string;
  /** `AC-XXXX`. */
  codigo: string;
  nombre: string;
}

async function at(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Airtable ${init.method ?? 'GET'} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function coreConfig() {
  const { clientesBaseId: base, clientesTableId, clientesAreasTableId, clientesToken: token } =
    config.airtable;
  if (!base || !clientesTableId || !clientesAreasTableId || !token) return null;
  return { base, clientesTableId, clientesAreasTableId, token };
}

async function recordCliente(
  cfg: NonNullable<ReturnType<typeof coreConfig>>,
  idCliente: string
) {
  const data = await at(
    `${AT}/${cfg.base}/${cfg.clientesTableId}?${new URLSearchParams({
      filterByFormula: `{ID} = '${escapeAirtableValue(idCliente)}'`,
      maxRecords: '1',
    })}`,
    cfg.token
  );
  return data.records?.[0] ?? null;
}

function mapArea(r: { id: string; fields?: Record<string, unknown> }): AreaCliente {
  const f = r.fields ?? {};
  return {
    recordId: r.id,
    codigo: String(f['ID'] ?? ''),
    nombre: String(f['Nombre Area'] ?? '').trim(),
  };
}

/**
 * Las áreas ACTIVAS de un cliente `CL-XXXX`. `null` si Clients Core no está
 * configurado: la pantalla lo distingue de "el cliente no tiene áreas".
 */
export async function listarAreasCliente(idCliente: string): Promise<AreaCliente[] | null> {
  const cfg = coreConfig();
  if (!cfg) return null;

  const cliente = await recordCliente(cfg, idCliente);
  const ids: string[] = cliente?.fields?.['Areas Cliente'] ?? [];
  if (!ids.length) return [];

  const areas: AreaCliente[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const formula = `OR(${lote.map((id) => `RECORD_ID() = '${escapeAirtableValue(id)}'`).join(', ')})`;
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ filterByFormula: formula, pageSize: '100' });
      if (offset) params.set('offset', offset);
      const data = await at(`${AT}/${cfg.base}/${cfg.clientesAreasTableId}?${params}`, cfg.token);
      for (const r of data.records ?? []) {
        if (String(r.fields?.['Estado Area'] ?? '') === 'Inactivo') continue;
        areas.push(mapArea(r));
      }
      offset = data.offset;
    } while (offset);
  }

  return areas
    .filter((a) => a.nombre && a.codigo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Un área por su código `AC-XXXX`, activa o no: una remisión vieja la sigue nombrando. */
export async function obtenerAreaCliente(codigo: string): Promise<AreaCliente | null> {
  const cfg = coreConfig();
  if (!cfg || !codigo) return null;
  const data = await at(
    `${AT}/${cfg.base}/${cfg.clientesAreasTableId}?${new URLSearchParams({
      filterByFormula: `{ID} = '${escapeAirtableValue(codigo)}'`,
      maxRecords: '1',
    })}`,
    cfg.token
  );
  const r = data.records?.[0];
  return r ? mapArea(r) : null;
}

/**
 * Crea un área para el cliente, o devuelve la que ya tenga ese nombre.
 *
 * Idempotente por nombre (sin distinguir mayúsculas ni espacios): el operador la
 * crea desde el despacho, y un doble clic o un reintento no deben dejar dos
 * "Sanidad" con códigos distintos, porque cada pedido apuntaría a una.
 */
export async function crearAreaCliente(
  idCliente: string,
  nombre: string,
  creadoPor?: string
): Promise<AreaCliente> {
  const cfg = coreConfig();
  if (!cfg) throw new Error('Sirius Clients Core no está configurado');

  const limpio = nombre.replace(/\s+/g, ' ').trim();
  if (!limpio) throw new Error('El nombre del área es obligatorio');

  const normal = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '');
  const existentes = (await listarAreasCliente(idCliente)) ?? [];
  const repetida = existentes.find((a) => normal(a.nombre) === normal(limpio));
  if (repetida) return repetida;

  const cliente = await recordCliente(cfg, idCliente);
  if (!cliente) throw new Error(`Cliente ${idCliente} no existe en Clients Core`);

  const creado = await at(`${AT}/${cfg.base}/${cfg.clientesAreasTableId}`, cfg.token, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        'Nombre Area': limpio,
        Cliente: [cliente.id],
        'Estado Area': 'Activo',
        ...(creadoPor ? { 'Creado Por ID': creadoPor } : {}),
      },
      typecast: false,
    }),
  });
  // El `ID` es una fórmula sobre el autonumber: ya viene calculado en la respuesta.
  return mapArea(creado);
}
