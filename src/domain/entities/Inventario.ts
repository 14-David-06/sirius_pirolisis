// src/domain/entities/Inventario.ts
// Entidades y esquemas de validación para el módulo de inventario con trazabilidad productiva

import { z } from 'zod';

// --- Enums ---

export const TIPO_USO_VALUES = [
  'balance_de_masa',
  'recoleccion_desechos',
  'limpieza_mantenimiento',
  'dano_o_perdida',
  'ajuste_inventario',
  'otro',
] as const;

export const CATEGORIA_INSUMO_VALUES = [
  'lona',
  'big_bag',
  'quimico',
  'herramienta',
  'consumible',
  'otro',
] as const;

export const ESTADO_INSUMO_VALUES = [
  'disponible',
  'asignado',
  'consumido',
  'vencido',
  'dado_de_baja',
  'en_mantenimiento',
] as const;

export type TipoUso = typeof TIPO_USO_VALUES[number];
export type CategoriaInsumo = typeof CATEGORIA_INSUMO_VALUES[number];
export type EstadoInsumo = typeof ESTADO_INSUMO_VALUES[number];

// Mapa: tipo_uso → es_productivo
export const TIPO_USO_PRODUCTIVO: Record<TipoUso, boolean> = {
  balance_de_masa: true,
  recoleccion_desechos: false,
  limpieza_mantenimiento: false,
  dano_o_perdida: false,
  ajuste_inventario: false,
  otro: false,
};

// Labels para UI
export const TIPO_USO_LABELS: Record<TipoUso, string> = {
  balance_de_masa: 'Balance de Masa (Producción)',
  recoleccion_desechos: 'Recolección de Desechos',
  limpieza_mantenimiento: 'Limpieza / Mantenimiento',
  dano_o_perdida: 'Daño o Pérdida',
  ajuste_inventario: 'Ajuste de Inventario',
  otro: 'Otro',
};

export const TIPO_USO_ICONS: Record<TipoUso, string> = {
  balance_de_masa: '⚖️',
  recoleccion_desechos: '🗑️',
  limpieza_mantenimiento: '🧹',
  dano_o_perdida: '💔',
  ajuste_inventario: '📋',
  otro: '📝',
};

// --- Zod Schemas ---

export const removeQuantitySchema = z.object({
  itemId: z.string().min(1, 'ID del insumo es requerido'),
  cantidad: z.number().positive('La cantidad debe ser un número positivo'),
  tipo_uso: z.enum(TIPO_USO_VALUES, {
    errorMap: () => ({ message: `Tipo de uso debe ser uno de: ${TIPO_USO_VALUES.join(', ')}` }),
  }),
  balance_masa_id: z.string().nullable().optional(),
  mantenimiento_id: z.string().nullable().optional(),
  observaciones: z.string().optional(),
  documentoSoporteUrl: z.string().optional(),
  'Realiza Registro': z.string().optional(),
}).refine(
  (data) => {
    if (data.tipo_uso === 'otro') {
      return data.observaciones && data.observaciones.trim().length > 0;
    }
    return true;
  },
  {
    message: 'Las observaciones son obligatorias cuando el tipo de uso es "otro"',
    path: ['observaciones'],
  }
).refine(
  (data) => {
    if (data.tipo_uso !== 'balance_de_masa' && data.balance_masa_id) {
      return false;
    }
    return true;
  },
  {
    message: 'El balance de masa solo se puede vincular cuando tipo_uso es "balance_de_masa"',
    path: ['balance_masa_id'],
  }
);

export type RemoveQuantityInput = z.infer<typeof removeQuantitySchema>;

export const metricasQuerySchema = z.object({
  insumo_id: z.string().optional(),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha: YYYY-MM-DD').optional(),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha: YYYY-MM-DD').optional(),
  turno_id: z.string().optional(),
});

export type MetricasQuery = z.infer<typeof metricasQuerySchema>;

export const metricasLonasQuerySchema = z.object({
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha: YYYY-MM-DD').optional(),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha: YYYY-MM-DD').optional(),
});

export type MetricasLonasQuery = z.infer<typeof metricasLonasQuerySchema>;

// --- Interfaces de respuesta ---

export interface MetricasResponse {
  success: boolean;
  data: {
    total_salidas: number;
    total_productivas: number;
    total_operativas: number;
    eficiencia_pct: number;
    desglose_por_tipo: Record<string, number>;
    consumo_por_turno: Array<{ turno_id: string; cantidad: number }>;
    unidades_por_balance: number;
  };
}

export interface MetricasLonasResponse {
  success: boolean;
  data: {
    fecha_inicio: string | null;
    fecha_fin: string | null;
    total_lonas_productivas: number;
    total_lonas_operativas: number;
    eficiencia_pct: number;
  };
}
