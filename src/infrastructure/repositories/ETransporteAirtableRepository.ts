// src/infrastructure/repositories/ETransporteAirtableRepository.ts
// Adapter Airtable para operaciones de eTransporte (lectura de Baches Pirolisis, escritura en carbon_etransporte_resultados)

import { IETransporteRepository } from '../../domain/repositories/IETransporteRepository';
import { ETransporteResultado, ETransporteConstantes } from '../../domain/entities/ETransporteCalculo';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
const BACHES_TABLE_ID = process.env.AIRTABLE_BACHES_TABLE_ID!;
const CARBON_RESULTADOS_TABLE = process.env.CARBON_ETRANSPORTE_RESULTADOS_TABLE_ID!;

export class ETransporteAirtableRepository implements IETransporteRepository {
  private get headers() {
    return {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  async contarBachesPorPeriodo(fechaInicio: string, fechaFin: string): Promise<number> {
    let allRecords: any[] = [];
    let offset: string | undefined;

    // Filtrar baches por "Fecha Creacion" en Baches Pirolisis
    const filterFormula = `AND(IS_AFTER({Fecha Creacion}, '${fechaInicio}'), IS_BEFORE({Fecha Creacion}, DATEADD('${fechaFin}', 1, 'days')))`;

    do {
      const params = new URLSearchParams({
        filterByFormula: filterFormula,
        'fields[]': 'Fecha Creacion',
        pageSize: '100',
      });
      if (offset) params.set('offset', offset);

      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${BACHES_TABLE_ID}?${params.toString()}`;

      const response = await fetch(url, {
        headers: this.headers,
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error consultando Baches Pirolisis:', errorText);
        throw new Error(`Error de Airtable: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    return allRecords.length;
  }

  async guardarResultado(resultado: Omit<ETransporteResultado, 'id' | 'created_at'>): Promise<ETransporteResultado> {
    const fields: Record<string, any> = {
      'fecha_inicio_periodo': resultado.fecha_inicio_periodo,
      'fecha_fin_periodo': resultado.fecha_fin_periodo,
      'total_baches': resultado.total_baches,
      'total_viajes': resultado.total_viajes,
      'distancia_total_km': resultado.distancia_total_km,
      'litros_diesel': resultado.litros_diesel,
      'kg_diesel': resultado.kg_diesel,
      'emisiones_combustion_kg': resultado.emisiones_combustion_kg,
      'emisiones_upstream_kg': resultado.emisiones_upstream_kg,
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
      console.error('Error guardando resultado eTransporte:', errorText);
      throw new Error(`Error de Airtable al guardar: ${response.status} - ${errorText}`);
    }

    const record = await response.json();
    return this.mapRecordToResultado(record);
  }

  async listarResultados(page: number, pageSize: number): Promise<{ resultados: ETransporteResultado[]; total: number }> {
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
        console.error('Error listando resultados eTransporte:', errorText);
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

  async obtenerResultadoPorId(id: string): Promise<ETransporteResultado | null> {
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

  private mapRecordToResultado(record: any): ETransporteResultado {
    const fields = record.fields || {};
    let constantes: ETransporteConstantes;
    try {
      constantes = typeof fields['constantes_usadas'] === 'string'
        ? JSON.parse(fields['constantes_usadas'])
        : fields['constantes_usadas'] || {};
    } catch {
      constantes = {
        distancia_km_viaje: 0,
        consumo_L_km: 0,
        densidad_diesel: 0,
        fe_combustion: 0,
        fe_upstream: 0,
      };
    }

    return {
      id: record.id,
      fecha_inicio_periodo: fields['fecha_inicio_periodo'] || '',
      fecha_fin_periodo: fields['fecha_fin_periodo'] || '',
      total_baches: fields['total_baches'] || 0,
      total_viajes: fields['total_viajes'] || 0,
      distancia_total_km: fields['distancia_total_km'] || 0,
      litros_diesel: fields['litros_diesel'] || 0,
      kg_diesel: fields['kg_diesel'] || 0,
      emisiones_combustion_kg: fields['emisiones_combustion_kg'] || 0,
      emisiones_upstream_kg: fields['emisiones_upstream_kg'] || 0,
      emisiones_total_kg: fields['emisiones_total_kg'] || 0,
      emisiones_total_ton: fields['emisiones_total_ton'] || 0,
      constantes_usadas: constantes,
      calculado_por: fields['calculado_por'] || '',
      created_at: fields['created_at'] || record.createdTime || '',
    };
  }
}
