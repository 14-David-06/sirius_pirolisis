/**
 * Tipos y interfaces para el módulo de Inventario de Insumos
 * Sistema de gestión de inventario para procesos de pirólisis industrial
 */

import { TipoUso } from '@/domain/entities/Inventario';

// ============================================================================
// TIPOS BASE DE AIRTABLE
// ============================================================================

/**
 * Estructura base de un registro de Airtable
 */
export interface AirtableRecord<T = Record<string, unknown>> {
  id: string;
  fields: T;
  createdTime: string;
}

// ============================================================================
// CAMPOS DE INVENTARIO
// ============================================================================

/**
 * Campos del registro de inventario en Airtable
 */
export interface InventarioFields {
  // — Campos crudos de Sirius Insumos Core (tabla Insumo) —
  'Nombre'?: string;
  'Código SIRIUS-INS'?: string;
  /** Link: array de record IDs de Categoria Insumo. Usa `categorias` para mostrar. */
  'Categoria'?: string[];
  /** Link: array de record IDs de Unidades de Medida. Usa `unidad` para mostrar. */
  'Unidad Base'?: string[] | string;
  'Unidad Medida'?: string;
  'Stock Minimo'?: number;
  'Estado Insumo'?: string;
  'ID Area Origen'?: string;
  'Movimientos Insumos'?: string[];
  'Stock Insumos'?: string[];

  // — Campos normalizados que agrega /api/inventario/list —
  /** Código legible del insumo: "SIRIUS-INS-0059". */
  codigo?: string;
  /** Nombres de TODAS las categorías del insumo, ya resueltos. */
  categorias?: string[];
  /** Símbolo de la unidad base: "und", "kg", "L". */
  unidad?: string;
  /** Nombre de la unidad base: "Unidad", "Kilogramo", "Litro". */
  unidad_nombre?: string;
  /** Stock real calculado por el Core. */
  stock_actual?: number;
  stock_minimo?: number;
  /** Estado derivado del stock (no confundir con `Estado Insumo` del catálogo). */
  estado_calculado?: 'disponible' | 'por_agotarse' | 'agotado';
  estado_catalogo?: string;

  // — Alias de compatibilidad —
  'Insumo'?: string;
  'Categoria Insumo'?: string;
  'Total Cantidad Stock'?: number;

  // Estado y validez
  'Fecha Vencimiento'?: string;

  // Ficha de seguridad (para químicos)
  'Ficha Seguridad URL'?: string;
  'Ficha Seguridad S3 Path'?: string;

  // Campos adicionales genéricos
  'Descripción'?: string;
  'Notas'?: string;
  [key: string]: unknown;
}

/**
 * Registro completo de inventario
 */
export type InventarioRecord = AirtableRecord<InventarioFields>;

// ============================================================================
// DATOS DE RESPUESTA
// ============================================================================

/**
 * Respuesta de la API de listado de inventario
 */
export interface InventarioData {
  records: InventarioRecord[];
  offset?: string;
}

/**
 * Datos de un paquete de lonas activo
 */
export interface PaqueteLonasData {
  paquete_id: string;
  fecha_activacion: string;
  cantidad_lonas: number;
  dias_en_uso: number;
  total_balances_vinculados: number;
}

/**
 * Información de rotación de paquete de lonas
 */
export interface PaqueteLonasRotacion {
  nuevo_id: string | null;
  anterior_id: string | null;
  anterior_dias_uso: number | null;
}

/**
 * Métricas de eficiencia del inventario
 */
export interface MetricasInventario {
  total_salidas: number;
  total_productivas: number;
  total_operativas: number;
  eficiencia_pct: number;
  desglose_por_tipo: Record<string, number>;
}

/**
 * Balance de masa para vinculación
 */
export interface BalanceMasa {
  id: string;
  fields: Record<string, unknown>;
}

// ============================================================================
// FORMULARIOS
// ============================================================================

/**
 * Datos del formulario de registro de nuevo insumo
 */
export interface RegistroInsumoFormData {
  'Nombre del Insumo': string;
  'Categoría': string;
  'Presentación': string;
  'Cantidad Presentacion Insumo': string;
  'Presentación Personalizada': string;
  'Ficha Seguridad URL': string;
  'Ficha Seguridad S3 Path': string;
}

/**
 * Datos del formulario de ingreso de cantidades
 */
export interface IngresoInsumoFormData {
  selectedItemId: string;
  cantidad: string;
  notas: string;
}

/**
 * Datos del formulario de salida de insumos
 */
export interface SalidaInsumoFormData {
  selectedItemId: string;
  cantidad: string;
  tipo_uso: TipoUso;
  balance_masa_id: string;
  observaciones: string;
  documentoSoporte: File | null;
}

// ============================================================================
// PROPS DE COMPONENTES
// ============================================================================

/**
 * Props para componentes de formularios de inventario
 */
export interface InventarioFormBaseProps {
  records: InventarioRecord[];
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Props específicas para formulario de salida
 */
export interface SalidaInsumoFormProps extends InventarioFormBaseProps {
  getItemName: (record: InventarioRecord) => string;
  getItemCategory: (record: InventarioRecord) => string;
  getItemUnit: (record: InventarioRecord) => string;
  getItemStockTotal: (record: InventarioRecord) => number;
  getCurrentUserName: () => string;
}

/**
 * Getters de un insumo, compartidos por las vistas del inventario.
 */
export interface InventarioItemGetters {
  getItemName: (record: InventarioRecord) => string;
  getItemCodigo: (record: InventarioRecord) => string;
  getItemCategories: (record: InventarioRecord) => string[];
  getItemStockTotal: (record: InventarioRecord) => number;
  getMinStock: (record: InventarioRecord) => number;
  getItemUnit: (record: InventarioRecord) => string;
  getItemEstado: (record: InventarioRecord) => EstadoInsumo;
  getItemMovimientos: (record: InventarioRecord) => string[];
}

/**
 * Props para ItemCard
 */
export interface ItemCardProps extends InventarioItemGetters {
  item: InventarioRecord;
}

// ============================================================================
// FILTROS Y BÚSQUEDA
// ============================================================================

/**
 * Filtros disponibles para el inventario
 */
export interface InventarioFilters {
  /** Nombre de categoría tal como viene del Core: "Repuestos y Refacciones". */
  categoria?: string;
  estado?: EstadoInsumo | '';
  /** Texto libre: busca en nombre, código y categorías. */
  busqueda?: string;
}

/**
 * Estados de disponibilidad, derivados del stock real.
 * (El campo `Estado Insumo` del Core —Activo/Inactivo/Stock— describe el ciclo
 * de vida del catálogo, no la disponibilidad.)
 */
export type EstadoInsumo =
  | 'disponible'
  | 'por_agotarse'
  | 'agotado';

/**
 * Presentaciones estándar de insumos
 */
export type PresentacionInsumo =
  | 'Kilogramos'
  | 'Litros'
  | 'Unidades'
  | 'Bolsas'
  | 'Cajas'
  | 'Galones'
  | 'Metros'
  | 'Otro';

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Resultado de subida de archivo a S3
 */
export interface S3UploadResult {
  fileUrl: string;
  s3Path: string;
}

/**
 * Respuesta estándar de la API
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
