// src/app/api/aforos/[id]/route.ts
// DELETE: Eliminar aforo — solo Admin/Supervisor

import { NextRequest, NextResponse } from 'next/server';
import { Container } from '@/infrastructure/container';
import { LoggerService } from '@/infrastructure/services/LoggerService';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'El ID del aforo es requerido',
      }, { status: 400 });
    }

    // Obtener info del usuario que elimina (enviado en body o headers)
    let eliminadoPor = 'Desconocido';
    try {
      const body = await request.json();
      eliminadoPor = body.eliminadoPor || 'Desconocido';
    } catch {
      // Si no hay body, usar default
    }

    const useCase = Container.getDeleteAforoUseCase();
    await useCase.ejecutar(id, eliminadoPor);

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    LoggerService.error('Error al eliminar aforo', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    }, { status: 500 });
  }
}
