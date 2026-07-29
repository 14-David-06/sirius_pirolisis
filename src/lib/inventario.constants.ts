/**
 * Constantes compartidas para el módulo de Inventario
 * Centraliza opciones, categorías y configuraciones reutilizables
 */

import type { EstadoInsumo, PresentacionInsumo } from '@/types/inventario';

// ============================================================================
// CATEGORÍAS — ELIMINADAS (2026-07-28)
// ============================================================================

// Los insumos consumibles de Pirólisis NO se clasifican por categoría: el área
// maneja ~26 insumos y agruparlos añadía un nivel de navegación sin valor. El
// campo `Categoria` sigue existiendo en Sirius Insumos Core (otras áreas lo
// usan), pero este módulo no lo lee, ni lo muestra, ni lo escribe.
// Las herramientas y equipos, que sí se clasifican, viven en Activos Fijos.

// ============================================================================
// STOCK MÍNIMO
// ============================================================================

/**
 * Stock mínimo por defecto de un insumo consumible: 2 unidades.
 *
 * Se usa al crear el insumo y como valor mostrado cuando el Core no tiene
 * umbral definido, para que la alerta de reposición exista siempre. Se ajusta
 * por insumo desde el editor de ingresos/salidas.
 */
export const STOCK_MINIMO_DEFAULT = 2;

// ============================================================================
// ESTADOS
// ============================================================================

export const ESTADOS_INSUMO: { value: EstadoInsumo; label: string }[] = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'por_agotarse', label: 'Por agotarse' },
  { value: 'agotado', label: 'Agotado' },
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
