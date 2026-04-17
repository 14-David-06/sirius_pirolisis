// src/infrastructure/repositories/AforoAirtableRepository.ts
// Implementación del repositorio de aforos usando Airtable

import { config } from '../../lib/config';
import { Aforo, CreateAforoInput } from '../../domain/entities/Aforo';
import { IAforoRepository } from '../../domain/repositories/IAforoRepository';
import { LoggerService } from '../services/LoggerService';

const AIRTABLE_TOKEN = config.airtable.token;
const AIRTABLE_BASE_ID = config.airtable.baseId;
const AFOROS_TABLE = config.airtable.aforosTurnoTableId || 'aforos_turno';
const TURNOS_TABLE = config.airtable.turnosTableId || 'Turno Pirolisis';

export class AforoAirtableRepository implements IAforoRepository {
  private get headers() {
    return {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  private get baseUrl() {
    return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
  }

  async create(input: CreateAforoInput, realizaRegistro: string): Promise<Aforo> {
    // Calcular campos derivados antes de persistir
    const alimentacionPorHora = Math.round(input.alimentacionBiomasaMinuto * 60 * 100) / 100;
    const produccionPorHora = Math.round(input.produccionBiocharMinuto * 60 * 100) / 100;
    const rendimientoInstantaneo = input.alimentacionBiomasaMinuto > 0
      ? Math.round(((input.produccionBiocharMinuto / input.alimentacionBiomasaMinuto) * 100) * 100) / 100
      : 0;

    const fields: Record<string, unknown> = {
      'fldw2Sk5naTbVYYh3': new Date().toISOString(),
      'fldHXsnSj1TsQi3MM': [input.turnoId],
      'fldtBder1osm75Mn5': input.hertzTolva,
      'fldcJyD9TS6g1a5yP': input.alimentacionBiomasaMinuto,
      'fldAiDI9CTWizclGr': input.produccionBiocharMinuto,
      'fldzlwIq2WOS8tl7q': realizaRegistro,
      'fldtHvx4SywxoSkfv': alimentacionPorHora,
      'fldsfmQoAXAjYnNml': produccionPorHora,
      'fldl3QJO4n35xC9ns': rendimientoInstantaneo,
    };

    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(AFOROS_TABLE)}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        records: [{ fields }],
        typecast: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      LoggerService.error('Error al crear aforo en Airtable', new Error(errorText));
      throw new Error(`Error al crear aforo: ${errorText}`);
    }

    const result = await response.json();
    const record = result.records[0];
    return this.mapRecordToAforo(record);
  }

  async findByTurno(turnoId: string): Promise<Aforo[]> {
    const filterFormula = encodeURIComponent(`FIND("${turnoId}", ARRAYJOIN({ID_Turno}))`);
    let allRecords: any[] = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({
        filterByFormula: decodeURIComponent(filterFormula),
        'sort[0][field]': 'Fecha Hora Registro',
        'sort[0][direction]': 'desc',
        pageSize: '100',
      });
      if (offset) params.set('offset', offset);

      const url = `${this.baseUrl}/${encodeURIComponent(AFOROS_TABLE)}?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        LoggerService.error('Error al obtener aforos de Airtable', new Error(errorText));
        throw new Error(`Error al obtener aforos: ${errorText}`);
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    return allRecords.map((r: any) => this.mapRecordToAforo(r));
  }

  async delete(id: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/${encodeURIComponent(AFOROS_TABLE)}/${id}`,
      {
        method: 'DELETE',
        headers: this.headers,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      LoggerService.error('Error al eliminar aforo en Airtable', new Error(errorText));
      throw new Error(`Error al eliminar aforo: ${errorText}`);
    }

    return true;
  }

  async existeTurnoCerrado(): Promise<boolean> {
    const filterFormula = encodeURIComponent(`{Fecha Fin Turno} != BLANK()`);
    const url = `${this.baseUrl}/${encodeURIComponent(TURNOS_TABLE)}?filterByFormula=${filterFormula}&maxRecords=1&fields%5B%5D=Fecha%20Fin%20Turno`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      LoggerService.error('Error al verificar turnos cerrados', new Error(errorText));
      throw new Error(`Error al verificar turnos cerrados: ${errorText}`);
    }

    const data = await response.json();
    return (data.records?.length || 0) > 0;
  }

  private mapRecordToAforo(record: any): Aforo {
    const fields = record.fields;
    const alimentacionMin = fields['Alimentacion Biomasa Por Minuto (Kg)'] || 0;
    const produccionMin = fields['Produccion Biochar Por Minuto (Kg)'] || 0;

    // Rendimiento calculado — el valor canónico viene de la fórmula de Airtable
    const rendimientoAirtable = fields['Rendimiento Instantaneo (%)'];
    const rendimiento = rendimientoAirtable != null
      ? rendimientoAirtable
      : (alimentacionMin > 0 ? (produccionMin / alimentacionMin) * 100 : 0);

    return {
      id: record.id,
      fechaHoraRegistro: fields['Fecha Hora Registro'] || new Date().toISOString(),
      turnoId: Array.isArray(fields['ID_Turno']) ? fields['ID_Turno'][0] : fields['ID_Turno'] || '',
      hertzTolva: fields['Hertz Tolva'] || 0,
      alimentacionBiomasaMinuto: alimentacionMin,
      produccionBiocharMinuto: produccionMin,
      rendimientoInstantaneo: Math.round(rendimiento * 100) / 100,
      alimentacionBiomasaHora: fields['Alimentacion Biomasa Por Hora (Kg/h)'] || alimentacionMin * 60,
      produccionBiocharHora: fields['Produccion Biochar Por Hora (Kg/h)'] || produccionMin * 60,
      realizaRegistro: fields['Realiza Registro'] || '',
    };
  }
}
