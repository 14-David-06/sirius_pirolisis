import type { NextRequest } from 'next/server';
import { atenderPublica, consultarRecepcion } from '@/lib/recepcion/recepcion';

// Pública y sin sesión: la abre quien recibe, desde el QR o WhatsApp. El token
// viaja en el cuerpo (en la URL quedaría en logs y en el Referer) y se verifica
// antes de tocar Airtable. Ver `src/lib/recepcion/recepcion.ts`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST {token} → resumen sin datos personales. 60 cada 15 min por IP. */
export async function POST(request: NextRequest) {
  return atenderPublica(
    request,
    { ruta: 'consultar', porIp: { windowMs: 15 * 60 * 1000, maxRequests: 60 } },
    (cuerpo) => consultarRecepcion(String(cuerpo.token ?? ''))
  );
}
