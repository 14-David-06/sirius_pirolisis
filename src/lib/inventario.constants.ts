/**
 * Constantes compartidas para el módulo de Inventario
 * Centraliza opciones, categorías y configuraciones reutilizables
 */

import type { CategoriaInsumo, EstadoInsumo, PresentacionInsumo } from '@/types/inventario';

// ============================================================================
// CATEGORÍAS
// ============================================================================

export const CATEGORIAS_INSUMO = [
  'Materiales',
  'Químicos',
  'Herramientas',
  'Equipos',
  'Consumibles',
] as const;

export const CATEGORIAS_INSUMO_ICONS: Record<string, string> = {
  'Materiales': '🏭',
  'Químicos': '⚗️',
  'Herramientas': '🔧',
  'Equipos': '⚙️',
  'Consumibles': '📦',
};

export const CATEGORIAS_FILTRO: { value: CategoriaInsumo; label: string }[] = [
  { value: 'lona', label: 'Lona' },
  { value: 'big_bag', label: 'Big Bag' },
  { value: 'quimico', label: 'Químico' },
  { value: 'herramienta', label: 'Herramienta' },
  { value: 'consumible', label: 'Consumible' },
];

// ============================================================================
// ESTADOS
// ============================================================================

export const ESTADOS_INSUMO: { value: EstadoInsumo; label: string }[] = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'agotado', label: 'Agotado' },
  { value: 'por_agotarse', label: 'Por agotarse' },
  { value: 'vencido', label: 'Vencido' },
];

// ============================================================================
// PRESENTACIONES
// ============================================================================

export const PRESENTACIONES_INSUMO: { value: PresentacionInsumo; label: string; icon: string }[] = [
  { value: 'Kilogramos', label: 'Kilogramos', icon: '⚖️' },
  { value: 'Litros', label: 'Litros', icon: '🧪' },
  { value: 'Unidades', label: 'Unidades', icon: '📦' },
  { value: 'Bolsas', label: 'Bolsas', icon: '🛍️' },
  { value: 'Cajas', label: 'Cajas', icon: '📦' },
  { value: 'Galones', label: 'Galones', icon: '🪣' },
  { value: 'Metros', label: 'Metros', icon: '📏' },
  { value: 'Otro', label: 'Otro', icon: '✏️' },
];

// ============================================================================
// VALIDACIONES
// ============================================================================

/**
 * Tamaño mínimo para ficha de seguridad (100KB)
 */
export const MIN_FICHA_SEGURIDAD_SIZE = 100 * 1024;

/**
 * Formatos aceptados para ficha de seguridad
 */
export const FICHA_SEGURIDAD_ACCEPTED_FORMATS = '.pdf';

/**
 * Tamaño máximo para documento de soporte (10MB)
 */
export const MAX_DOCUMENTO_SOPORTE_SIZE = 10 * 1024 * 1024;

/**
 * Formatos aceptados para documento de soporte
 */
export const DOCUMENTO_SOPORTE_ACCEPTED_FORMATS = '.pdf,.jpg,.jpeg,.png';

// ============================================================================
// MENSAJES
// ============================================================================

export const MENSAJES = {
  EXITO: {
    INSUMO_CREADO: 'Insumo registrado exitosamente',
    CANTIDAD_AGREGADA: 'Cantidad agregada exitosamente',
    SALIDA_REGISTRADA: 'Salida de insumo registrada exitosamente',
  },
  ERROR: {
    CAMPOS_REQUERIDOS: 'Por favor completa los campos requeridos',
    SELECCIONAR_INSUMO: 'Por favor selecciona un insumo',
    ESPECIFICAR_CANTIDAD: 'Por favor especifica la cantidad',
    STOCK_INSUFICIENTE: (cantidad: number, disponible: number) =>
      `No puedes remover ${cantidad} unidades. Solo hay ${disponible} unidades disponibles en stock.`,
    OBSERVACIONES_REQUERIDAS: 'Las observaciones son obligatorias cuando el tipo de uso es "Otro"',
    SUBIR_FICHA: 'Error al subir ficha de seguridad',
    SUBIR_DOCUMENTO: 'Error al subir el documento de soporte',
  },
} as const;

// ============================================================================
// CONFIGURACIÓN UI
// ============================================================================

/**
 * Días de anticipación para alertas de vencimiento
 */
export const DIAS_ALERTA_VENCIMIENTO = 30;

/**
 * Número máximo de balances a cargar en el selector
 */
export const MAX_BALANCES_ACTIVOS = 20;

/**
 * Tiempo de espera antes de cerrar modal después de rotación de lonas (ms)
 */
export const DELAY_ROTACION_LONAS = 4000;
