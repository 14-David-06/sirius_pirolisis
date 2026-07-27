/**
 * Constantes compartidas para el módulo de Gestión de Activos Fijos
 * Centraliza opciones, categorías y configuraciones reutilizables
 *
 * ⚠️ Este módulo lo importan componentes `"use client"`, así que TODO lo que
 * contiene termina en el bundle del navegador. No agregues aquí IDs de Airtable,
 * tokens ni ningún dato de infraestructura: van en `activos.fields.ts`
 * (server-only) leídos desde variables de entorno.
 */

import type {
  CategoriaActivo,
  EstadoOperativo,
  CondicionActivo,
  TipoUbicacion,
  TipoEvento,
  EstadoResultado,
} from '@/types/activos';

// ============================================================================
// CATEGORÍAS DE ACTIVOS
// ============================================================================

export const CATEGORIAS_ACTIVO: readonly CategoriaActivo[] = [
  'Herramienta',
  'Equipo Industrial',
  'Vehículo',
  'Tecnología',
  'Infraestructura',
  'Mobiliario y Enseres',
  'Seguridad',
] as const;

export const CATEGORIAS_ACTIVO_ICONS: Record<CategoriaActivo, string> = {
  'Herramienta': '🔧',
  'Equipo Industrial': '⚙️',
  'Vehículo': '🚛',
  'Tecnología': '💻',
  'Infraestructura': '🏭',
  'Mobiliario y Enseres': '📦',
  'Seguridad': '🔥',
};

export const CATEGORIAS_ACTIVO_DESCRIPCION: Record<CategoriaActivo, string> = {
  'Herramienta': 'Herramientas manuales y eléctricas',
  'Equipo Industrial': 'Maquinaria y equipos de producción',
  'Vehículo': 'Camionetas, montacargas, maquinaria móvil',
  'Tecnología': 'Computadores, tablets, equipos de cómputo',
  'Infraestructura': 'Reactores, tanques, estructuras fijas',
  'Mobiliario y Enseres': 'Escritorios, sillas, estanterías',
  'Seguridad': 'Extintores, botiquines, EPP permanente',
};

// ============================================================================
// ESTADOS OPERATIVOS
// ============================================================================

export const ESTADOS_OPERATIVO: readonly EstadoOperativo[] = [
  'Operativo',
  'En Mantenimiento',
  'En Reparación',
  'Fuera de Servicio',
  'En Tránsito',
  'Disponible en Almacén',
  'Dado de Baja',
] as const;

/**
 * Estados válidos para REGISTRAR un nuevo activo
 * Excluye estados que no tienen sentido al crear un activo por primera vez
 */
export const ESTADOS_REGISTRO_ACTIVO: readonly EstadoOperativo[] = [
  'Operativo',                // Lo más común: activo listo para usar
  'Disponible en Almacén',    // Guardado como stock/respaldo
  'En Tránsito',              // Viene en camino
  'En Mantenimiento',         // Requiere setup/instalación inicial
] as const;

export const ESTADOS_REGISTRO_DESCRIPCIONES: Record<string, string> = {
  'Operativo': '🟢 Operativo - Funcionando correctamente, listo para usar',
  'Disponible en Almacén': '⚪ Disponible en Almacén - Guardado como stock o respaldo',
  'En Tránsito': '🔵 En Tránsito - Viene en camino, aún no ha llegado',
  'En Mantenimiento': '🟡 En Mantenimiento - Requiere instalación o configuración inicial',
};

export const ESTADOS_OPERATIVO_ICONS: Record<EstadoOperativo, string> = {
  'Operativo': '🟢',
  'En Mantenimiento': '🟡',
  'En Reparación': '🔴',
  'Fuera de Servicio': '⚫',
  'En Tránsito': '🔵',
  'Disponible en Almacén': '⚪',
  'Dado de Baja': '🟤',
};

export const ESTADOS_OPERATIVO_COLOR: Record<EstadoOperativo, string> = {
  'Operativo': 'green',
  'En Mantenimiento': 'yellow',
  'En Reparación': 'red',
  'Fuera de Servicio': 'gray',
  'En Tránsito': 'blue',
  'Disponible en Almacén': 'white',
  'Dado de Baja': 'brown',
};

// ============================================================================
// CONDICIONES DE ACTIVOS
// ============================================================================

export const CONDICIONES_ACTIVO: readonly CondicionActivo[] = [
  'Excelente',
  'Buena',
  'Regular',
  'Necesita Reparación',
  'Dañada',
] as const;

export const CONDICIONES_ACTIVO_ICONS: Record<CondicionActivo, string> = {
  'Excelente': '⭐',
  'Buena': '✅',
  'Regular': '⚠️',
  'Necesita Reparación': '🔧',
  'Dañada': '❌',
};

export const CONDICIONES_ACTIVO_COLOR: Record<CondicionActivo, string> = {
  'Excelente': 'green',
  'Buena': 'blue',
  'Regular': 'yellow',
  'Necesita Reparación': 'orange',
  'Dañada': 'red',
};

// ============================================================================
// TIPOS DE UBICACIÓN
// ============================================================================

export const TIPOS_UBICACION: readonly TipoUbicacion[] = [
  'Planta Industrial',
  'Oficina',
  'Bodega/Almacén',
  'Taller',
  'Finca/Campo',
  'Área de Carga',
  'Parqueadero',
  'Obra',
  'Externa',
] as const;

export const TIPOS_UBICACION_ICONS: Record<TipoUbicacion, string> = {
  'Planta Industrial': '🏭',
  'Oficina': '🏢',
  'Bodega/Almacén': '📦',
  'Taller': '🔧',
  'Finca/Campo': '🌾',
  'Área de Carga': '🚛',
  'Parqueadero': '🅿️',
  'Obra': '🏗️',
  'Externa': '📍',
};

// ============================================================================
// UBICACIONES COMUNES (para auto-completar)
// ============================================================================

export const UBICACIONES_COMUNES = [
  'Almacén Principal',
  'Taller de Mantenimiento',
  'Planta Pirólisis',
  'Planta Blend',
  'Oficina Administrativa',
  'Guaicaramo',
  'Bodega de Herramientas',
  'Laboratorio',
  'Parqueadero Principal',
  'Área de Carga y Descarga',
] as const;

// ============================================================================
// ÁREAS DE LA EMPRESA (para auto-completar)
// ============================================================================

export const AREAS_EMPRESA = [
  'Pirólisis',
  'Blend',
  'Mantenimiento',
  'Transporte',
  'Administración',
  'Seguridad',
  'Guaicaramo',
  'Laboratorio',
  'Producción',
  'Operaciones',
  'Almacén',
  'Sistemas',
] as const;

// ============================================================================
// TIPOS DE EVENTOS
// ============================================================================

export const TIPOS_EVENTO: readonly TipoEvento[] = [
  'Mantenimiento Preventivo',
  'Reparación Correctiva',
  'Recarga',
  'Calibración',
  'Traslado',
  'Mejora/Actualización',
  'Inspección',
  'Baja',
  'Cambio de Responsable',
] as const;

export const TIPOS_EVENTO_ICONS: Record<TipoEvento, string> = {
  'Mantenimiento Preventivo': '🔧',
  'Reparación Correctiva': '🛠️',
  'Recarga': '🔋',
  'Calibración': '📏',
  'Traslado': '📦',
  'Mejora/Actualización': '⬆️',
  'Inspección': '🔍',
  'Baja': '❌',
  'Cambio de Responsable': '📝',
};

export const TIPOS_EVENTO_COLOR: Record<TipoEvento, string> = {
  'Mantenimiento Preventivo': 'blue',
  'Reparación Correctiva': 'orange',
  'Recarga': 'green',
  'Calibración': 'purple',
  'Traslado': 'gray',
  'Mejora/Actualización': 'teal',
  'Inspección': 'yellow',
  'Baja': 'red',
  'Cambio de Responsable': 'indigo',
};

// ============================================================================
// ESTADOS DE RESULTADO
// ============================================================================

export const ESTADOS_RESULTADO: readonly EstadoResultado[] = [
  'Exitoso',
  'Parcial',
  'Fallido',
  'Pendiente',
] as const;

export const ESTADOS_RESULTADO_ICONS: Record<EstadoResultado, string> = {
  'Exitoso': '✅',
  'Parcial': '⚠️',
  'Fallido': '❌',
  'Pendiente': '⏳',
};

export const ESTADOS_RESULTADO_COLOR: Record<EstadoResultado, string> = {
  'Exitoso': 'green',
  'Parcial': 'yellow',
  'Fallido': 'red',
  'Pendiente': 'gray',
};

// ============================================================================
// VALIDACIONES
// ============================================================================

/**
 * Tamaño máximo para foto de activo (5MB)
 */
export const MAX_FOTO_ACTIVO_SIZE = 5 * 1024 * 1024;

/**
 * Formatos aceptados para foto de activo
 */
export const FOTO_ACTIVO_ACCEPTED_FORMATS = '.jpg,.jpeg,.png,.webp';

/**
 * Tamaño máximo para evidencia (10MB)
 */
export const MAX_EVIDENCIA_SIZE = 10 * 1024 * 1024;

/**
 * Formatos aceptados para evidencia
 */
export const EVIDENCIA_ACCEPTED_FORMATS = '.pdf,.jpg,.jpeg,.png';

/**
 * Días de anticipación para alertas de vencimiento
 */
export const DIAS_ALERTA_VENCIMIENTO = 30;

/**
 * Días de anticipación para alertas de mantenimiento
 */
export const DIAS_ALERTA_MANTENIMIENTO = 15;

/**
 * Días máximos para considerar una asignación "de larga duración"
 */
export const DIAS_ASIGNACION_LARGA = 90;

/**
 * Número de años por defecto para vida útil si no se especifica
 */
export const VIDA_UTIL_DEFAULT_ANIOS = 5;

// ============================================================================
// MENSAJES
// ============================================================================

export const MENSAJES = {
  EXITO: {
    ACTIVO_CREADO: 'Activo registrado exitosamente',
    ACTIVO_ACTUALIZADO: 'Activo actualizado correctamente',
    ACTIVO_ELIMINADO: 'Activo dado de baja exitosamente',
    ASIGNACION_CREADA: 'Activo asignado exitosamente',
    DEVOLUCION_REGISTRADA: 'Devolución registrada correctamente',
    EVENTO_REGISTRADO: 'Evento registrado en la hoja de vida',
  },
  ERROR: {
    CAMPOS_REQUERIDOS: 'Por favor completa todos los campos requeridos',
    SELECCIONAR_ACTIVO: 'Por favor selecciona un activo',
    SELECCIONAR_TIPO: 'Por favor selecciona al menos un tipo de activo',
    SELECCIONAR_UBICACION: 'Por favor selecciona una ubicación',
    ESPECIFICAR_RESPONSABLE: 'Por favor especifica el responsable',
    FECHA_INVALIDA: 'La fecha especificada no es válida',
    FECHA_FUTURA: 'La fecha no puede ser futura',
    ACTIVO_YA_ASIGNADO: 'Este activo ya está asignado a otra persona',
    ACTIVO_NO_DISPONIBLE: 'El activo no está disponible para asignación',
    ASIGNACION_NO_ACTIVA: 'Esta asignación ya fue devuelta',
    CONDICION_REQUERIDA: 'Por favor especifica la condición del activo',
    VALOR_NEGATIVO: 'El valor no puede ser negativo',
    SUBIR_FOTO: 'Error al subir la foto del activo',
    SUBIR_EVIDENCIA: 'Error al subir la evidencia',
    ACTIVO_NO_ENCONTRADO: 'Activo no encontrado',
    ASIGNACION_NO_ENCONTRADA: 'Asignación no encontrada',
  },
  ADVERTENCIA: {
    PROXIMO_VENCER: (dias: number) =>
      `Este activo vence en ${dias} día${dias !== 1 ? 's' : ''}`,
    VENCIDO: 'Este activo está vencido',
    MANTENIMIENTO_PENDIENTE: 'Tiene mantenimiento pendiente',
    ASIGNACION_LARGA: (dias: number) =>
      `Este activo lleva ${dias} días asignado`,
    SIN_NUMERO_SERIE: 'Este activo no tiene número de serie registrado',
    SIN_VALOR: 'Este activo no tiene valor de adquisición registrado',
  },
  INFO: {
    CARGANDO_ACTIVOS: 'Cargando activos...',
    CARGANDO_ASIGNACIONES: 'Cargando asignaciones...',
    NO_HAY_ACTIVOS: 'No hay activos registrados',
    NO_HAY_ASIGNACIONES: 'No hay asignaciones registradas',
    FILTRO_SIN_RESULTADOS: 'No se encontraron activos con los filtros aplicados',
    ACTIVO_DISPONIBLE: 'Activo disponible para asignación',
    ACTIVO_ASIGNADO: (responsable: string) => `Asignado a: ${responsable}`,
  },
} as const;

// ============================================================================
// CONFIGURACIÓN UI
// ============================================================================

/**
 * Número máximo de activos a mostrar por página
 */
export const ACTIVOS_POR_PAGINA = 20;

/**
 * Número máximo de asignaciones a mostrar en historial
 */
export const ASIGNACIONES_POR_PAGINA = 10;

/**
 * Tiempo de espera antes de cerrar modal después de éxito (ms)
 */
export const DELAY_CLOSE_MODAL = 2000;

/**
 * Colores para gráficos de dashboard
 */
export const CHART_COLORS = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  gray: '#6b7280',
};

/**
 * Opciones de ordenamiento
 */
export const SORT_OPTIONS = [
  { value: 'nombre', label: 'Nombre (A-Z)' },
  { value: '-nombre', label: 'Nombre (Z-A)' },
  { value: 'codigo', label: 'Código (menor a mayor)' },
  { value: '-codigo', label: 'Código (mayor a menor)' },
  { value: 'fecha', label: 'Fecha de adquisición (antigua)' },
  { value: '-fecha', label: 'Fecha de adquisición (reciente)' },
  { value: 'vencimiento', label: 'Próximos a vencer' },
] as const;
