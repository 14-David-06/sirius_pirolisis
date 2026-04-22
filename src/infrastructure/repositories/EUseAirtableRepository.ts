// src/infrastructure/repositories/EUseAirtableRepository.ts
// Adapter Airtable eUse (Etapa 4):
//   - Lectura: Remisiones Baches Pirolisis + Detalle Cantidades + Clientes (cross-base)
//   - Escritura: carbon_euse_resultados

import { IEUseRepository } from '../../domain/repositories/IEUseRepository';
import {
  EUseResultado,
  EUseConstantes,
  EUseRemisionDetalle,
  EUseRemisionRaw,
  EUseClienteDistancia,
} from '../../domain/entities/EUseCalculo';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY!;

const REMISIONES_TABLE_ID = process.env.AIRTABLE_REMISIONES_BACHES_TABLE_ID!;
const REMISIONES_FECHA_FIELD_ID = process.env.AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID!;
const REMISIONES_CLIENTE_FIELD_ID = process.env.AIRTABLE_REMISIONES_CLIENTE_FIELD_ID!;
const REMISIONES_DETALLE_LINK_FIELD_ID = process.env.AIRTABLE_REMISIONES_DETALLE_CANTIDADES_FIELD_ID!;
const REMISIONES_NUMERO_FIELD_ID = process.env.AIRTABLE_REMISIONES_ID_FIELD_ID!;

const DETALLE_TABLE_ID = process.env.AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID!;
const DETALLE_CANTIDAD_FIELD_ID = process.env.AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID!;
const DETALLE_REMISION_LINK_FIELD_ID = process.env.AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID!;

// Cross-base: Sirius Clients Core
const CLIENTES_BASE_ID = process.env.AIRTABLE_CLIENTES_BASE_ID!;
const CLIENTES_TABLE_ID = process.env.AIRTABLE_CLIENTES_TABLE_ID!;
const CLIENTES_NOMBRE_FIELD_ID = process.env.AIRTABLE_CLIENTES_NOMBRE_FIELD_ID!;
const CLIENTES_DISTANCIA_FIELD_ID = process.env.AIRTABLE_CLIENTES_DISTANCIA_FIELD_ID!;
const CLIENTES_TOKEN = process.env.AIRTABLE_CLIENTES_TOKEN || AIRTABLE_TOKEN;

// Tabla destino
const CARBON_RESULTADOS_TABLE = process.env.CARBON_EUSE_RESULTADOS_TABLE_ID!;

interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
}

export class EUseAirtableRepository implements IEUseRepository {
  private headers(token: string = AIRTABLE_TOKEN): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchAll(
    baseId: string,
    tableId: string,
    params: URLSearchParams,
    token: string = AIRTABLE_TOKEN
  ): Promise<AirtableRecord[]> {
    const all: AirtableRecord[] = [];
    let offset: string | undefined;
    do {
      if (offset) params.set('offset', offset);
      else params.delete('offset');

      const url = `https://api.airtable.com/v0/${baseId}/${tableId}?${params.toString()}`;
      const response = await fetch(url, {
        headers: this.headers(token),
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Airtable ${response.status} sobre ${baseId}/${tableId}: ${errorText}`
        );
      }

      const data = await response.json();
      all.push(...(data.records || []));
      offset = data.offset;
    } while (offset);
    return all;
  }

  async listarRemisionesPorPeriodo(
    fechaInicio: string,
    fechaFin: string
  ): Promise<EUseRemisionRaw[]> {
    // Filtramos por Fecha Evento (campo date) — IS_AFTER/IS_BEFORE inclusivos por límites con DATEADD.
    const filterFormula =
      `AND(` +
      `IS_AFTER({${REMISIONES_FECHA_FIELD_ID}}, DATEADD('${fechaInicio}', -1, 'days')),` +
      `IS_BEFORE({${REMISIONES_FECHA_FIELD_ID}}, DATEADD('${fechaFin}', 1, 'days'))` +
      `)`;

    const remisionParams = new URLSearchParams({
      filterByFormula: filterFormula,
      pageSize: '100',
      returnFieldsByFieldId: 'true',
    });
    remisionParams.append('fields[]', REMISIONES_FECHA_FIELD_ID);
    remisionParams.append('fields[]', REMISIONES_CLIENTE_FIELD_ID);
    remisionParams.append('fields[]', REMISIONES_DETALLE_LINK_FIELD_ID);
    if (REMISIONES_NUMERO_FIELD_ID) {
      remisionParams.append('fields[]', REMISIONES_NUMERO_FIELD_ID);
    }

    const remisionRecords = await this.fetchAll(
      AIRTABLE_BASE_ID,
      REMISIONES_TABLE_ID,
      remisionParams
    );

    if (remisionRecords.length === 0) return [];

    // Agrupamos los IDs de detalle vinculados por remisión.
    const detalleIdsPorRemision = new Map<string, string[]>();
    const allDetalleIds = new Set<string>();
    for (const r of remisionRecords) {
      const ids = (r.fields[REMISIONES_DETALLE_LINK_FIELD_ID] as string[] | undefined) || [];
      detalleIdsPorRemision.set(r.id, ids);
      ids.forEach((id) => allDetalleIds.add(id));
    }

    // Cargar detalles en lotes (filterByFormula con OR(RECORD_ID()='id1',...)) en chunks de 50.
    const detalleCantidadPorId = new Map<string, number>();
    if (allDetalleIds.size > 0) {
      const idArray = Array.from(allDetalleIds);
      const CHUNK = 50;
      for (let i = 0; i < idArray.length; i += CHUNK) {
        const chunk = idArray.slice(i, i + CHUNK);
        const orExpr = chunk.map((id) => `RECORD_ID()='${id}'`).join(',');
        const params = new URLSearchParams({
          filterByFormula: `OR(${orExpr})`,
          pageSize: '100',
          returnFieldsByFieldId: 'true',
        });
        params.append('fields[]', DETALLE_CANTIDAD_FIELD_ID);
        params.append('fields[]', DETALLE_REMISION_LINK_FIELD_ID);

        const detalleRecords = await this.fetchAll(
          AIRTABLE_BASE_ID,
          DETALLE_TABLE_ID,
          params
        );
        for (const d of detalleRecords) {
          const cantidad = Number(d.fields[DETALLE_CANTIDAD_FIELD_ID]) || 0;
          detalleCantidadPorId.set(d.id, cantidad);
        }
      }
    }

    // Construir resultado
    return remisionRecords.map((r) => {
      const detalleIds = detalleIdsPorRemision.get(r.id) || [];
      const kg = detalleIds.reduce(
        (sum, id) => sum + (detalleCantidadPorId.get(id) || 0),
        0
      );
      const cliente = (r.fields[REMISIONES_CLIENTE_FIELD_ID] as string) || '';
      const fechaEvento = (r.fields[REMISIONES_FECHA_FIELD_ID] as string) || '';
      const numero = REMISIONES_NUMERO_FIELD_ID
        ? String(r.fields[REMISIONES_NUMERO_FIELD_ID] ?? '')
        : '';
      return {
        remision_id: r.id,
        remision_numero: numero,
        cliente,
        fecha_evento: fechaEvento,
        kg_despachados: kg,
      };
    });
  }

  async listarClientesConDistancia(): Promise<EUseClienteDistancia[]> {
    const params = new URLSearchParams({
      pageSize: '100',
      returnFieldsByFieldId: 'true',
    });
    params.append('fields[]', CLIENTES_NOMBRE_FIELD_ID);
    params.append('fields[]', CLIENTES_DISTANCIA_FIELD_ID);

    let records: AirtableRecord[];
    try {
      records = await this.fetchAll(
        CLIENTES_BASE_ID,
        CLIENTES_TABLE_ID,
        params,
        CLIENTES_TOKEN
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `No se pudo leer la base cross-base de Clientes (${CLIENTES_BASE_ID}). ` +
        `Verifica que AIRTABLE_TOKEN (o AIRTABLE_CLIENTES_TOKEN) tenga scope de lectura sobre esa base. Detalle: ${msg}`
      );
    }

    return records
      .map((r) => {
        const nombre = (r.fields[CLIENTES_NOMBRE_FIELD_ID] as string) || '';
        const distancia = Number(r.fields[CLIENTES_DISTANCIA_FIELD_ID]);
        return { nombre, distancia_km: Number.isFinite(distancia) ? distancia : NaN };
      })
      .filter((c) => c.nombre && Number.isFinite(c.distancia_km));
  }

  async guardarResultado(
    resultado: Omit<EUseResultado, 'id' | 'created_at'>
  ): Promise<EUseResultado> {
    const fields: Record<string, unknown> = {
      fecha_inicio_periodo: resultado.fecha_inicio_periodo,
      fecha_fin_periodo: resultado.fecha_fin_periodo,
      remisiones_analizadas: resultado.remisiones_analizadas,
      remisiones_liviano: resultado.remisiones_liviano,
      remisiones_pesado: resultado.remisiones_pesado,
      emisiones_liviano_kg: resultado.emisiones_liviano_kg,
      emisiones_pesado_kg: resultado.emisiones_pesado_kg,
      emisiones_total_kg: resultado.emisiones_total_kg,
      emisiones_total_ton: resultado.emisiones_total_ton,
      desglose_remisiones: JSON.stringify(resultado.desglose_remisiones),
      constantes_usadas: JSON.stringify(resultado.constantes_usadas),
      calculado_por: resultado.calculado_por,
    };

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_RESULTADOS_TABLE}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error guardando resultado eUse: ${response.status} - ${errorText}`);
    }

    const record = await response.json();
    return this.mapRecordToResultado(record);
  }

  async listarResultados(
    page: number,
    pageSize: number
  ): Promise<{ resultados: EUseResultado[]; total: number }> {
    const params = new URLSearchParams({ pageSize: '100' });
    const all = await this.fetchAll(AIRTABLE_BASE_ID, CARBON_RESULTADOS_TABLE, params);
    const total = all.length;
    const start = (page - 1) * pageSize;
    const slice = all.slice(start, start + pageSize);
    return {
      resultados: slice.map((r) => this.mapRecordToResultado(r)),
      total,
    };
  }

  async obtenerResultadoPorId(id: string): Promise<EUseResultado | null> {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_RESULTADOS_TABLE}/${id}`;
    const response = await fetch(url, {
      headers: this.headers(),
      next: { revalidate: 0 },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error de Airtable: ${response.status} - ${errorText}`);
    }
    return this.mapRecordToResultado(await response.json());
  }

  private mapRecordToResultado(record: AirtableRecord): EUseResultado {
    const f = record.fields || {};

    const parseJson = <T,>(value: unknown, fallback: T): T => {
      if (value == null || value === '') return fallback;
      if (typeof value !== 'string') return value as T;
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    };

    const constantes = parseJson<EUseConstantes>(f.constantes_usadas, {
      fe_euse_liviano: 0,
      fe_euse_pesado: 0,
      umbral_ton: 0,
    });
    const desglose = parseJson<EUseRemisionDetalle[]>(f.desglose_remisiones, []);

    return {
      id: record.id,
      fecha_inicio_periodo: (f.fecha_inicio_periodo as string) || '',
      fecha_fin_periodo: (f.fecha_fin_periodo as string) || '',
      remisiones_analizadas: Number(f.remisiones_analizadas) || 0,
      remisiones_liviano: Number(f.remisiones_liviano) || 0,
      remisiones_pesado: Number(f.remisiones_pesado) || 0,
      emisiones_liviano_kg: Number(f.emisiones_liviano_kg) || 0,
      emisiones_pesado_kg: Number(f.emisiones_pesado_kg) || 0,
      emisiones_total_kg: Number(f.emisiones_total_kg) || 0,
      emisiones_total_ton: Number(f.emisiones_total_ton) || 0,
      desglose_remisiones: desglose,
      constantes_usadas: constantes,
      calculado_por: (f.calculado_por as string) || '',
      created_at: (f.created_at as string) || record.createdTime || '',
    };
  }
}
