/**
 * Formato de números y unidades para el módulo de Inventario.
 *
 * Todo el inventario se muestra en la unidad base de cada insumo (und, kg, L…).
 * NUNCA se suman cantidades de insumos distintos: mezclar kg con L y unidades
 * produce un número sin significado.
 */

const formatoEntero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const formatoDecimal = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/**
 * Formatea una cantidad con separador de miles local.
 * Mantiene decimales solo cuando el valor los tiene: 33614 → "33.614",
 * 14.8 → "14,8".
 */
export function formatCantidad(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  return Number.isInteger(valor) ? formatoEntero.format(valor) : formatoDecimal.format(valor);
}

/** Formatea una cantidad junto a su unidad: `formatStock(14.8, 'L')` → "14,8 L". */
export function formatStock(valor: number, unidad: string): string {
  return `${formatCantidad(valor)} ${unidad || 'und'}`;
}

/** Formatea un porcentaje: 99.5 → "99,5 %". */
export function formatPorcentaje(valor: number): string {
  if (!Number.isFinite(valor)) return '0 %';
  return `${formatCantidad(valor)} %`;
}

/**
 * Fecha ISO → "27 jul 2026". Devuelve '—' si no hay fecha válida.
 *
 * ⚠️ Una cadena `YYYY-MM-DD` se parsea como medianoche UTC, y al renderizarla en la
 * zona local de Colombia (UTC-5) cae al DÍA ANTERIOR: el lote `BLEND-2026-06-24` se
 * mostraba como "23 de jun". Los campos `date` de Airtable llegan siempre así, sin
 * hora, así que hay que construir la fecha en hora local en vez de dejar que el
 * parser la interprete como UTC.
 *
 * Las cadenas con hora (`…T12:00:00Z`) sí representan un instante real y se dejan
 * pasar tal cual: ahí la conversión a hora local es lo correcto.
 */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—';

  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const fecha = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(iso);

  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type EstadoStock = 'disponible' | 'por_agotarse' | 'agotado';

/** Etiquetas y colores por estado de stock (Tailwind, sobre fondo oscuro). */
export const ESTADO_STOCK_UI: Record<EstadoStock, { label: string; badge: string; texto: string }> = {
  disponible: {
    label: 'Disponible',
    badge: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',
    texto: 'text-emerald-200',
  },
  por_agotarse: {
    label: 'Por agotarse',
    badge: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',
    texto: 'text-amber-200',
  },
  agotado: {
    label: 'Agotado',
    badge: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
    texto: 'text-rose-200',
  },
};

/** Normaliza cualquier string de estado a un `EstadoStock` conocido. */
export function normalizeEstado(valor: string | undefined): EstadoStock {
  if (valor === 'agotado' || valor === 'por_agotarse' || valor === 'disponible') return valor;
  return 'disponible';
}
