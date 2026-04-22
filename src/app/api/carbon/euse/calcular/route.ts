// POST /api/carbon/euse/calcular
// Ejecuta cálculo eUse, persiste en carbon_euse_resultados y retorna desglose.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Container } from '../../../../../infrastructure/container';
import { handleApiError } from '../../../../../middleware/error-handler';
import { EUseCalculadorError } from '../../../../../application/services/EUseCalculator';

const schema = z.object({
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  calculado_por: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = schema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Datos de entrada inválidos',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const { fecha_inicio, fecha_fin } = validation.data;
    if (new Date(fecha_inicio) > new Date(fecha_fin)) {
      return NextResponse.json({
        success: false,
        error: 'La fecha de inicio debe ser anterior o igual a la fecha de fin',
      }, { status: 400 });
    }

    const calculado_por = validation.data.calculado_por || 'Sistema';

    const useCase = Container.getCalcularEUseUseCase();
    const { resultado, guardado } = await useCase.ejecutar({
      fecha_inicio, fecha_fin, calculado_por,
    });

    return NextResponse.json({
      success: true,
      data: resultado,
      registro_id: guardado.id,
    });
  } catch (error: unknown) {
    if (error instanceof EUseCalculadorError) {
      return NextResponse.json({
        success: false,
        error: error.message,
        remisiones_sin_distancia: error.remisionesSinMatch,
      }, { status: 422 });
    }
    return handleApiError(error, 'POST /api/carbon/euse/calcular');
  }
}
