// POST /api/carbon/euse/preview
// Mismo cálculo eUse pero NO persiste — para vista en tiempo real.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Container } from '../../../../../infrastructure/container';
import { handleApiError } from '../../../../../middleware/error-handler';
import { EUseCalculadorError } from '../../../../../application/services/EUseCalculator';

const schema = z.object({
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
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

    const useCase = Container.getPreviewEUseUseCase();
    const resultado = await useCase.ejecutar(fecha_inicio, fecha_fin);

    return NextResponse.json({ success: true, data: resultado });
  } catch (error: unknown) {
    if (error instanceof EUseCalculadorError) {
      return NextResponse.json({
        success: false,
        error: error.message,
        remisiones_sin_distancia: error.remisionesSinMatch,
      }, { status: 422 });
    }
    return handleApiError(error, 'POST /api/carbon/euse/preview');
  }
}
