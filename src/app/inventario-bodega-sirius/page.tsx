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
import { PadFirma, type PadFirmaHandle } from '@/components/PadFirma';
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

/**
 * Un pedido de Biochar Blend, pendiente o cerrado. Lo arma `listarPedidosBlend()`
 * cruzando Pedidos Core con las Salidas del libro mayor: acá solo se pinta y se
 * filtra. `pendiente` viene resuelto del servidor —la pantalla no reinterpreta el
 * estado— para que el chip y la fila no puedan contar cosas distintas.
 */
interface PedidoBlend {
  recordId: string;
  codigo: string;
  estado: string;
  pendiente: boolean;
  idCliente: string;
  clienteNombre: string;
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
 * Un lote de Blend producido con lo que queda sin despachar. Lo deriva
 * `lotesDisponiblesBlend()`: producido menos remitido, porque la Salida de un
 * despacho no lleva el lote y lo remitido hay que contarlo por el otro lado.
 */
interface LoteBlend {
  lote: string;
  kgProducidos: number;
  kgDespachados: number;
  kgDisponibles: number;
  fecha: string;
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
const fecha = (iso: string) => {
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
      className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5 hover:shadow-2xl hover:shadow-black/40"
    >
      <div>
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

  // Los pedidos pendientes viven en su propio estado, no dentro de `data`: se leen
  // de otro endpoint y contra otras bases, así que su carga —y su fallo— no deben
  // arrastrar al inventario, que es lo que la pantalla existe para mostrar.
  const [pedidos, setPedidos] = useState<PedidoBlend[] | null>(null);
  const [lotesBlend, setLotesBlend] = useState<LoteBlend[]>([]);
  const [pedidosCargando, setPedidosCargando] = useState(true);
  /** El pedido que se está despachando, o `null` si no hay ninguno. */
  const [despachando, setDespachando] = useState<PedidoBlend | null>(null);

  const cargar = async () => {
    setCargando(true);
    setPedidosCargando(true);
    setError(null);

    // En paralelo: el inventario no tiene por qué esperar a cuatro Cores de pedidos.
    const pedidosPromesa = fetch('/api/pirolisis/pedidos', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        setPedidos(Array.isArray(json?.pedidos) ? json.pedidos : null);
        setLotesBlend(Array.isArray(json?.lotes) ? json.lotes : []);
      })
      .catch(() => {
        setPedidos(null);
        setLotesBlend([]);
      })
      .finally(() => setPedidosCargando(false));

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

    await pedidosPromesa;
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-start">
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
              className="block w-full p-4 sm:p-5 pb-0 sm:pb-0 text-left"
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
            <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 pt-4 pb-4 sm:pb-5">
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
          <section className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
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

          {/* Qué hay (arriba) contra para qué hace falta (acá). El saldo por sí solo
              no dice si sobra o falta: el pedido pendiente es el que convierte el
              inventario en una decisión de producir. */}
          <SeccionPedidos
            pedidos={pedidos}
            cargando={pedidosCargando}
            kgBlendDisponible={blend?.kg ?? null}
            onDespachar={setDespachando}
          />

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

      {despachando && (
        <Modal
          titulo={`Despachar ${despachando.codigo}`}
          descripcion="Produce el Blend que falte con el biochar y el abono de bodega, emite la remisión y descuenta el libro mayor."
          onCerrar={() => setDespachando(null)}
        >
          <FormDespacho
            pedido={despachando}
            lotes={lotesBlend}
            baches={(biochar.baches ?? []).filter((b) => b.kg > 0.01)}
            onListo={async (mensaje) => {
              setDespachando(null);
              await tras(mensaje);
            }}
            onCancelar={() => setDespachando(null)}
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

/** Orden de los chips: el del Core, de recién recibido a cerrado. */
const ESTADOS_PEDIDO = [
  'Recibido',
  'Procesando',
  'Enviado Parcial',
  'Enviado',
  'Completado',
  'Cancelado',
] as const;

type FiltroPedido = 'todos' | 'pendientes' | (typeof ESTADOS_PEDIDO)[number];

/**
 * Los pedidos de Biochar Blend de pirólisis: los que están pendientes y los ya
 * cerrados —enviados, completados y cancelados—, filtrables por estado.
 *
 * Es una vista de SOLO LECTURA sobre Sirius Pedidos Core: el pedido lo crea el
 * CRM y aquí no hay forma de agendarlo ni de remisionarlo (§8 de CLAUDE.md).
 * Lo que aporta a esta pantalla es la otra mitad de la decisión: el saldo de
 * Blend dice cuánto hay, y esto dice cuánto se debe y a quién ya se le cumplió.
 *
 * Los KG pendientes se derivan —solicitado menos despachado, y el despachado sale
 * de las Salidas del libro mayor—, así que un pedido despachado en dos remisiones
 * muestra el saldo real y no el total original.
 *
 * El total que se anuncia arriba y la comparación contra el saldo de bodega suman
 * SOLO los pendientes, esté el filtro donde esté: un cancelado con 1.500 kg sin
 * despachar no es demanda, y sumarlo diría que falta producir algo que nadie pidió.
 */
function SeccionPedidos({
  pedidos,
  cargando,
  kgBlendDisponible,
  onDespachar,
}: {
  pedidos: PedidoBlend[] | null;
  cargando: boolean;
  kgBlendDisponible: number | null;
  onDespachar: (pedido: PedidoBlend) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroPedido>('todos');

  const lista = pedidos ?? [];
  const pendientes = lista.filter((p) => p.pendiente);
  const totalPendiente = pendientes.reduce((s, p) => s + p.kgPendientes, 0);

  const visibles =
    filtro === 'todos'
      ? lista
      : filtro === 'pendientes'
        ? pendientes
        : lista.filter((p) => p.estado === filtro);

  const kgVisibles = visibles.reduce((s, p) => s + p.kgSolicitados, 0);

  // Solo se compara contra el saldo si se pudo leer: un `null` tratado como 0 diría
  // "falta todo" cuando lo que pasa es que no se sabe.
  const faltante =
    kgBlendDisponible === null ? null : Math.max(0, totalPendiente - kgBlendDisponible);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Pedidos de Biochar Blend
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
          aria-label="Cargando pedidos"
          className="mt-3 h-24 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
        />
      ) : pedidos === null ? (
        /* `null` no es "no hay pedidos": es "no se pudo preguntar". Decir lo
           contrario haría creer que no hay nada que producir. */
        <Aviso>
          ⚠️ No se pudo leer Sirius Pedidos Core, así que no se sabe qué pedidos hay. El
          inventario de arriba sí es válido.
        </Aviso>
      ) : !lista.length ? (
        <p className="mt-3 rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-6 text-center text-sm text-white/50">
          Sirius Pedidos Core no tiene ningún pedido de Biochar Blend.
        </p>
      ) : (
        <>
          {/* Un chip por estado que EXISTA, con su conteo: un filtro que ofrece
              estados vacíos hace buscar en una lista que ya se sabe que no tiene
              nada. “Pendientes” va aparte porque agrupa tres estados y es la
              pregunta que trae a alguien a esta pantalla. */}
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
            {ESTADOS_PEDIDO.map((e) => {
              const n = lista.filter((p) => p.estado === e).length;
              if (!n) return null;
              return (
                <Chip key={e} activo={filtro === e} onClick={() => setFiltro(e)}>
                  {e} ({n})
                </Chip>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-white/50">
            {visibles.length} pedido(s) · suman {kg(kgVisibles)} solicitados
          </p>

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
                    key={p.recordId}
                    /* Lo cerrado se atenúa: sigue consultable, pero no compite por
                       la atención con lo que todavía hay que despachar. */
                    className={
                      p.pendiente
                        ? 'bg-white/[0.02] hover:bg-white/[0.06]'
                        : 'bg-white/[0.01] text-white/60 hover:bg-white/[0.05]'
                    }
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      {p.codigo || '—'}
                      {p.empaque && (
                        <span className="ml-2 text-xs font-normal text-white/40">{p.empaque}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{p.clienteNombre}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/60">{fecha(p.fecha)}</td>
                    <td className="px-4 py-3">
                      <EstadoPedidoBadge estado={p.estado} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.fuenteKg === 'sin-dato' ? (
                        /* El pedido existe pero nadie escribió cuántos kg: mostrar 0
                           lo haría parecer atendido. */
                        <span
                          className="text-amber-300"
                          title="El pedido no tiene cantidad registrada en el Core"
                        >
                          sin dato
                        </span>
                      ) : (
                        kg(p.kgSolicitados)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/70">
                      {kg(p.kgDespachados)}
                      {!!p.remisiones.length && (
                        <span className="ml-2 text-xs text-white/40">
                          {p.remisiones.join(', ')}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        p.pendiente ? 'font-medium text-sky-200' : 'text-white/40'
                      }`}
                    >
                      {/* En un pedido cerrado el saldo no es deuda: va en gris para
                          no leerlo como algo por despachar. */}
                      {kg(p.kgPendientes)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* El botón no se apaga por falta de Blend: despachar
                          PRODUCE lo que falte. Si tampoco hay biochar o abono, es
                          el ensayo el que lo dice, con los kg de cada uno. */}
                      {p.pendiente && p.kgPendientes > 0.01 && (
                        <button
                          onClick={() => onDespachar(p)}
                          className="rounded-lg bg-[#5A7836] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#4a6429]"
                        >
                          Despachar
                        </button>
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

          {/* Lo que la pantalla existe para responder: con lo que hay en bodega,
              ¿alcanza? Se dice el número que falta, no un "insuficiente" a secas. */}
          {faltante !== null && !!pendientes.length && (
            <p className="mt-2 text-xs text-white/50">
              {faltante > 0.01 ? (
                <>
                  Con {kg(kgBlendDisponible ?? 0)} de Blend en bodega faltan {kg(faltante)} por
                  producir para cubrir lo pendiente.
                </>
              ) : (
                <>
                  Los {kg(kgBlendDisponible ?? 0)} de Blend en bodega alcanzan para cubrir lo
                  pendiente.
                </>
              )}
            </p>
          )}

          {visibles.some((p) => p.fuenteKg === 'notas') && (
            <p className="mt-1 text-xs text-white/40">
              Algún pedido no tiene su detalle vinculado en el Core: sus KG salen de las notas.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Cada estado del Core con su tono. Cualquier otro valor se pinta neutro. */
function EstadoPedidoBadge({ estado }: { estado: string }) {
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

/** Lo que devuelve el ensayo del despacho: qué se va a escribir, sin escribirlo. */
interface PlanDespacho {
  pedido: {
    codigo: string;
    cliente: string;
    idCliente: string;
    kgSolicitados: number;
    kgDespachados: number;
    kgPendientes: number;
  };
  kg: number;
  lote: string;
  origen: 'lote-existente' | 'produccion';
  produccion: {
    lote: string;
    kgBlend: number;
    kgBiochar: number;
    kgAbono: number;
    baches: Array<{ codigo: string; kg: number; disponible: number }>;
    kgMaximoProducible: number;
    biocharDisponible: number;
    abonoDisponible: number;
    limitante: 'biochar' | 'abono' | 'ninguno';
  } | null;
  loteDisponibleAntes: number;
  loteDisponibleDespues: number;
  blendDisponibleAntes: number;
  blendDisponibleDespues: number;
  estadoPedidoResultante: 'Enviado' | 'Enviado Parcial';
  motivoParcial?: string;
}

/**
 * Despachar un pedido: produce el Blend si hace falta, emite la remisión y
 * descuenta el producto del libro mayor.
 *
 * El Blend no se almacena esperando pedidos: se produce contra el pedido. Por eso
 * el formulario no pide elegir lote — lo resuelve el servidor, que prefiere el
 * producto que ya existe y solo produce lo que falte, con el biochar y el abono
 * que haya—. El selector de lote queda como anulación manual para el caso en que
 * el operador sepa de cuál quiere que salga.
 *
 * Se ensaya primero (`dryRun`) y se confirma después. Una remisión no se puede
 * deshacer: apenas se emite, el cliente puede firmarla desde el celular en la
 * finca. Y si hay producción de por medio, el ensayo es además la única forma de
 * ver qué baches se van a consumir antes de consumirlos.
 */
function FormDespacho({
  pedido,
  lotes,
  baches,
  onListo,
  onCancelar,
}: {
  pedido: PedidoBlend;
  lotes: LoteBlend[];
  /** Los que tienen biochar en bodega: de acá sale lo que se produzca. */
  baches: BacheBodega[];
  onListo: (mensaje: string) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const conProducto = lotes.filter((l) => l.kgDisponibles > 0.01);

  /** '' = automático: que el servidor decida entre despachar de bodega o producir. */
  const [lote, setLote] = useState('');
  const [responsable, setResponsable] = useState(() => usuarioActual());
  const [seleccion, setSeleccion] = useState<Record<string, SeleccionBache>>({});
  const [pctBiochar, setPctBiochar] = useState<number | null>(null);
  const [fechaDespacho, setFechaDespacho] = useState(() => new Date().toISOString().split('T')[0]);
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDespacho | null>(null);

  // ── Quien se lleva el producto ────────────────────────────────────────────
  // Firma en la planta, en este mismo dispositivo, porque está acá cargando. La
  // del receptor se da después en la finca, por la página pública.
  const [conductor, setConductor] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [emailConductor, setEmailConductor] = useState('');
  const padRef = useRef<PadFirmaHandle | null>(null);
  const [hayFirma, setHayFirma] = useState(false);

  /** La remisión ya emitida: de acá sale el enlace para que el receptor firme. */
  const [emitida, setEmitida] = useState<{ codigo: string; mensaje: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const elegido = conProducto.find((l) => l.lote === lote) ?? null;

  /**
   * Se despacha lo que le falta al pedido, y no se digita.
   *
   * Teclear la cantidad era la única forma de emitir un parcial a propósito, y
   * un parcial honesto lo impone el inventario —lo que no alcanza a salir—, no
   * alguien bajando el número. Despachar de más ya no tiene destino (el backend
   * lo rechaza con `kgPedido > kgPendientes`) y de menos deja el pedido abierto
   * por una decisión que nadie registra en ninguna parte.
   *
   * `Enviado Parcial` sigue existiendo: lo decide el servidor cuando el Blend y
   * la producción no dan para el total.
   */
  const kgPedidos = pedido.kgPendientes;
  const kgValidos = kgPedidos > 0;
  const excedeLote = !!elegido && kgPedidos > elegido.kgDisponibles + 0.01;

  // La proporción de biochar se pide al servidor: `config.blend` es la única
  // fuente de la fórmula y sus variables no son `NEXT_PUBLIC_`, así que copiarla
  // acá sería un segundo sitio donde puede divergir.
  useEffect(() => {
    let vigente = true;
    fetch('/api/pirolisis/blend/produccion')
      .then((res) => res.json())
      .then((json) => {
        const pct = json?.formula?.pctBiochar;
        if (vigente && pct > 0) setPctBiochar(pct);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  /**
   * Si este despacho va a producir, y por lo tanto si hay que elegir baches.
   *
   * Es la misma regla del servidor (`elegirLoteExistente()`: el lote más viejo
   * que cubra el despacho COMPLETO, porque una remisión no puede mezclar dos
   * lotes), repetida acá solo para decidir qué se muestra. Quien manda es el
   * servidor: si se equivoca hacia "no produce", el despacho falla pidiendo los
   * baches en vez de escribir nada.
   */
  const hayLoteQueCubra = conProducto.some((l) => l.kgDisponibles + 0.01 >= kgPedidos);
  const vaAProducir = !lote && !hayLoteQueCubra;

  const biocharEnBodega = Math.round(baches.reduce((t, b) => t + b.kg, 0) * 100) / 100;

  /**
   * El biochar que hay que marcar: el de la fórmula, o todo el que haya si no
   * alcanza.
   *
   * Sin ese tope, un pedido más grande que la bodega pediría marcar biochar que
   * no existe y dejaría el botón apagado para siempre — matando el despacho
   * parcial, que es justo lo que el servidor hace en ese caso: produce lo que se
   * pueda y deja el pedido en `Enviado Parcial`.
   */
  const kgBiocharNecesario =
    pctBiochar === null
      ? null
      : Math.min(Math.round(kgPedidos * pctBiochar * 100) / 100, biocharEnBodega);

  const bachesMarcados = baches
    .map((b) => ({ bache: b, sel: seleccion[b.codigo] }))
    .filter((x) => x.sel?.marcado);

  const kgDeBache = (sel?: SeleccionBache) => {
    const n = Number((sel?.kgTexto ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const kgMarcado =
    Math.round(bachesMarcados.reduce((t, x) => t + kgDeBache(x.sel), 0) * 100) / 100;
  const bacheExcedido = bachesMarcados.find((x) => kgDeBache(x.sel) > x.bache.kg + 0.01);
  const sinKg = bachesMarcados.find((x) => kgDeBache(x.sel) <= 0);

  /**
   * Marcar de más se frena acá y no solo en el servidor.
   *
   * `validarSeleccion()` tolera hasta un 10% por encima —la diferencia de
   * balanza—, pero la pantalla exige que cuadre: es donde el operador puede
   * corregir mientras digita, en vez de enterarse después de pulsar. Al ser la
   * regla ESTRICTA de las dos, nada que la UI deje pasar puede caerse en el
   * servidor; si el margen de allá cambia, acá no hay que tocar nada.
   */
  const excedeBiochar = kgBiocharNecesario !== null && kgMarcado > kgBiocharNecesario + 0.01;

  /**
   * La selección solo se exige cuando hay que producir, y solo si se sabe cuánto
   * biochar hace falta: sin la fórmula no se puede decir si lo marcado alcanza,
   * y bloquear el despacho por una petición que falló sería peor que dejar que el
   * servidor —que sí tiene la fórmula— haga la cuenta y la rechace.
   */
  const bachesListos =
    !vaAProducir ||
    kgBiocharNecesario === null ||
    (bachesMarcados.length > 0 &&
      !bacheExcedido &&
      !sinKg &&
      !excedeBiochar &&
      kgMarcado + 0.01 >= kgBiocharNecesario);

  // Quien se lleva el producto va identificado y firmando: es la mitad de la
  // cadena de custodia. Sin eso, la remisión dice que algo salió de la planta sin
  // decir con quién, y el documento no acredita nada.
  const conductorListo =
    conductor.trim().length > 2 && cedula.trim().length > 3 && hayFirma;

  const listo =
    kgValidos && !excedeLote && !!responsable.trim() && bachesListos && conductorListo;

  const alternarBache = (codigo: string) =>
    setSeleccion((prev) => {
      const actual = prev[codigo];
      return { ...prev, [codigo]: { marcado: !actual?.marcado, kgTexto: actual?.kgTexto ?? '' } };
    });

  const cambiarKgBache = (codigo: string, kgTexto: string) =>
    setSeleccion((prev) => ({ ...prev, [codigo]: { marcado: true, kgTexto } }));

  /**
   * Marca los baches más antiguos hasta cubrir el biochar, con los KG ya puestos.
   *
   * Es una propuesta para editar, no un atajo para no mirar: arranca vacío a
   * propósito —el operador tiene las lonas delante y la app no sabe de cuál sacó—
   * y esto solo le ahorra la digitación cuando el reparto FIFO es el que hizo.
   */
  const proponerFIFO = () => {
    if (kgBiocharNecesario === null) return;
    const porAntiguedad = [...baches].sort((a, b) => a.codigo.localeCompare(b.codigo));
    const nueva: Record<string, SeleccionBache> = {};
    let falta = kgBiocharNecesario;
    for (const b of porAntiguedad) {
      if (falta <= 0.01) break;
      const usa = Math.round(Math.min(b.kg, falta) * 100) / 100;
      if (usa <= 0.01) continue;
      nueva[b.codigo] = { marcado: true, kgTexto: String(usa) };
      falta = Math.round((falta - usa) * 100) / 100;
    }
    setSeleccion(nueva);
  };

  const enviar = async (dryRun: boolean) => {
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/pirolisis/pedidos/despachar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPedido: pedido.codigo,
          lote: lote || undefined,
          kg: kgPedidos,
          // Solo cuando se va a producir: mandarlos con un lote elegido a mano
          // sugeriría que se van a descontar, y ahí no se consume biochar.
          baches: vaAProducir
            ? bachesMarcados.map((x) => ({ codigo: x.bache.codigo, kg: kgDeBache(x.sel) }))
            : undefined,
          responsableEntrega: responsable.trim(),
          transportista: {
            nombre: conductor.trim(),
            cedula: cedula.trim(),
            telefono: telefono.trim() || undefined,
            email: emailConductor.trim() || undefined,
            // El trazo solo se manda en el despacho real: en el ensayo no se sube
            // nada a S3, que es lo que hace que ensayar no deje rastro.
            firmaBase64: dryRun ? undefined : (padRef.current?.obtenerFirma() ?? undefined),
          },
          observaciones: observaciones.trim() || undefined,
          fechaDespacho,
          dryRun,
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(json.error ?? `Error ${res.status}`);
      }

      if (dryRun) {
        setPlan(json.plan as PlanDespacho);
        return;
      }

      // 207: la remisión quedó emitida pero un paso de trazabilidad falló —el
      // descuento del inventario, el estado del pedido, algún paso de la
      // producción—. Se dice con su detalle en vez de celebrar un éxito a medias.
      const fallidos = ((json.steps ?? []) as StepResultUI[]).filter((s) => !s.ok);
      const mensaje = fallidos.length
        ? `${json.message} Pasos con problema: ${fallidos
            .map((s) => `${s.step} (${s.error})`)
            .join(' · ')}`
        : json.message;

      // El despacho no termina al emitir: falta que el receptor firme. Cerrar acá
      // dejaba el enlace sin aparecer por ningún lado, y la mitad de la cadena de
      // custodia sin camino.
      setEmitida({ codigo: json.remision?.codigo ?? '', mensaje });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  if (emitida) {
    const enlace =
      typeof window !== 'undefined' && emitida.codigo
        ? `${window.location.origin}/pirolisis/blend/firmar/${emitida.codigo}`
        : '';
    return (
      <div className="space-y-4 text-sm text-white">
        <div className="rounded-xl bg-[#5A7836]/20 ring-1 ring-[#5A7836]/50 p-4">
          <p className="font-medium">{emitida.mensaje}</p>
        </div>

        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-2">
          <p className="font-medium">Falta la firma de quien recibe</p>
          <p className="text-white/60 text-xs">
            El receptor la da en la finca, desde su celular. Pásale este enlace —o
            ábrelo tú con él delante—: ahí acepta el compromiso de uso, firma, y el
            documento queda entregado.
          </p>
          {enlace ? (
            <>
              <p className="break-all rounded-lg bg-black/30 p-2 font-mono text-xs text-white/80">
                {enlace}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(enlace).then(
                      () => setCopiado(true),
                      () => setCopiado(false)
                    );
                  }}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/20 hover:bg-white/20"
                >
                  {copiado ? 'Copiado' : 'Copiar enlace'}
                </button>
                <a
                  href={enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/20 hover:bg-white/20"
                >
                  Abrir para firmar
                </a>
              </div>
            </>
          ) : (
            <p className="text-xs text-amber-300">
              La remisión se emitió pero no se pudo leer su código, así que no hay enlace. Búscala
              en Remisiones Core para firmarla.
            </p>
          )}
        </div>

        <BotonAccion onClick={() => onListo(emitida.mensaje)}>Cerrar</BotonAccion>
      </div>
    );
  }

  if (plan) {
    const prod = plan.produccion;
    return (
      <div className="space-y-4 text-sm text-white">
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-1.5">
          <p className="font-medium">Esto es lo que se va a escribir:</p>
          <p className="text-white/70">
            Pedido <span className="text-white">{plan.pedido.codigo}</span> · {plan.pedido.cliente}
          </p>

          {prod ? (
            <>
              {/* Producir es la parte irreversible que el operador tiene que ver
                  ANTES: consume baches que ya no se podrán vender como puro. */}
              <p className="text-white/70">
                Se produce el lote{' '}
                <span className="font-mono text-xs text-white">{prod.lote}</span> con{' '}
                <span className="text-white">{kg(prod.kgBiochar)}</span> de biochar y{' '}
                <span className="text-white">{kg(prod.kgAbono)}</span> de abono →{' '}
                <span className="text-white">{kg(prod.kgBlend)}</span> de Blend
              </p>
              <ul className="ml-4 list-disc text-xs text-white/60">
                {prod.baches.map((b) => (
                  <li key={b.codigo}>
                    {b.codigo}: salen {kg(b.kg)} de {kg(b.disponible)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-white/70">
              Sale del lote <span className="font-mono text-xs text-white">{plan.lote}</span>, que
              tiene {kg(plan.loteDisponibleAntes)}
            </p>
          )}

          <p className="text-white/70">
            Se despachan <span className="text-white">{kg(plan.kg)}</span> · el lote queda en{' '}
            {kg(plan.loteDisponibleDespues)}
          </p>
          <p className="text-white/70">
            La bodega queda en {kg(plan.blendDisponibleDespues)} de Blend
          </p>
          <p className="text-white/70">
            El pedido queda en <span className="text-white">{plan.estadoPedidoResultante}</span> ·
            le faltarían {kg(Math.max(0, plan.pedido.kgPendientes - plan.kg))}
          </p>
        </div>

        {plan.motivoParcial && <Aviso>⚠️ {plan.motivoParcial}</Aviso>}

        <p className="text-xs text-white/50">
          Al confirmar {prod ? 'se descuentan los baches y el abono, ' : ''}se emite la remisión en
          Sirius Remisiones Core, se descuenta el Blend del libro mayor y el pedido cambia de
          estado. Nada de esto se deshace desde acá.
        </p>

        {error && <p className="text-red-300">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => enviar(false)}
            disabled={enviando}
            className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
          >
            {enviando ? 'Despachando…' : prod ? 'Producir y despachar' : 'Confirmar despacho'}
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
      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 text-xs text-white/60 space-y-0.5">
        <p>
          <span className="text-white/80">{pedido.codigo}</span> · {pedido.clienteNombre}
        </p>
        <p>
          Pidió {kg(pedido.kgSolicitados)} · ya despachados {kg(pedido.kgDespachados)} · faltan{' '}
          <span className="text-sky-200">{kg(pedido.kgPendientes)}</span>
        </p>
      </div>

      <div className="block">
        <span className="text-white/70">KG a despachar</span>
        <p className={`${CAMPO} ${excedeLote ? 'ring-red-400/60' : ''}`}>
          {kg(pedido.kgPendientes)}
        </p>
        <span className="mt-1 block text-xs text-white/50">
          Si no hay tanto Blend, se produce lo que falte con el biochar y el abono de bodega. Si ni
          eso alcanza, sale lo que se pueda y el pedido queda Enviado Parcial.
        </span>
        {excedeLote && !!elegido && (
          <span className="mt-1 block text-xs text-red-300">
            El lote {elegido.lote} solo tiene {kg(elegido.kgDisponibles)} sin despachar: elige otro
            lote o déjalo en automático.
          </span>
        )}
      </div>

      <label className="block">
        <span className="text-white/70">Lote</span>
        <select value={lote} onChange={(e) => setLote(e.target.value)} className={CAMPO}>
          <option value="">Automático — usa lo que haya y produce lo que falte</option>
          {conProducto.map((l) => (
            <option key={l.lote} value={l.lote}>
              {l.lote} — {kg(l.kgDisponibles)} sin despachar
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-white/50">
          {/* Elegir lote a mano APAGA la producción: si ese lote no alcanza, el
              despacho se rechaza en vez de fabricar por su cuenta. */}
          Elegir un lote concreto no produce nada: sale solo de ese lote, o no sale.
        </span>
      </label>

      {/* El selector solo aparece cuando este despacho va a producir: con producto
          en bodega no se consume biochar y pedir baches sería pedir un dato que no
          se va a escribir. */}
      {vaAProducir && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-white/70">Baches de los que sale el biochar</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={proponerFIFO}
                disabled={kgBiocharNecesario === null || !baches.length}
                title="Marca los baches más antiguos hasta cubrir el biochar, para editarlos"
                className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-40"
              >
                Proponer los más antiguos
              </button>
              {bachesMarcados.length > 0 && (
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
            {kgBiocharNecesario === null
              ? 'Marca de cuáles salió el biochar y cuánto pesó cada uno.'
              : `Este despacho necesita ${kg(kgBiocharNecesario)} de biochar. Digita lo que pesó de cada bache.`}
          </p>

          {!baches.length ? (
            <p className="mt-2 text-xs text-amber-200">
              Ningún bache tiene biochar disponible en bodega, así que no hay con qué producir.
            </p>
          ) : (
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-xl bg-white/5 ring-1 ring-white/10 p-2">
              {baches.map((b) => {
                const sel = seleccion[b.codigo];
                const sobra = kgDeBache(sel) > b.kg + 0.01;
                return (
                  <div key={b.codigo} className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-white/80">
                      <input
                        type="checkbox"
                        checked={Boolean(sel?.marcado)}
                        onChange={() => alternarBache(b.codigo)}
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
                      onChange={(e) => cambiarKgBache(b.codigo, e.target.value)}
                      placeholder="kg"
                      aria-label={`KG del bache ${b.codigo}`}
                      className={`w-24 rounded-lg bg-white/10 px-2 py-1 text-right text-xs text-white placeholder-white/30 ring-1 focus:outline-none focus-visible:ring-2 ${
                        sobra ? 'ring-red-400/60' : 'ring-white/20 focus-visible:ring-[#5A7836]'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {bachesMarcados.length > 0 && (
            <p className="mt-1.5 text-xs">
              <span className="text-white/50">Total marcado: </span>
              <span className={bachesListos ? 'text-white' : 'text-amber-200'}>
                {kg(kgMarcado)}
              </span>
              {kgBiocharNecesario !== null && (
                <span className="text-white/50"> de {kg(kgBiocharNecesario)} necesarios</span>
              )}
            </p>
          )}

          {bacheExcedido && (
            <p className="mt-1 text-xs text-red-300">
              El bache {bacheExcedido.bache.codigo} solo tiene {kg(bacheExcedido.bache.kg)}.
            </p>
          )}

          {excedeBiochar && kgBiocharNecesario !== null && (
            <p className="mt-1 text-xs text-red-300">
              Sobran {kg(kgMarcado - kgBiocharNecesario)}: este Blend solo lleva{' '}
              {kg(kgBiocharNecesario)} de biochar. Descontar de más deja el inventario por debajo
              de lo que hay en bodega.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-white/70">Entrega</span>
          <input
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            className={CAMPO}
          />
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

      {/* Quien se lleva el producto: la primera mitad de la cadena de custodia.
          Se pide acá porque acá está —cargando el camión—, y su firma en este
          dispositivo es lo que acredita que el producto salió con él. La segunda
          mitad, la del receptor, se da en la finca. */}
      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 space-y-3">
        <p className="text-white/80">Quién se lleva el pedido</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-white/70">Nombre completo</span>
            <input
              value={conductor}
              onChange={(e) => setConductor(e.target.value)}
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-white/70">Cédula</span>
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} className={CAMPO} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-white/70">Teléfono (opcional)</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className="text-white/70">Correo (opcional)</span>
            <input
              type="email"
              value={emailConductor}
              onChange={(e) => setEmailConductor(e.target.value)}
              className={CAMPO}
            />
          </label>
        </div>

        <PadFirma
          titulo="Firma de quien se lleva el pedido"
          ayuda="Firma con el dedo o el mouse. Queda en el documento de la remisión."
          handleRef={padRef}
          onCambio={setHayFirma}
        />
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
          {!kgValidos
            ? 'Este pedido ya no tiene KG pendientes.'
            : excedeLote
              ? 'El lote elegido no tiene esos KG.'
              : !conductorListo
                ? 'Falta identificar y que firme quien se lleva el pedido.'
                : !responsable.trim()
                ? 'Falta quién entrega.'
                : bacheExcedido
                  ? `El bache ${bacheExcedido.bache.codigo} no tiene esos KG.`
                  : excedeBiochar && kgBiocharNecesario !== null
                    ? `Sobran ${kg(kgMarcado - kgBiocharNecesario)} de biochar marcado.`
                    : sinKg
                    ? `Falta digitar los KG del bache ${sinKg.bache.codigo}.`
                    : !bachesMarcados.length
                      ? 'Marca de qué baches sale el biochar.'
                      : kgBiocharNecesario !== null
                        ? `Faltan ${kg(kgBiocharNecesario - kgMarcado)} de biochar por marcar.`
                        : 'Revisa los datos.'}
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
      <section className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
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
