// GET /api/carbon/ebiomas/resultados/:id
// Detalle de un cálculo específico (para reporte exportable)

import { NextRequest, NextResponse } from 'next/server';
import { Container } from '../../../../../../infrastructure/container';
import { handleApiError } from '../../../../../../middleware/error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'ID de resultado requerido',
      }, { status: 400 });
    }

    const useCase = Container.getGetResultadosEBiomasUseCase();
    const resultado = await useCase.obtenerPorId(id);

    if (!resultado) {
      return NextResponse.json({
        success: false,
        error: 'Resultado no encontrado',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: resultado,
    });

  } catch (error: unknown) {
    return handleApiError(error, 'GET /api/carbon/ebiomas/resultados/[id]');
  }
}
