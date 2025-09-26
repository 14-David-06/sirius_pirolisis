// src/app/api/logout/route.ts
import { NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true, message: 'Logout exitoso' });

    // Destruir sesión
    await ServerSessionManager.destroySession(response);

    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    return NextResponse.json(
      { success: false, message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}