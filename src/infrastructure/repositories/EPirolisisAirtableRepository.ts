// src/infrastructure/repositories/EPirolisisAirtableRepository.ts
// Adapter Airtable para operaciones de ePirólisis (Etapa 2)
// Solo lectura sobre Turno Pirolisis, Balances Masa, Baches Pirolisis, Manejo Residuos
// Escritura en carbon_epirolisis_resultados

import { IEPirolisisRepository } from '../../domain/repositories/IEPirolisisRepository';
import { EPirolisisResultado, EPirolisisDatosAgregados, EPirolisisConstantes } from '../../domain/entities/EPirolisisCalculo';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;

// Table IDs (solo lectura)
const TURNO_PIROLISIS_TABLE = process.env.CARBON_EPIROLISIS_TURNO_TABLE_ID!;
const BALANCES_MASA_TABLE = process.env.CARBON_EPIROLISIS_BALANCES_MASA_TABLE_ID!;
const MANEJO_RESIDUOS_TABLE = process.env.CARBON_EPIROLISIS_MANEJO_RESIDUOS_TABLE_ID!;

// Table ID (escritura)
const CARBON_EPIROLISIS_TABLE = process.env.CARBON_EPIROLISIS_RESULTADOS_TABLE_ID!;

export class EPirolisisAirtableRepository implements IEPirolisisRepository {
  private get headers() {
    return {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchAllRecords(tableId: string, filterFormula: string, fields: string[]): Promise<any[]> {
    let allRecords: any[] = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({ filterByFormula: filterFormula, pageSize: '100' });
      fields.forEach(f => params.append('fields[]', f));
      if (offset) params.set('offset', offset);

      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?${params.toString()}`;
      const response = await fetch(url, { headers: this.headers, next: { revalidate: 0 } });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable error (${tableId}): ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    return allRecords;
  }

  async obtenerDatosAgregados(fechaInicio: string, fechaFin: string, turnoId?: string | null): Promise<EPirolisisDatosAgregados> {
    // 1. Obtener turnos del período
    let turnoFilter: string;
    if (turnoId) {
      turnoFilter = `RECORD_ID() = "${turnoId}"`;
    } else {
      turnoFilter = `AND(IS_AFTER({Fecha Inicio Turno}, '${fechaInicio}'), IS_BEFORE({Fecha Inicio Turno}, DATEADD('${fechaFin}', 1, 'days')))`;
    }

    const turnos = await this.fetchAllRecords(
      TURNO_PIROLISIS_TABLE,
      turnoFilter,
      ['Fecha Inicio Turno', 'Total Energia Consumida', 'Total Biogas Consumido', 'Balances Masa', 'Manejo Residuos']
    );

    const turnos_analizados = turnos.length;

    // 2. Sumar kWh y m³ biogás
    let kwh_total = 0;
    let m3_biogas_total = 0;
    const balanceMasaIds: Set<string> = new Set();
    const manejoResiduosIds: Set<string> = new Set();

    for (const turno of turnos) {
      const fields = turno.fields || {};
      const energia = parseFloat(fields['Total Energia Consumida']) || 0;
      const biogas = parseFloat(fields['Total Biogas Consumido']) || 0;
      // Only count positive values (negative means fin < inicio, bad data)
      kwh_total += Math.abs(energia);
      m3_biogas_total += Math.abs(biogas);

      // Collect linked record IDs
      const balances = fields['Balances Masa'] || [];
      balances.forEach((id: string) => balanceMasaIds.add(id));

      const residuos = fields['Manejo Residuos'] || [];
      residuos.forEach((id: string) => manejoResiduosIds.add(id));
    }

    // 3. Count lonas = count of Balances Masa records linked to turnos
    const total_lonas = balanceMasaIds.size;

    // 4. Count distinct baches from Balances Masa → Baches Pirolisis
    let total_big_bags = 0;
    if (balanceMasaIds.size > 0) {
      const bacheIds: Set<string> = new Set();
      const balanceIdsArray = Array.from(balanceMasaIds);

      // Fetch balances masa in batches to get linked baches
      for (let i = 0; i < balanceIdsArray.length; i += 50) {
        const batch = balanceIdsArray.slice(i, i + 50);
        const orFormula = batch.map(id => `RECORD_ID() = "${id}"`).join(', ');
        const filter = batch.length === 1 ? orFormula : `OR(${orFormula})`;

        const balanceRecords = await this.fetchAllRecords(
          BALANCES_MASA_TABLE,
          filter,
          ['Baches Pirolisis']
        );

        for (const rec of balanceRecords) {
          const baches = rec.fields?.['Baches Pirolisis'] || [];
          baches.forEach((id: string) => bacheIds.add(id));
        }
      }
      total_big_bags = bacheIds.size;
    }

    // 5. Sum residuos kg from Manejo Residuos
    let total_residuos_kg = 0;
    if (manejoResiduosIds.size > 0) {
      const residuoIdsArray = Array.from(manejoResiduosIds);

      for (let i = 0; i < residuoIdsArray.length; i += 50) {
        const batch = residuoIdsArray.slice(i, i + 50);
        const orFormula = batch.map(id => `RECORD_ID() = "${id}"`).join(', ');
        const filter = batch.length === 1 ? orFormula : `OR(${orFormula})`;

        const residuoRecords = await this.fetchAllRecords(
          MANEJO_RESIDUOS_TABLE,
          filter,
          ['Cantidad Residuo KG']
        );

        for (const rec of residuoRecords) {
          total_residuos_kg += parseFloat(rec.fields?.['Cantidad Residuo KG']) || 0;
        }
      }
    }

    return {
      turnos_analizados,
      kwh_total,
      m3_biogas_total,
      total_big_bags,
      total_lonas,
      total_residuos_kg,
    };
  }

  async guardarResultado(resultado: Omit<EPirolisisResultado, 'id' | 'created_at'>): Promise<EPirolisisResultado> {
    const fields: Record<string, any> = {
      'fecha_inicio_periodo': resultado.fecha_inicio_periodo,
      'fecha_fin_periodo': resultado.fecha_fin_periodo,
      'turno_id': resultado.turno_id || '',
      'turnos_analizados': resultado.turnos_analizados,
      'kwh_total': resultado.kwh_total,
      'm3_biogas_total': resultado.m3_biogas_total,
      'total_big_bags': resultado.total_big_bags,
      'total_lonas': resultado.total_lonas,
      'total_residuos_kg': resultado.total_residuos_kg,
      'emisiones_electricidad_kg': resultado.emisiones_electricidad_kg,
      'emisiones_co2_biogenico_kg': resultado.emisiones_co2_biogenico_kg,
      'emisiones_ch4_kg': resultado.emisiones_ch4_kg,
      'emisiones_n2o_kg': resultado.emisiones_n2o_kg,
      'emisiones_big_bags_kg': resultado.emisiones_big_bags_kg,
      'emisiones_lonas_kg': resultado.emisiones_lonas_kg,
      'emisiones_residuos_kg': resultado.emisiones_residuos_kg,
      'emisiones_total_kg': resultado.emisiones_total_kg,
      'emisiones_total_ton': resultado.emisiones_total_ton,
      'constantes_usadas': JSON.stringify(resultado.constantes_usadas),
      'factores_pendientes': JSON.stringify(resultado.factores_pendientes),
      'calculado_por': resultado.calculado_por,
    };

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_EPIROLISIS_TABLE}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable save error: ${response.status} - ${errorText}`);
    }

    const record = await response.json();
    return this.mapRecordToResultado(record);
  }

  async listarResultados(page: number, pageSize: number): Promise<{ resultados: EPirolisisResultado[]; total: number }> {
    let allRecords: any[] = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({ pageSize: '100' });
      if (offset) params.set('offset', offset);

      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_EPIROLISIS_TABLE}?${params.toString()}`;
      const response = await fetch(url, { headers: this.headers, next: { revalidate: 0 } });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable error: ${response.status} - ${errorText}`);
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

  async obtenerResultadoPorId(id: string): Promise<EPirolisisResultado | null> {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CARBON_EPIROLISIS_TABLE}/${id}`;
    const response = await fetch(url, { headers: this.headers, next: { revalidate: 0 } });

    if (!response.ok) {
      if (response.status === 404) return null;
      const errorText = await response.text();
      throw new Error(`Airtable error: ${response.status} - ${errorText}`);
    }

    const record = await response.json();
    return this.mapRecordToResultado(record);
  }

  private mapRecordToResultado(record: any): EPirolisisResultado {
    const fields = record.fields || {};
    let constantes: EPirolisisConstantes;
    try {
      constantes = typeof fields['constantes_usadas'] === 'string'
        ? JSON.parse(fields['constantes_usadas'])
        : fields['constantes_usadas'] || {};
    } catch {
      constantes = { fe_electricidad: 0, fe_co2_biogas: 0, fe_ch4_biogas: 0, fe_n2o_biogas: 0, fe_big_bag: 0, fe_lona: 0, fe_residuo_kg: 0 };
    }

    let factores_pendientes: string[];
    try {
      factores_pendientes = typeof fields['factores_pendientes'] === 'string'
        ? JSON.parse(fields['factores_pendientes'])
        : fields['factores_pendientes'] || [];
    } catch {
      factores_pendientes = [];
    }

    return {
      id: record.id,
      fecha_inicio_periodo: fields['fecha_inicio_periodo'] || '',
      fecha_fin_periodo: fields['fecha_fin_periodo'] || '',
      turno_id: fields['turno_id'] || null,
      turnos_analizados: fields['turnos_analizados'] || 0,
      kwh_total: fields['kwh_total'] || 0,
      m3_biogas_total: fields['m3_biogas_total'] || 0,
      total_big_bags: fields['total_big_bags'] || 0,
      total_lonas: fields['total_lonas'] || 0,
      total_residuos_kg: fields['total_residuos_kg'] || 0,
      emisiones_electricidad_kg: fields['emisiones_electricidad_kg'] || 0,
      emisiones_co2_biogenico_kg: fields['emisiones_co2_biogenico_kg'] || 0,
      emisiones_ch4_kg: fields['emisiones_ch4_kg'] || 0,
      emisiones_n2o_kg: fields['emisiones_n2o_kg'] || 0,
      emisiones_big_bags_kg: fields['emisiones_big_bags_kg'] || 0,
      emisiones_lonas_kg: fields['emisiones_lonas_kg'] || 0,
      emisiones_residuos_kg: fields['emisiones_residuos_kg'] || 0,
      emisiones_total_kg: fields['emisiones_total_kg'] || 0,
      emisiones_total_ton: fields['emisiones_total_ton'] || 0,
      constantes_usadas: constantes,
      factores_pendientes: factores_pendientes,
      calculado_por: fields['calculado_por'] || '',
      created_at: record.createdTime || '',
    };
  }
}
