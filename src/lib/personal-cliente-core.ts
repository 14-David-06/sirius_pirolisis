// src/lib/personal-cliente-core.ts
//
// El personal de un cliente, leído de Sirius Clients Core (`Personal Cliente`).
//
// Quien recoge un pedido de Blend casi siempre es gente del cliente, y ya está
// registrada en el Core con su cédula. Digitarla otra vez en cada despacho es como
// terminan dos cédulas distintas para la misma persona en dos remisiones.
//
// ⚠️ El cruce va por el link `Personal Clientes` del registro del CLIENTE, no por
// una fórmula sobre `Cliente` en la tabla de personal: en una fórmula un link se
// evalúa como el texto del campo primario del vinculado (§3 de CLAUDE.md), y el
// primario de Clientes es una fórmula que no conviene dar por estable.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';

const AT = 'https://api.airtable.com/v0';

export interface PersonaCliente {
  recordId: string;
  /** Código legible de la persona en el Core. */
  codigo: string;
  nombre: string;
  cedula: string;
  cargo: string;
  email: string;
  telefono: string;
}

async function at(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Airtable GET ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

/**
 * El personal ACTIVO de un cliente `CL-XXXX`. `null` si Clients Core no está
 * configurado: la pantalla lo distingue de "el cliente no tiene personal".
 */
export async function listarPersonalCliente(idCliente: string): Promise<PersonaCliente[] | null> {
  const { clientesBaseId: base, clientesTableId, clientesPersonalTableId, clientesToken: token } =
    config.airtable;
  if (!base || !clientesTableId || !clientesPersonalTableId || !token) return null;

  const cliente = await at(
    `${AT}/${base}/${clientesTableId}?${new URLSearchParams({
      filterByFormula: `{ID} = '${escapeAirtableValue(idCliente)}'`,
      maxRecords: '1',
    })}`,
    token
  );
  const ids: string[] = cliente.records?.[0]?.fields?.['Personal Clientes'] ?? [];
  if (!ids.length) return [];

  // Una lectura para todos, no una por persona: 5 req/s por base.
  const personas: PersonaCliente[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const formula = `OR(${lote.map((id) => `RECORD_ID() = '${escapeAirtableValue(id)}'`).join(', ')})`;
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ filterByFormula: formula, pageSize: '100' });
      if (offset) params.set('offset', offset);
      const data = await at(`${AT}/${base}/${clientesPersonalTableId}?${params}`, token);
      for (const r of data.records ?? []) {
        const f = r.fields ?? {};
        // Sin estado cuenta como activo: varias filas viejas nunca lo tuvieron.
        if (String(f['Estado Personal'] ?? '') === 'Inactivo') continue;
        personas.push({
          recordId: r.id,
          codigo: String(f['Codigo Persona Cliente'] ?? ''),
          nombre: String(f['Nombre Completo'] ?? '').trim(),
          cedula: String(f['Cedula'] ?? '').trim(),
          cargo: String(f['Cargo'] ?? '').trim(),
          email: String(f['Email'] ?? f['Email Notificacion'] ?? '').trim(),
          telefono: String(f['Teléfono'] ?? '').trim(),
        });
      }
      offset = data.offset;
    } while (offset);
  }

  return personas
    .filter((p) => p.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
