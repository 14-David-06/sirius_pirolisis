// POST /api/carbon/ebiomas/calcular
// Ejecuta el cálculo de eBiomass, guarda en carbon_ebiomas_resultados, retorna resultado

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Container } from '../../../../../infrastructure/container';
import { handleApiError } from '../../../../../middleware/error-handler';

const calcularSchema = z.object({
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  turno_id: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = calcularSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Datos de entrada inválidos',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const { fecha_inicio, fecha_fin, turno_id } = validation.data;

    // Validar que fecha_inicio <= fecha_fin
    if (new Date(fecha_inicio) > new Date(fecha_fin)) {
      return NextResponse.json({
        success: false,
        error: 'La fecha de inicio debe ser anterior o igual a la fecha de fin',
      }, { status: 400 });
    }

    // Obtener usuario de la sesión (si disponible)
    const calculado_por = body.calculado_por || 'Sistema';

    const useCase = Container.getCalcularEBiomasUseCase();
    const { resultado, guardado } = await useCase.ejecutar({
      fecha_inicio,
      fecha_fin,
      turno_id: turno_id || null,
      calculado_por,
    });

    return NextResponse.json({
      success: true,
      data: resultado,
      registro_id: guardado.id,
    });

  } catch (error: unknown) {
    return handleApiError(error, 'POST /api/carbon/ebiomas/calcular');
  }
}
