import { NextResponse } from 'next/server';
import { ActivosError, listarActivos } from '@/lib/activos.server';
import { DIAS_ALERTA_VENCIMIENTO } from '@/lib/activos.constants';
import type { EstadisticasActivos } from '@/types/activos';

/**
 * GET /api/activos/estadisticas — agregados de todo el parque de activos.
 *
 * La página de activos NO usa este endpoint: calcula sus indicadores sobre los
 * registros que ya cargó, así no hay dos consultas ni dos definiciones de
 * "disponible". Queda expuesto para tableros y consumidores externos.
 */
export async function GET() {
  try {
    const activos = await listarActivos();

    const estadisticas: EstadisticasActivos = {
      totalActivos: activos.length,
      operativos: 0,
      enReparacion: 0,
      enMantenimiento: 0,
      asignados: 0,
      disponibles: 0,
      porVencer: 0,
      vencidos: 0,
      incompletos: 0,
      valorTotalAdquisicion: 0,
      porCategoria: {},
      porUbicacion: {},
      porArea: {},
      porEstado: {},
    };

    for (const activo of activos) {
      const f = activo.fields;
      const estado = f.estado || 'Operativo';

      estadisticas.porEstado[estado] = (estadisticas.porEstado[estado] || 0) + 1;

      if (estado === 'Operativo') estadisticas.operativos++;
      if (estado === 'En Reparación') estadisticas.enReparacion++;
      if (estado === 'En Mantenimiento') estadisticas.enMantenimiento++;

      if (f.asignado) {
        estadisticas.asignados++;
      } else if (estado === 'Operativo' || estado === 'Disponible en Almacén') {
        estadisticas.disponibles++;
      }

      const dias = f.diasVencimiento;
      if (typeof dias === 'number') {
        if (dias < 0) estadisticas.vencidos++;
        else if (dias <= DIAS_ALERTA_VENCIMIENTO) estadisticas.porVencer++;
      }

      if (!f.completo) estadisticas.incompletos++;

      estadisticas.valorTotalAdquisicion += f.valorAdquisicion || 0;

      for (const categoria of f.categorias || []) {
        estadisticas.porCategoria[categoria] = (estadisticas.porCategoria[categoria] || 0) + 1;
      }

      // Por nombre de ubicación, no por record ID: antes el agregado devolvía
      // claves "rec…" que no significaban nada para quien lo consumiera.
      const ubicacion = f.ubicacion || 'Sin ubicación';
      estadisticas.porUbicacion[ubicacion] = (estadisticas.porUbicacion[ubicacion] || 0) + 1;

      const area = f.area || 'Sin área';
      estadisticas.porArea[area] = (estadisticas.porArea[area] || 0) + 1;
    }

    return NextResponse.json({ success: true, data: estadisticas }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      return NextResponse.json(
        { success: false, error: err.message, details: err.details },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/estadisticas:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
