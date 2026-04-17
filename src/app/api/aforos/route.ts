// src/app/api/aforos/route.ts
// POST: Crear aforo | GET: Listar aforos por turno

import { NextRequest, NextResponse } from 'next/server';
import { Container } from '@/infrastructure/container';
import { CreateAforoSchema } from '@/domain/entities/Aforo';
import { LoggerService } from '@/infrastructure/services/LoggerService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validar input con Zod
    const validation = CreateAforoSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Datos de entrada inválidos',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const realizaRegistro = body.realizaRegistro;
    if (!realizaRegistro || typeof realizaRegistro !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'El campo realizaRegistro es requerido',
      }, { status: 400 });
    }

    const useCase = Container.getCreateAforoUseCase();
    const aforo = await useCase.ejecutar(validation.data, realizaRegistro);

    return NextResponse.json({
      success: true,
      data: aforo,
    });
  } catch (error) {
    LoggerService.error('Error al crear aforo', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const turnoId = searchParams.get('turno_id');

    if (!turnoId) {
      return NextResponse.json({
        success: false,
        error: 'El parámetro turno_id es requerido',
      }, { status: 400 });
    }

    const useCase = Container.getGetAforosByTurnoUseCase();
    const aforos = await useCase.ejecutar(turnoId);

    // Calcular rendimiento promedio
    const rendimientoPromedio = aforos.length > 0
      ? Math.round((aforos.reduce((sum, a) => sum + a.rendimientoInstantaneo, 0) / aforos.length) * 100) / 100
      : 0;

    return NextResponse.json({
      success: true,
      data: aforos,
      resumen: {
        totalAforos: aforos.length,
        rendimientoPromedio,
      },
    });
  } catch (error) {
    LoggerService.error('Error al obtener aforos', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    }, { status: 500 });
  }
}
