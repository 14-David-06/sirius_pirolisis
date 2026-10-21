import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { mapaClientes } from '@/lib/pedidos-blend-core';
import {
  ESTADO_REMISION,
  leerPersonas,
  listarRemisionesCrudas,
  remisionesCoreConfig,
  TIPO_PERSONA,
  type PersonaRemision,
} from '@/lib/remisiones-core';
import {
  correoDeNotas,
  esEstadoRecibible,
  kgRemitidoDeRemision,
  recibidaDeNotas,
  type RemisionCruda,
} from '@/lib/remision-pirolisis.constants';
import { sanearError } from '@/lib/log-seguro';

// El panel de remisiones de la bodega: qué falta por recibir, qué se recibió por
// enlace y qué quedó a medias. Tres lecturas en total (Remisiones, Personas por
// lotes y el mapa de clientes), no una por remisión: 5 req/s por base.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VISTAS = ['por-recibir', 'recibidas', 'incompletas', 'todas'] as const;
type Vista = (typeof VISTAS)[number];

function documentoDe(r: RemisionCruda): 'emision' | 'recibida' | 'ninguno' {
  if (r.documentos.some((d) => d.endsWith('-recibida.pdf'))) return 'recibida';
  return r.documentos.length ? 'emision' : 'ninguno';
}

/**
 * «Incompleta» es lo que pide una acción del operador:
 *  - un Borrador (despacho a medias: [Completar] o [Anular]);
 *  - una recibida por enlace sin la marca del correo (Graph falló o se simuló:
 *    [Reenviar]) o sin el documento `-recibida.pdf`;
 *  - una por recibir sin ningún documento adjunto.
 */
function incompleta(r: RemisionCruda): boolean {
  if (r.estado === ESTADO_REMISION.borrador) return true;
  if (r.estado === ESTADO_REMISION.entregada && recibidaDeNotas(r.notas)) {
    return !correoDeNotas(r.notas) || documentoDe(r) !== 'recibida';
  }
  return esEstadoRecibible(r.estado) && documentoDe(r) === 'ninguno';
}

function enVista(r: RemisionCruda, vista: Vista): boolean {
  switch (vista) {
    case 'por-recibir':
      return esEstadoRecibible(r.estado);
    case 'recibidas':
      return r.estado === ESTADO_REMISION.entregada;
    case 'incompletas':
      return incompleta(r);
    default:
      return true;
  }
}

/** El de código mayor: una reapertura manual agrega otro, y vale el último. */
function ultimo(personas: PersonaRemision[], tipo: string): PersonaRemision | undefined {
  return personas
    .filter((p) => p.tipo === tipo)
    .sort((a, b) => b.codigo.localeCompare(a.codigo, 'es', { numeric: true }))[0];
}

/**
 * GET ?vista=por-recibir|recibidas|incompletas|todas (por defecto `por-recibir`).
 *
 * Con sesión. No devuelve cédulas ni correos: nombre y código del receptor, y
 * nombre y teléfono del transportista (para mandarle el enlace por WhatsApp).
 */
export async function GET(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const pedida = request.nextUrl.searchParams.get('vista') ?? 'por-recibir';
  if (!(VISTAS as readonly string[]).includes(pedida)) {
    return NextResponse.json({ error: `Vista no válida: use ${VISTAS.join(', ')}` }, { status: 400 });
  }
  const vista = pedida as Vista;

  try {
    remisionesCoreConfig();
  } catch (err) {
    return NextResponse.json({ error: sanearError(err) }, { status: 503 });
  }

  try {
    const remisiones = (await listarRemisionesCrudas({ soloPirolisis: true }))
      .filter((r) => enVista(r, vista))
      .sort((a, b) => b.numeracion - a.numeracion);
    // En serie: Personas vive en la misma base que Remisiones.
    const personas = await leerPersonas([...new Set(remisiones.flatMap((r) => r.personasIds))]);
    const clientes = await mapaClientes();
    const porId = new Map(personas.map((p) => [p.recordId, p]));

    return NextResponse.json(
      {
        remisiones: remisiones.map((r) => {
          const propias = r.personasIds.map((id) => porId.get(id)).filter((p): p is PersonaRemision => Boolean(p));
          const receptor = ultimo(propias, TIPO_PERSONA.receptor);
          const transportista = ultimo(propias, TIPO_PERSONA.transportista);
          const kg = kgRemitidoDeRemision(r);
          const recibidaEn = recibidaDeNotas(r.notas);
          return {
            codigo: r.codigo,
            recordId: r.recordId,
            producto: kg?.tipo ?? 'blend',
            estado: r.estado,
            idPedido: r.idPedido,
            idCliente: r.idCliente,
            cliente: clientes[r.idCliente] ?? r.idCliente,
            idAreaCliente: r.idAreaCliente,
            kg: kg?.kg ?? 0,
            fechaDespacho: r.fechaDespacho,
            fechaRecibido: r.fechaRecibido,
            recibidaPorEnlace: Boolean(recibidaEn),
            recibidaEn,
            receptor: receptor ? { nombre: receptor.nombre, codigo: receptor.codigo } : null,
            correoEnviadoEn: correoDeNotas(r.notas),
            documento: documentoDe(r),
            transportista: transportista
              ? { nombre: transportista.nombre, telefono: transportista.telefono.trim() || null }
              : null,
          };
        }),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[remisiones] lectura:', sanearError(err));
    return NextResponse.json({ error: 'No se pudieron leer las remisiones. Intente de nuevo.' }, { status: 503 });
  }
}
