import type { NextRequest } from 'next/server';
import { atenderPublica, identificarReceptor } from '@/lib/recepcion/recepcion';

// Pública y sin sesión. La cédula se busca SOLO en el alcance del cliente de la
// remisión y la respuesta va enmascarada: el límite por enlace (huella del token)
// es lo que impide recorrer cédulas con un enlace filtrado rotando de IP.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST {token, cedula}. 30 por hora por IP y 10 cada 15 min por enlace. */
export async function POST(request: NextRequest) {
  return atenderPublica(
    request,
    {
      ruta: 'identificar',
      porIp: { windowMs: 60 * 60 * 1000, maxRequests: 30 },
      porToken: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
    },
    (cuerpo) => identificarReceptor(String(cuerpo.token ?? ''), String(cuerpo.cedula ?? ''))
  );
}
