import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { assertCodigoSimbolico } from '@/lib/airtable-escape';
import { sanearError } from '@/lib/log-seguro';
import { checkRateLimit } from '@/middleware/rate-limit';
import { crearEnlaceRecepcion, recepcionConfigurada } from '@/lib/recepcion/enlace.server';
import { qrDataUrl } from '@/lib/recepcion/qr';
import { mensajeWhatsAppRecepcion, urlWhatsApp } from '@/lib/recepcion/textos';
import { huellaToken } from '@/lib/recepcion/token';
import { ESTADO_REMISION, leerPersonas, leerRemisionCruda, TIPO_PERSONA } from '@/lib/remisiones-core';
import {
  esEstadoRecibible,
  kgRemitidoDeRemision,
  NOMBRE_PRODUCTO,
  tipoRemision,
} from '@/lib/remision-pirolisis.constants';

// Emite (o vuelve a emitir) el enlace de recepción de una remisión, con su QR y el
// texto para WhatsApp. No se guarda en ningún lado: es determinista por día.
//
// Con sesión y, en producción, solo con la sesión FIRMADA (`recepcionConfigurada`
// lo exige): con la cookie sin firma cualquiera fabrica una sesión, y los códigos
// de remisión son consecutivos.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODIGO = /^SIRIUS-REM-\d{4,}$/;

/**
 * 30 enlaces cada 15 min por usuario, sin importar la remisión. `checkRateLimit`
 * antepone la ruta a la llave, y aquí la ruta lleva el código: se le pasa una ruta
 * fija para que el cupo sea del usuario y no de cada remisión.
 */
const RUTA_LIMITE = { nextUrl: { pathname: '/api/pirolisis/remisiones/enlace' } } as NextRequest;

export async function POST(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const usuario = session.user.id || session.user.Cedula || 'desconocido';
  const limite = checkRateLimit(RUTA_LIMITE, { windowMs: 15 * 60 * 1000, maxRequests: 30 }, `usuario:${usuario}`);
  if (!limite.allowed) {
    const segundos = Math.max(1, Math.ceil((limite.resetTime - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Demasiados enlaces emitidos. Espere unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(segundos) } }
    );
  }

  const { codigo: crudo } = await params;
  const codigo = decodeURIComponent(crudo ?? '').trim();
  try {
    assertCodigoSimbolico(codigo, 'código de remisión');
    if (!CODIGO.test(codigo)) throw new Error(`El código de remisión "${codigo}" no tiene un formato válido`);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Antes de leer nada: sin secreto, sin URL base o (en producción) sin sesión
  // firmada no hay enlace que emitir. El mensaje nombra la variable, nunca su valor.
  const configurada = recepcionConfigurada();
  if (!configurada.ok) {
    return NextResponse.json(
      { error: `Enlace de recepción no configurado: falta ${configurada.falta.join(', ')}` },
      { status: 503 }
    );
  }

  try {
    const r = await leerRemisionCruda(codigo);
    const tipo = r ? tipoRemision(r) : null;
    // Una del laboratorio es "no existe" para PiroliApp: no le emitimos enlaces.
    if (!r || !tipo) return NextResponse.json({ error: `No existe la remisión ${codigo}` }, { status: 404 });
    if (r.estado === ESTADO_REMISION.borrador) {
      return NextResponse.json(
        { error: 'La remisión está en Borrador: complete el despacho antes de compartir el enlace', estado: r.estado },
        { status: 409 }
      );
    }
    if (!esEstadoRecibible(r.estado)) {
      return NextResponse.json(
        {
          error: `La remisión está ${r.estado}: ya no se puede recibir`,
          estado: r.estado,
          fechaRecibido: r.fechaRecibido || null,
        },
        { status: 410 }
      );
    }

    const enlace = crearEnlaceRecepcion(r.recordId);
    if (!enlace) return NextResponse.json({ error: 'Enlace de recepción no configurado' }, { status: 503 });

    const personas = await leerPersonas(r.personasIds);
    const transportista = personas.find((p) => p.tipo === TIPO_PERSONA.transportista);
    const texto = mensajeWhatsAppRecepcion({
      codigo: r.codigo,
      producto: NOMBRE_PRODUCTO[tipo],
      kg: kgRemitidoDeRemision(r)?.kg ?? 0,
      venceEl: enlace.venceEl,
      url: enlace.url,
    });
    const telefono = transportista?.telefono?.trim();
    const urlTransportista = telefono ? urlWhatsApp(texto, telefono) : null;

    // Quién emitió qué, sin la credencial: la huella basta para seguir el enlace.
    console.info(
      '[enlace]',
      JSON.stringify({ codigo: r.codigo, usuario, huella: huellaToken(enlace.token), venceEl: enlace.venceEl })
    );

    return NextResponse.json(
      {
        codigo: r.codigo,
        estado: r.estado,
        url: enlace.url,
        venceEl: enlace.venceEl,
        qrDataUrl: await qrDataUrl(enlace.url),
        whatsapp: {
          texto,
          url: urlWhatsApp(texto),
          // Solo si el número se pudo leer: `urlWhatsApp` cae al selector de
          // contactos (`wa.me/?text=`) y eso no es "al transportista".
          urlTransportista: urlTransportista && /^https:\/\/wa\.me\/\d/.test(urlTransportista) ? urlTransportista : null,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[enlace]', sanearError(err));
    return NextResponse.json({ error: 'No se pudo emitir el enlace. Intente de nuevo.' }, { status: 503 });
  }
}
