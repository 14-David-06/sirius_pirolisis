/**
 * Tipos y interfaces para el módulo de Gestión de Activos Fijos
 * Sistema multi-área de gestión de activos para toda la empresa Sirius
 * Base: Sirius Activos Core 
 */

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
// CAMPOS DE ACTIVOS FIJOS
// ============================================================================

/**
 * Campos del registro de Activo Fijo en Airtable
 * Tabla: Activos Fijos
 */
export interface ActivoFijoFields {
  // Identificación
  'Código Activo'?: string; // formula, primary
  'ID'?: number; // autoNumber
  'Nombre del Activo'?: string;
  'Descripción'?: string;

  // Tipo y Categoría
  'Tipo de Activo'?: string[]; // link to Tipos de Activo
  'Categoría'?: string[]; // lookup

  // Códigos
  'Número de Serie'?: string;
  'Código Interno'?: string;

  // Estado y Ubicación
  'Estado Operativo'?: EstadoOperativo;
  'Ubicación Actual'?: string[]; // link to Ubicaciones
  'Área Responsable'?: string;
  'Responsable Asignado'?: string;

  // Datos de Adquisición
  'Fecha de Adquisición'?: string; // date
  'Valor de Adquisición'?: number; // currency
  'Proveedor'?: string;
  'Marca'?: string;
  'Modelo'?: string;

  // Vencimiento
  'Requiere Vencimiento'?: boolean[]; // lookup
  'Fecha de Vencimiento'?: string; // date
  'Días para Vencimiento'?: number; // formula

  // Mantenimiento
  'Requiere Mantenimiento'?: boolean[]; // lookup
  'Próximo Mantenimiento'?: string; // date
  'Vida Útil Estimada'?: number[]; // lookup
  'Año de Baja Estimado'?: number; // formula

  // Relaciones
  'Historial de Eventos'?: string[]; // link to Hoja de Vida Activo
  'Asignaciones'?: string[]; // link to Asignaciones
  'Última Asignación'?: string; // rollup
  'Última Devolución'?: string; // rollup

  // Campos calculados y multimedia
  'Está Asignado'?: string; // formula
  'Notas'?: string;
  'Foto del Activo'?: Array<{ url: string; filename: string }>; // attachments

  // Campos genéricos adicionales
  [key: string]: unknown;
}

/**
 * Registro completo de Activo Fijo
 */
export type ActivoFijoRecord = AirtableRecord<ActivoFijoFields>;

// ============================================================================
// CAMPOS DE ASIGNACIONES
// ============================================================================

/**
 * Campos del registro de Asignación en Airtable
 * Tabla: Asignaciones
 */
export interface AsignacionFields {
  // Identificación
  'Responsable'?: string; // primary

  // Activo
  'Activo'?: string[]; // link to Activos Fijos
  'Nombre Activo'?: string[]; // lookup
  'Código Activo'?: string[]; // lookup

  // Responsable
  'Área del Responsable'?: string;

  // Fechas
  'Fecha Asignación'?: string; // dateTime
  'Fecha Devolución'?: string; // dateTime
  'Estado Asignación'?: string; // formula

  // Ubicación y Propósito
  'Ubicación Destino'?: string[]; // link to Ubicaciones
  'Propósito de Uso'?: string;

  // Condición
  'Condición al Asignar'?: CondicionActivo;
  'Condición al Devolver'?: CondicionActivo;

  // Observaciones
  'Observaciones Asignación'?: string;
  'Observaciones Devolución'?: string;

  // Cálculos
  'Días en Uso'?: number; // formula

  // Usuarios
  'Usuario que Asigna'?: string;
  'Usuario que Recibe'?: string;

  // Evidencia
  'Evidencia Asignación'?: Array<{ url: string; filename: string }>;
  'Evidencia Devolución'?: Array<{ url: string; filename: string }>;

  // Mantenimiento
  'Requiere Mantenimiento Post-Devolución'?: boolean;

  // Campos genéricos adicionales
  [key: string]: unknown;
}

/**
 * Registro completo de Asignación
 */
export type AsignacionRecord = AirtableRecord<AsignacionFields>;

// ============================================================================
// CAMPOS DE TIPOS DE ACTIVO
// ============================================================================

/**
 * Campos del catálogo de Tipos de Activo
 * Tabla: Tipos de Activo
 */
export interface TipoActivoFields {
  'Código Tipo'?: string; // primary
  'Nombre Tipo'?: string;
  'Descripción'?: string;
  'Categoría'?: string;
  'Vida Útil Estimada (años)'?: number;
  'Requiere Vencimiento'?: boolean;
  'Requiere Mantenimiento Preventivo'?: boolean;
  'Estado'?: string;
  'Activos Fijos'?: string[]; // link inverso
  [key: string]: unknown;
}

export type TipoActivoRecord = AirtableRecord<TipoActivoFields>;

// ============================================================================
// CAMPOS DE UBICACIONES
// ============================================================================

/**
 * Campos del catálogo de Ubicaciones
 * Tabla: Ubicaciones
 */
export interface UbicacionFields {
  'Código Ubicación'?: string; // primary
  'Nombre Ubicación'?: string;
  'Tipo Ubicación'?: TipoUbicacion;
  'Descripción'?: string;
  'Responsable Área'?: string;
  'Estado'?: string;
  'Código Área Nómina Core'?: string;
  'Activos Fijos'?: string[]; // link inverso
  'Asignaciones'?: string[]; // link inverso
  [key: string]: unknown;
}

export type UbicacionRecord = AirtableRecord<UbicacionFields>;

// ============================================================================
// CAMPOS DE HOJA DE VIDA
// ============================================================================

/**
 * Campos del historial de eventos de activos
 * Tabla: Hoja de Vida Activo
 */
export interface HojaVidaActivoFields {
  'ID Evento'?: string; // primary
  'Activos Fijos'?: string[]; // link to Activos Fijos
  'Tipo Evento'?: TipoEvento;
  'Fecha Evento'?: string;
  'Descripción'?: string;
  'Realizado Por'?: string;
  'Empresa / Proveedor'?: string;
  'Costo Evento'?: number;
  'Próxima Acción Requerida'?: string;
  'Fecha Próxima Acción'?: string;
  'Estado Resultado'?: EstadoResultado;
  'Evidencia'?: Array<{ url: string; filename: string }>;
  'Observaciones'?: string;
  [key: string]: unknown;
}

export type HojaVidaActivoRecord = AirtableRecord<HojaVidaActivoFields>;

// ============================================================================
// DATOS DE RESPUESTA
// ============================================================================

/**
 * Respuesta de la API de listado de activos
 */
export interface ActivosData {
  records: ActivoFijoRecord[];
  offset?: string;
}

/**
 * Respuesta de la API de listado de asignaciones
 */
export interface AsignacionesData {
  records: AsignacionRecord[];
  offset?: string;
}

/**
 * Estadísticas generales de activos
 */
export interface EstadisticasActivos {
  totalActivos: number;
  operativos: number;
  enReparacion: number;
  asignados: number;
  disponibles: number;
  porVencer: number;
  valorTotalAdquisicion: number;
  porCategoria: Record<string, number>;
  porUbicacion: Record<string, number>;
  porArea: Record<string, number>;
}

/**
 * Datos de activo con información extendida
 */
export interface ActivoExtendido extends ActivoFijoRecord {
  diasParaVencimiento?: number;
  estaAsignado?: boolean;
  categoriaLabel?: string;
  ubicacionLabel?: string;
  ultimaAsignacionFecha?: string;
  diasDesdeUltimaAsignacion?: number;
}

// ============================================================================
// FORMULARIOS
// ============================================================================

/**
 * Datos del formulario de registro de nuevo activo
 */
export interface RegistroActivoFormData {
  'Nombre del Activo': string;
  'Tipo de Activo': string[]; // Array de record IDs
  'Estado Operativo': EstadoOperativo;
  'Ubicación Actual': string[]; // Array de record IDs
  'Área Responsable': string;
  'Número de Serie'?: string;
  'Código Interno'?: string;
  'Fecha de Adquisición'?: string;
  'Valor de Adquisición'?: number;
  'Proveedor'?: string;
  'Marca'?: string;
  'Modelo'?: string;
  'Descripción'?: string;
  'Fecha de Vencimiento'?: string;
  'Próximo Mantenimiento'?: string;
  'Notas'?: string;
}

/**
 * Datos del formulario de asignación de activo
 */
export interface AsignarActivoFormData {
  activoId: string;
  responsable: string;
  areaResponsable: string;
  fechaAsignacion: string;
  ubicacionDestino?: string[]; // Array de record IDs
  propositoUso: string;
  condicionAlAsignar: CondicionActivo;
  observacionesAsignacion?: string;
  usuarioQueAsigna: string;
}

/**
 * Datos del formulario de devolución de activo
 */
export interface DevolverActivoFormData {
  asignacionId: string;
  fechaDevolucion: string;
  condicionAlDevolver: CondicionActivo;
  observacionesDevolucion?: string;
  usuarioQueRecibe: string;
  requiereMantenimiento: boolean;
}

/**
 * Datos del formulario de evento en hoja de vida
 */
export interface RegistroEventoFormData {
  activoId: string[];
  tipoEvento: TipoEvento;
  fechaEvento: string;
  descripcion: string;
  realizadoPor: string;
  empresaProveedor?: string;
  costoEvento?: number;
  proximaAccionRequerida?: string;
  fechaProximaAccion?: string;
  estadoResultado: EstadoResultado;
  observaciones?: string;
}

// ============================================================================
// PROPS DE COMPONENTES
// ============================================================================

/**
 * Props base para componentes de formularios de activos
 */
export interface ActivosFormBaseProps {
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Props para el componente ActivoCard
 */
export interface ActivoCardProps {
  activo: ActivoFijoRecord;
  getActivoNombre: (record: ActivoFijoRecord) => string;
  getActivoCodigo: (record: ActivoFijoRecord) => string;
  getActivoCategoria: (record: ActivoFijoRecord) => string;
  getActivoEstado: (record: ActivoFijoRecord) => EstadoOperativo;
  getActivoUbicacion: (record: ActivoFijoRecord) => string;
  getActivoResponsable: (record: ActivoFijoRecord) => string;
  getActivoEstaAsignado: (record: ActivoFijoRecord) => boolean;
  getActivoDiasVencimiento: (record: ActivoFijoRecord) => number | null;
  onVerDetalle?: (activo: ActivoFijoRecord) => void;
}

/**
 * Props para el componente AsignacionCard
 */
export interface AsignacionCardProps {
  asignacion: AsignacionRecord;
  getAsignacionResponsable: (record: AsignacionRecord) => string;
  getAsignacionActivoNombre: (record: AsignacionRecord) => string;
  getAsignacionEstado: (record: AsignacionRecord) => string;
  getAsignacionDiasEnUso: (record: AsignacionRecord) => number;
  onDevolver?: (asignacion: AsignacionRecord) => void;
}

// ============================================================================
// FILTROS Y BÚSQUEDA
// ============================================================================

/**
 * Filtros disponibles para activos
 */
export interface ActivosFilters {
  categoria?: CategoriaActivo;
  estadoOperativo?: EstadoOperativo;
  ubicacion?: string;
  area?: string;
  soloAsignados?: boolean;
  soloDisponibles?: boolean;
  proximosAVencer?: boolean; // < 30 días
}

/**
 * Filtros disponibles para asignaciones
 */
export interface AsignacionesFilters {
  responsable?: string;
  area?: string;
  soloActivas?: boolean; // Sin fecha de devolución
  activoId?: string;
}

// ============================================================================
// TIPOS ENUMERADOS
// ============================================================================

/**
 * Categorías de activos
 */
export type CategoriaActivo =
  | 'Herramienta'
  | 'Equipo Industrial'
  | 'Vehículo'
  | 'Tecnología'
  | 'Infraestructura'
  | 'Mobiliario y Enseres'
  | 'Seguridad';

/**
 * Estados operativos de activos
 */
export type EstadoOperativo =
  | 'Operativo'
  | 'En Mantenimiento'
  | 'En Reparación'
  | 'Fuera de Servicio'
  | 'En Tránsito'
  | 'Disponible en Almacén'
  | 'Dado de Baja';

/**
 * Condición física de un activo
 */
export type CondicionActivo =
  | 'Excelente'
  | 'Buena'
  | 'Regular'
  | 'Necesita Reparación'
  | 'Dañada';

/**
 * Tipos de ubicación
 */
export type TipoUbicacion =
  | 'Planta Industrial'
  | 'Oficina'
  | 'Bodega/Almacén'
  | 'Taller'
  | 'Finca/Campo'
  | 'Área de Carga'
  | 'Parqueadero'
  | 'Obra'
  | 'Externa';

/**
 * Tipos de eventos en hoja de vida
 */
export type TipoEvento =
  | 'Mantenimiento Preventivo'
  | 'Reparación Correctiva'
  | 'Recarga'
  | 'Calibración'
  | 'Traslado'
  | 'Mejora/Actualización'
  | 'Inspección'
  | 'Baja'
  | 'Cambio de Responsable';

/**
 * Estados de resultado de eventos
 */
export type EstadoResultado =
  | 'Exitoso'
  | 'Parcial'
  | 'Fallido'
  | 'Pendiente';

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

/**
 * Opciones para búsqueda de activos
 */
export interface BusquedaActivosOptions {
  searchTerm?: string;
  filters?: ActivosFilters;
  sortBy?: 'nombre' | 'codigo' | 'fecha' | 'vencimiento';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Resultado de búsqueda de activos
 */
export interface BusquedaActivosResult {
  activos: ActivoFijoRecord[];
  total: number;
  hasMore: boolean;
  offset?: string;
}
