// GET /api/carbon/epirolisis/resultados
// Lista histórico de cálculos ePirólisis con paginación

import { NextRequest, NextResponse } from 'next/server';
import { Container } from '../../../../../infrastructure/container';
import { handleApiError } from '../../../../../middleware/error-handler';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    const useCase = Container.getGetResultadosEPirolisisUseCase();
    const { resultados, total } = await useCase.listar(page, pageSize);

    return NextResponse.json({
      success: true,
      data: resultados,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });

  } catch (error: unknown) {
    return handleApiError(error, 'GET /api/carbon/epirolisis/resultados');
  }
}
