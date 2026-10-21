/**
 * La recepción de una remisión, vista desde la bodega: el enlace con el que quien
 * recibe la confirma, cómo hacérselo llegar y qué remisiones siguen sin recibir.
 *
 * Reemplaza la firma en papel como la constancia de entrega (2026-10-21): el
 * receptor abre el enlace, escribe su cédula y confirma; la remisión pasa a
 * Entregada y le llega el PDF por correo con copia a adm@ y david@. La bodega no
 * guarda el enlace en ninguna parte —es determinista por día y lo emite el
 * servidor cada vez—, así que pedirlo de nuevo no invalida el anterior.
 */

'use client';

import { useEffect, useState } from 'react';
import { mensajeWhatsAppRecepcion, urlWhatsApp } from '@/lib/recepcion/textos';
import { fechaLegible } from '@/lib/fecha-bogota';
import { kg } from './comunes';
import {
  AvisoSesionVencida,
  BotonAccion,
  Chip,
  Modal,
  PasosConProblema,
  fecha,
  fechaHora,
  type StepResultUI,
} from './componentes';

/** El enlace de recepción como lo devuelven el despacho y `…/enlace`. */
export interface RecepcionUI {
  url: string;
  venceEl: string;
  /** null si el servidor no pudo dibujar el QR: el enlace sigue sirviendo. */
  qrDataUrl: string | null;
}

export const TEXTO_RECEPCION =
  'El receptor confirma la recepción con su cédula desde este enlace; al confirmar le llega la remisión por correo con copia a adm@ y david@.';

export function urlPdfRemision(codigo: string): string {
  return `/api/pirolisis/blend/remision/pdf?remision=${encodeURIComponent(codigo)}`;
}

/** Nombre comercial del producto, el mismo que imprime la remisión. */
export function nombreProducto(producto: string): string {
  return producto === 'biochar' || producto === 'Biochar' ? 'Biochar' : 'Biochar Blend';
}

// ─── Estado de la remisión ─────────────────────────────────────────────────────

const ESTADOS_REMISION: Record<string, { texto: string; icono: string; tono: string }> = {
  Pendiente: { texto: 'Pendiente', icono: '○', tono: 'bg-white/10 text-white/80 ring-white/20' },
  'En Tránsito': {
    texto: 'En tránsito · falta la recepción',
    icono: '➜',
    tono: 'bg-amber-500/15 text-amber-200 ring-amber-400/30',
  },
  Entregada: { texto: 'Entregada', icono: '✓', tono: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' },
  Cancelada: { texto: 'Anulada', icono: '✕', tono: 'bg-red-500/15 text-red-200 ring-red-400/30' },
  Borrador: {
    texto: 'Borrador · despacho incompleto',
    icono: '…',
    tono: 'bg-slate-700/60 text-white/70 ring-white/15',
  },
};

/** Siempre icono y texto: el color solo no lo distingue quien no ve bien los tonos. */
export function EstadoRemisionBadge({ estado }: { estado: string }) {
  const e = ESTADOS_REMISION[estado] ?? { texto: estado || '—', icono: '•', tono: 'bg-white/10 text-white/60 ring-white/20' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ${e.tono}`}>
      <span aria-hidden="true">{e.icono}</span>
      {e.texto}
    </span>
  );
}

const esPorRecibir = (estado: string) => estado === 'Pendiente' || estado === 'En Tránsito';

// ─── El enlace y cómo compartirlo ──────────────────────────────────────────────

/**
 * El QR, el enlace y las formas de hacérselo llegar a quien recibe.
 *
 * El mensaje de WhatsApp sale de `mensajeWhatsAppRecepcion`, que no recibe
 * cédulas ni nombres: se reenvía y queda en la vista previa del chat, y lo único
 * sensible es el enlace, que vence.
 */
export function BloqueRecepcion({
  recepcion,
  codigo,
  producto,
  kg: kgRemision,
  telefonoTransportista,
  nombreTransportista,
  whatsapp,
}: {
  recepcion: RecepcionUI | null;
  codigo: string;
  producto: string;
  kg: number;
  telefonoTransportista?: string | null;
  nombreTransportista?: string | null;
  /** Los enlaces ya armados por el servidor (`…/enlace`); si faltan se arman aquí. */
  whatsapp?: { url: string; urlTransportista: string | null };
}) {
  const [copiado, setCopiado] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);

  useEffect(() => {
    setPuedeCompartir(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const pdf = codigo ? (
    <a
      href={urlPdfRemision(codigo)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
    >
      Descargar remisión (PDF{recepcion ? ' con QR' : ''})
    </a>
  ) : null;

  if (!recepcion) {
    return (
      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-3 text-sm">
        <p className="text-amber-200">
          La confirmación por enlace no está configurada en este servidor, así que no hay enlace
          que compartir. La remisión sí quedó emitida.
        </p>
        {pdf}
      </div>
    );
  }

  const texto = mensajeWhatsAppRecepcion({
    codigo,
    producto: nombreProducto(producto),
    kg: kgRemision,
    venceEl: recepcion.venceEl,
    url: recepcion.url,
  });
  const urlTodos = whatsapp?.url ?? urlWhatsApp(texto);
  const urlTransportistaLocal = telefonoTransportista ? urlWhatsApp(texto, telefonoTransportista) : null;
  // `urlWhatsApp` cae al selector de contactos si el número no se puede leer, y
  // eso no es "al transportista": solo se ofrece si quedó con número.
  const urlTransportista =
    whatsapp?.urlTransportista ??
    (urlTransportistaLocal && /^https:\/\/wa\.me\/\d/.test(urlTransportistaLocal) ? urlTransportistaLocal : null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(recepcion.url);
      setCopiado(true);
    } catch {
      // Sin contexto seguro (http en la LAN) no hay portapapeles: se selecciona el
      // texto para que el operador lo copie a mano.
      const campo = document.getElementById(`enlace-${codigo}`) as HTMLInputElement | null;
      campo?.select();
      setCopiado(false);
    }
  };

  const compartir = async () => {
    try {
      await navigator.share({ title: `Remisión ${codigo}`, text: texto });
    } catch {
      // Cancelar el diálogo de compartir también rechaza: no es un error.
    }
  };

  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-3 text-sm text-white">
      <p className="font-medium">Enlace de recepción</p>
      <p className="text-white/70">{TEXTO_RECEPCION}</p>

      {recepcion.qrDataUrl ? (
        <img
          src={recepcion.qrDataUrl}
          alt={`Código QR para confirmar la recepción de ${codigo}`}
          width={240}
          height={240}
          className="mx-auto rounded-lg bg-white p-2"
        />
      ) : (
        <p className="text-xs text-amber-200">No se pudo dibujar el QR; el enlace de abajo sirve igual.</p>
      )}

      <p className="text-xs text-white/60">Vence el {fechaLegible(recepcion.venceEl)} (al terminar el día).</p>

      <div className="flex gap-2">
        <input
          id={`enlace-${codigo}`}
          readOnly
          value={recepcion.url}
          aria-label={`Enlace de recepción de ${codigo}`}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 font-mono text-xs text-white ring-1 ring-white/20"
        />
        <button
          type="button"
          onClick={copiar}
          className="shrink-0 rounded-lg bg-white/10 px-3 text-xs font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
        >
          Copiar
        </button>
      </div>
      <p aria-live="polite" className="text-xs text-emerald-200 min-h-[1rem]">
        {copiado ? 'Enlace copiado' : ''}
      </p>

      <div className="flex flex-wrap gap-2">
        {urlTransportista && (
          <a
            href={urlTransportista}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429]"
          >
            WhatsApp a {nombreTransportista?.trim() || 'quien lo lleva'}
          </a>
        )}
        <a
          href={urlTodos}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
        >
          Compartir por WhatsApp
        </a>
        {puedeCompartir && (
          <button
            type="button"
            onClick={compartir}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
          >
            Compartir…
          </button>
        )}
        {pdf}
      </div>
    </div>
  );
}

/**
 * La remisión recién emitida, de Blend o de biochar. No se cierra sola: el enlace
 * tiene que salir con el camión, y cerrar al emitir dejaba la remisión sin camino
 * al receptor.
 */
export function RemisionEmitida({
  codigo,
  mensaje,
  steps,
  recepcion,
  producto,
  kg: kgRemision,
  telefonoTransportista,
  nombreTransportista,
  onCerrar,
}: {
  codigo: string;
  mensaje: string;
  steps: StepResultUI[];
  recepcion: RecepcionUI | null;
  producto: string;
  kg: number;
  telefonoTransportista?: string | null;
  nombreTransportista?: string | null;
  onCerrar: () => void;
}) {
  return (
    <div className="space-y-4 text-sm text-white">
      <div className="rounded-xl bg-[#5A7836]/20 ring-1 ring-[#5A7836]/50 p-4">
        <p className="font-medium">{mensaje}</p>
        {codigo && (
          <p className="mt-1 text-white/70">
            Remisión <span className="font-mono">{codigo}</span> · {kg(kgRemision)} de{' '}
            {nombreProducto(producto)}
          </p>
        )}
      </div>

      <PasosConProblema steps={steps} />

      {codigo ? (
        <BloqueRecepcion
          recepcion={recepcion}
          codigo={codigo}
          producto={producto}
          kg={kgRemision}
          telefonoTransportista={telefonoTransportista}
          nombreTransportista={nombreTransportista}
        />
      ) : (
        <p className="text-xs text-amber-300">
          La remisión se emitió pero no se pudo leer su código. Búscala en Remisiones Core.
        </p>
      )}

      <BotonAccion onClick={onCerrar}>Cerrar</BotonAccion>
    </div>
  );
}

// ─── Volver a pedir el enlace ──────────────────────────────────────────────────

interface RespuestaEnlace extends RecepcionUI {
  codigo: string;
  estado: string;
  whatsapp: { texto: string; url: string; urlTransportista: string | null };
}

/**
 * El enlace de una remisión ya emitida, pedido de nuevo (`POST …/enlace`): para
 * cuando el conductor perdió el mensaje o el papel se mojó.
 */
export function PanelEnlaceRecepcion({
  codigo,
  producto,
  kg: kgRemision,
  nombreTransportista,
  onCerrar,
}: {
  codigo: string;
  producto: string;
  kg: number;
  nombreTransportista?: string | null;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<RespuestaEnlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);
  const [generando, setGenerando] = useState(true);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    setGenerando(true);
    setError(null);
    fetch(`/api/pirolisis/remisiones/${encodeURIComponent(codigo)}/enlace`, { method: 'POST' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!vigente) return;
        if (res.status === 401) {
          setSesionVencida(true);
          return;
        }
        if (res.status === 410) {
          setError(
            json.fechaRecibido
              ? `Ya fue recibida el ${fecha(json.fechaRecibido)}: no hay nada que confirmar.`
              : `La remisión está ${json.estado ?? 'cerrada'}: ya no se puede recibir.`
          );
          return;
        }
        if (!res.ok) {
          setError(json.error ?? `Error ${res.status}`);
          return;
        }
        setDatos(json as RespuestaEnlace);
      })
      .catch((err) => {
        if (vigente) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (vigente) setGenerando(false);
      });
    return () => {
      vigente = false;
    };
  }, [codigo, vuelta]);

  return (
    <div className="space-y-4 text-sm text-white">
      {sesionVencida && <AvisoSesionVencida para="emitir el enlace" />}

      {generando && !datos && (
        <div aria-busy="true" className="space-y-2">
          <div className="mx-auto h-[240px] w-[240px] rounded-lg bg-white/10 animate-pulse motion-reduce:animate-none" />
          <p className="text-center text-white/60">Generando enlace…</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}

      {datos && (
        <>
          <BloqueRecepcion
            recepcion={datos}
            codigo={datos.codigo}
            producto={producto}
            kg={kgRemision}
            nombreTransportista={nombreTransportista}
            whatsapp={{ url: datos.whatsapp.url, urlTransportista: datos.whatsapp.urlTransportista }}
          />
          <p className="text-xs text-white/50">
            Los enlaces anteriores siguen sirviendo hasta que vencen: generar uno nuevo no los anula.
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        {datos && (
          <BotonAccion onClick={() => setVuelta((n) => n + 1)} disabled={generando}>
            {generando ? 'Generando…' : 'Generar uno nuevo'}
          </BotonAccion>
        )}
        <BotonAccion onClick={onCerrar}>Cerrar</BotonAccion>
      </div>
    </div>
  );
}

// ─── Panel de remisiones ───────────────────────────────────────────────────────

/** Una fila de `GET /api/pirolisis/remisiones`. */
export interface RemisionListaUI {
  codigo: string;
  recordId: string;
  producto: 'blend' | 'biochar';
  estado: string;
  idPedido: string;
  idCliente: string;
  cliente: string;
  idAreaCliente: string;
  kg: number;
  fechaDespacho: string;
  fechaRecibido: string;
  recibidaPorEnlace: boolean;
  recibidaEn: string | null;
  receptor: { nombre: string; codigo: string } | null;
  correoEnviadoEn: string | null;
  documento: 'emision' | 'recibida' | 'ninguno';
  transportista: { nombre: string; telefono: string | null } | null;
}

type VistaRemisiones = 'por-recibir' | 'incompletas' | 'recibidas' | 'todas';

const VISTAS: Array<{ clave: VistaRemisiones; etiqueta: string; vacio: string }> = [
  { clave: 'por-recibir', etiqueta: 'Por recibir', vacio: 'Ninguna remisión por recibir.' },
  { clave: 'incompletas', etiqueta: 'Incompletas', vacio: 'Ninguna remisión pide una acción.' },
  { clave: 'recibidas', etiqueta: 'Recibidas', vacio: 'Ninguna remisión recibida todavía.' },
  { clave: 'todas', etiqueta: 'Todas', vacio: 'Ninguna remisión de pirólisis en el Core.' },
];

/**
 * Las remisiones de pirólisis (Blend y biochar) y su recepción: qué falta por
 * recibir, qué se recibió por enlace y si el correo salió.
 *
 * Cada vista se pide al servidor y no se filtra aquí: «incompleta» depende de las
 * marcas y del documento adjunto, y repetir esa regla en el navegador es como la
 * pestaña llegaría a contar distinto que el servidor.
 *
 * Usa su propio endpoint con sesión, aparte de `/api/pirolisis/pedidos`, que no la
 * exige: un 401 aquí no debe dejar la pantalla sin los pedidos.
 */
export function SeccionRemisiones({ recargar = 0 }: { recargar?: number }) {
  const [vista, setVista] = useState<VistaRemisiones>('por-recibir');
  const [remisiones, setRemisiones] = useState<RemisionListaUI[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [enlaceDe, setEnlaceDe] = useState<RemisionListaUI | null>(null);
  const [reenviarDe, setReenviarDe] = useState<RemisionListaUI | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    fetch(`/api/pirolisis/remisiones?vista=${vista}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!vigente) return;
        if (res.status === 401) {
          setSinSesion(true);
          setRemisiones(null);
          return;
        }
        setSinSesion(false);
        if (!res.ok) {
          setError(json.error ?? `Error ${res.status}`);
          setRemisiones(null);
          return;
        }
        setRemisiones(Array.isArray(json.remisiones) ? json.remisiones : []);
      })
      .catch((err) => {
        if (vigente) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [vista, recargar, vuelta]);

  const actual = VISTAS.find((v) => v.clave === vista)!;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Remisiones de pirólisis
        </h2>
        <span className="text-xs text-white/50">Blend y biochar · lo despachado con remisión</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {VISTAS.map((v) => (
          <Chip key={v.clave} activo={vista === v.clave} onClick={() => setVista(v.clave)}>
            {v.etiqueta}
            {vista === v.clave && remisiones && !cargando ? ` (${remisiones.length})` : ''}
          </Chip>
        ))}
      </div>

      {sinSesion ? (
        <Aviso401 />
      ) : cargando && !remisiones ? (
        <div
          aria-busy="true"
          aria-label="Cargando remisiones"
          className="mt-3 h-24 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
        />
      ) : error ? (
        <p className="mt-3 rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 p-4 text-sm text-amber-100">
          ⚠️ No se pudieron leer las remisiones ({error}). Los pedidos y el inventario de arriba
          siguen siendo válidos.
        </p>
      ) : !remisiones?.length ? (
        <p className="mt-3 rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-6 text-center text-sm text-white/50">
          {actual.vacio}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-white/10">
          <table className="w-full min-w-[920px] text-sm text-white">
            <thead className="bg-white/10 text-xs uppercase tracking-wider text-white/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Remisión</th>
                <th className="px-4 py-3 text-left font-medium">Pedido</th>
                <th className="px-4 py-3 text-left font-medium">Cliente</th>
                <th className="px-4 py-3 text-right font-medium">KG</th>
                <th className="px-4 py-3 text-left font-medium">Despachada</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Recepción</th>
                <th className="px-4 py-3 text-left font-medium">Correo</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {remisiones.map((r) => (
                <tr key={r.codigo} className="bg-white/[0.02] hover:bg-white/[0.06]">
                  <td className="px-4 py-3 whitespace-nowrap font-medium">
                    {r.codigo}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.producto === 'biochar'
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : 'bg-sky-500/15 text-sky-200'
                      }`}
                    >
                      {r.producto === 'biochar' ? 'Biochar' : 'Blend'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-white/70">{r.idPedido || '—'}</td>
                  <td className="px-4 py-3">{r.cliente || r.idCliente || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{kg(r.kg)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-white/60">{fecha(r.fechaDespacho)}</td>
                  <td className="px-4 py-3">
                    <EstadoRemisionBadge estado={r.estado} />
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {r.recibidaPorEnlace ? (
                      <>
                        {r.receptor?.nombre ?? 'Receptor'}
                        <span className="block text-xs text-white/50">{fechaHora(r.recibidaEn)}</span>
                      </>
                    ) : r.estado === 'Entregada' ? (
                      <span className="text-white/50">Por fuera del enlace</span>
                    ) : esPorRecibir(r.estado) ? (
                      'Pendiente'
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.correoEnviadoEn ? (
                      <span className="text-white/70">Enviado {fecha(r.correoEnviadoEn)}</span>
                    ) : r.recibidaPorEnlace ? (
                      <span className="text-amber-200" title="Se recibió por enlace pero no consta el correo">
                        No consta
                      </span>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {esPorRecibir(r.estado) && (
                        <button
                          type="button"
                          onClick={() => setEnlaceDe(r)}
                          className="rounded-lg bg-[#5A7836] px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap hover:bg-[#4a6429]"
                        >
                          Link de recepción
                        </button>
                      )}
                      {r.recibidaPorEnlace && (
                        <button
                          type="button"
                          onClick={() => setReenviarDe(r)}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap ring-1 ring-white/20 hover:bg-white/20"
                        >
                          Reenviar correo
                        </button>
                      )}
                      {r.estado === 'Borrador' ? (
                        <span className="text-xs text-white/50" title="Se completa o se anula desde su pedido">
                          Complétalo desde el pedido
                        </span>
                      ) : (
                        <a
                          href={urlPdfRemision(r.codigo)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
                        >
                          PDF
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {enlaceDe && (
        <Modal
          titulo={`Link de recepción · ${enlaceDe.codigo}`}
          descripcion="Quien recibe lo abre, escribe su cédula y confirma. La remisión pasa a Entregada y le llega el PDF por correo."
          onCerrar={() => setEnlaceDe(null)}
        >
          <PanelEnlaceRecepcion
            codigo={enlaceDe.codigo}
            producto={enlaceDe.producto}
            kg={enlaceDe.kg}
            nombreTransportista={enlaceDe.transportista?.nombre}
            onCerrar={() => setEnlaceDe(null)}
          />
        </Modal>
      )}

      {reenviarDe && (
        <ReenviarCorreo
          remision={reenviarDe}
          onCerrar={(cambio) => {
            setReenviarDe(null);
            if (cambio) setVuelta((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

function Aviso401() {
  return (
    <p className="mt-3 rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 p-4 text-sm text-amber-100">
      <a href="/login" className="font-medium underline">
        Inicia sesión
      </a>{' '}
      para ver las remisiones y sus enlaces. Los pedidos de arriba siguen cargando sin ella.
    </p>
  );
}

/**
 * Reenvío del comprobante a quien recibió. Pide confirmación porque el correo
 * sale a un tercero y a la copia interna: un clic de más es un correo de más, y
 * el servidor solo admite tres por hora por remisión.
 */
function ReenviarCorreo({
  remision,
  onCerrar,
}: {
  remision: RemisionListaUI;
  onCerrar: (cambio: boolean) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ mensaje: string; steps: StepResultUI[]; ok: boolean } | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);

  const reenviar = async () => {
    setEnviando(true);
    try {
      const res = await fetch(`/api/pirolisis/remisiones/${encodeURIComponent(remision.codigo)}/reenviar`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      const steps = (Array.isArray(json.steps) ? json.steps : []) as StepResultUI[];
      if (res.status === 401) {
        setSesionVencida(true);
        return;
      }
      if (res.status === 429) {
        const seg = Number(res.headers.get('Retry-After'));
        const minutos = Number.isFinite(seg) && seg > 0 ? Math.max(1, Math.ceil(seg / 60)) : null;
        setResultado({
          ok: false,
          steps: [],
          mensaje: minutos
            ? `Ya se reenvió hace poco. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`
            : 'Ya se reenvió hace poco. Espera unos minutos.',
        });
        return;
      }
      if (!res.ok && res.status !== 207) {
        setResultado({ ok: false, steps, mensaje: json.error ?? `Error ${res.status}` });
        return;
      }
      const para: string[] = Array.isArray(json.correo?.para) ? json.correo.para : [];
      setResultado({
        ok: res.status === 200,
        steps,
        mensaje:
          res.status === 207
            ? 'El correo se intentó pero un paso quedó a medias.'
            : json.correo?.soloCopia
              ? 'Reenviado solo a la copia interna (quien recibió no tiene correo registrado).'
              : json.correo?.estado === 'simulado'
                ? 'El correo se simuló (este servidor no envía correos reales): no le llegó a nadie.'
                : `Correo reenviado${para.length ? ` a ${para.join(', ')}` : ''}.`,
      });
    } catch (err) {
      setResultado({ ok: false, steps: [], mensaje: err instanceof Error ? err.message : String(err) });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Reenviar correo · ${remision.codigo}`}
      descripcion={`Se enviará el PDF firmado de ${remision.codigo} a quien recibió, con copia a adm@ y david@.`}
      onCerrar={() => onCerrar(Boolean(resultado))}
      bloqueado={enviando}
    >
      <div className="space-y-4 text-sm text-white">
        {sesionVencida && <AvisoSesionVencida para="reenviar el correo" />}
        {resultado && (
          <p role="status" className={resultado.ok ? 'text-emerald-200' : 'text-amber-200'}>
            {resultado.mensaje}
          </p>
        )}
        {resultado && <PasosConProblema steps={resultado.steps} />}
        <div className="flex flex-wrap gap-3">
          {!resultado && (
            <BotonAccion tono="primario" onClick={reenviar} disabled={enviando}>
              {enviando ? 'Reenviando…' : 'Reenviar'}
            </BotonAccion>
          )}
          <BotonAccion onClick={() => onCerrar(Boolean(resultado))} disabled={enviando}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </BotonAccion>
        </div>
      </div>
    </Modal>
  );
}
