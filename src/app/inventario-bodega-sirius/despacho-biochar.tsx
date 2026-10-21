/**
 * Despacho COMERCIAL de biochar puro (SIRIUS-PRODUCT-0015) contra un pedido de
 * Sirius Pedidos Core.
 *
 * Es la venta del biochar, y por eso emite REMISIÓN, igual que el Blend. Lo que
 * sale sin venta —laboratorio, muestra, merma, entrega con acta— va por «Sacar sin
 * venta» y NO genera remisión. Mezclarlos es como quedaron kg de "muestra" con
 * destino "PEDIDO …": una venta escrita como salida no deja remisión, ni pedido
 * cumplido, ni constancia de recepción.
 *
 * El operador digita el TOTAL (decisión de David: "vamos a manejar todos los
 * totales"); el servidor lo reparte FIFO por bache, porque de qué bache salió
 * cada kg es lo que sostiene la contabilidad de carbono. El ensayo devuelve el
 * reparto y la llave `idDespacho`, y la confirmación los reenvía TAL CUAL:
 * recalcular caería en otros baches si el saldo se movió, y con la misma llave un
 * reintento completa la misma remisión en vez de emitir otra.
 */

'use client';

import { useEffect, useState } from 'react';
import { repartirSalidaFIFO } from '@/lib/salida-bache.constants';
import { fechaBogota } from '@/lib/fecha-bogota';
import { CAMPO, kg } from './comunes';
import {
  Aviso,
  AvisoSesionVencida,
  BotonAccion,
  CamposTransportista,
  Chip,
  EstadoPedidoBadge,
  PasosConProblema,
  SelectorAreaCliente,
  TRANSPORTISTA_VACIO,
  fecha,
  transportistaCompleto,
  transportistaIniciado,
  transportistaParaEnviar,
  useSesionServidor,
  usuarioActual,
  type AreaClienteUI,
  type PedidoBlend,
  type StepResultUI,
  type TransportistaUI,
} from './componentes';
import { RemisionEmitida, type RecepcionUI } from './recepcion';

/** Un pedido de biochar puro: el de Blend más lo que solo tiene el biochar. */
export interface PedidoBiocharUI extends PedidoBlend {
  producto?: string;
  /**
   * `SIRIUS-REM-XXXX` de un despacho que quedó en Borrador. Mientras exista, el
   * pedido no admite otro despacho: se completa o se anula.
   */
  despachoIncompleto: string | null;
}

/** Lo que devuelve el ensayo del despacho de biochar (`PlanDespachoBiochar`). */
export interface PlanDespachoBiocharUI {
  idDespacho: string;
  pedido: {
    codigo: string;
    cliente: string;
    idCliente: string;
    kgSolicitados: number;
    kgDespachados: number;
    kgPendientes: number;
  };
  areaCliente: { codigo: string; nombre: string } | null;
  kg: number;
  co2SecuestradoKg: number;
  reparto: Array<{
    bache: string;
    kg: number;
    saldoCore: number;
    comprometido: number;
    disponible: number;
    disponibleDespues: number;
    estadoActual: string;
    estadoNuevo: string | null;
  }>;
  biochar: {
    kgCore: number | null;
    kgBaches: number | null;
    divergencia: number | null;
    disponibleDespachable: number;
  };
  estadoPedidoResultante: 'Enviado' | 'Enviado Parcial';
  motivoParcial?: string;
  despachoIncompleto: { codigo: string; estado: string } | null;
  advertencias: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function postJson(url: string, cuerpo: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as Record<string, any> };
}

// ─── Sección de pedidos ────────────────────────────────────────────────────────

/** El id del título: «Despachar pedido» de la tarjeta lleva el foco aquí. */
export const ID_PEDIDOS_BIOCHAR = 'pedidos-biochar';

/**
 * Los pedidos de biochar puro, con su botón de despacho.
 *
 * El total pendiente y la comparación contra la bodega suman SOLO los pendientes,
 * esté el filtro donde esté: un cancelado sin despachar no es demanda.
 */
export function SeccionPedidosBiochar({
  pedidos,
  cargando,
  kgBodega,
  onDespachar,
  onCompletar,
}: {
  pedidos: PedidoBiocharUI[] | null;
  cargando: boolean;
  kgBodega: number | null;
  onDespachar: (p: PedidoBiocharUI) => void;
  onCompletar: (p: PedidoBiocharUI) => void;
}) {
  const [filtro, setFiltro] = useState<'todos' | 'pendientes'>('todos');
  const lista = pedidos ?? [];
  const pendientes = lista.filter((p) => p.pendiente);
  const totalPendiente = pendientes.reduce((s, p) => s + p.kgPendientes, 0);
  const visibles = filtro === 'pendientes' ? pendientes : lista;
  const sinBiochar = kgBodega !== null && kgBodega <= 0.01;
  // Un `null` tratado como 0 diría "falta todo" cuando lo que pasa es que no se sabe.
  const faltante = kgBodega === null ? null : Math.max(0, totalPendiente - kgBodega);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={ID_PEDIDOS_BIOCHAR}
          tabIndex={-1}
          className="text-xs font-semibold uppercase tracking-widest text-white/50 focus:outline-none focus-visible:text-white"
        >
          Pedidos de biochar puro
          {lista.length ? ` (${lista.length})` : ''}
        </h2>
        {!!lista.length && (
          <span className="text-xs text-white/50">
            {pendientes.length
              ? `${pendientes.length} pendiente(s) · faltan por despachar ${kg(totalPendiente)}`
              : 'Ninguno pendiente'}
          </span>
        )}
      </div>

      {cargando ? (
        <div
          aria-busy="true"
          aria-label="Cargando pedidos de biochar"
          className="mt-3 h-24 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
        />
      ) : pedidos === null ? (
        <Aviso>
          ⚠️ No se pudo leer Sirius Pedidos Core, así que no se sabe qué pedidos de biochar hay. El
          inventario de arriba sí es válido.
        </Aviso>
      ) : !lista.length ? (
        <p className="mt-3 rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-6 text-center text-sm text-white/50">
          Sirius Pedidos Core no tiene pedidos de Biochar (SIRIUS-PRODUCT-0015). Se crean en el CRM;
          cuando exista uno aparecerá aquí con su botón Despachar.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip activo={filtro === 'todos'} onClick={() => setFiltro('todos')}>
              Todos ({lista.length})
            </Chip>
            {!!pendientes.length && (
              <Chip
                activo={filtro === 'pendientes'}
                onClick={() => setFiltro('pendientes')}
                clase="bg-sky-500/15 text-sky-200 ring-sky-400/30"
              >
                Pendientes ({pendientes.length})
              </Chip>
            )}
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-white/10">
            <table className="w-full min-w-[760px] text-sm text-white">
              <thead className="bg-white/10 text-xs uppercase tracking-wider text-white/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Pedido</th>
                  <th className="px-4 py-3 text-left font-medium">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Solicitado</th>
                  <th className="px-4 py-3 text-right font-medium">Despachado</th>
                  <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibles.map((p) => (
                  <tr
                    key={`${p.recordId}-biochar`}
                    className={
                      p.pendiente
                        ? 'bg-white/[0.02] hover:bg-white/[0.06]'
                        : 'bg-white/[0.01] text-white/60 hover:bg-white/[0.05]'
                    }
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{p.codigo || '—'}</td>
                    <td className="px-4 py-3">{p.clienteNombre}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/60">{fecha(p.fecha)}</td>
                    <td className="px-4 py-3">
                      <EstadoPedidoBadge estado={p.estado} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.fuenteKg === 'sin-dato' ? (
                        <span className="text-amber-300" title="El pedido no tiene cantidad registrada en el Core">
                          sin dato
                        </span>
                      ) : (
                        kg(p.kgSolicitados)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/70">
                      {kg(p.kgDespachados)}
                      {!!p.remisiones.length && (
                        <span className="ml-2 text-xs text-white/40">{p.remisiones.join(', ')}</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        p.pendiente ? 'font-medium text-sky-200' : 'text-white/40'
                      }`}
                    >
                      {kg(p.kgPendientes)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.despachoIncompleto ? (
                        /* Un Borrador bloquea el pedido: ofrecer «Despachar» al lado
                           invitaría a un segundo despacho que el servidor rechaza. */
                        <button
                          type="button"
                          onClick={() => onCompletar(p)}
                          title={`El despacho ${p.despachoIncompleto} quedó a medias`}
                          className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-100 whitespace-nowrap ring-1 ring-amber-400/40 hover:bg-amber-500/30"
                        >
                          Completar despacho
                        </button>
                      ) : (
                        p.pendiente &&
                        p.kgPendientes > 0.01 && (
                          <div className="flex flex-col items-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => onDespachar(p)}
                              disabled={sinBiochar}
                              className="rounded-lg bg-[#5A7836] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#4a6429] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Despachar
                            </button>
                            {sinBiochar && <span className="text-xs text-white/40">Sin biochar en bodega</span>}
                          </div>
                        )
                      )}
                    </td>
                  </tr>
                ))}
                {!visibles.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-white/50">
                      Ningún pedido coincide con el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {faltante !== null && !!pendientes.length && (
            <p className="mt-2 text-xs text-white/50">
              {faltante > 0.01 ? (
                <>
                  Con {kg(kgBodega ?? 0)} de biochar en bodega faltan {kg(faltante)} para cubrir lo
                  pendiente.
                </>
              ) : (
                <>Los {kg(kgBodega ?? 0)} de biochar en bodega alcanzan para cubrir lo pendiente.</>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─── Formulario de despacho ────────────────────────────────────────────────────

type Resultado =
  | { tipo: 'emitida'; codigo: string; mensaje: string; steps: StepResultUI[]; recepcion: RecepcionUI | null; kg: number }
  | { tipo: 'fallo'; mensaje: string; steps: StepResultUI[]; codigo: string | null };

/**
 * El despacho de biochar de un pedido: total → ensayo → confirmación.
 *
 * Si el pedido tiene un despacho en Borrador, el formulario no ofrece otro: solo
 * [Completar] o [Anular] ese, porque el servidor rechazaría el nuevo con 409.
 */
export function FormDespachoBiochar({
  pedido,
  kgBodega,
  baches = [],
  onListo,
  onCancelar,
  onOcupado,
}: {
  pedido: PedidoBiocharUI;
  kgBodega: number;
  /** Solo para orientar mientras se digita: el reparto que manda es el del ensayo. */
  baches?: Array<{ codigo: string; kg: number }>;
  onListo: (mensaje: string) => void | Promise<void>;
  onCancelar: () => void;
  /** El diálogo se bloquea mientras se escribe: cerrarlo no detiene al servidor. */
  onOcupado?: (ocupado: boolean) => void;
}) {
  const sesion = useSesionServidor();
  const [sesionVencida, setSesionVencida] = useState(false);
  const [incompleto, setIncompleto] = useState<string | null>(pedido.despachoIncompleto);

  const [kgTexto, setKgTexto] = useState(() => {
    const sugerido = r2(Math.max(0, Math.min(pedido.kgPendientes, kgBodega)));
    return sugerido > 0 ? String(sugerido) : '';
  });
  const [responsable, setResponsable] = useState(() => usuarioActual());
  const [fechaDespacho, setFechaDespacho] = useState(() => fechaBogota());
  const [observaciones, setObservaciones] = useState('');
  const [area, setArea] = useState<AreaClienteUI | null>(null);
  const [transportista, setTransportista] = useState<TransportistaUI>(TRANSPORTISTA_VACIO);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDespachoBiocharUI | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    onOcupado?.(enviando);
  }, [enviando]);

  const vencida = sesion === 'vencida' || sesionVencida;
  const kgPedidos = Number(kgTexto);
  const kgValidos = Number.isFinite(kgPedidos) && kgPedidos > 0;
  const excedePedido = kgValidos && kgPedidos > pedido.kgPendientes + 0.005;
  const excedeBodega = kgValidos && kgPedidos > kgBodega + 0.005;
  const previa = kgValidos && !excedeBodega && baches.length ? repartirSalidaFIFO(baches, kgPedidos) : null;
  const transportistaOk = !transportistaIniciado(transportista) || transportistaCompleto(transportista);
  const responsableOk = responsable.trim().length >= 2;

  const motivoBloqueo = vencida
    ? 'Tu sesión venció.'
    : !kgValidos
      ? 'Falta cuántos kg se despachan.'
      : excedePedido
        ? `Al pedido solo le faltan ${kg(pedido.kgPendientes)}.`
        : excedeBodega
          ? `En bodega solo hay ${kg(kgBodega)}.`
          : !responsableOk
            ? 'Falta quién entrega.'
            : !transportistaOk
              ? 'Completa el nombre y la cédula de quien se lleva el pedido, o deja sus datos vacíos.'
              : null;

  const cuerpoBase = () => ({
    idPedido: pedido.codigo,
    responsableEntrega: responsable.trim(),
    transportista: transportistaIniciado(transportista) ? transportistaParaEnviar(transportista) : undefined,
    idAreaCliente: area?.codigo,
    fechaDespacho,
    observaciones: observaciones.trim() || undefined,
  });

  const ensayar = async () => {
    setError(null);
    setEnviando(true);
    try {
      const { status, json } = await postJson('/api/pirolisis/pedidos/despachar-biochar', {
        ...cuerpoBase(),
        kg: r2(kgPedidos),
        dryRun: true,
      });
      if (status === 401) {
        setSesionVencida(true);
        return;
      }
      if (status === 409 && json.despachoIncompleto?.codigo) {
        setIncompleto(json.despachoIncompleto.codigo);
        setError(json.error ?? null);
        return;
      }
      if (status !== 200 || !json.plan) {
        setError(json.error ?? `Error ${status}`);
        return;
      }
      setPlan(json.plan as PlanDespachoBiocharUI);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  /** Confirma ESE plan: el reparto y la llave van tal cual los devolvió el ensayo. */
  const confirmar = async () => {
    if (!plan) return;
    setError(null);
    setEnviando(true);
    try {
      const { status, json } = await postJson('/api/pirolisis/pedidos/despachar-biochar', {
        ...cuerpoBase(),
        kg: plan.kg,
        idDespacho: plan.idDespacho,
        reparto: plan.reparto.map(({ bache, kg: kgBache }) => ({ bache, kg: kgBache })),
        dryRun: false,
      });
      const steps = (Array.isArray(json.steps) ? json.steps : []) as StepResultUI[];
      if (status === 401) {
        setSesionVencida(true);
        return;
      }
      if (status === 200 || status === 207) {
        setResultado({
          tipo: 'emitida',
          codigo: json.remision?.codigo ?? '',
          mensaje: json.message ?? 'Remisión emitida.',
          steps,
          recepcion: json.recepcion ?? null,
          kg: Number(json.remision?.kg_total) || plan.kg,
        });
        return;
      }
      if (status === 500) {
        setResultado({
          tipo: 'fallo',
          mensaje: json.error ?? json.message ?? 'Falló un paso crítico del despacho.',
          steps,
          // `remision` viene null si no se pudo releer; el código viene aparte.
          codigo: json.remision?.codigo ?? json.codigoRemision ?? null,
        });
        return;
      }
      if (status === 409 && json.despachoIncompleto?.codigo) {
        setPlan(null);
        setIncompleto(json.despachoIncompleto.codigo);
        setError(json.error ?? null);
        return;
      }
      // 409 (el saldo o el pedido cambiaron), 400, 503: no se escribió nada.
      setError(json.error ?? `Error ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  if (incompleto) {
    return (
      <DespachoIncompleto
        codigo={incompleto}
        aviso={error}
        telefonoTransportista={transportista.telefono}
        nombreTransportista={transportista.nombre}
        onListo={onListo}
        onCancelar={onCancelar}
        onOcupado={setEnviando}
      />
    );
  }

  if (resultado?.tipo === 'emitida') {
    return (
      <RemisionEmitida
        codigo={resultado.codigo}
        mensaje={resultado.mensaje}
        steps={resultado.steps}
        recepcion={resultado.recepcion}
        producto="biochar"
        kg={resultado.kg}
        telefonoTransportista={transportista.telefono || null}
        nombreTransportista={transportista.nombre || null}
        onCerrar={() => onListo(resultado.mensaje)}
      />
    );
  }

  if (resultado?.tipo === 'fallo') {
    return (
      <div className="space-y-4 text-sm text-white">
        <div role="alert" className="rounded-xl bg-red-500/10 ring-1 ring-red-400/30 p-4">
          <p className="font-medium text-red-100">El despacho quedó incompleto</p>
          <p className="mt-1 text-red-100/80">{resultado.mensaje}</p>
          {resultado.codigo && (
            <p className="mt-1 text-xs text-red-100/60">
              La remisión <span className="font-mono">{resultado.codigo}</span> sigue en Borrador y
              bloquea el pedido hasta que se complete.
            </p>
          )}
        </div>
        <PasosConProblema steps={resultado.steps} />
        <p className="text-xs text-white/50">
          Reintentar reenvía el mismo plan con la misma clave: no emite otra remisión. Si la
          remisión quedó en Borrador, lleva a Completar, que escribe solo lo que falte.
        </p>
        {error && <p className="text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <BotonAccion tono="primario" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Reintentando…' : 'Reintentar'}
          </BotonAccion>
          <BotonAccion onClick={() => onListo(resultado.mensaje)} disabled={enviando}>
            Cerrar
          </BotonAccion>
        </div>
      </div>
    );
  }

  if (plan) {
    const faltaria = Math.max(0, plan.pedido.kgPendientes - plan.kg);
    return (
      <div className="space-y-4 text-sm text-white">
        {vencida && <AvisoSesionVencida />}
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-2">
          <p className="font-medium">Esto es lo que se va a escribir:</p>
          <p className="text-white/70">
            Pedido <span className="text-white">{plan.pedido.codigo}</span> · {plan.pedido.cliente}
            {plan.areaCliente && (
              <>
                {' '}
                · {plan.areaCliente.nombre} ({plan.areaCliente.codigo})
              </>
            )}
          </p>
          <p className="text-white/70">
            Salen <span className="text-white">{kg(plan.kg)}</span> de biochar
            {plan.reparto.length > 1 ? ` de ${plan.reparto.length} baches` : ''}, los más antiguos
            primero:
          </p>
          <ul className="space-y-0.5 pl-3 text-white/70" aria-label="Reparto por bache">
            {plan.reparto.map((b) => (
              <li key={b.bache}>
                <span className="text-white">{b.bache}</span> · {kg(b.kg)} de {kg(b.disponible)} · queda{' '}
                {kg(b.disponibleDespues)} · {b.estadoNuevo ?? b.estadoActual}
              </li>
            ))}
          </ul>
          <p className="text-white/70">
            {transportistaIniciado(transportista) ? (
              <>
                Se lo lleva <span className="text-white">{transportista.nombre.trim()}</span> · C.C.{' '}
                {transportista.cedula.trim()}
              </>
            ) : (
              <span className="text-amber-200">
                Sin transportista identificado: la remisión queda Pendiente.
              </span>
            )}
          </p>
          <p className="text-white/70">
            El pedido queda en <span className="text-white">{plan.estadoPedidoResultante}</span>
            {faltaria > 0.01 ? ` · le faltarían ${kg(faltaria)}` : ''}
          </p>
          <p className="text-xs text-white/50">
            Clave del despacho: <span className="font-mono text-white/70">{plan.idDespacho}</span>
            <span className="block">
              Si algo falla, reintentar con esta clave no descuenta dos veces.
            </span>
          </p>
        </div>

        {plan.motivoParcial && <Aviso>⚠️ {plan.motivoParcial}</Aviso>}
        {!!plan.advertencias?.length && (
          <Aviso>
            <ul className="space-y-1">
              {plan.advertencias.map((a) => (
                <li key={a}>⚠️ {a}</li>
              ))}
            </ul>
          </Aviso>
        )}

        <p className="text-xs text-white/50">
          Al confirmar: 1) sale el biochar de cada bache (libro mayor y fórmula), 2) se emite la
          remisión en Sirius Remisiones Core, 3) el pedido cambia de estado. Nada de esto se deshace
          desde acá.
        </p>

        {enviando && <p className="text-white/70">Despachando… no cierres esta ventana.</p>}
        {error && (
          <p role="alert" className="text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <BotonAccion tono="primario" onClick={confirmar} disabled={enviando || vencida}>
            {enviando ? 'Despachando…' : 'Confirmar despacho'}
          </BotonAccion>
          <BotonAccion
            onClick={() => {
              setPlan(null);
              setError(null);
            }}
            disabled={enviando}
          >
            Volver
          </BotonAccion>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!motivoBloqueo) ensayar();
      }}
      className="space-y-4 text-sm"
    >
      {vencida && <AvisoSesionVencida />}

      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 text-xs text-white/60 space-y-0.5">
        <p>
          <span className="text-white/80">{pedido.codigo}</span> · {pedido.clienteNombre}
        </p>
        <p>
          Pidió {kg(pedido.kgSolicitados)} · ya despachados {kg(pedido.kgDespachados)} · faltan{' '}
          <span className="text-sky-200">{kg(pedido.kgPendientes)}</span>
        </p>
      </div>

      <label className="block">
        <span className="text-white/70">KG a despachar (total)</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={kgTexto}
          onChange={(e) => setKgTexto(e.target.value)}
          required
          aria-invalid={excedePedido || excedeBodega || undefined}
          className={CAMPO}
        />
        <span className="mt-1 block text-xs text-white/50">
          En bodega hay {kg(kgBodega)}
          {baches.length ? ` en ${baches.length} baches` : ''}.{' '}
          {previa &&
            `Saldría de ${previa.map((b) => `${b.codigo} (${kg(b.kg)})`).join(', ')}: los baches más antiguos primero (aproximado; manda el ensayo).`}
        </span>
        {excedePedido && (
          <span className="mt-1 block text-xs text-red-300">
            Al pedido solo le faltan {kg(pedido.kgPendientes)}.
          </span>
        )}
        {excedeBodega && (
          <span className="mt-1 block text-xs text-red-300">En bodega solo hay {kg(kgBodega)}.</span>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-white/70">Entrega</span>
          <input value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CAMPO} />
        </label>
        <label className="block">
          <span className="text-white/70">Fecha de despacho</span>
          <input
            type="date"
            value={fechaDespacho}
            onChange={(e) => setFechaDespacho(e.target.value)}
            className={CAMPO}
          />
        </label>
      </div>

      <SelectorAreaCliente
        idCliente={pedido.idCliente}
        clienteNombre={pedido.clienteNombre}
        inicial={pedido.idAreaCliente ?? ''}
        valor={area?.codigo ?? ''}
        onCambio={setArea}
      />

      <CamposTransportista
        idCliente={pedido.idCliente}
        clienteNombre={pedido.clienteNombre}
        valor={transportista}
        onCambio={setTransportista}
      />

      <label className="block">
        <span className="text-white/70">Observaciones</span>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          maxLength={500}
          className={CAMPO}
        />
        <span className="mt-1 block text-xs text-white/50">Se imprime en la remisión: la ve el cliente.</span>
      </label>

      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={enviando || !!motivoBloqueo || sesion === 'verificando'}
          className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
        >
          {enviando ? 'Calculando…' : 'Ver qué se va a escribir'}
        </button>
        <BotonAccion onClick={onCancelar}>Cancelar</BotonAccion>
      </div>

      {/* Un botón apagado sin explicación se lee como que la app se rompió. */}
      {motivoBloqueo && <p className="text-xs text-white/50">{motivoBloqueo}</p>}
    </form>
  );
}

// ─── Despacho en Borrador ──────────────────────────────────────────────────────

/**
 * Un despacho que quedó a medias (la remisión en Borrador). Solo dos salidas:
 * completarlo —escribe lo que falte, seguro de repetir— o anularlo, que el
 * servidor permite solo si todavía no se escribió inventario.
 */
function DespachoIncompleto({
  codigo,
  aviso,
  telefonoTransportista,
  nombreTransportista,
  onListo,
  onCancelar,
  onOcupado,
}: {
  codigo: string;
  aviso: string | null;
  telefonoTransportista?: string;
  nombreTransportista?: string;
  onListo: (mensaje: string) => void | Promise<void>;
  onCancelar: () => void;
  onOcupado: (ocupado: boolean) => void;
}) {
  const [enviando, setEnviando] = useState<'completar' | 'anular' | null>(null);
  const [confirmarAnular, setConfirmarAnular] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);
  const [fallo, setFallo] = useState<StepResultUI[] | null>(null);
  const [emitida, setEmitida] = useState<{
    codigo: string;
    mensaje: string;
    steps: StepResultUI[];
    recepcion: RecepcionUI | null;
    kg: number;
  } | null>(null);

  const ejecutar = async (accion: 'completar' | 'anular') => {
    setError(null);
    setFallo(null);
    setEnviando(accion);
    onOcupado(true);
    try {
      const { status, json } = await postJson('/api/pirolisis/pedidos/despachar-biochar/completar', {
        remision: codigo,
        accion,
      });
      const steps = (Array.isArray(json.steps) ? json.steps : []) as StepResultUI[];
      if (status === 401) {
        setSesionVencida(true);
        return;
      }
      if (status === 200 || status === 207) {
        if (accion === 'anular') {
          await onListo(`Despacho ${codigo} anulado: el pedido queda libre para despacharse de nuevo.`);
          return;
        }
        setEmitida({
          codigo: json.remision?.codigo ?? codigo,
          mensaje: json.yaCompleto
            ? `El despacho ${codigo} ya estaba completo: no se escribió nada.`
            : `Despacho ${codigo} completado.`,
          steps,
          recepcion: json.recepcion ?? null,
          kg: Number(json.remision?.kg_total) || 0,
        });
        return;
      }
      setError(json.error ?? `Error ${status}`);
      if (status === 500) setFallo(steps);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(null);
      onOcupado(false);
    }
  };

  if (emitida) {
    return (
      <RemisionEmitida
        codigo={emitida.codigo}
        mensaje={emitida.mensaje}
        steps={emitida.steps}
        recepcion={emitida.recepcion}
        producto="biochar"
        kg={emitida.kg}
        telefonoTransportista={telefonoTransportista || null}
        nombreTransportista={nombreTransportista || null}
        onCerrar={() => onListo(emitida.mensaje)}
      />
    );
  }

  return (
    <div className="space-y-4 text-sm text-white">
      {sesionVencida && <AvisoSesionVencida para="completar el despacho" />}
      <Aviso>
        ⚠️ El despacho <span className="font-mono">{codigo}</span> de este pedido quedó a medias (la
        remisión sigue en Borrador). Complétalo antes de despachar otro.
        {aviso && <span className="mt-1 block text-amber-100/80">{aviso}</span>}
      </Aviso>
      <p className="text-xs text-white/50">
        Completar escribe solo lo que falte y se puede repetir sin descontar dos veces. Anular solo
        procede si todavía no salió biochar de ningún bache.
      </p>

      {fallo && <PasosConProblema steps={fallo} />}
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}

      {confirmarAnular ? (
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-400/30 p-3 space-y-3">
          <p className="text-red-100">¿Anular {codigo}? La remisión pasa a Cancelada.</p>
          <div className="flex flex-wrap gap-3">
            <BotonAccion tono="salida" onClick={() => ejecutar('anular')} disabled={!!enviando}>
              {enviando === 'anular' ? 'Anulando…' : 'Sí, anular'}
            </BotonAccion>
            <BotonAccion onClick={() => setConfirmarAnular(false)} disabled={!!enviando}>
              No
            </BotonAccion>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <BotonAccion tono="primario" onClick={() => ejecutar('completar')} disabled={!!enviando}>
            {enviando === 'completar' ? 'Completando…' : 'Completar'}
          </BotonAccion>
          <BotonAccion tono="salida" onClick={() => setConfirmarAnular(true)} disabled={!!enviando}>
            Anular
          </BotonAccion>
          <BotonAccion onClick={onCancelar} disabled={!!enviando}>
            Cerrar
          </BotonAccion>
        </div>
      )}
    </div>
  );
}
