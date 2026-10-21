/**
 * Piezas de interfaz que comparten la pantalla de bodega y sus formularios.
 *
 * Viven aparte de `page.tsx` por la misma razón que `comunes.ts`: un archivo de
 * ruta de Next no puede exportar nada más que el default, y el despacho de
 * biochar, el de Blend y el panel de remisiones necesitan el MISMO diálogo, el
 * mismo selector de personal y el mismo aviso de sesión. Copiarlos es como el
 * despacho de biochar terminaría pidiendo al transportista de otra forma que el
 * de Blend.
 */

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CAMPO } from './comunes';

// ─── Tipos de la interfaz ──────────────────────────────────────────────────────

/**
 * Un pedido de Biochar Blend, pendiente o cerrado. Lo arma `listarPedidosBlend()`
 * cruzando Pedidos Core con las Salidas del libro mayor: acá solo se pinta y se
 * filtra. `pendiente` viene resuelto del servidor —la pantalla no reinterpreta el
 * estado— para que el chip y la fila no puedan contar cosas distintas.
 */
export interface PedidoBlend {
  recordId: string;
  codigo: string;
  estado: string;
  pendiente: boolean;
  idCliente: string;
  clienteNombre: string;
  /** `AC-XXXX` del área del cliente a la que va, si el pedido la trae. */
  idAreaCliente: string;
  fecha: string;
  kgSolicitados: number;
  kgDespachados: number;
  kgPendientes: number;
  fuenteKg: 'detalle' | 'notas' | 'sin-dato';
  empaque: string;
  observaciones: string;
  remisiones: string[];
}

/**
 * Un paso de una operación multi-base, como lo devuelve el servidor
 * (`StepResult`). `skipped` distingue lo que no aplicó de lo que quedó a medias.
 */
export interface StepResultUI {
  step: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** Una persona del cliente en Sirius Clients Core (ver `/api/clientes/personal`). */
export interface PersonaClienteUI {
  recordId: string;
  codigo: string;
  nombre: string;
  cedula: string;
  cargo: string;
  email: string;
  telefono: string;
}

/** Un área del cliente en Sirius Clients Core (ver `/api/clientes/areas`). */
export interface AreaClienteUI {
  recordId: string;
  codigo: string;
  nombre: string;
}

/** Quien se lleva el producto, tal como lo manda el formulario al despacho. */
export interface TransportistaUI {
  nombre: string;
  cedula: string;
  telefono: string;
  email: string;
}

export const TRANSPORTISTA_VACIO: TransportistaUI = { nombre: '', cedula: '', telefono: '', email: '' };

/** Valor del selector para quien recoge sin estar en el personal del cliente. */
export const OTRA_PERSONA = 'OTRA';

/** Marca del 401 de las APIs con sesión: la cookie de sesión venció. */
export const SESION_VENCIDA = 'SESION_VENCIDA';

/** Valor del selector para registrar un área que el cliente todavía no tiene. */
export const NUEVA_AREA = 'NUEVA';

// ─── Fechas ────────────────────────────────────────────────────────────────────

const FORMATO_FECHA: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

/**
 * Fecha legible.
 *
 * ⚠️ `new Date('2026-09-11')` NO es el 11 de septiembre: es medianoche UTC, y en
 * Bogotá (UTC−5) se imprime como el 10. Así es como los pedidos y los movimientos
 * aparecían un día corridos. Una fecha sin hora es un DÍA DEL CALENDARIO, no un
 * instante, y se arma con sus partes en hora local para que no se convierta nada.
 *
 * Airtable devuelve las dos formas: un campo `date` da `2026-09-11` y un
 * `dateTime` al que se le escribió solo una fecha da `2026-09-11T00:00:00.000Z`
 * —que sigue siendo un día del calendario, no un instante—, así que las dos caen
 * en el mismo camino. Un instante de verdad sí se convierte, y se lee en la zona
 * de la planta y no en la del navegador.
 */
export const fecha = (iso: string) => {
  if (!iso) return '—';

  const diaCalendario = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.000)?)?Z?)?$/.exec(iso);
  if (diaCalendario) {
    const [, anio, mes, dia] = diaCalendario;
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).toLocaleDateString(
      'es-CO',
      FORMATO_FECHA
    );
  }

  return new Date(iso).toLocaleDateString('es-CO', {
    ...FORMATO_FECHA,
    timeZone: 'America/Bogota',
  });
};

/**
 * Un instante (`[recibida:<ISO>]`) con su hora, en la zona de la planta: «21 oct
 * 2026, 3:04 p. m.». La hora importa en la recepción —es la evidencia de cuándo
 * se confirmó—, y en la fecha sola se perdería.
 */
export const fechaHora = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleString('es-CO', {
    ...FORMATO_FECHA,
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
};

// ─── Piezas básicas ────────────────────────────────────────────────────────────

export function Chip({
  activo,
  onClick,
  children,
  clase = 'bg-white/10 text-white/70 ring-white/20',
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  clase?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${
        activo ? 'bg-[#5A7836] text-white ring-[#5A7836]' : `${clase} hover:brightness-125`
      }`}
    >
      {children}
    </button>
  );
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 p-4 text-sm text-amber-100">
      {children}
    </div>
  );
}

/**
 * Nombre del operador para el campo `responsable` del movimiento.
 *
 * Inventario Production Core no tiene campo de SIRIUS-PER —a diferencia de Insumos
 * Core, que sí lo tenía—, así que el nombre es toda la atribución posible ahí.
 */
export function usuarioActual(): string {
  try {
    const sesion = localStorage.getItem('userSession');
    if (!sesion) return 'Sistema';
    const datos = JSON.parse(sesion);
    return datos.user?.Nombre || datos.user?.name || 'Sistema';
  } catch {
    return 'Sistema';
  }
}

/**
 * El diálogo de todos los formularios de la bodega.
 *
 * `bloqueado` apaga el ✕ y el Escape mientras se envía: cerrar a mitad de un
 * despacho no lo cancela —el servidor sigue escribiendo— y deja al operador sin
 * la respuesta, que es justo lo que dice qué quedó a medias.
 */
export function Modal({
  titulo,
  descripcion,
  onCerrar,
  bloqueado = false,
  children,
}: {
  titulo: string;
  descripcion: string;
  onCerrar: () => void;
  bloqueado?: boolean;
  children: React.ReactNode;
}) {
  const idTitulo = useId();
  const idDescripcion = useId();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  // El último valor sin volver a suscribir el teclado en cada render.
  const estado = useRef({ bloqueado, onCerrar });
  estado.current = { bloqueado, onCerrar };

  useEffect(() => {
    // El foco al título: un lector de pantalla anuncia el diálogo al abrirse, y
    // el Tab arranca dentro del diálogo y no detrás de él.
    tituloRef.current?.focus();
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !estado.current.bloqueado) estado.current.onCerrar();
    };
    document.addEventListener('keydown', alTeclado);
    return () => document.removeEventListener('keydown', alTeclado);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 py-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idDescripcion}
        aria-busy={bloqueado || undefined}
        className="w-full max-w-lg rounded-2xl bg-slate-900 ring-1 ring-white/15 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={idTitulo} ref={tituloRef} tabIndex={-1} className="text-lg font-semibold text-white focus:outline-none">
              {titulo}
            </h2>
            <p id={idDescripcion} className="mt-1 text-sm text-white/60">
              {descripcion}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={bloqueado}
            aria-label="Cerrar"
            className="rounded-lg px-2 py-1 text-white/60 ring-1 ring-white/15 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ✕
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export function BotonAccion({
  onClick,
  children,
  tono = 'neutro',
  disabled = false,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tono?: 'neutro' | 'salida' | 'entrada' | 'primario';
  disabled?: boolean;
  title?: string;
}) {
  const tonos = {
    neutro: 'bg-white/10 ring-white/20 hover:bg-white/20',
    entrada: 'bg-emerald-500/15 ring-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25',
    salida: 'bg-orange-500/15 ring-orange-400/30 text-orange-100 hover:bg-orange-500/25',
    primario: 'bg-[#5A7836] ring-[#5A7836] hover:bg-[#4a6429]',
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-4 py-2 text-sm font-medium text-white ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${tonos[tono]}`}
    >
      {children}
    </button>
  );
}

/** Cada estado del pedido en el Core con su tono. Cualquier otro valor se pinta neutro. */
export function EstadoPedidoBadge({ estado }: { estado: string }) {
  const tono =
    estado === 'Enviado Parcial'
      ? 'bg-orange-500/15 text-orange-200'
      : estado === 'Procesando'
        ? 'bg-sky-500/15 text-sky-200'
        : estado === 'Recibido'
          ? 'bg-white/10 text-white/80'
          : estado === 'Enviado'
            ? 'bg-teal-500/15 text-teal-200'
            : estado === 'Completado'
              ? 'bg-emerald-500/15 text-emerald-200'
              : estado === 'Cancelado'
                ? 'bg-red-500/15 text-red-200'
                : 'bg-white/10 text-white/60';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tono}`}>
      {estado || '—'}
    </span>
  );
}

// ─── Sesión ────────────────────────────────────────────────────────────────────

export type EstadoSesion = 'verificando' | 'ok' | 'vencida';

/**
 * ¿La cookie de sesión sigue viva? Se pregunta al ABRIR el formulario.
 *
 * La pantalla entra con la sesión de `localStorage`, que no vence, pero las APIs
 * que escriben miran la cookie, que vence a las 24 h. Sin esta pregunta el
 * operador llenaba el despacho entero —con el conductor esperando— para recibir
 * un 401 al final.
 *
 * Un fallo de red no se toma como sesión vencida: bloquear por eso impediría
 * despachar con una conexión inestable, y el 401 del propio envío lo cubre.
 */
export function useSesionServidor(): EstadoSesion {
  const [estado, setEstado] = useState<EstadoSesion>('verificando');
  useEffect(() => {
    let vigente = true;
    fetch('/api/me', { cache: 'no-store' })
      .then((res) => {
        if (vigente) setEstado(res.status === 401 ? 'vencida' : 'ok');
      })
      .catch(() => {
        if (vigente) setEstado('ok');
      });
    return () => {
      vigente = false;
    };
  }, []);
  return estado;
}

/** El aviso de sesión vencida, con el camino para resolverlo. */
export function AvisoSesionVencida({ para = 'despachar' }: { para?: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 p-3 text-sm text-amber-100"
    >
      Tu sesión venció:{' '}
      <a href="/login" className="font-medium underline">
        vuelve a iniciar sesión
      </a>{' '}
      para {para} (la remisión queda a tu nombre).
    </div>
  );
}

// ─── Pasos de una operación multi-base ─────────────────────────────────────────

/**
 * Nombre legible de cada paso. Los que llevan sufijo (`core:S-00141`,
 * `inventario:BLEND-…`) se nombran por su prefijo con el código a la vista.
 */
export function nombrePaso(step: string, nombres?: Record<string, string>): string {
  if (nombres?.[step]) return nombres[step];
  const [prefijo, ...resto] = step.split(':');
  const sufijo = resto.join(':');
  switch (prefijo) {
    case 'remision':
      return 'La remisión en Sirius Remisiones Core';
    case 'producto_remitido':
      return 'El producto remitido de la remisión';
    case 'lectura':
      return 'La relectura de la remisión emitida';
    case 'transportista':
      return 'No se vinculó a quien se lleva el producto';
    case 'local':
      return 'El consumo de los baches en PiroliApp';
    case 'core':
      return `La salida del bache ${sufijo} en el libro mayor`;
    case 'inventario':
      return sufijo ? `La salida del lote ${sufijo} en el libro mayor` : 'La salida en el libro mayor';
    case 'activar':
      return 'La remisión no salió de Borrador';
    case 'estado_baches':
      return 'No se actualizó el estado de los baches';
    case 'verificacion_saldo':
      return 'La verificación del saldo de los baches';
    case 'estado_pedido':
      return 'No se actualizó el estado del pedido';
    case 'enlace':
      return 'El enlace de recepción';
    case 'documento':
      return 'El PDF no quedó adjunto en el Core (se puede volver a adjuntar)';
    case 'produccion':
      return `La producción (${sufijo})`;
    default:
      return step;
  }
}

/**
 * Los pasos que NO salieron bien, separados en dos grupos que significan cosas
 * distintas:
 *
 *  · «Quedó a medias» (`!ok && !skipped`): algo se intentó y falló; hay que
 *    revisarlo o completarlo.
 *  · «No aplicó» (`!ok && skipped`): el paso no corresponde en este entorno —el
 *    enlace de recepción fuera de producción, por ejemplo—. No es una falla.
 *
 * Antes se listaba todo `!ok` junto, y un enlace no configurado en pruebas se
 * leía como un despacho roto (es lo que la ruta ya separaba y la pantalla no).
 */
export function PasosConProblema({
  steps,
  nombres,
}: {
  steps: StepResultUI[];
  nombres?: Record<string, string>;
}) {
  const aMedias = steps.filter((s) => !s.ok && !s.skipped);
  const noAplico = steps.filter((s) => !s.ok && s.skipped);
  if (!aMedias.length && !noAplico.length) return null;

  return (
    <div className="space-y-3 text-sm">
      {!!aMedias.length && (
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-400/30 p-3">
          <p className="font-medium text-red-100">Quedó a medias</p>
          <ul className="mt-1.5 space-y-1 text-red-100/80" aria-label="Pasos que quedaron a medias">
            {aMedias.map((s) => (
              <li key={s.step}>
                {nombrePaso(s.step, nombres)}
                {s.error && <span className="block text-xs text-red-200/70">{s.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!noAplico.length && (
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
          <p className="font-medium text-white/70">No aplicó</p>
          <ul className="mt-1.5 space-y-1 text-white/60" aria-label="Pasos que no aplicaron">
            {noAplico.map((s) => (
              <li key={s.step}>
                {nombrePaso(s.step, nombres)}
                {s.error && <span className="block text-xs text-white/40">{s.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Área del cliente ──────────────────────────────────────────────────────────

/**
 * A qué área del cliente va el despacho (Sanidad, Fertilización…).
 *
 * Las áreas viven en Sirius Clients Core por cliente. Se pueden crear desde aquí
 * porque es en el despacho donde se descubre que falta una: mandar al operador a
 * Airtable es como termina escrita en las observaciones, donde nada la lee.
 */
export function SelectorAreaCliente({
  idCliente,
  clienteNombre,
  inicial,
  valor,
  onCambio,
}: {
  idCliente: string;
  clienteNombre: string;
  /** El área que trae el pedido: se propone al cargar, si sigue activa. */
  inicial: string;
  valor: string;
  onCambio: (area: AreaClienteUI | null) => void;
}) {
  const [areas, setAreas] = useState<AreaClienteUI[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    if (!idCliente) {
      setAreas([]);
      return;
    }
    fetch(`/api/clientes/areas?cliente=${encodeURIComponent(idCliente)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) throw new Error(SESION_VENCIDA);
        if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
        return (json.areas ?? []) as AreaClienteUI[];
      })
      .then((lista) => {
        if (!vigente) return;
        setAreas(lista);
        // La del pedido, si la trae y sigue activa; si ya no existe, no se
        // propone una que el servidor va a rechazar.
        onCambio(lista.find((a) => a.codigo === inicial) ?? null);
      })
      .catch((err) => {
        if (!vigente) return;
        setAreas([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      vigente = false;
    };
    // Solo al cambiar de cliente: `inicial` es el punto de partida, no un disparador.
  }, [idCliente]);

  const crear = async () => {
    const nombre = nueva.trim();
    if (!nombre) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/clientes/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente: idCliente, nombre }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error(SESION_VENCIDA);
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      const area = json.area as AreaClienteUI;
      setAreas((prev) => {
        const lista = (prev ?? []).filter((a) => a.codigo !== area.codigo);
        return [...lista, area].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      });
      onCambio(area);
      setCreando(false);
      setNueva('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="block">
      <span className="text-white/70">Área de {clienteNombre || idCliente} a la que va</span>
      <select
        value={creando ? NUEVA_AREA : valor}
        onChange={(e) => {
          if (e.target.value === NUEVA_AREA) {
            setCreando(true);
            return;
          }
          setCreando(false);
          onCambio(areas?.find((a) => a.codigo === e.target.value) ?? null);
        }}
        disabled={areas === null || !idCliente}
        aria-label={`Área de ${clienteNombre || idCliente} a la que va`}
        className={CAMPO}
      >
        <option value="">
          {areas === null ? 'Cargando áreas del cliente…' : 'Sin área (no se indica)'}
        </option>
        {(areas ?? []).map((a) => (
          <option key={a.codigo} value={a.codigo}>
            {a.nombre} · {a.codigo}
          </option>
        ))}
        {idCliente && <option value={NUEVA_AREA}>+ Registrar un área nueva</option>}
      </select>

      {creando && (
        <div className="mt-2 flex gap-2">
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              // Enter enviaría el formulario del despacho entero.
              if (e.key === 'Enter') {
                e.preventDefault();
                crear();
              }
            }}
            placeholder="Ej: Sanidad, Fertilización…"
            maxLength={80}
            className={CAMPO}
          />
          <button
            type="button"
            onClick={crear}
            disabled={guardando || !nueva.trim()}
            className="shrink-0 rounded-lg bg-white/10 px-3 text-xs font-medium text-white ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      )}

      {error === SESION_VENCIDA ? (
        <span className="mt-1 block text-xs text-amber-200">
          Tu sesión venció y las áreas del cliente no se pueden leer.{' '}
          <a href="/login" className="underline">
            Vuelve a iniciar sesión
          </a>
          .
        </span>
      ) : (
        error && (
          <span className="mt-1 block text-xs text-amber-200">
            No se pudieron leer las áreas de Sirius Clients Core ({error}).
          </span>
        )
      )}
    </div>
  );
}

// ─── Quién se lleva el producto ────────────────────────────────────────────────

/** ¿Están el nombre y la cédula de quien se lleva el producto? */
export function transportistaCompleto(t: TransportistaUI): boolean {
  return t.nombre.trim().length > 2 && t.cedula.trim().length > 3;
}

/** ¿Se empezó a llenar? Un transportista a medias no se manda: se completa o se borra. */
export function transportistaIniciado(t: TransportistaUI): boolean {
  return Boolean(t.nombre.trim() || t.cedula.trim() || t.telefono.trim() || t.email.trim());
}

/** El transportista como lo pide el cuerpo del despacho: sin campos vacíos. */
export function transportistaParaEnviar(t: TransportistaUI) {
  return {
    nombre: t.nombre.trim(),
    cedula: t.cedula.trim(),
    telefono: t.telefono.trim() || undefined,
    email: t.email.trim() || undefined,
  };
}

/**
 * Quien se lleva el producto: la primera mitad de la cadena de custodia. Se pide
 * en el despacho porque ahí está —cargando el camión—.
 *
 * Quien recoge casi siempre es gente del cliente, ya registrada con su cédula en
 * Sirius Clients Core: elegirla evita digitar otra versión de la misma persona en
 * cada remisión. Lo comparten el despacho de Blend y el de biochar para que las
 * dos remisiones identifiquen al transportista igual.
 */
export function CamposTransportista({
  idCliente,
  clienteNombre,
  valor,
  onCambio,
  titulo = 'Quién se lleva el pedido',
}: {
  idCliente: string;
  clienteNombre: string;
  valor: TransportistaUI;
  onCambio: (v: TransportistaUI) => void;
  titulo?: string;
}) {
  // `null` = todavía cargando.
  const [personal, setPersonal] = useState<PersonaClienteUI[] | null>(null);
  const [errorPersonal, setErrorPersonal] = useState<string | null>(null);
  /** recordId de la persona elegida, `OTRA` para alguien que no está en el Core. */
  const [personaId, setPersonaId] = useState('');
  const personaElegida = personal?.find((p) => p.recordId === personaId) ?? null;

  useEffect(() => {
    let vigente = true;
    if (!idCliente) {
      setPersonal([]);
      setPersonaId(OTRA_PERSONA);
      return;
    }
    fetch(`/api/clientes/personal?cliente=${encodeURIComponent(idCliente)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        // ⚠️ La pantalla se abre con la sesión de localStorage, que no vence, pero
        // esta API mira la cookie `sirius_session`, que vence a las 24 h. Un 401
        // aquí casi siempre es eso, y decir "No autorizado" no le dice a nadie qué
        // hacer.
        if (res.status === 401) throw new Error(SESION_VENCIDA);
        if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
        return (json.personal ?? []) as PersonaClienteUI[];
      })
      .then((lista) => {
        if (!vigente) return;
        setPersonal(lista);
        if (!lista.length) setPersonaId(OTRA_PERSONA);
      })
      .catch((err) => {
        if (!vigente) return;
        setPersonal([]);
        setPersonaId(OTRA_PERSONA);
        setErrorPersonal(err instanceof Error ? err.message : String(err));
      });
    return () => {
      vigente = false;
    };
  }, [idCliente]);

  const elegirPersona = (id: string) => {
    setPersonaId(id);
    const p = personal?.find((x) => x.recordId === id);
    onCambio({
      nombre: p?.nombre ?? '',
      cedula: p?.cedula ?? '',
      telefono: p?.telefono ?? '',
      email: p?.email ?? '',
    });
  };

  const campo = (
    clave: keyof TransportistaUI,
    etiqueta: string,
    soloLectura: boolean,
    tipo: 'text' | 'email' | 'tel' = 'text'
  ) => (
    <label className="block">
      <span className="text-white/70">{etiqueta}</span>
      <input
        type={tipo}
        value={valor[clave]}
        onChange={(e) => onCambio({ ...valor, [clave]: e.target.value })}
        readOnly={soloLectura}
        className={CAMPO}
      />
    </label>
  );

  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-3">
      <p className="text-white/80">{titulo}</p>

      <label className="block">
        <span className="text-white/70">Personal de {clienteNombre || idCliente}</span>
        <select
          value={personaId}
          onChange={(e) => elegirPersona(e.target.value)}
          disabled={personal === null}
          className={CAMPO}
        >
          <option value="" disabled>
            {personal === null ? 'Cargando personal del cliente…' : 'Elige quién recoge'}
          </option>
          {(personal ?? []).map((p) => (
            <option key={p.recordId} value={p.recordId}>
              {p.nombre}
              {p.cargo ? ` · ${p.cargo}` : ''}
              {p.cedula ? ` · C.C. ${p.cedula}` : ' · sin cédula en el Core'}
            </option>
          ))}
          <option value={OTRA_PERSONA}>Otra persona (no está en Clients Core)</option>
        </select>
        {errorPersonal === SESION_VENCIDA ? (
          <span className="mt-1 block text-xs text-amber-200">
            Tu sesión venció y el personal del cliente no se puede leer.{' '}
            <a href="/login" className="underline">
              Vuelve a iniciar sesión
            </a>{' '}
            para elegirlo de Sirius Clients Core, o digita los datos.
          </span>
        ) : errorPersonal ? (
          <span className="mt-1 block text-xs text-amber-200">
            No se pudo leer el personal de Sirius Clients Core ({errorPersonal}): digita los datos.
          </span>
        ) : (
          personal !== null &&
          !personal.length && (
            <span className="mt-1 block text-xs text-white/50">
              El cliente no tiene personal activo en Sirius Clients Core: digita los datos.
            </span>
          )
        )}
      </label>

      {/* Con una persona del Core, nombre y contacto vienen de allá y no se
          editan aquí: corregirlos en la remisión dejaría dos versiones de la
          misma persona. La cédula sí se puede completar si el Core no la tiene. */}
      {personaId && (
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('nombre', 'Nombre completo', !!personaElegida)}
          {campo('cedula', 'Cédula', !!personaElegida?.cedula)}
        </div>
      )}

      {personaId && (
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('telefono', 'Teléfono (opcional)', !!personaElegida?.telefono, 'tel')}
          {campo('email', 'Correo (opcional)', !!personaElegida?.email, 'email')}
        </div>
      )}
    </div>
  );
}
