/**
 * Tipos e interfaces del módulo de Activos Fijos.
 * Base: Sirius Activos Core (multi-área, toda la empresa).
 *
 * Los nombres de campo de este archivo están verificados contra el esquema real
 * de la base. Si Airtable cambia, este archivo es el primero que hay que ajustar.
 */

// ============================================================================
// TIPOS BASE DE AIRTABLE
// ============================================================================

/** Estructura base de un registro de Airtable. */
export interface AirtableRecord<T = Record<string, unknown>> {
  id: string;
  fields: T;
  createdTime: string;
}

/** Adjunto de Airtable. */
export interface AirtableAttachment {
  url: string;
  filename: string;
}

// ============================================================================
// CAMPOS DE ACTIVOS FIJOS
// ============================================================================

/**
 * Campos normalizados que agrega `/api/activos/list`.
 *
 * ⚠️ Los campos crudos `Tipo de Activo` y `Ubicación Actual` son links: llegan
 * como arrays de record IDs ("rec…"). Pintarlos directo muestra IDs en pantalla,
 * así que el endpoint los resuelve a nombres y los expone aquí en minúsculas.
 */
export interface ActivoNormalizado {
  /** Código legible generado por Airtable: "ACT-0017". */
  codigo?: string;
  nombre?: string;
  descripcion?: string;
  /** Nombres de los tipos de activo vinculados. */
  tipos?: string[];
  /** Record IDs de los tipos vinculados (para el formulario de edición). */
  tipoIds?: string[];
  /** Categorías heredadas del tipo, ya resueltas a texto. */
  categorias?: string[];
  /** Nombre de la ubicación actual. */
  ubicacion?: string;
  /** Record ID de la ubicación actual (para el formulario de edición). */
  ubicacionId?: string;
  area?: string;
  responsable?: string;
  /** `true` cuando el activo tiene responsable asignado. */
  asignado?: boolean;
  estado?: EstadoOperativo;
  numeroSerie?: string;
  marca?: string;
  modelo?: string;
  proveedor?: string;
  fechaAdquisicion?: string | null;
  valorAdquisicion?: number;
  fechaVencimiento?: string | null;
  /** Días restantes hasta el vencimiento. Negativo si ya venció. */
  diasVencimiento?: number | null;
  proximoMantenimiento?: string | null;
  requiereVencimiento?: boolean;
  requiereMantenimiento?: boolean;
  vidaUtil?: number | null;
  anioBaja?: number | null;
  notas?: string;
  totalEventos?: number;
  totalAsignaciones?: number;
  ultimaAsignacion?: string | null;
  ultimaDevolucion?: string | null;
  /**
   * `true` cuando el activo tiene los datos mínimos de clasificación (tipo y
   * ubicación). Los activos incompletos no se pueden ubicar ni depreciar.
   */
  completo?: boolean;
}

/**
 * Campos del registro de Activo Fijo.
 * Tabla: Activos Fijos (Sirius Activos Core).
 */
export interface ActivoFijoFields extends ActivoNormalizado {
  // — Identificación —
  'Código Activo'?: string; // formula (primary): "ACT-0001"
  'ID'?: number; // autoNumber
  'Nombre del Activo'?: string;
  'Descripción'?: string;

  // — Clasificación —
  'Tipo de Activo'?: string[]; // link → Tipos de Activo
  'Categoría'?: string[]; // lookup desde el tipo
  'Número de Serie'?: string;

  // — Estado y ubicación —
  'Estado Operativo'?: EstadoOperativo;
  'Ubicación Actual'?: string[]; // link → Ubicaciones
  'Área Responsable'?: string;
  'Responsable Asignado'?: string;

  // — Adquisición —
  'Fecha de Adquisición'?: string;
  'Valor de Adquisición'?: number; // currency COP, precisión 0
  'Proveedor'?: string;
  'Marca'?: string;
  'Modelo'?: string;

  // — Vencimiento —
  'Requiere Vencimiento'?: boolean[]; // lookup
  'Fecha de Vencimiento'?: string;
  'Días para Vencimiento'?: number; // formula (negativo si venció)

  // — Mantenimiento —
  'Requiere Mantenimiento'?: boolean[]; // lookup
  'Próximo Mantenimiento'?: string;
  /** Ojo: en Airtable la "ú" va en minúscula ("Vida útil Estimada"). */
  'Vida útil Estimada'?: number[]; // lookup
  'Año de Baja Estimado'?: number; // formula

  // — Relaciones —
  'Historial de Eventos'?: string[]; // link → Hoja de Vida Activo
  'Asignaciones'?: string[]; // link → Asignaciones
  'Última Asignación'?: string; // rollup
  'Última Devolución'?: string; // rollup

  // — Otros —
  'Está Asignado'?: string; // formula: "Asignado" | "Disponible"
  'Notas'?: string;

  [key: string]: unknown;
}

/** Registro completo de Activo Fijo. */
export type ActivoFijoRecord = AirtableRecord<ActivoFijoFields>;

// ============================================================================
// CAMPOS DE ASIGNACIONES
// ============================================================================

/**
 * Campos del registro de Asignación.
 * Tabla: Asignaciones.
 */
export interface AsignacionFields {
  'Responsable'?: string; // primary
  'Activo'?: string[]; // link → Activos Fijos
  'Nombre Activo'?: string[]; // lookup
  'Código Activo'?: string[]; // lookup
  'Área del Responsable'?: string;
  'Fecha Asignación'?: string; // dateTime
  'Fecha Devolución'?: string; // dateTime (vacío si está activa)
  'Estado Asignación'?: string; // formula: "Activa" | "Devuelto"
  'Ubicación Destino'?: string[]; // link → Ubicaciones
  'Propósito de Uso'?: string;
  'Condición al Asignar'?: CondicionActivo;
  'Condición al Devolver'?: CondicionActivo;
  'Observaciones Asignación'?: string;
  'Observaciones Devolución'?: string;
  'Días en Uso'?: number; // formula
  'Usuario que Asigna'?: string;
  'Usuario que Recibe'?: string;
  'Evidencia Devolución'?: AirtableAttachment[];
  'Requiere Mantenimiento Post-Devolución'?: boolean;

  // — Campos normalizados que agrega la API —
  activoId?: string;
  activoNombre?: string;
  activoCodigo?: string;
  responsable?: string;
  fechaAsignacion?: string | null;
  fechaDevolucion?: string | null;
  activa?: boolean;
  diasEnUso?: number;

  [key: string]: unknown;
}

/** Registro completo de Asignación. */
export type AsignacionRecord = AirtableRecord<AsignacionFields>;

// ============================================================================
// CATÁLOGOS
// ============================================================================

/** Tipo de activo del catálogo, ya normalizado por la API. */
export interface TipoActivoOpcion {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  requiereVencimiento: boolean;
  requiereMantenimiento: boolean;
  vidaUtil: number | null;
}

/** Ubicación del catálogo, ya normalizada por la API. */
export interface UbicacionOpcion {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string;
  /** Código del área en Sirius Nómina Core (ej: SIRIUS-AREA-0009). */
  codigoArea: string;
}

// ============================================================================
// HOJA DE VIDA
// ============================================================================

/**
 * Campos del historial de eventos técnicos.
 * Tabla: Hoja de Vida Activo.
 */
export interface HojaVidaActivoFields {
  'ID Evento'?: string; // primary
  'Activos Fijos'?: string[]; // link → Activos Fijos
  'Tipo Evento'?: TipoEvento;
  'Fecha Evento'?: string;
  'Descripción'?: string;
  'Realizado Por'?: string;
  'Empresa / Proveedor'?: string;
  'Costo Evento'?: number;
  'Próxima Acción Requerida'?: string;
  'Fecha Próxima Acción'?: string;
  'Estado Resultado'?: EstadoResultado;
  'Evidencia'?: AirtableAttachment[];
  'Observaciones'?: string;
  [key: string]: unknown;
}

export type HojaVidaActivoRecord = AirtableRecord<HojaVidaActivoFields>;

// ============================================================================
// DATOS DE RESPUESTA
// ============================================================================

/** Respuesta de `/api/activos/list`. */
export interface ActivosData {
  records: ActivoFijoRecord[];
  offset?: string;
}

/** Respuesta de `/api/activos/asignaciones/list`. */
export interface AsignacionesData {
  records: AsignacionRecord[];
  offset?: string;
}

/** Estadísticas agregadas de activos (endpoint `/api/activos/estadisticas`). */
export interface EstadisticasActivos {
  totalActivos: number;
  operativos: number;
  enReparacion: number;
  enMantenimiento: number;
  asignados: number;
  disponibles: number;
  porVencer: number;
  vencidos: number;
  incompletos: number;
  valorTotalAdquisicion: number;
  porCategoria: Record<string, number>;
  porUbicacion: Record<string, number>;
  porArea: Record<string, number>;
  porEstado: Record<string, number>;
}

/** Respuesta estándar de la API. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  message?: string;
}

// ============================================================================
// FORMULARIOS
// ============================================================================

/**
 * Cuerpo aceptado por `/api/activos/create` y `/api/activos/update/[id]`.
 * Las claves son nombres de campo de Airtable; la API las traduce a field IDs.
 */
export interface ActivoFormPayload {
  'Nombre del Activo'?: string;
  'Descripción'?: string;
  'Tipo de Activo'?: string[];
  'Estado Operativo'?: EstadoOperativo;
  'Ubicación Actual'?: string[];
  'Área Responsable'?: string;
  'Responsable Asignado'?: string;
  'Número de Serie'?: string;
  'Fecha de Adquisición'?: string;
  'Valor de Adquisición'?: number | null;
  'Proveedor'?: string;
  'Marca'?: string;
  'Modelo'?: string;
  'Fecha de Vencimiento'?: string;
  'Próximo Mantenimiento'?: string;
  'Notas'?: string;
}

/** Cuerpo de `/api/activos/asignar`. */
export interface AsignarActivoPayload {
  activoId: string;
  responsable: string;
  areaResponsable?: string;
  fechaAsignacion: string;
  ubicacionDestino?: string[];
  propositoUso?: string;
  condicionAlAsignar: CondicionActivo;
  observacionesAsignacion?: string;
  usuarioQueAsigna?: string;
}

/**
 * Cuerpo de `/api/activos/devolver`.
 * Se identifica la asignación por `asignacionId` o, más cómodo desde la UI,
 * por `activoId` (la API busca la asignación abierta de ese activo).
 */
export interface DevolverActivoPayload {
  asignacionId?: string;
  activoId?: string;
  fechaDevolucion: string;
  condicionAlDevolver: CondicionActivo;
  observacionesDevolucion?: string;
  usuarioQueRecibe?: string;
  requiereMantenimiento?: boolean;
}

/** Cuerpo de `/api/activos/delete/[id]` (baja lógica). */
export interface BajaActivoPayload {
  motivoBaja?: string;
  usuario?: string;
}

// ============================================================================
// GETTERS Y PROPS DE COMPONENTES
// ============================================================================

/**
 * Getters de un activo, compartidos por todas las vistas del módulo.
 * Viven en `useActivos` y se pasan como props para que los componentes de
 * presentación no necesiten conocer la forma de los campos de Airtable.
 */
export interface ActivoGetters {
  getActivoNombre: (record: ActivoFijoRecord) => string;
  getActivoCodigo: (record: ActivoFijoRecord) => string;
  getActivoCategorias: (record: ActivoFijoRecord) => string[];
  getActivoTipos: (record: ActivoFijoRecord) => string[];
  getActivoEstado: (record: ActivoFijoRecord) => EstadoOperativo;
  getActivoUbicacion: (record: ActivoFijoRecord) => string;
  getActivoArea: (record: ActivoFijoRecord) => string;
  getActivoResponsable: (record: ActivoFijoRecord) => string;
  getActivoEstaAsignado: (record: ActivoFijoRecord) => boolean;
  getActivoValor: (record: ActivoFijoRecord) => number;
  getActivoDiasVencimiento: (record: ActivoFijoRecord) => number | null;
  getActivoEstaCompleto: (record: ActivoFijoRecord) => boolean;
}

/** Acciones que un activo expone en la tabla y en el detalle. */
export type AccionActivo = 'detalle' | 'editar' | 'asignar' | 'devolver' | 'baja';

/** Props base de los formularios del módulo. */
export interface ActivosFormBaseProps {
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
}

// ============================================================================
// FILTROS
// ============================================================================

/** Estado de asignación usado como filtro. */
export type FiltroAsignacion = '' | 'asignados' | 'disponibles';

/**
 * Filtros de la vista de activos. Se aplican en memoria sobre los registros ya
 * cargados: cambiar un filtro no dispara una consulta a Airtable.
 */
export interface ActivosFilters {
  /** Nombre de categoría tal como viene del catálogo de tipos. */
  categoria?: string;
  estado?: EstadoOperativo | '';
  ubicacion?: string;
  area?: string;
  asignacion?: FiltroAsignacion;
  /** Texto libre: nombre, código, serie, marca, modelo, responsable. */
  busqueda?: string;
  /** Solo activos sin tipo o sin ubicación. */
  soloIncompletos?: boolean;
}

/** Filtros de asignaciones. */
export interface AsignacionesFilters {
  responsable?: string;
  area?: string;
  soloActivas?: boolean;
  activoId?: string;
}

// ============================================================================
// TIPOS ENUMERADOS (verificados contra los singleSelect de Airtable)
// ============================================================================

/**
 * Categorías de activo. Vienen del campo texto `Categoría` del catálogo de
 * tipos, así que la lista real la manda el dato: esta unión solo cubre las
 * categorías conocidas para efectos de iconos y descripciones.
 */
export type CategoriaActivo =
  | 'Herramienta'
  | 'Equipo Industrial'
  | 'Vehículo'
  | 'Tecnología'
  | 'Infraestructura'
  | 'Mobiliario y Enseres'
  | 'Seguridad';

/** Estados operativos (singleSelect `Estado Operativo`). */
export type EstadoOperativo =
  | 'Operativo'
  | 'En Mantenimiento'
  | 'En Reparación'
  | 'Fuera de Servicio'
  | 'En Tránsito'
  | 'Disponible en Almacén'
  | 'Dado de Baja'
  | 'Incompleto';

/** Condición física (singleSelect `Condición al Asignar` / `al Devolver`). */
export type CondicionActivo =
  | 'Excelente'
  | 'Buena'
  | 'Regular'
  | 'Necesita Reparación'
  | 'Dañada';

/** Tipos de ubicación (singleSelect `Tipo Ubicación`). */
export type TipoUbicacion =
  | 'Planta'
  | 'Oficina'
  | 'Bodega'
  | 'Área Operativa'
  | 'Laboratorio'
  | 'Exterior / Campo';

/** Tipos de evento de la hoja de vida (singleSelect `Tipo Evento`). */
export type TipoEvento =
  | 'Mantenimiento Preventivo'
  | 'Mantenimiento Correctivo'
  | 'Recarga / Reposición'
  | 'Calibración'
  | 'Inspección'
  | 'Traslado'
  | 'Reparación'
  | 'Baja de Activo'
  | 'Actualización Técnica';

/** Estados de resultado de un evento (singleSelect `Estado Resultado`). */
export type EstadoResultado = 'Exitoso' | 'Parcial' | 'Fallido' | 'Pendiente';
