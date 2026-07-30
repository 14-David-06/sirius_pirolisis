/**
 * Semáforo de cobertura de un pedido.
 *
 * La cobertura es ACUMULADA: un pedido está 'cubierto' solo si el stock alcanza
 * para él y para todo lo que se entrega antes. Ver /api/pirolisis/blend/agenda.
 */

"use client";

import type { Cobertura } from '@/types/agenda-blend';

const UI: Record<Cobertura, { label: string; clases: string; titulo: string }> = {
  cubierto: {
    label: 'Cubierto',
    clases: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30',
    titulo: 'La bodega alcanza para este pedido y para todo lo que vence antes',
  },
  parcial: {
    label: 'Parcial',
    clases: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',
    titulo: 'El stock cubre solo parte de este pedido',
  },
  sin_stock: {
    label: 'Sin stock',
    clases: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
    titulo: 'La materia prima ya se agotó con los pedidos anteriores',
  },
  no_aplica: {
    label: 'Cerrado',
    clases: 'bg-white/10 text-white/50 ring-1 ring-white/15',
    titulo: 'Pedido despachado o cancelado: no compromete materia prima',
  },
};

const NOMBRE_MATERIA: Record<string, string> = {
  biochar: 'biochar',
  abono: 'bioabono',
  biologicos: 'biológicos',
};

interface CoberturaBadgeProps {
  cobertura: Cobertura;
  limitante?: string | null;
  className?: string;
}

export default function CoberturaBadge({ cobertura, limitante, className = '' }: CoberturaBadgeProps) {
  const ui = UI[cobertura] ?? UI.no_aplica;
  const detalle = limitante ? ` · falta ${NOMBRE_MATERIA[limitante] ?? limitante}` : '';

  return (
    <span
      title={ui.titulo + (limitante ? ` (limita el ${NOMBRE_MATERIA[limitante] ?? limitante})` : '')}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${ui.clases} ${className}`}
    >
      {ui.label}
      {detalle}
    </span>
  );
}
