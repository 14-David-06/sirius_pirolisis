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
  // Identificación del insumo
  'Insumo'?: string;
  'Nombre del Insumo'?: string;
  'Categoría'?: string;
  'Categoria Insumo'?: string;

  // Cantidades y stock
  'Cantidad Presentacion Insumo'?: number;
  'Total Cantidad Stock'?: number;
  'Stock Minimo'?: number;

  // Presentación
  'Presentacion Insumo'?: string;
  'Presentación'?: string;
  'Presentación Personalizada'?: string;

  // Trazabilidad
  'Realiza Registro'?: string;
  'Entrada Insumos Pirolisis'?: string[];
  'Salida Insumos Pirolisis'?: string[];

  // Estado y validez
  'Estado'?: 'disponible' | 'agotado' | 'por_agotarse' | 'vencido';
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
  getItemQuantity: (record: InventarioRecord) => number;
  getItemPresentacion: (record: InventarioRecord) => string;
  getItemStockTotal: (record: InventarioRecord) => number;
  getCurrentUserName: () => string;
}

/**
 * Props para ItemCard
 */
export interface ItemCardProps {
  item: InventarioRecord;
  getItemName: (record: InventarioRecord) => string;
  getItemCategory: (record: InventarioRecord) => string;
  getItemCategoriaInsumo: (record: InventarioRecord) => string;
  getItemEstado: (record: InventarioRecord) => string;
  getItemPresentacion: (record: InventarioRecord) => string;
  getItemCantidadPresentacion: (record: InventarioRecord) => number;
  getItemStockTotal: (record: InventarioRecord) => number;
  getItemDescription: (record: InventarioRecord) => string;
  getItemEntradas: (record: InventarioRecord) => string[];
  getItemSalidas: (record: InventarioRecord) => string[];
}

// ============================================================================
// FILTROS Y BÚSQUEDA
// ============================================================================

/**
 * Filtros disponibles para el inventario
 */
export interface InventarioFilters {
  categoria?: string;
  estado?: string;
}

/**
 * Categorías de insumos disponibles
 */
export type CategoriaInsumo =
  | 'lona'
  | 'big_bag'
  | 'quimico'
  | 'herramienta'
  | 'consumible';

/**
 * Estados de insumos
 */
export type EstadoInsumo =
  | 'disponible'
  | 'agotado'
  | 'por_agotarse'
  | 'vencido';

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
