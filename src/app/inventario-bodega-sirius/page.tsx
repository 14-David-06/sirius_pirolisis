/**
 * Inventario de la Bodega Sirius: lo que la planta tiene almacenado, según el
 * libro mayor de Sirius Inventario Production Core.
 *
 * Dos productos, los dos componentes con los que se produce Biochar Blend:
 *   · Biochar puro (SIRIUS-PRODUCT-0015) — lo que pirólisis PRODUCE, trazado por bache
 *   · Abono 4G     (SIRIUS-PRODUCT-0020) — lo que pirólisis RECIBE, sin baches
 *
 * No duplica el Sistema de Baches. Allá la pregunta es "cómo va la producción de
 * este bache" y la fuente es la fórmula de la tabla de baches; acá es "qué hay
 * físicamente en bodega y de dónde salió cada kg". El biochar aparece aquí cuando
 * se le da "Pasar a Bodega" a un bache: ese cambio de estado es el que escribe la
 * Entrada (ver src/lib/biochar-bodega.ts).
 *
 * Los estados de bodega (completo/parcial/agotado/sobregirado) los deriva el
 * endpoint, no esta pantalla: los mismos números alimentan los contadores de los
 * filtros y los totales, y clasificar por separado en cada lado es como un chip
 * llega a decir "12 agotados" mientras el KPI cuenta otra cosa.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { TurnoProtection, Tarjeta3D } from '@/components';
import { MOTIVOS_SALIDA } from '@/lib/salida-bache.constants';
import { SelectorBache } from './SelectorBache';
import {
  CAMPO,
  kg,
  type BacheBodega,
  type BacheNoDisponible,
  type EstadoBodega,
} from './comunes';
import type { MotivoSalida } from '@/lib/salida-bache.constants';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

interface Disponible {
  kg: number;
  origen: 'inventario-prod-core' | 'baches';
  kgBaches: number | null;
  kgCore: number | null;
  divergencia: number | null;
}

interface Movimiento {
  id: string;
  codigo: string;
  tipo: string;
  kg: number;
  bache: string;
  destino: string;
  documento: string;
  fecha: string;
  motivo: string;
  observaciones: string;
}

/** Los movimientos del Core traen `cantidad`; los del biochar por bache, `kg`. */
interface MovimientoProd extends Omit<Movimiento, 'kg'> {
  cantidad: number;
  unidad: string;
}

interface Totales {
  ingresado: number;
  consumido: number;
  saldo: number;
  porEstado: Record<EstadoBodega, number>;
}

/**
 * El resumen de un producto del Core sin trazabilidad por bache. Es el mismo para
 * el abono 4G y para el Biochar Blend: lo devuelve `resumenProducto()`.
 */
interface ResumenProd {
  kg: number | null;
  kgIngresado: number;
  kgConsumido: number;
  kgSegunMovimientos: number;
  divergencia: number | null;
  porLote: Array<{ lote: string; kg: number }>;
  movimientos: MovimientoProd[];
}

interface BodegaData {
  biochar: {
    disponible: Disponible;
    baches: BacheBodega[] | null;
    /** Existen pero sin biochar que sacar: se muestran, no se pueden operar. */
    noDisponibles: BacheNoDisponible[];
    totales: Totales | null;
    movimientos: Movimiento[] | null;
  };
  abono: ResumenProd | null;
  blend: ResumenProd | null;
}

/** Cómo se presenta cada estado de bodega. El orden es el de los chips. */
const ESTADOS: Array<{
  clave: EstadoBodega;
  etiqueta: string;
  chip: string;
  texto: string;
}> = [
  {
    clave: 'completo',
    etiqueta: 'Sin consumir',
    chip: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30',
    texto: 'text-emerald-300',
  },
  {
    clave: 'parcial',
    etiqueta: 'Parciales',
    chip: 'bg-sky-500/15 text-sky-200 ring-sky-400/30',
    texto: 'text-sky-300',
  },
  {
    clave: 'agotado',
    etiqueta: 'Agotados',
    chip: 'bg-white/10 text-white/70 ring-white/20',
    texto: 'text-white/50',
  },
  {
    clave: 'sobregirado',
    etiqueta: 'Sobregirados',
    chip: 'bg-red-500/15 text-red-200 ring-red-400/30',
    texto: 'text-red-300',
  },
];

const META = Object.fromEntries(ESTADOS.map((e) => [e.clave, e])) as Record<
  EstadoBodega,
  (typeof ESTADOS)[number]
>;

type Producto = 'biochar' | 'abono' | 'blend';

/**
 * Cómo se nombra cada cifra en la sección de un producto sin baches.
 *
 * Está separado del componente porque las palabras son lo ÚNICO que distingue al
 * abono del Blend: el primero se consume por lote y el segundo se produce por
 * lote, así que "Consumido en Blend" y "Despachado" son la misma columna leída al
 * revés. Un componente por producto habría duplicado la tabla para cambiar seis
 * cadenas.
 */
interface EtiquetasProducto {
  titulo: string;
  acento: string;
  /** Qué falta y cómo se arregla si el producto no existe en el Core. */
  sinConfigurar: React.ReactNode;
  kpiSaldo: string;
  kpiIngresado: string;
  kpiIngresadoNota: string;
  kpiConsumido: string;
  kpiConsumidoNota: string;
  tituloPorLote: string;
  columnaPorLote: string;
  pie: React.ReactNode;
}

const ETIQUETAS_ABONO: EtiquetasProducto = {
  titulo: 'Abono 4G',
  acento: 'text-amber-200',
  sinConfigurar: (
    <>
      Falta <code className="text-white/90">AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID</code>, el
      producto del abono en Sirius Inventario Production Core. Se crea con{' '}
      <code className="text-white/90">
        node scripts/migrar-abono-inventario-core.mjs --producto --apply
      </code>
      , que además traslada el saldo desde Insumos Core.
    </>
  ),
  kpiSaldo: 'En bodega',
  kpiIngresado: 'Ingresado histórico',
  kpiIngresadoNota: 'Todo lo que ha entrado',
  kpiConsumido: 'Consumido en Blend',
  kpiConsumidoNota: 'Salidas del libro mayor',
  tituloPorLote: 'Consumo por producción',
  columnaPorLote: 'Abono consumido',
  pie: (
    <>
      El abono 4G no se produce en pirólisis: se recibe. Su libro mayor vive acá —y no en Sirius
      Insumos Core, donde estuvo hasta el 21 de agosto de 2026— para que producir Blend descuente el
      biochar y el abono en una sola base.
    </>
  ),
};

const ETIQUETAS_BLEND: EtiquetasProducto = {
  titulo: 'Biochar Blend',
  acento: 'text-sky-200',
  sinConfigurar: (
    <>
      Falta <code className="text-white/90">AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID</code>, el
      producto del Blend en Sirius Inventario Production Core.
    </>
  ),
  kpiSaldo: 'En bodega',
  kpiIngresado: 'Producido histórico',
  kpiIngresadoNota: 'Entradas de producción',
  kpiConsumido: 'Despachado',
  kpiConsumidoNota: 'Salidas por remisión',
  // Al contrario del abono: el Blend se PRODUCE por lote, así que el desglose
  // responde cuánto salió de cada producción, no cuánto se fue a ella.
  tituloPorLote: 'Producción por lote',
  columnaPorLote: 'Blend producido',
  pie: (
    <>
      El Biochar Blend es el producto terminado: sus entradas las escribe la producción —el lote{' '}
      <code className="text-white/80">BLEND-…</code> que une los movimientos de biochar y de abono— y
      sus salidas, las remisiones. Por eso el único botón es <strong>Producción</strong>, que
      descuenta la materia prima al mismo tiempo: un ingreso suelto sería Blend sin receta, kilos que
      no descontaron nada.
    </>
  ),
};
type VistaBiochar = 'baches' | 'movimientos';
type FiltroEstado = EstadoBodega | 'todos';
type FiltroTipo = 'todos' | 'Entrada' | 'Salida';
type Orden = 'kg-desc' | 'kg-asc' | 'codigo-desc' | 'codigo-asc';

const fecha = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

export default function InventarioBodegaSirius() {
  return (
    <TurnoProtection requiresTurno={false} allowBitacoraUsers={true}>
      <BodegaContent />
    </TurnoProtection>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative"
      style={{ backgroundImage: FONDO }}
    >
      <div className="absolute inset-0 bg-slate-950/75" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

function Kpi({
  label,
  valor,
  nota,
  acento = 'text-white',
}: {
  label: string;
  valor: string;
  nota?: string;
  acento?: string;
}) {
  return (
    <Tarjeta3D
      escala={1.04}
      className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5 hover:shadow-2xl hover:shadow-black/40"
    >
      {/* El contenido flota por delante de la tarjeta: sin el translateZ el giro
          se ve como una lámina plana y no como profundidad. */}
      <div className="[transform:translateZ(28px)]">
        <span className="text-xs font-medium uppercase tracking-wider text-white/60">{label}</span>
        <p className={`mt-2 text-2xl sm:text-3xl font-semibold tabular-nums ${acento}`}>{valor}</p>
        {nota && <p className="mt-0.5 text-xs text-white/50">{nota}</p>}
      </div>
    </Tarjeta3D>
  );
}

function Chip({
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

function Aviso({ children }: { children: React.ReactNode }) {
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
function usuarioActual(): string {
  try {
    const sesion = localStorage.getItem('userSession');
    if (!sesion) return 'Sistema';
    const datos = JSON.parse(sesion);
    return datos.user?.Nombre || datos.user?.name || 'Sistema';
  } catch {
    return 'Sistema';
  }
}

function Modal({
  titulo,
  descripcion,
  onCerrar,
  children,
}: {
  titulo: string;
  descripcion: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 py-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-lg rounded-2xl bg-slate-900 ring-1 ring-white/15 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{titulo}</h2>
            <p className="mt-1 text-sm text-white/60">{descripcion}</p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg px-2 py-1 text-white/60 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function BotonAccion({
  onClick,
  children,
  tono = 'neutro',
}: {
  onClick: () => void;
  children: React.ReactNode;
  tono?: 'neutro' | 'salida' | 'entrada';
}) {
  const tonos = {
    neutro: 'bg-white/10 ring-white/20 hover:bg-white/20',
    entrada: 'bg-emerald-500/15 ring-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25',
    salida: 'bg-orange-500/15 ring-orange-400/30 text-orange-100 hover:bg-orange-500/25',
  } as const;
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium text-white ring-1 transition ${tonos[tono]}`}
    >
      {children}
    </button>
  );
}

function BodegaContent() {
  const [data, setData] = useState<BodegaData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [producto, setProducto] = useState<Producto>('biochar');
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<VistaBiochar>('baches');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  // Un solo filtro para abono y Blend: son vistas excluyentes, nunca se ven a la vez.
  const [filtroTipoProd, setFiltroTipoProd] = useState<FiltroTipo>('todos');
  const [orden, setOrden] = useState<Orden>('kg-desc');

  // Qué formulario está abierto. `null` = ninguno.
  const [modal, setModal] = useState<
    'salida-biochar' | 'entrada-abono' | 'salida-abono' | 'produccion-blend' | null
  >(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/pirolisis/inventario/bodega-sirius', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const tras = async (mensaje: string) => {
    setModal(null);
    setAviso(mensaje);
    await cargar();
  };

  const biochar = data?.biochar;
  const abono = data?.abono ?? null;
  const blend = data?.blend ?? null;
  /** El producto sin baches que está a la vista, si es alguno. */
  const resumenProd = producto === 'abono' ? abono : producto === 'blend' ? blend : null;

  const bachesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = (biochar?.baches ?? []).filter((b) => {
      if (filtroEstado !== 'todos' && b.estado !== filtroEstado) return false;
      if (!q) return true;
      return b.codigo.toLowerCase().includes(q) || b.lotes.some((l) => l.toLowerCase().includes(q));
    });

    const ordenada = [...lista];
    switch (orden) {
      case 'kg-desc':
        return ordenada.sort((a, b) => b.kg - a.kg);
      case 'kg-asc':
        return ordenada.sort((a, b) => a.kg - b.kg);
      case 'codigo-desc':
        return ordenada.sort((a, b) => b.codigo.localeCompare(a.codigo));
      case 'codigo-asc':
        return ordenada.sort((a, b) => a.codigo.localeCompare(b.codigo));
    }
  }, [biochar, busqueda, filtroEstado, orden]);

  const movimientosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (biochar?.movimientos ?? []).filter((m) => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (!q) return true;
      return (
        m.bache.toLowerCase().includes(q) ||
        m.destino.toLowerCase().includes(q) ||
        m.documento.toLowerCase().includes(q) ||
        m.codigo.toLowerCase().includes(q)
      );
    });
  }, [biochar, busqueda, filtroTipo]);

  const movimientosProd = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (resumenProd?.movimientos ?? []).filter((m) => {
      if (filtroTipoProd !== 'todos' && m.tipo !== filtroTipoProd) return false;
      if (!q) return true;
      return (
        m.destino.toLowerCase().includes(q) ||
        m.documento.toLowerCase().includes(q) ||
        m.codigo.toLowerCase().includes(q) ||
        m.motivo.toLowerCase().includes(q)
      );
    });
  }, [resumenProd, busqueda, filtroTipoProd]);

  /** Lo que suma la selección actual: un filtro sin su subtotal obliga a sumar a mano. */
  const subtotal = useMemo(() => {
    if (producto !== 'biochar') {
      return movimientosProd.reduce((s, m) => s + (m.tipo === 'Salida' ? -m.cantidad : m.cantidad), 0);
    }
    if (vista === 'baches') return bachesFiltrados.reduce((s, b) => s + b.kg, 0);
    return movimientosFiltrados.reduce((s, m) => s + (m.tipo === 'Salida' ? -m.kg : m.kg), 0);
  }, [producto, vista, bachesFiltrados, movimientosFiltrados, movimientosProd]);

  if (cargando && !data) {
    return (
      <PageShell>
        <div aria-busy="true" aria-label="Cargando inventario de bodega" className="space-y-6">
          <div className="h-8 w-80 rounded bg-white/10 animate-pulse motion-reduce:animate-none" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[104px] rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none" />
        </div>
      </PageShell>
    );
  }

  // Se valida la FORMA, no solo que haya respuesta. Un bundle viejo contra una API
  // nueva —una pestaña que quedó abierta, un despliegue a mitad— llegaba acá con
  // `biochar` indefinido y rompía en el primer `.kg`: una pantalla en blanco en vez
  // de un aviso. Mejor caer en esta tarjeta, que además dice qué hacer.
  if (error || !data || !biochar?.disponible) {
    return (
      <PageShell>
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-400/30 p-6 text-white">
          <h1 className="text-lg font-semibold">No se pudo leer el inventario de bodega</h1>
          <p className="mt-2 text-sm text-white/70">
            {error ??
              (data
                ? 'La respuesta del servidor no tiene la forma esperada. Recarga la página con Ctrl+Shift+R: suele ser una versión vieja de la pantalla contra una API ya actualizada.'
                : 'Respuesta vacía del servidor')}
          </p>
          <button
            onClick={cargar}
            className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium ring-1 ring-white/20 hover:bg-white/20"
          >
            Reintentar
          </button>
        </div>
      </PageShell>
    );
  }

  const { disponible, totales } = biochar;
  const totalBaches = biochar.baches?.length ?? 0;
  const conSaldo = (totales?.porEstado?.completo ?? 0) + (totales?.porEstado?.parcial ?? 0);

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">
            Inventario Bodega Sirius
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Lo almacenado para producir Biochar Blend, según el libro mayor de Sirius Inventario
            Production Core.
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-50"
        >
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {/* El resultado del último movimiento queda a la vista hasta que se cierre:
          un alert() se va con el clic y se lleva consigo la referencia, que es lo
          que hay que anotar si algo sale raro. */}
      {aviso && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl bg-[#5A7836]/20 ring-1 ring-[#5A7836]/50 p-4 text-sm text-white">
          <span>{aviso}</span>
          <button
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Selector de producto ────────────────────────────────────────────
          Los dos saldos van en el propio botón: el dato que casi siempre se
          viene a buscar es "cuánto hay", y esconderlo detrás de un clic
          obligaría a alternar entre pestañas para compararlos. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-start [perspective:1200px]">
        {(
          [
            {
              clave: 'biochar' as Producto,
              titulo: 'Biochar puro',
              detalle: 'Lo que produce la planta · por bache',
              saldo: disponible.kg,
              acento: 'text-emerald-300',
            },
            {
              clave: 'abono' as Producto,
              titulo: 'Abono 4G',
              detalle: 'Materia prima del Blend · sin baches',
              saldo: abono?.kg ?? null,
              acento: 'text-amber-200',
            },
            {
              clave: 'blend' as Producto,
              titulo: 'Biochar Blend',
              detalle: 'El producto terminado · biochar + abono',
              saldo: blend?.kg ?? null,
              acento: 'text-sky-200',
            },
          ] as const
        ).map((p) => (
          /* La tarjeta es un contenedor, no un button: los botones de acción viven
             dentro y un button anidado en otro es HTML inválido —el navegador
             desanida el interior y el clic deja de llegar. El selector es el button
             de adentro. */
          <Tarjeta3D
            key={p.clave}
            className={`rounded-xl ring-1 ${
              producto === p.clave
                ? 'bg-white/10 ring-[#5A7836] shadow-2xl shadow-[#5A7836]/20'
                : 'bg-white/5 ring-white/10 hover:bg-white/[0.07] hover:shadow-2xl hover:shadow-black/40'
            }`}
          >
            <button
              onClick={() => setProducto(p.clave)}
              aria-pressed={producto === p.clave}
              className="block w-full p-4 sm:p-5 pb-0 sm:pb-0 text-left [transform:translateZ(30px)]"
            >
              <span className="text-xs font-medium uppercase tracking-wider text-white/60">
                {p.titulo}
              </span>
              <p className={`mt-2 text-2xl sm:text-3xl font-semibold tabular-nums ${p.acento}`}>
                {p.saldo === null ? 'no configurado' : kg(p.saldo)}
              </p>
              <p className="mt-0.5 text-xs text-white/50">{p.detalle}</p>
            </button>

            {/* Las acciones de cada producto van en SU tarjeta: así el botón que
                mueve el abono nunca queda al lado del saldo del biochar.
                El biochar no tiene botón de INGRESAR: entra solo cuando un bache
                pasa a bodega en el Sistema de Baches, y una entrada suelta aquí
                sería inventario sin bache — biochar sin la trazabilidad que
                sostiene la contabilidad de carbono. */}
            <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 pt-4 pb-4 sm:pb-5 [transform:translateZ(18px)]">
              {p.clave === 'biochar' && (
                <BotonAccion tono="salida" onClick={() => setModal('salida-biochar')}>
                  Sacar biochar
                </BotonAccion>
              )}
              {p.clave === 'abono' && (
                <>
                  <BotonAccion tono="entrada" onClick={() => setModal('entrada-abono')}>
                    Ingresar abono
                  </BotonAccion>
                  <BotonAccion tono="salida" onClick={() => setModal('salida-abono')}>
                    Sacar abono
                  </BotonAccion>
                </>
              )}
              {p.clave === 'blend' && (
                <>
                  {/* El Blend no tiene botón de "ingresar": entra SOLO produciéndolo,
                      porque una entrada suelta sería producto sin receta —kilos que no
                      descontaron biochar ni abono de nada—. Las salidas las escriben
                      las remisiones. */}
                  <BotonAccion tono="entrada" onClick={() => setModal('produccion-blend')}>
                    Producción
                  </BotonAccion>
                  <span className="text-xs text-white/40">Las salidas las hacen las remisiones</span>
                </>
              )}
            </div>
          </Tarjeta3D>
        ))}
      </div>

      {producto === 'biochar' ? (
        <>
          <section className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 [perspective:1200px]">
            <Kpi
              label="En bodega"
              valor={kg(disponible.kg)}
              nota="Ingresado − consumido"
              acento="text-emerald-300"
            />
            <Kpi
              label="Baches con saldo"
              valor={String(conSaldo)}
              nota={`de ${totalBaches} que han pasado por bodega`}
            />
            <Kpi
              label="Ingresado histórico"
              valor={totales ? kg(totales.ingresado) : '—'}
              nota="Todo lo que ha entrado"
            />
            <Kpi
              label="Despachado / consumido"
              valor={totales ? kg(totales.consumido) : '—'}
              nota="Blend, laboratorio y salidas"
            />
          </section>

          {/* Sacar biochar vive en la tarjeta del producto (arriba). Acá solo queda
              el para qué: para producir Blend, el descuento lo hace la producción. */}
          <p className="mt-4 text-xs text-white/50">
            Sacar biochar es para laboratorio, muestra, merma, traslado o entrega. Para producir
            Blend, el descuento lo hace la producción.
          </p>

          {/* La divergencia entre las dos vistas del mismo inventario se muestra, no
              se esconde: significa que un consumo se escribió en una y no en la otra. */}
          {disponible.divergencia !== null && Math.abs(disponible.divergencia) > 0.01 && (
            <Aviso>
              ⚠️ El libro mayor ({kg(disponible.kgCore ?? 0)}) y la fórmula de los baches (
              {kg(disponible.kgBaches ?? 0)}) difieren en {kg(disponible.divergencia)}. Un consumo
              quedó escrito en una sola de las dos vistas.
            </Aviso>
          )}

          {disponible.origen === 'baches' && (
            <Aviso>
              ⚠️ No se pudo leer el saldo del Core; el total mostrado sale de la fórmula de los
              baches.
            </Aviso>
          )}

          <div className="mt-8 flex rounded-lg bg-white/5 ring-1 ring-white/10 p-1 w-fit">
            {(['baches', 'movimientos'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  vista === v ? 'bg-[#5A7836] text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                {v === 'baches'
                  ? `Por bache (${totalBaches})`
                  : `Movimientos (${biochar.movimientos?.length ?? 0})`}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {vista === 'baches' ? (
                <>
                  <Chip activo={filtroEstado === 'todos'} onClick={() => setFiltroEstado('todos')}>
                    Todos ({totalBaches})
                  </Chip>
                  {ESTADOS.map((e) => {
                    const n = totales?.porEstado?.[e.clave] ?? 0;
                    // Un estado sin baches no se muestra: un chip en 0 solo estorba —
                    // salvo "Sobregirados", que en 0 es justamente la buena noticia.
                    if (!n && e.clave !== 'sobregirado') return null;
                    return (
                      <Chip
                        key={e.clave}
                        activo={filtroEstado === e.clave}
                        onClick={() => setFiltroEstado(e.clave)}
                        clase={e.chip}
                      >
                        {e.etiqueta} ({n})
                      </Chip>
                    );
                  })}
                </>
              ) : (
                (['todos', 'Entrada', 'Salida'] as const).map((t) => (
                  <Chip key={t} activo={filtroTipo === t} onClick={() => setFiltroTipo(t)}>
                    {t === 'todos'
                      ? `Todos (${biochar.movimientos?.length ?? 0})`
                      : `${t}s (${biochar.movimientos?.filter((m) => m.tipo === t).length ?? 0})`}
                  </Chip>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar bache, lote o documento…"
                className="flex-1 min-w-[220px] rounded-lg bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-white/30"
              />
              {vista === 'baches' && (
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as Orden)}
                  aria-label="Ordenar baches"
                  className="rounded-lg bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-white/30 [&>option]:bg-slate-800"
                >
                  <option value="kg-desc">Mayor saldo primero</option>
                  <option value="kg-asc">Menor saldo primero</option>
                  <option value="codigo-desc">Bache más reciente</option>
                  <option value="codigo-asc">Bache más antiguo</option>
                </select>
              )}
            </div>

            <p className="text-xs text-white/50">
              {vista === 'baches'
                ? `${bachesFiltrados.length} bache(s) · suman ${kg(subtotal)} en bodega`
                : `${movimientosFiltrados.length} movimiento(s) · efecto neto ${kg(subtotal)}`}
              {(filtroEstado === 'agotado' || filtroTipo === 'Salida') &&
                ' · histórico, ya no es stock'}
            </p>
          </div>

          {biochar.baches === null && (
            <p className="mt-4 text-sm text-white/60">
              El desglose no está disponible (falta configuración del producto en el Core), pero el
              total sí es válido.
            </p>
          )}

          {vista === 'baches' ? (
            <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-white/10">
              <table className="w-full min-w-[720px] text-sm text-white">
                <thead className="bg-white/10 text-xs uppercase tracking-wider text-white/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Bache</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">En bodega</th>
                    <th className="px-4 py-3 text-right font-medium">Ingresado</th>
                    <th className="px-4 py-3 text-right font-medium">Consumido</th>
                    <th className="px-4 py-3 text-left font-medium">Destinos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bachesFiltrados.map((b) => (
                    <tr key={b.codigo} className="bg-white/[0.02] hover:bg-white/[0.06]">
                      <td className="px-4 py-3 font-medium">{b.codigo}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                            META[b.estado].chip
                          }`}
                        >
                          {META[b.estado].etiqueta}
                        </span>
                      </td>
                      {/* Un saldo negativo es posible y se muestra tal cual: significa
                          que se descontó más de lo que había, y esconderlo deja el
                          error sin dueño (pasó con S-00177: −0,18 kg). */}
                      <td className={`px-4 py-3 text-right tabular-nums ${META[b.estado].texto}`}>
                        {kg(b.kg)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/70">
                        {kg(b.kgIngresado)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/70">
                        {kg(b.kgConsumido)}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {b.lotes.length ? b.lotes.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                  {!bachesFiltrados.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-white/50">
                        Ningún bache coincide con el filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-white/10">
              <table className="w-full min-w-[720px] text-sm text-white">
                <thead className="bg-white/10 text-xs uppercase tracking-wider text-white/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-left font-medium">Tipo</th>
                    <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-4 py-3 text-left font-medium">Bache</th>
                    <th className="px-4 py-3 text-left font-medium">Destino</th>
                    <th className="px-4 py-3 text-left font-medium">Documento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {movimientosFiltrados.map((m) => (
                    <tr key={m.id} className="bg-white/[0.02] hover:bg-white/[0.06]">
                      <td className="px-4 py-3 whitespace-nowrap text-white/70">{fecha(m.fecha)}</td>
                      <td className="px-4 py-3">
                        <TipoBadge tipo={m.tipo} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{kg(m.kg)}</td>
                      <td className="px-4 py-3">{m.bache || '—'}</td>
                      <td className="px-4 py-3 text-white/60">{m.destino || '—'}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{m.documento || '—'}</td>
                    </tr>
                  ))}
                  {!movimientosFiltrados.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-white/50">
                        Ningún movimiento coincide con el filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-6 text-xs text-white/40">
            Cada bache entra a este inventario cuando se le da &ldquo;Pasar a Bodega&rdquo; en el
            Sistema de Baches: el biochar en planta todavía no es inventario. Los baches agotados no
            se borran — son el histórico que sostiene la contabilidad de carbono.
          </p>
        </>
      ) : (
        <SeccionProducto
          resumen={resumenProd}
          etiquetas={producto === 'blend' ? ETIQUETAS_BLEND : ETIQUETAS_ABONO}
          movimientos={movimientosProd}
          subtotal={subtotal}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          filtroTipo={filtroTipoProd}
          setFiltroTipo={setFiltroTipoProd}
        />
      )}

      {modal === 'salida-biochar' && (
        <Modal
          titulo="Sacar biochar de bodega"
          descripcion="Descuenta el bache en sus tres partes: su fórmula, el libro mayor del Core y su Estado Bache."
          onCerrar={() => setModal(null)}
        >
          <FormSalidaBiochar
            baches={(biochar.baches ?? []).filter((b) => b.kg > 0.01)}
            noDisponibles={biochar.noDisponibles ?? []}
            onListo={tras}
            onCancelar={() => setModal(null)}
          />
        </Modal>
      )}

      {(modal === 'entrada-abono' || modal === 'salida-abono') && (
        <Modal
          titulo={modal === 'entrada-abono' ? 'Ingresar abono 4G' : 'Sacar abono 4G'}
          descripcion={
            modal === 'entrada-abono'
              ? 'Registra una entrada en el libro mayor. El abono llega de afuera: no lo produce la planta.'
              : 'Descuenta abono del libro mayor. Si es para una producción, indica el lote.'
          }
          onCerrar={() => setModal(null)}
        >
          <FormMovimientoAbono
            tipo={modal === 'entrada-abono' ? 'Entrada' : 'Salida'}
            disponible={abono?.kg ?? abono?.kgSegunMovimientos ?? 0}
            onListo={tras}
            onCancelar={() => setModal(null)}
          />
        </Modal>
      )}

      {modal === 'produccion-blend' && (
        <Modal
          titulo="Producción de Biochar Blend"
          descripcion="Convierte biochar puro y abono 4G en producto terminado. Todo queda unido por un lote BLEND-…"
          onCerrar={() => setModal(null)}
        >
          <FormProduccionBlend
            baches={(biochar.baches ?? []).filter((b) => b.kg > 0.01)}
            abonoDisponible={abono?.kg ?? abono?.kgSegunMovimientos ?? 0}
            onListo={tras}
            onCancelar={() => setModal(null)}
          />
        </Modal>
      )}
    </PageShell>
  );
}

/** Lo que devuelve /api/baches/salida: el plan de la salida y sus pasos. */
interface PlanSalida {
  referencia: string;
  destino: string;
  yaExistia: boolean;
  bache: {
    codigo: string;
    kg: number;
    disponibleAntes: number;
    estadoAnterior: string;
    estadoNuevo: string | null;
  };
}

interface StepResultUI {
  step: string;
  ok: boolean;
  error?: string;
}

/**
 * Salida de biochar de un bache, por un motivo que NO es producción de Blend.
 *
 * El bache es obligatorio y no hay "salida general": el biochar solo existe en el
 * inventario como el biochar DE un bache, y una salida sin bache descontaría kg de
 * la nada — que es exactamente el "biochar fantasma" de la auditoría del
 * 2026-07-29 (4 filas sin bache que se comieron 8.070 kg).
 *
 * Antes de escribir se pide el plan al servidor (`dryRun`): esta operación mueve
 * inventario real en dos bases y no se deshace con un botón. Ver el plan —cuántos
 * kg, en qué estado queda el bache, qué parte ya estaba escrita— es lo que separa
 * un registro de un susto.
 */
function FormSalidaBiochar({
  baches,
  noDisponibles,
  onListo,
  onCancelar,
}: {
  baches: BacheBodega[];
  noDisponibles: BacheNoDisponible[];
  onListo: (mensaje: string) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState(baches[0]?.codigo ?? '');
  const [motivo, setMotivo] = useState<MotivoSalida>('laboratorio');
  const [completo, setCompleto] = useState(true);
  const [kgTexto, setKgTexto] = useState('');
  const [destino, setDestino] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fechaSalida, setFechaSalida] = useState(() => new Date().toISOString().split('T')[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanSalida | null>(null);

  const bache = baches.find((b) => b.codigo === codigo);
  const kgPedidos = completo ? (bache?.kg ?? 0) : Number(kgTexto);
  const restante = (bache?.kg ?? 0) - (Number.isFinite(kgPedidos) ? kgPedidos : 0);

  const enviar = async (dryRun: boolean) => {
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/baches/salida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bache: codigo,
          motivo,
          kg: completo ? undefined : Number(kgTexto),
          destino: destino.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          realizaRegistro: usuarioActual(),
          fecha: fechaSalida,
          dryRun,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error ?? `Error ${res.status}`);
      }

      if (dryRun) {
        setPlan(json as PlanSalida);
        return;
      }

      // 207: el bache quedó descontado pero un paso de trazabilidad falló. Se dice
      // con su detalle en vez de celebrar un éxito a medias.
      const fallidos = (json.steps ?? []).filter((p: StepResultUI) => !p.ok);
      await onListo(
        fallidos.length
          ? `${json.message} Pasos con problema: ${fallidos
              .map((p: StepResultUI) => `${p.step} (${p.error})`)
              .join(' · ')}`
          : json.message
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  if (!baches.length) {
    return (
      <div className="text-sm text-white/70">
        Ningún bache tiene biochar disponible en bodega, así que no hay de dónde sacar.
        <div className="mt-4">
          <BotonAccion onClick={onCancelar}>Cerrar</BotonAccion>
        </div>
      </div>
    );
  }

  if (plan) {
    const b = plan.bache;
    return (
      <div className="space-y-4 text-sm text-white">
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-1.5">
          <p className="font-medium">Esto es lo que se va a escribir:</p>
          <p className="text-white/70">
            Bache <span className="text-white">{b.codigo}</span> · salen{' '}
            <span className="text-white">{kg(b.kg)}</span> de {kg(b.disponibleAntes)}
          </p>
          <p className="text-white/70">
            Queda en {kg(b.disponibleAntes - b.kg)} · estado {b.estadoNuevo ?? b.estadoAnterior}
          </p>
          <p className="text-white/70">
            Destino: {plan.destino} · Referencia:{' '}
            <span className="font-mono text-xs">{plan.referencia}</span>
          </p>
          {plan.yaExistia && (
            <p className="text-amber-200">
              ⚠️ Esta salida ya está registrada: confirmar no descontará de nuevo.
            </p>
          )}
        </div>
        {error && <p className="text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => enviar(false)}
            disabled={enviando}
            className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
          >
            {enviando ? 'Registrando…' : 'Confirmar salida'}
          </button>
          <BotonAccion onClick={() => setPlan(null)}>Volver</BotonAccion>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(true);
      }}
      className="space-y-4 text-sm"
    >
      <SelectorBache
        baches={baches}
        valor={codigo}
        onCambio={setCodigo}
        noDisponibles={noDisponibles}
      />

      <label className="block">
        <span className="text-white/70">Motivo</span>
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value as MotivoSalida)}
          className={CAMPO}
        >
          {Object.entries(MOTIVOS_SALIDA).map(([clave, info]) => (
            <option key={clave} value={clave}>
              {info.etiqueta}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-white/50">
          {MOTIVOS_SALIDA[motivo].descripcion}
        </span>
      </label>

      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 space-y-2">
        <label className="flex items-center gap-2 text-white/80">
          <input
            type="checkbox"
            checked={completo}
            onChange={(e) => setCompleto(e.target.checked)}
            className="h-4 w-4 accent-[#5A7836]"
          />
          Sacar el bache completo ({kg(bache?.kg ?? 0)})
        </label>
        {!completo && (
          <label className="block">
            <span className="text-white/70">KG a sacar</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={bache?.kg ?? 0}
              value={kgTexto}
              onChange={(e) => setKgTexto(e.target.value)}
              required
              className={CAMPO}
            />
            <span className="mt-1 block text-xs text-white/50">
              Quedarían {kg(Number.isFinite(restante) ? restante : 0)} en el bache.
            </span>
          </label>
        )}
      </div>

      <label className="block">
        <span className="text-white/70">Destino</span>
        <input
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          placeholder="Laboratorio DataLab, área, quien recibe…"
          className={CAMPO}
        />
        <span className="mt-1 block text-xs text-white/50">
          Si se deja vacío queda el motivo: la merma no tiene a dónde ir.
        </span>
      </label>

      <label className="block">
        <span className="text-white/70">Fecha</span>
        <input
          type="date"
          value={fechaSalida}
          onChange={(e) => setFechaSalida(e.target.value)}
          required
          className={CAMPO}
        />
      </label>

      <label className="block">
        <span className="text-white/70">Observaciones</span>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          className={CAMPO}
        />
      </label>

      {error && <p className="text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="submit"
          disabled={enviando || !bache}
          className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
        >
          {enviando ? 'Calculando…' : 'Ver qué se va a escribir'}
        </button>
        <BotonAccion onClick={onCancelar}>Cancelar</BotonAccion>
      </div>
    </form>
  );
}

/**
 * Entrada o salida de abono 4G. Un solo write, sin plan previo: a diferencia de la
 * salida de un bache —que toca tres cosas en dos bases—, el abono solo existe como
 * movimiento del Core, y ahí un error se corrige con el movimiento contrario.
 */
function FormMovimientoAbono({
  tipo,
  disponible,
  onListo,
  onCancelar,
}: {
  tipo: 'Entrada' | 'Salida';
  disponible: number;
  onListo: (mensaje: string) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [kgTexto, setKgTexto] = useState('');
  const [fechaMov, setFechaMov] = useState(() => new Date().toISOString().split('T')[0]);
  const [lote, setLote] = useState('');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [esProduccion, setEsProduccion] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kgNumerico = Number(kgTexto);
  const esSalida = tipo === 'Salida';

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/pirolisis/inventario/abono/movimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          kg: kgNumerico,
          fecha: fechaMov,
          lote: esSalida && esProduccion ? lote.trim() : undefined,
          referencia: esSalida && esProduccion ? undefined : referencia.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          realizaRegistro: usuarioActual(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? `Error ${res.status}`);
      await onListo(json.advertencia ? `${json.message} ⚠️ ${json.advertencia}` : json.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-4 text-sm">
      <label className="block">
        <span className="text-white/70">KG de abono</span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={esSalida ? disponible : undefined}
          value={kgTexto}
          onChange={(e) => setKgTexto(e.target.value)}
          required
          autoFocus
          className={CAMPO}
        />
        {esSalida && (
          <span className="mt-1 block text-xs text-white/50">
            Hay {kg(disponible)} en bodega
            {Number.isFinite(kgNumerico) && kgNumerico > 0
              ? ` · quedarían ${kg(disponible - kgNumerico)}`
              : ''}
            .
          </span>
        )}
      </label>

      <label className="block">
        <span className="text-white/70">Fecha</span>
        <input
          type="date"
          value={fechaMov}
          onChange={(e) => setFechaMov(e.target.value)}
          required
          className={CAMPO}
        />
      </label>

      {esSalida ? (
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 space-y-2">
          <label className="flex items-center gap-2 text-white/80">
            <input
              type="checkbox"
              checked={esProduccion}
              onChange={(e) => setEsProduccion(e.target.checked)}
              className="h-4 w-4 accent-[#5A7836]"
            />
            Es para una producción de Blend
          </label>
          {esProduccion ? (
            <label className="block">
              <span className="text-white/70">Lote</span>
              <input
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                placeholder="BLEND-2026-08-21"
                required
                className={CAMPO}
              />
              {/* El lote es la trazabilidad del abono: es lo que responde "de qué
                  está hecho este Blend". Sin él, el consumo baja el saldo y no
                  explica nada. */}
              <span className="mt-1 block text-xs text-white/50">
                El lote es lo que permite reconstruir la composición del Blend.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="text-white/70">Referencia de la salida</span>
              <input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="TRASLADO-2026-08-21, MERMA-BODEGA…"
                required
                className={CAMPO}
              />
            </label>
          )}
        </div>
      ) : (
        <label className="block">
          <span className="text-white/70">Documento de la entrada (opcional)</span>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Remisión o factura del proveedor"
            className={CAMPO}
          />
          {/* Sin documento la llave es ABONO-ENTRADA-<fecha>, así que dos entradas
              el mismo día se leen como una. Con documento, cada carga es única. */}
          <span className="mt-1 block text-xs text-white/50">
            Sin documento, dos entradas del mismo día cuentan como una sola.
          </span>
        </label>
      )}

      <label className="block">
        <span className="text-white/70">Observaciones</span>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          className={CAMPO}
        />
      </label>

      {error && <p className="text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
        >
          {enviando ? 'Registrando…' : esSalida ? 'Registrar salida' : 'Registrar entrada'}
        </button>
        <BotonAccion onClick={onCancelar}>Cancelar</BotonAccion>
      </div>
    </form>
  );
}

interface PlanProduccion {
  lote: string;
  fecha: string;
  yaExistia: boolean;
  kgBiochar: number;
  kgAbono: number;
  kgBlend: number;
  baches: Array<{
    codigo: string;
    kg: number;
    disponibleAntes: number;
    estadoAnterior: string;
    estadoNuevo: string | null;
    yaExistia: boolean;
  }>;
}

/** Un bache marcado para entrar a la producción. `kgTexto` vacío = entra completo. */
interface SeleccionBache {
  marcado: boolean;
  kgTexto: string;
}

/**
 * Producción de Biochar Blend: la única puerta por la que el Blend entra al
 * inventario.
 *
 * Pide biochar POR BACHE y no un total, porque `bache_origen_id` es lo que sostiene
 * la contabilidad de carbono: un total suelto no dice de qué bache salió cada kg y
 * la composición del despacho deja de poder reconstruirse.
 *
 * Los KG de Blend se DIGITAN, no se calculan de la fórmula: los porcentajes suman
 * 99,7% y sus componentes no cuadran con el total (decisión abierta con DataLab),
 * así que derivarlos inventaría kilos. El sugerido es biochar + abono, que es la
 * masa que realmente se mezcló; el agua y los biológicos no están en este
 * inventario.
 *
 * Igual que la salida de biochar, primero se ENSAYA: esto mueve inventario real en
 * dos bases y no se deshace con un botón.
 */
function FormProduccionBlend({
  baches,
  abonoDisponible,
  onListo,
  onCancelar,
}: {
  baches: BacheBodega[];
  abonoDisponible: number;
  onListo: (mensaje: string) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [seleccion, setSeleccion] = useState<Record<string, SeleccionBache>>({});
  const [kgAbonoTexto, setKgAbonoTexto] = useState('');
  const [kgBlendTexto, setKgBlendTexto] = useState('');
  const [sufijoLote, setSufijoLote] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fechaProd, setFechaProd] = useState(() => new Date().toISOString().split('T')[0]);
  const [razonAbono, setRazonAbono] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanProduccion | null>(null);

  // La proporción abono/biochar se pide al servidor: `config.blend` es la única
  // fuente de la fórmula y sus variables no son `NEXT_PUBLIC_`, así que copiarla acá
  // sería un segundo sitio donde puede divergir. Si la petición falla no hay
  // sugerido y el operador digita el número: la producción no depende de esto.
  useEffect(() => {
    let vigente = true;
    fetch('/api/pirolisis/blend/produccion')
      .then((res) => res.json())
      .then((json) => {
        const { pctBiochar, pctAbono } = json?.formula ?? {};
        if (vigente && pctBiochar > 0 && pctAbono > 0) setRazonAbono(pctAbono / pctBiochar);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const elegidos = baches
    .map((b) => ({ bache: b, sel: seleccion[b.codigo] }))
    .filter((x) => x.sel?.marcado);

  const kgDe = (b: BacheBodega, sel?: SeleccionBache) => {
    const texto = sel?.kgTexto.trim();
    if (!texto) return b.kg;
    const n = Number(texto);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const kgBiochar = elegidos.reduce((total, x) => total + kgDe(x.bache, x.sel), 0);
  const abonoSugerido = razonAbono !== null ? kgBiochar * razonAbono : null;
  const kgAbono = kgAbonoTexto.trim() ? Number(kgAbonoTexto) : (abonoSugerido ?? 0);
  const kgBlend = kgBlendTexto.trim()
    ? Number(kgBlendTexto)
    : kgBiochar + (Number.isFinite(kgAbono) ? kgAbono : 0);

  const excedido = elegidos.find((x) => kgDe(x.bache, x.sel) > x.bache.kg + 0.01);
  const abonoExcedido = Number.isFinite(kgAbono) && kgAbono > abonoDisponible + 0.01;
  const blendInvalido = kgBlendTexto.trim() !== '' && !(Number(kgBlendTexto) > 0);

  /**
   * Pasar de acá requiere que NINGUNA cantidad supere su disponible.
   *
   * El exceso no se deja pasar con un aviso porque el Core admite saldos negativos:
   * las fórmulas de Airtable no tienen piso, así que producir con más abono del que
   * hay no falla —deja el stock en negativo y nadie se entera hasta el siguiente
   * conteo físico. Ya pasó con el bache S-00177 (−0,18 kg). Un botón apagado es la
   * única barrera real.
   *
   * Ojo con el abono: el sugerido de la fórmula se usa cuando el campo está vacío,
   * así que puede bloquear el botón sin que el operador haya digitado nada. Es
   * correcto —esa es la cantidad con la que se produciría— y el mensaje dice cuánto
   * hay para que sepa qué corregir.
   */
  const listo =
    elegidos.length > 0 &&
    kgBiochar > 0.01 &&
    !excedido &&
    !abonoExcedido &&
    !blendInvalido &&
    Number.isFinite(kgAbono) &&
    kgAbono >= 0;

  /**
   * Selecciona baches hasta consumir exactamente el abono que hay en bodega.
   *
   * El abono es el componente escaso —hay 11.458 kg contra 48.273 de biochar— así
   * que la pregunta real del operador no es "cuánto biochar tengo" sino "cuánto
   * puedo producir antes de quedarme sin abono". Sin esto tocaba tantear a mano
   * marcando y desmarcando baches contra un tope que se mueve con cada clic.
   *
   * El objetivo sale de la fórmula (`kgAbono / (pctAbono / pctBiochar)`), y los
   * baches se toman **del más antiguo al más nuevo**: es FIFO, la regla estándar de
   * bodega, y evita que los baches viejos queden abiertos para siempre mientras se
   * consumen los recién llegados. El último entra parcial con el remanente, para
   * cuadrar al kilo en vez de pasarse.
   *
   * Si el biochar no alcanza para todo el abono, ajusta el abono a lo que dé el
   * biochar disponible: nunca deja el formulario en un estado que no se puede enviar.
   */
  const usarTodoElAbono = () => {
    if (razonAbono === null || abonoDisponible <= 0) return;

    const objetivo = abonoDisponible / razonAbono;
    const porAntiguedad = [...baches].sort((a, b) => a.codigo.localeCompare(b.codigo));

    const nueva: Record<string, SeleccionBache> = {};
    let restante = objetivo;
    for (const b of porAntiguedad) {
      if (restante <= 0.01) break;
      if (b.kg <= restante + 0.01) {
        // Vacío = el bache completo: así el servicio toma el saldo exacto de la
        // fórmula y no un número redondeado que dejaría centavos de kg colgando.
        nueva[b.codigo] = { marcado: true, kgTexto: '' };
        restante -= b.kg;
      } else {
        nueva[b.codigo] = { marcado: true, kgTexto: restante.toFixed(2) };
        restante = 0;
      }
    }

    setSeleccion(nueva);
    setKgAbonoTexto(((objetivo - restante) * razonAbono).toFixed(2));
    setKgBlendTexto('');
  };

  const alternar = (codigo: string) =>
    setSeleccion((prev) => ({
      ...prev,
      [codigo]: { marcado: !prev[codigo]?.marcado, kgTexto: prev[codigo]?.kgTexto ?? '' },
    }));

  const cambiarKg = (codigo: string, kgTexto: string) =>
    setSeleccion((prev) => ({ ...prev, [codigo]: { marcado: true, kgTexto } }));

  const enviar = async (dryRun: boolean) => {
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/pirolisis/blend/produccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baches: elegidos.map((x) => ({
            bache: x.bache.codigo,
            // Vacío = el bache completo: es el caso normal y pedir el número exacto de
            // una fórmula con dos decimales sería una trampa para el operador.
            kg: x.sel?.kgTexto.trim() ? Number(x.sel.kgTexto) : undefined,
          })),
          kgAbono: Number.isFinite(kgAbono) ? kgAbono : 0,
          kgBlend: kgBlendTexto.trim() ? Number(kgBlendTexto) : undefined,
          sufijoLote: sufijoLote.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          realizaRegistro: usuarioActual(),
          fecha: fechaProd,
          dryRun,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? `Error ${res.status}`);

      if (dryRun) {
        setPlan(json as PlanProduccion);
        return;
      }

      // 207: los baches quedaron descontados pero un paso de trazabilidad falló. Se
      // dice con su detalle en vez de celebrar un éxito a medias.
      const fallidos = (json.steps ?? []).filter((p: StepResultUI) => !p.ok);
      await onListo(
        fallidos.length
          ? `${json.message} Pasos con problema: ${fallidos
              .map((p: StepResultUI) => `${p.step} (${p.error})`)
              .join(' · ')}`
          : json.message
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  if (!baches.length) {
    return (
      <div className="text-sm text-white/70">
        Ningún bache tiene biochar disponible en bodega, así que no hay con qué producir.
        <div className="mt-4">
          <BotonAccion onClick={onCancelar}>Cerrar</BotonAccion>
        </div>
      </div>
    );
  }

  if (plan) {
    return (
      <div className="space-y-4 text-sm text-white">
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-1.5">
          <p className="font-medium">Esto es lo que se va a escribir:</p>
          <p className="text-white/70">
            Lote <span className="font-mono text-xs text-white">{plan.lote}</span> · {plan.fecha}
          </p>
          <ul className="mt-2 space-y-1">
            {plan.baches.map((b) => (
              <li key={b.codigo} className="text-white/70">
                <span className="text-white">{b.codigo}</span> · salen {kg(b.kg)} de{' '}
                {kg(b.disponibleAntes)} · queda en {kg(b.disponibleAntes - b.kg)} · estado{' '}
                {b.estadoNuevo ?? b.estadoAnterior}
                {b.yaExistia && <span className="text-amber-200"> · ya descontado</span>}
              </li>
            ))}
          </ul>
          <p className="pt-1 text-white/70">
            Biochar <span className="text-white">{kg(plan.kgBiochar)}</span> + abono{' '}
            <span className="text-white">{kg(plan.kgAbono)}</span> → Blend{' '}
            <span className="text-sky-200">{kg(plan.kgBlend)}</span>
          </p>
          {plan.yaExistia && (
            <p className="text-amber-200">
              ⚠️ Este lote ya está registrado: confirmar no descontará de nuevo, solo completará lo
              que falte.
            </p>
          )}
        </div>
        {error && <p className="text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => enviar(false)}
            disabled={enviando}
            className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
          >
            {enviando ? 'Registrando…' : 'Confirmar producción'}
          </button>
          <BotonAccion onClick={() => setPlan(null)}>Volver</BotonAccion>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(true);
      }}
      className="space-y-4 text-sm"
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-white/70">Baches que aportan el biochar</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={usarTodoElAbono}
              disabled={razonAbono === null || abonoDisponible <= 0}
              title={
                razonAbono === null
                  ? 'No se pudo leer la fórmula del Blend'
                  : 'Marca baches del más antiguo al más nuevo hasta consumir todo el abono'
              }
              className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-40"
            >
              Usar todo el abono
            </button>
            {elegidos.length > 0 && (
              <button
                type="button"
                onClick={() => setSeleccion({})}
                className="rounded-lg px-3 py-1 text-xs font-medium text-white/60 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        <p className="mt-0.5 text-xs text-white/50">
          Deja los KG vacíos para llevar el bache completo.
        </p>
        <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-white/5 ring-1 ring-white/10 p-2">
          {baches.map((b) => {
            const sel = seleccion[b.codigo];
            const sobra = kgDe(b, sel) > b.kg + 0.01;
            return (
              <div key={b.codigo} className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-white/80">
                  <input
                    type="checkbox"
                    checked={Boolean(sel?.marcado)}
                    onChange={() => alternar(b.codigo)}
                    className="h-4 w-4 accent-[#5A7836]"
                  />
                  <span className="font-mono text-xs">{b.codigo}</span>
                  <span className="text-white/50">{kg(b.kg)}</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={b.kg}
                  value={sel?.kgTexto ?? ''}
                  onChange={(e) => cambiarKg(b.codigo, e.target.value)}
                  placeholder="completo"
                  aria-label={`KG del bache ${b.codigo}`}
                  className={`w-28 rounded-lg bg-white/10 px-2 py-1 text-right text-xs text-white placeholder-white/30 ring-1 focus:outline-none focus-visible:ring-2 ${
                    sobra ? 'ring-red-400/60' : 'ring-white/20 focus-visible:ring-[#5A7836]'
                  }`}
                />
              </div>
            );
          })}
        </div>
        {excedido && (
          <p className="mt-1 text-xs text-red-300">
            El bache {excedido.bache.codigo} solo tiene {kg(excedido.bache.kg)}.
          </p>
        )}
      </div>

      <label className="block">
        <span className="text-white/70">Abono 4G (kg)</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={kgAbonoTexto}
          onChange={(e) => setKgAbonoTexto(e.target.value)}
          placeholder={abonoSugerido !== null ? abonoSugerido.toFixed(2) : '0,00'}
          className={`${CAMPO} ${abonoExcedido ? 'ring-red-400/60' : ''}`}
        />
        <span className="mt-1 block text-xs text-white/50">
          En bodega hay {kg(abonoDisponible)}.
          {abonoSugerido !== null && ` La fórmula sugiere ${kg(abonoSugerido)} para este biochar.`}
        </span>
        {abonoExcedido && (
          <span className="mt-1 block text-xs text-red-300">
            Es más abono del que hay en bodega: sobran {kg(kgAbono - abonoDisponible)}. Ajusta la
            cantidad o registra primero la entrada de abono que falta.
          </span>
        )}
      </label>

      <label className="block">
        <span className="text-white/70">Blend producido (kg)</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={kgBlendTexto}
          onChange={(e) => setKgBlendTexto(e.target.value)}
          placeholder={(kgBiochar + (Number.isFinite(kgAbono) ? kgAbono : 0)).toFixed(2)}
          className={CAMPO}
        />
        <span className="mt-1 block text-xs text-white/50">
          Es lo que se PESÓ. Vacío = biochar + abono. El agua y los biológicos no están en este
          inventario, así que la fórmula no puede dar este número.
        </span>
        {blendInvalido && (
          <span className="mt-1 block text-xs text-red-300">
            Los KG de Blend deben ser mayores que cero (o déjalo vacío).
          </span>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-white/70">Fecha</span>
          <input
            type="date"
            value={fechaProd}
            onChange={(e) => setFechaProd(e.target.value)}
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="text-white/70">Pedido / distintivo del lote</span>
          <input
            value={sufijoLote}
            onChange={(e) => setSufijoLote(e.target.value)}
            placeholder="SIRIUS-PED-0059"
            className={CAMPO}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-white/70">Observaciones</span>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          className={CAMPO}
        />
      </label>

      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 space-y-1 text-xs text-white/60">
        <p>
          Lote:{' '}
          <span className="font-mono text-white/80">
            BLEND-{fechaProd}
            {sufijoLote.trim() && `-${sufijoLote.trim()}`}
          </span>
        </p>
        <p>
          Biochar {kg(kgBiochar)} + abono {kg(Number.isFinite(kgAbono) ? kgAbono : 0)} → Blend{' '}
          {kg(Number.isFinite(kgBlend) ? kgBlend : 0)}
        </p>
        <p>
          Se descuenta el biochar de {elegidos.length} bache(s) y el abono, y entra el Blend al
          libro mayor. Todo queda unido por el lote.
        </p>
      </div>

      {error && <p className="text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={enviando || !listo}
          className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
        >
          {enviando ? 'Calculando…' : 'Ver qué se va a escribir'}
        </button>
        <BotonAccion onClick={onCancelar}>Cancelar</BotonAccion>
      </div>

      {/* Un botón apagado sin explicación se lee como que la app se rompió. */}
      {!listo && (
        <p className="text-xs text-white/50">
          {!elegidos.length || kgBiochar <= 0.01
            ? 'Marca al menos un bache para poder continuar.'
            : excedido
              ? `El bache ${excedido.bache.codigo} no tiene esos kg.`
              : abonoExcedido
                ? 'No hay tanto abono en bodega.'
                : blendInvalido
                  ? 'Revisa los KG de Blend producido.'
                  : 'Revisa las cantidades.'}
        </p>
      )}
    </form>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        tipo === 'Entrada'
          ? 'bg-emerald-500/15 text-emerald-200'
          : 'bg-orange-500/15 text-orange-200'
      }`}
    >
      {tipo}
    </span>
  );
}

/**
 * Un producto SIN trazabilidad por bache: el abono 4G y el Biochar Blend.
 *
 * Los dos se resumen igual —saldo del libro mayor, desglose por lote, tabla de
 * movimientos— y solo cambia cómo se nombra cada cifra, así que la sección es una
 * y las palabras vienen en `etiquetas`. Duplicarla para el Blend habría duplicado
 * también el aviso de divergencia, que es justamente lo que el Blend necesita
 * mostrar (su fila de Stock_Actual marca 0 kg teniendo miles de kg de entradas).
 *
 * No hay tabla por bache a propósito: ninguno de los dos se produce por lotes de
 * pirólisis. La trazabilidad del abono es a qué producción se fue; la del Blend,
 * de qué producción salió.
 */
function SeccionProducto({
  resumen,
  etiquetas,
  movimientos,
  subtotal,
  busqueda,
  setBusqueda,
  filtroTipo,
  setFiltroTipo,
}: {
  resumen: ResumenProd | null;
  etiquetas: EtiquetasProducto;
  movimientos: MovimientoProd[];
  subtotal: number;
  busqueda: string;
  setBusqueda: (v: string) => void;
  filtroTipo: FiltroTipo;
  setFiltroTipo: (v: FiltroTipo) => void;
}) {
  if (!resumen) {
    return (
      <div className="mt-6 rounded-xl bg-white/5 ring-1 ring-white/10 p-6 text-white">
        <h2 className="text-lg font-semibold">{etiquetas.titulo} sin configurar</h2>
        <p className="mt-2 text-sm text-white/70">{etiquetas.sinConfigurar}</p>
      </div>
    );
  }

  return (
    <>
      <section className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 [perspective:1200px]">
        <Kpi
          label={etiquetas.kpiSaldo}
          valor={resumen.kg === null ? '—' : kg(resumen.kg)}
          nota="Saldo del libro mayor"
          acento={etiquetas.acento}
        />
        <Kpi
          label={etiquetas.kpiIngresado}
          valor={kg(resumen.kgIngresado)}
          nota={etiquetas.kpiIngresadoNota}
        />
        <Kpi
          label={etiquetas.kpiConsumido}
          valor={kg(resumen.kgConsumido)}
          nota={etiquetas.kpiConsumidoNota}
        />
        <Kpi
          label="Movimientos"
          valor={String(resumen.movimientos.length)}
          nota="Entradas y salidas registradas"
        />
      </section>

      {/* Que el saldo no cuadre con los movimientos es la señal —la única— de que
          alguno entró sin vincularse a `Stock_Actual`, que es el modo silencioso en
          que un saldo se queda corto. */}
      {resumen.divergencia !== null && Math.abs(resumen.divergencia) > 0.01 && (
        <Aviso>
          ⚠️ El saldo ({kg(resumen.kg ?? 0)}) no cuadra con la suma de los movimientos (
          {kg(resumen.kgSegunMovimientos)}): difieren en {kg(resumen.divergencia)}. Hay movimientos
          sin vincular a Stock_Actual, así que el saldo no los cuenta.
        </Aviso>
      )}

      {resumen.kg === null && (
        <Aviso>
          ⚠️ No se pudo leer la fila de Stock_Actual de {etiquetas.titulo}. Los totales de abajo
          salen de los movimientos, que es la mejor aproximación disponible.
        </Aviso>
      )}

      {resumen.porLote.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-3">
            {etiquetas.tituloPorLote}
          </h2>
          <div className="overflow-x-auto rounded-xl ring-1 ring-white/10">
            <table className="w-full min-w-[420px] text-sm text-white">
              <thead className="bg-white/10 text-xs uppercase tracking-wider text-white/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Lote de Blend</th>
                  <th className="px-4 py-3 text-right font-medium">{etiquetas.columnaPorLote}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {resumen.porLote.map((l) => (
                  <tr key={l.lote} className="bg-white/[0.02] hover:bg-white/[0.06]">
                    <td className="px-4 py-3 font-medium">{l.lote}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/80">{kg(l.kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-8 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Movimientos
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {(['todos', 'Entrada', 'Salida'] as const).map((t) => (
            <Chip key={t} activo={filtroTipo === t} onClick={() => setFiltroTipo(t)}>
              {t === 'todos'
                ? `Todos (${resumen.movimientos.length})`
                : `${t}s (${resumen.movimientos.filter((m) => m.tipo === t).length})`}
            </Chip>
          ))}
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar lote, documento o motivo…"
          className="w-full rounded-lg bg-white/5 px-4 py-2 text-sm text-white placeholder-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-white/30"
        />
        <p className="text-xs text-white/50">
          {movimientos.length} movimiento(s) · efecto neto {kg(subtotal)}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-white/10">
        <table className="w-full min-w-[680px] text-sm text-white">
          <thead className="bg-white/10 text-xs uppercase tracking-wider text-white/60">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Fecha</th>
              <th className="px-4 py-3 text-left font-medium">Tipo</th>
              <th className="px-4 py-3 text-right font-medium">Cantidad</th>
              <th className="px-4 py-3 text-left font-medium">Destino</th>
              <th className="px-4 py-3 text-left font-medium">Motivo</th>
              <th className="px-4 py-3 text-left font-medium">Documento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {movimientos.map((m) => (
              <tr key={m.id} className="bg-white/[0.02] hover:bg-white/[0.06]">
                <td className="px-4 py-3 whitespace-nowrap text-white/70">{fecha(m.fecha)}</td>
                <td className="px-4 py-3">
                  <TipoBadge tipo={m.tipo} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{kg(m.cantidad)}</td>
                <td className="px-4 py-3 text-white/60">{m.destino || '—'}</td>
                <td className="px-4 py-3 text-white/60">{m.motivo || '—'}</td>
                <td className="px-4 py-3 text-white/50 text-xs">{m.documento || '—'}</td>
              </tr>
            ))}
            {!movimientos.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-white/50">
                  Ningún movimiento coincide con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-white/40">{etiquetas.pie}</p>
    </>
  );
}
