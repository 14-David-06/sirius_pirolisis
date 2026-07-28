/**
 * Formato y presentación del módulo de Activos Fijos.
 *
 * Mismo criterio que `inventario.format.ts`: el color y la etiqueta de cada
 * estado se definen UNA vez aquí y los componentes solo los consumen. Así la
 * tabla, las tarjetas, las alertas y el detalle no pueden discrepar.
 *
 * Las clases son de Tailwind sobre fondo oscuro; nunca se construyen de forma
 * dinámica (`bg-${color}-500`) porque el compilador de Tailwind no las genera.
 */

import type { CondicionActivo, EstadoOperativo } from '@/types/activos';

const formatoEntero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const formatoDecimal = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Formatea una cantidad con separador de miles local: 33614 → "33.614". */
export function formatCantidad(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  return Number.isInteger(valor) ? formatoEntero.format(valor) : formatoDecimal.format(valor);
}

/** Formatea pesos colombianos sin decimales: 1250000 → "$ 1.250.000". */
export function formatMoneda(valor: number): string {
  if (!Number.isFinite(valor)) return formatoMoneda.format(0);
  return formatoMoneda.format(valor);
}

/**
 * Moneda abreviada para indicadores, donde el ancho es escaso:
 * 1_250_000 → "$ 1,3 M"; 45_000_000_000 → "$ 45 mil M".
 */
export function formatMonedaCompacta(valor: number): string {
  if (!Number.isFinite(valor) || valor === 0) return '$ 0';
  const abs = Math.abs(valor);
  if (abs >= 1_000_000_000) return `$ ${formatCantidad(redondear(valor / 1_000_000_000))} mil M`;
  if (abs >= 1_000_000) return `$ ${formatCantidad(redondear(valor / 1_000_000))} M`;
  if (abs >= 1_000) return `$ ${formatCantidad(redondear(valor / 1_000))} k`;
  return formatMoneda(valor);
}

/** Un decimal como máximo, y sin decimal cuando es innecesario. */
function redondear(valor: number): number {
  const conUnDecimal = Math.round(valor * 10) / 10;
  return Number.isInteger(conUnDecimal) ? conUnDecimal : conUnDecimal;
}

/** Fecha ISO → "27 jul 2026". Devuelve '—' si no hay fecha válida. */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Fecha ISO → "27 jul 2026, 14:35". Para asignaciones (campos dateTime). */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "1 día" / "12 días" / "vencido hace 3 días". */
export function formatDias(dias: number | null | undefined): string {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return '—';
  const abs = Math.abs(Math.trunc(dias));
  const sufijo = abs === 1 ? 'día' : 'días';
  if (dias < 0) return `hace ${formatCantidad(abs)} ${sufijo}`;
  return `${formatCantidad(abs)} ${sufijo}`;
}

/** Fecha de hoy en formato `YYYY-MM-DD`, para inputs `type="date"`. */
export function hoyISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ============================================================================
// ESTADO OPERATIVO
// ============================================================================

interface EstiloUI {
  label: string;
  /** Clases de la pastilla (badge). */
  badge: string;
  /** Clase de color para cifras y textos destacados. */
  texto: string;
}

/**
 * Un color por estado, alineado con el significado operativo:
 * verde = se puede usar, ámbar = requiere atención, rojo = no sirve,
 * gris = fuera del inventario activo.
 */
export const ESTADO_OPERATIVO_UI: Record<EstadoOperativo, EstiloUI> = {
  'Operativo': {
    label: 'Operativo',
    badge: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',
    texto: 'text-emerald-200',
  },
  'Disponible en Almacén': {
    label: 'En almacén',
    badge: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30',
    texto: 'text-sky-200',
  },
  'En Mantenimiento': {
    label: 'En mantenimiento',
    badge: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',
    texto: 'text-amber-200',
  },
  'En Reparación': {
    label: 'En reparación',
    badge: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
    texto: 'text-rose-200',
  },
  'Fuera de Servicio': {
    label: 'Fuera de servicio',
    badge: 'bg-rose-500/10 text-rose-200/90 ring-1 ring-rose-400/20',
    texto: 'text-rose-200/90',
  },
  'En Tránsito': {
    label: 'En tránsito',
    badge: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30',
    texto: 'text-violet-200',
  },
  'Incompleto': {
    label: 'Incompleto',
    badge: 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30',
    texto: 'text-orange-200',
  },
  'Dado de Baja': {
    label: 'Dado de baja',
    badge: 'bg-white/10 text-white/50 ring-1 ring-white/15',
    texto: 'text-white/50',
  },
};

const ESTADOS_CONOCIDOS = Object.keys(ESTADO_OPERATIVO_UI) as EstadoOperativo[];

/** Normaliza cualquier texto de estado a un `EstadoOperativo` conocido. */
export function normalizeEstadoOperativo(valor: string | undefined | null): EstadoOperativo {
  if (valor && (ESTADOS_CONOCIDOS as string[]).includes(valor)) return valor as EstadoOperativo;
  return 'Operativo';
}

/** Estilo de un estado, tolerando valores nuevos añadidos en Airtable. */
export function estiloEstado(estado: string | undefined | null): EstiloUI {
  if (estado && estado in ESTADO_OPERATIVO_UI) {
    return ESTADO_OPERATIVO_UI[estado as EstadoOperativo];
  }
  return {
    label: estado || 'Sin estado',
    badge: 'bg-white/10 text-white/70 ring-1 ring-white/15',
    texto: 'text-white/70',
  };
}

/** Estados que impiden usar el activo (alimentan las alertas). */
export const ESTADOS_NO_OPERABLES: readonly EstadoOperativo[] = [
  'En Reparación',
  'Fuera de Servicio',
] as const;

// ============================================================================
// ASIGNACIÓN
// ============================================================================

export const ASIGNACION_UI: Record<'asignado' | 'disponible', EstiloUI> = {
  asignado: {
    label: 'Asignado',
    badge: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30',
    texto: 'text-sky-200',
  },
  disponible: {
    label: 'Disponible',
    badge: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',
    texto: 'text-emerald-200',
  },
};

// ============================================================================
// VENCIMIENTO
// ============================================================================

export type NivelVencimiento = 'sin_fecha' | 'vencido' | 'critico' | 'proximo' | 'vigente';

/** Días a partir de los cuales un vencimiento se considera "crítico". */
export const DIAS_VENCIMIENTO_CRITICO = 7;

/**
 * Clasifica el vencimiento a partir del campo calculado `Días para Vencimiento`.
 * Airtable devuelve valores negativos cuando la fecha ya pasó.
 */
export function clasificarVencimiento(
  dias: number | null | undefined,
  diasAlerta: number
): NivelVencimiento {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return 'sin_fecha';
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_VENCIMIENTO_CRITICO) return 'critico';
  if (dias <= diasAlerta) return 'proximo';
  return 'vigente';
}

export const VENCIMIENTO_UI: Record<NivelVencimiento, EstiloUI> = {
  vencido: {
    label: 'Vencido',
    badge: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
    texto: 'text-rose-200',
  },
  critico: {
    label: 'Vence esta semana',
    badge: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
    texto: 'text-rose-200',
  },
  proximo: {
    label: 'Por vencer',
    badge: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',
    texto: 'text-amber-200',
  },
  vigente: {
    label: 'Vigente',
    badge: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',
    texto: 'text-emerald-200',
  },
  sin_fecha: {
    label: 'Sin vencimiento',
    badge: 'bg-white/10 text-white/60 ring-1 ring-white/15',
    texto: 'text-white/60',
  },
};

// ============================================================================
// CONDICIÓN FÍSICA
// ============================================================================

export const CONDICION_UI: Record<CondicionActivo, EstiloUI> = {
  'Excelente': {
    label: 'Excelente',
    badge: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',
    texto: 'text-emerald-200',
  },
  'Buena': {
    label: 'Buena',
    badge: 'bg-emerald-500/10 text-emerald-200/90 ring-1 ring-emerald-400/20',
    texto: 'text-emerald-200/90',
  },
  'Regular': {
    label: 'Regular',
    badge: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',
    texto: 'text-amber-200',
  },
  'Necesita Reparación': {
    label: 'Necesita reparación',
    badge: 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/30',
    texto: 'text-orange-200',
  },
  'Dañada': {
    label: 'Dañada',
    badge: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
    texto: 'text-rose-200',
  },
};

/** Etiqueta para agrupar activos sin categoría asignada. */
export const CATEGORIA_SIN_CLASIFICAR = 'Sin clasificar';
