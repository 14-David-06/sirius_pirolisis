// src/app/api/turnos/tipo-apertura/route.ts
// GET: Inferir tipo de apertura de turno (arranque vs continuidad)

import { NextRequest, NextResponse } from 'next/server';
import { Container } from '@/infrastructure/container';
import { LoggerService } from '@/infrastructure/services/LoggerService';

export async function GET(request: NextRequest) {
  try {
    const useCase = Container.getInferirTipoAperturaUseCase();
    const resultado = await useCase.ejecutar();

    return NextResponse.json({
      success: true,
      data: resultado,
    });
  } catch (error) {
    LoggerService.error('Error al inferir tipo de apertura', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    }, { status: 500 });
  }
}
