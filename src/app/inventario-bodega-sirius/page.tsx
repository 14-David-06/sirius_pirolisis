/**
 * Inventario de la Bodega Sirius: la vista de BODEGA del biochar puro.
 *
 * No duplica el Sistema de Baches. Allá la pregunta es "cómo va la producción de
 * este bache" y la fuente es la fórmula de la tabla de baches; acá es "qué hay
 * físicamente en bodega y de dónde salió cada kg", y la fuente es el libro mayor
 * que comparte el ecosistema Sirius (Inventario Production Core). Cada bache
 * aparece aquí en el momento en que se le da "Pasar a Bodega": ese cambio de
 * estado es el que escribe la Entrada (ver src/lib/biochar-bodega.ts).
 *
 * Los estados de bodega (completo/parcial/agotado/sobregirado) los deriva el
 * endpoint, no esta pantalla: los mismos números alimentan los contadores de los
 * filtros y los totales, y clasificar por separado en cada lado es como un chip
 * llega a decir "12 agotados" mientras el KPI cuenta otra cosa.
 */

"use client";

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { TurnoProtection } from '@/components';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

type EstadoBodega = 'completo' | 'parcial' | 'agotado' | 'sobregirado';

interface Disponible {
  kg: number;
  origen: 'inventario-prod-core' | 'baches';
  kgBaches: number | null;
  kgCore: number | null;
  divergencia: number | null;
}

interface BacheBodega {
  codigo: string;
  kg: number;
  kgIngresado: number;
  kgConsumido: number;
  lotes: string[];
  estado: EstadoBodega;
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

interface Totales {
  ingresado: number;
  consumido: number;
  saldo: number;
  porEstado: Record<EstadoBodega, number>;
}

interface BodegaData {
  disponible: Disponible;
  baches: BacheBodega[] | null;
  totales: Totales | null;
  movimientos: Movimiento[] | null;
}

/** Cómo se presenta cada estado de bodega. El orden es el de los chips. */
const ESTADOS: Array<{
  clave: EstadoBodega;
  etiqueta: string;
  nota: string;
  chip: string;
  texto: string;
}> = [
  {
    clave: 'completo',
    etiqueta: 'Sin consumir',
    nota: 'Entró a bodega y no se le ha sacado nada',
    chip: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30',
    texto: 'text-emerald-300',
  },
  {
    clave: 'parcial',
    etiqueta: 'Parciales',
    nota: 'Ya aportaron a un lote y les queda saldo',
    chip: 'bg-sky-500/15 text-sky-200 ring-sky-400/30',
    texto: 'text-sky-300',
  },
  {
    clave: 'agotado',
    etiqueta: 'Agotados',
    nota: 'Consumidos por completo; el histórico queda',
    chip: 'bg-white/10 text-white/70 ring-white/20',
    texto: 'text-white/50',
  },
  {
    clave: 'sobregirado',
    etiqueta: 'Sobregirados',
    nota: 'Se les descontó más de lo que tenían',
    chip: 'bg-red-500/15 text-red-200 ring-red-400/30',
    texto: 'text-red-300',
  },
];

const META = Object.fromEntries(ESTADOS.map((e) => [e.clave, e])) as Record<
  EstadoBodega,
  (typeof ESTADOS)[number]
>;

type FiltroEstado = EstadoBodega | 'todos';
type FiltroTipo = 'todos' | 'Entrada' | 'Salida';
type Orden = 'kg-desc' | 'kg-asc' | 'codigo-desc' | 'codigo-asc';

const kg = (n: number) =>
  `${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

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
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5">
      <span className="text-xs font-medium uppercase tracking-wider text-white/60">{label}</span>
      <p className={`mt-2 text-2xl sm:text-3xl font-semibold tabular-nums ${acento}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-white/50">{nota}</p>}
    </div>
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

function BodegaContent() {
  const [data, setData] = useState<BodegaData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'baches' | 'movimientos'>('baches');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [orden, setOrden] = useState<Orden>('kg-desc');

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

  const bachesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = (data?.baches ?? []).filter((b) => {
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
  }, [data, busqueda, filtroEstado, orden]);

  const movimientosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (data?.movimientos ?? []).filter((m) => {
      if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
      if (!q) return true;
      return (
        m.bache.toLowerCase().includes(q) ||
        m.destino.toLowerCase().includes(q) ||
        m.documento.toLowerCase().includes(q) ||
        m.codigo.toLowerCase().includes(q)
      );
    });
  }, [data, busqueda, filtroTipo]);

  /** Lo que suma la selección actual: un filtro sin su subtotal obliga a sumar a mano. */
  const subtotal = useMemo(() => {
    if (vista === 'baches') return bachesFiltrados.reduce((s, b) => s + b.kg, 0);
    return movimientosFiltrados.reduce(
      (s, m) => s + (m.tipo === 'Salida' ? -m.kg : m.kg),
      0
    );
  }, [vista, bachesFiltrados, movimientosFiltrados]);

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

  if (error || !data) {
    return (
      <PageShell>
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-400/30 p-6 text-white">
          <h1 className="text-lg font-semibold">No se pudo leer el inventario de bodega</h1>
          <p className="mt-2 text-sm text-white/70">{error ?? 'Respuesta vacía del servidor'}</p>
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

  const { disponible, totales } = data;
  const totalBaches = data.baches?.length ?? 0;
  const conSaldo = (totales?.porEstado.completo ?? 0) + (totales?.porEstado.parcial ?? 0);

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">
            Inventario Bodega Sirius
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Biochar puro almacenado, según el libro mayor de Sirius Inventario Production Core.
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

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      {/* La divergencia entre las dos vistas del mismo inventario se muestra, no se
          esconde: significa que un consumo se escribió en una y no en la otra. */}
      {disponible.divergencia !== null && Math.abs(disponible.divergencia) > 0.01 && (
        <div className="mt-4 rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 p-4 text-sm text-amber-100">
          ⚠️ El libro mayor ({kg(disponible.kgCore ?? 0)}) y la fórmula de los baches (
          {kg(disponible.kgBaches ?? 0)}) difieren en {kg(disponible.divergencia)}. Un consumo quedó
          escrito en una sola de las dos vistas.
        </div>
      )}

      {disponible.origen === 'baches' && (
        <div className="mt-4 rounded-xl bg-amber-400/10 ring-1 ring-amber-300/30 p-4 text-sm text-amber-100">
          ⚠️ No se pudo leer el saldo del Core; el total mostrado sale de la fórmula de los baches.
        </div>
      )}

      {/* ── Selector de vista ───────────────────────────────────────────────── */}
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
              : `Movimientos (${data.movimientos?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {vista === 'baches' ? (
            <>
              <Chip activo={filtroEstado === 'todos'} onClick={() => setFiltroEstado('todos')}>
                Todos ({totalBaches})
              </Chip>
              {ESTADOS.map((e) => {
                const n = totales?.porEstado[e.clave] ?? 0;
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
                  ? `Todos (${data.movimientos?.length ?? 0})`
                  : `${t}s (${data.movimientos?.filter((m) => m.tipo === t).length ?? 0})`}
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
          {(filtroEstado === 'agotado' || filtroTipo === 'Salida') && ' · histórico, ya no es stock'}
        </p>
      </div>

      {data.baches === null && (
        <p className="mt-4 text-sm text-white/60">
          El desglose no está disponible (falta configuración del producto en el Core), pero el total
          sí es válido.
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
                  {/* Un saldo negativo es posible y se muestra tal cual: significa que
                      se descontó más de lo que había, y esconderlo deja el error sin
                      dueño (pasó con S-00177: −0,18 kg). */}
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${META[b.estado].texto}`}
                  >
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.tipo === 'Entrada'
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : 'bg-orange-500/15 text-orange-200'
                      }`}
                    >
                      {m.tipo}
                    </span>
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
        Cada bache entra a este inventario cuando se le da &ldquo;Pasar a Bodega&rdquo; en el Sistema
        de Baches: el biochar en planta todavía no es inventario. Los baches agotados no se borran —
        son el histórico que sostiene la contabilidad de carbono.
      </p>
    </PageShell>
  );
}
