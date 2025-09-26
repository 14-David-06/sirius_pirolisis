// src/app/api/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';

export async function GET(request: NextRequest) {
  try {
    const session = await ServerSessionManager.getSession(request);

    if (session) {
      return NextResponse.json({
        authenticated: true,
        user: session.user,
        loginTime: session.loginTime
      });
    } else {
      return NextResponse.json({
        authenticated: false
      }, { status: 401 });
    }
  } catch (error) {
    console.error('Error checking session:', error);
    return NextResponse.json(
      { authenticated: false, message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}