import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import type { ActivoFijoRecord, EstadisticasActivos } from '@/types/activos';

const BASE_ID = config.airtable.activosCoreBaseId;
const TABLE_ID = config.airtable.activosFijosTableId;

export async function GET(request: NextRequest) {
  // Verificar configuración
  if (!BASE_ID || !TABLE_ID) {
    return NextResponse.json({
      error: 'Módulo de Activos Fijos no configurado'
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado'
      }, { status: 500 });
    }

    // Obtener todos los activos (sin filtros)
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?pageSize=100`;

    let allRecords: ActivoFijoRecord[] = [];
    let offset: string | undefined;

    do {
      const fetchUrl = offset ? `${url}&offset=${offset}` : url;

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Error de Airtable:', data);
        return NextResponse.json({
          error: data?.error?.type || 'Airtable error',
          details: data
        }, { status: response.status });
      }

      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    // Calcular estadísticas
    const estadisticas: EstadisticasActivos = {
      totalActivos: allRecords.length,
      operativos: 0,
      enReparacion: 0,
      asignados: 0,
      disponibles: 0,
      porVencer: 0,
      valorTotalAdquisicion: 0,
      porCategoria: {},
      porUbicacion: {},
      porArea: {},
    };

    allRecords.forEach((record) => {
      const fields = record.fields;

      // Estado Operativo
      const estado = fields['Estado Operativo'];
      if (estado === 'Operativo') estadisticas.operativos++;
      if (estado === 'En Reparación') estadisticas.enReparacion++;

      // Asignados vs Disponibles
      const responsable = fields['Responsable Asignado'];
      if (responsable && responsable.trim() !== '') {
        estadisticas.asignados++;
      } else if (estado === 'Operativo') {
        estadisticas.disponibles++;
      }

      // Próximos a vencer (< 30 días)
      const diasVencimiento = fields['Días para Vencimiento'];
      if (typeof diasVencimiento === 'number' && diasVencimiento > 0 && diasVencimiento <= 30) {
        estadisticas.porVencer++;
      }

      // Valor total
      const valor = fields['Valor de Adquisición'];
      if (typeof valor === 'number') {
        estadisticas.valorTotalAdquisicion += valor;
      }

      // Por Categoría
      const categorias = fields['Categoría'];
      if (Array.isArray(categorias)) {
        categorias.forEach((cat) => {
          if (typeof cat === 'string') {
            estadisticas.porCategoria[cat] = (estadisticas.porCategoria[cat] || 0) + 1;
          }
        });
      }

      // Por Ubicación
      const ubicaciones = fields['Ubicación Actual'];
      if (Array.isArray(ubicaciones)) {
        // Las ubicaciones vienen como array de record IDs, necesitamos los nombres
        // Por ahora contaremos por ID
        ubicaciones.forEach((ubic) => {
          if (typeof ubic === 'string') {
            estadisticas.porUbicacion[ubic] = (estadisticas.porUbicacion[ubic] || 0) + 1;
          }
        });
      }

      // Por Área
      const area = fields['Área Responsable'];
      if (typeof area === 'string' && area.trim() !== '') {
        estadisticas.porArea[area] = (estadisticas.porArea[area] || 0) + 1;
      }
    });

    console.log('📊 Estadísticas calculadas:', estadisticas.totalActivos, 'activos');

    return NextResponse.json({
      success: true,
      data: estadisticas
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/estadisticas:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
