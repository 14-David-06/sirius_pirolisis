import type { NextRequest } from 'next/server';
import { atenderPublica, confirmarRecepcion, type ConfirmarInput } from '@/lib/recepcion/recepcion';

// Pública y sin sesión: ESCRIBE (prueba de la autorización, persona receptora,
// remisión Entregada, documento) y manda el correo. Los destinatarios nunca salen
// del cuerpo: los decide el servidor. Ver `src/lib/recepcion/recepcion.ts`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Lecturas y escrituras en tres bases más Graph: holgura sobre el tope de 10 s.
export const maxDuration = 60;

/** POST {token, cedula, modo, nuevo?, correo?, autorizaDatos?, textoVersion?}. 10/h por IP y 5/15 min por enlace. */
export async function POST(request: NextRequest) {
  return atenderPublica(
    request,
    {
      ruta: 'confirmar',
      porIp: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
      porToken: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
    },
    (cuerpo, meta) => {
      const nuevo = cuerpo.nuevo && typeof cuerpo.nuevo === 'object' ? (cuerpo.nuevo as Record<string, unknown>) : null;
      const entrada: ConfirmarInput = {
        token: String(cuerpo.token ?? ''),
        cedula: String(cuerpo.cedula ?? ''),
        modo: cuerpo.modo as ConfirmarInput['modo'],
        nuevo: nuevo
          ? { nombre: String(nuevo.nombre ?? ''), celular: String(nuevo.celular ?? ''), correo: String(nuevo.correo ?? '') }
          : undefined,
        correo: typeof cuerpo.correo === 'string' ? cuerpo.correo : undefined,
        autorizaDatos: cuerpo.autorizaDatos === true,
        textoVersion: typeof cuerpo.textoVersion === 'string' ? cuerpo.textoVersion : undefined,
        meta,
      };
      return confirmarRecepcion(entrada);
    }
  );
}
