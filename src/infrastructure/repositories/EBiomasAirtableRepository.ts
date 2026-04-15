// src/infrastructure/repositories/EBiomasAirtableRepository.ts
// Adapter Airtable para operaciones de eBiomass (solo lectura sobre Viajes Biomasa, escritura en carbon_ebiomas_resultados)

import { IEBiomasRepository } from '../../domain/repositories/IEBiomasRepository';
import { EBiomasResultado, EBiomasConstantes } from '../../domain/entities/EBiomasCalculo';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const VIAJES_BIOMASA_TABLE_ID = process.env.CARBON_EBIOMAS_VIAJES_BIOMASA_TABLE_ID!;
const CARBON_RESULTADOS_TABLE = process.env.CARBON_EBIOMAS_RESULTADOS_TABLE_ID!;

export class EBiomasAirtableRepository implements IEBiomasRepository {
  private get headers() {
    return {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  async contarViajesPorPeriodo(fechaInicio: string, fechaFin: string, turnoId?: string | null): Promise<number> {
    let allRecords: any[] = [];
    let offset: string | undefined;

    // Construir fórmula de filtro por fecha
    // "Fecha Entrega" es el campo de fecha en Viajes Biomasa (fld0VDi1YqcsbOcKI)
    const filterParts: string[] = [
      `IS_AFTER({Fecha Entrega}, '${fechaInicio}')`,
      `IS_BEFORE({Fecha Entrega}, DATEADD('${fechaFin}', 1, 'days'))`,
    ];

    // Filtro opcional por turno
    if (turnoId) {
      filterParts.push(`FIND("${turnoId}", ARRAYJOIN({ID_Turno}))`);
    }

    const filterFormula = `AND(${filterParts.join(', ')})`;

    do {
      const params = new URLSearchParams({
        filterByFormula: filterFormula,
        'fields[]': 'Fecha Entrega',
        pageSize: '100',
      });
      if (offset) params.set('offset', offset);

      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${VIAJES_BIOMASA_TABLE_ID}?${params.toString()}`;

      const response = await fetch(url, {
        headers: this.headers,
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error consultando Viajes Biomasa:', errorText);
        throw new Error(`Error de Airtable: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    return allRecords.length;
  }

  async guardarResultado(resultado: Omit<EBiomasResultado, 'id' | 'created_at'>): Promise<EBiomasResultado> {
    const fields: Record<string, any> = {
      'fecha_inicio_periodo': resultado.fecha_inicio_periodo,
      'fecha_fin_periodo': resultado.fecha_fin_periodo,
      'turno_id': resultado.turno_id || '',
      'total_viajes': resultado.total_viajes,
      'litros_diesel': resultado.litros_diesel,
      'kg_diesel': resultado.kg_diesel,
      'emisiones_produccion_kg': resultado.emisiones_produccion_kg,
      'emisiones_combustion_kg': resultado.emisiones_combustion_kg,
      'emisiones_total_kg': resultado.emisiones_total_kg,
      'emisiones_total_ton': resultado.emisiones_total_ton,
      'constantes_usadas': JSON.stringify(resultado.constantes_usadas),
      'calculado_por': resultado.calculado_por,
    };

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_RESULTADOS_TABLE}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error guardando resultado eBiomass:', errorText);
      throw new Error(`Error de Airtable al guardar: ${response.status} - ${errorText}`);
    }

    const record = await response.json();
    return this.mapRecordToResultado(record);
  }

  async listarResultados(page: number, pageSize: number): Promise<{ resultados: EBiomasResultado[]; total: number }> {
    let allRecords: any[] = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({
        pageSize: '100',
      });
      if (offset) params.set('offset', offset);

      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_RESULTADOS_TABLE}?${params.toString()}`;

      const response = await fetch(url, {
        headers: this.headers,
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error listando resultados eBiomass:', errorText);
        throw new Error(`Error de Airtable: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    const total = allRecords.length;
    const start = (page - 1) * pageSize;
    const paginatedRecords = allRecords.slice(start, start + pageSize);

    return {
      resultados: paginatedRecords.map((r: any) => this.mapRecordToResultado(r)),
      total,
    };
  }

  async obtenerResultadoPorId(id: string): Promise<EBiomasResultado | null> {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_RESULTADOS_TABLE}/${id}`;

    const response = await fetch(url, {
      headers: this.headers,
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      const errorText = await response.text();
      throw new Error(`Error de Airtable: ${response.status} - ${errorText}`);
    }

    const record = await response.json();
    return this.mapRecordToResultado(record);
  }

  private mapRecordToResultado(record: any): EBiomasResultado {
    const fields = record.fields || {};
    let constantes: EBiomasConstantes;
    try {
      constantes = typeof fields['constantes_usadas'] === 'string'
        ? JSON.parse(fields['constantes_usadas'])
        : fields['constantes_usadas'] || {};
    } catch {
      constantes = {
        consumo_diesel_por_viaje: 0,
        densidad_diesel: 0,
        fe_produccion_diesel: 0,
        fe_combustion_diesel: 0,
      };
    }

    return {
      id: record.id,
      fecha_inicio_periodo: fields['fecha_inicio_periodo'] || '',
      fecha_fin_periodo: fields['fecha_fin_periodo'] || '',
      turno_id: fields['turno_id'] || null,
      total_viajes: fields['total_viajes'] || 0,
      litros_diesel: fields['litros_diesel'] || 0,
      kg_diesel: fields['kg_diesel'] || 0,
      emisiones_produccion_kg: fields['emisiones_produccion_kg'] || 0,
      emisiones_combustion_kg: fields['emisiones_combustion_kg'] || 0,
      emisiones_total_kg: fields['emisiones_total_kg'] || 0,
      emisiones_total_ton: fields['emisiones_total_ton'] || 0,
      constantes_usadas: constantes,
      calculado_por: fields['calculado_por'] || '',
      created_at: fields['created_at'] || record.createdTime || '',
    };
  }
}
