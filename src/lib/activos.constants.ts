/**
 * Constantes de UI del módulo de Activos Fijos.
 *
 * ⚠️ Este módulo lo importan componentes `"use client"`, así que TODO lo que
 * contiene termina en el bundle del navegador. No agregues aquí IDs de Airtable,
 * tokens ni ningún dato de infraestructura: van en `activos.fields.ts`
 * (server-only) leídos desde variables de entorno.
 *
 * Las listas de opciones están verificadas contra los `singleSelect` reales de
 * Sirius Activos Core. Si no coinciden, Airtable rechaza la escritura completa
 * con un error opaco, así que conviene mantenerlas sincronizadas.
 */

import type {
  CategoriaActivo,
  CondicionActivo,
  EstadoOperativo,
  EstadoResultado,
  TipoEvento,
  TipoUbicacion,
} from '@/types/activos';

// ============================================================================
// CATEGORÍAS
// ============================================================================

/**
 * Categorías conocidas. La categoría real de un activo se hereda del catálogo
 * de tipos (campo de texto libre), así que la lista que se muestra en los
 * filtros se deriva de los datos; esta constante solo aporta descripciones.
 */
export const CATEGORIAS_ACTIVO: readonly CategoriaActivo[] = [
  'Herramienta',
  'Equipo Industrial',
  'Vehículo',
  'Tecnología',
  'Infraestructura',
  'Mobiliario y Enseres',
  'Seguridad',
] as const;

export const CATEGORIAS_ACTIVO_DESCRIPCION: Record<string, string> = {
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
  'Disponible en Almacén',
  'En Mantenimiento',
  'En Reparación',
  'En Tránsito',
  'Fuera de Servicio',
  'Incompleto',
  'Dado de Baja',
] as const;

/**
 * Estados válidos al REGISTRAR un activo nuevo.
 * Excluye los que no tienen sentido en el alta (`Dado de Baja`, `En Reparación`,
 * `Fuera de Servicio`): a esos se llega editando el activo, no creándolo.
 */
export const ESTADOS_REGISTRO_ACTIVO: readonly EstadoOperativo[] = [
  'Operativo',
  'Disponible en Almacén',
  'En Tránsito',
  'En Mantenimiento',
] as const;

/** Ayuda contextual de cada estado, para el `<select>` del formulario. */
export const ESTADOS_OPERATIVO_AYUDA: Record<EstadoOperativo, string> = {
  'Operativo': 'Funcionando correctamente y listo para usar',
  'Disponible en Almacén': 'Guardado como stock o respaldo',
  'En Tránsito': 'Viene en camino, aún no ha llegado',
  'En Mantenimiento': 'En mantenimiento preventivo o instalación inicial',
  'En Reparación': 'Fuera de operación por una falla',
  'Fuera de Servicio': 'No se puede usar y no está en reparación',
  'Incompleto': 'Falta información para clasificarlo o ubicarlo',
  'Dado de Baja': 'Retirado del inventario de activos',
};

// ============================================================================
// CONDICIONES FÍSICAS
// ============================================================================

export const CONDICIONES_ACTIVO: readonly CondicionActivo[] = [
  'Excelente',
  'Buena',
  'Regular',
  'Necesita Reparación',
  'Dañada',
] as const;

export const CONDICIONES_ACTIVO_AYUDA: Record<CondicionActivo, string> = {
  'Excelente': 'Como nuevo, sin desgaste visible',
  'Buena': 'Funciona correctamente, desgaste mínimo',
  'Regular': 'Funciona con desgaste normal de uso',
  'Necesita Reparación': 'Funciona a medias o requiere intervención',
  'Dañada': 'No funcional',
};

/** Condiciones que dejan el activo inservible hasta que se intervenga. */
export const CONDICIONES_REQUIEREN_MANTENIMIENTO: readonly CondicionActivo[] = [
  'Necesita Reparación',
  'Dañada',
] as const;

// ============================================================================
// UBICACIONES Y ÁREAS
// ============================================================================

/** Opciones del `singleSelect` `Tipo Ubicación` del catálogo de ubicaciones. */
export const TIPOS_UBICACION: readonly TipoUbicacion[] = [
  'Planta',
  'Oficina',
  'Bodega',
  'Área Operativa',
  'Laboratorio',
  'Exterior / Campo',
] as const;

/** Áreas de la empresa, para autocompletar `Área Responsable`. */
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
// HOJA DE VIDA
// ============================================================================

/** Opciones del `singleSelect` `Tipo Evento` de la Hoja de Vida. */
export const TIPOS_EVENTO: readonly TipoEvento[] = [
  'Mantenimiento Preventivo',
  'Mantenimiento Correctivo',
  'Recarga / Reposición',
  'Calibración',
  'Inspección',
  'Traslado',
  'Reparación',
  'Baja de Activo',
  'Actualización Técnica',
] as const;

export const ESTADOS_RESULTADO: readonly EstadoResultado[] = [
  'Exitoso',
  'Parcial',
  'Fallido',
  'Pendiente',
] as const;

// ============================================================================
// UMBRALES DE ALERTA
// ============================================================================

/** Días de anticipación para alertar un vencimiento. */
export const DIAS_ALERTA_VENCIMIENTO = 30;

/** Días de anticipación para alertar un mantenimiento programado. */
export const DIAS_ALERTA_MANTENIMIENTO = 15;

// ============================================================================
// MENSAJES
// ============================================================================

export const MENSAJES = {
  EXITO: {
    ACTIVO_CREADO: 'Activo registrado exitosamente',
    ACTIVO_ACTUALIZADO: 'Activo actualizado correctamente',
    ACTIVO_DADO_DE_BAJA: 'Activo dado de baja exitosamente',
    ACTIVO_REACTIVADO: 'Activo reactivado correctamente',
    ASIGNACION_CREADA: 'Activo asignado exitosamente',
    DEVOLUCION_REGISTRADA: 'Devolución registrada correctamente',
    ESTADO_ACTUALIZADO: 'Estado actualizado correctamente',
  },
  ERROR: {
    CAMPOS_REQUERIDOS: 'Revisa los campos marcados antes de continuar',
    NOMBRE_REQUERIDO: 'El nombre del activo es requerido',
    SELECCIONAR_ACTIVO: 'Selecciona un activo',
    SELECCIONAR_TIPO: 'Selecciona al menos un tipo de activo',
    SELECCIONAR_UBICACION: 'Selecciona una ubicación',
    ESPECIFICAR_RESPONSABLE: 'Indica el responsable',
    CONDICION_REQUERIDA: 'Indica la condición del activo',
    VALOR_NEGATIVO: 'El valor no puede ser negativo',
    FECHA_ADQUISICION_FUTURA: 'La fecha de adquisición no puede ser futura',
    ACTIVO_YA_ASIGNADO: 'Este activo ya está asignado',
    ACTIVO_NO_ENCONTRADO: 'Activo no encontrado',
    SIN_CAMBIOS: 'No hay cambios por guardar',
  },
  INFO: {
    NO_HAY_ACTIVOS: 'No hay activos registrados',
    FILTRO_SIN_RESULTADOS: 'Ningún activo coincide con los filtros aplicados',
    SIN_DISPONIBLES: 'No hay activos disponibles para asignar',
    SIN_ASIGNADOS: 'No hay activos asignados por devolver',
  },
} as const;
