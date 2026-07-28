/**
 * Barrel export de los componentes de Activos Fijos.
 * Simplifica los imports en la página del módulo.
 */

export { default as EstadisticasActivos } from './EstadisticasActivos';
export { default as AlertasActivos } from './AlertasActivos';
export { default as ActivosTable } from './ActivosTable';
export { default as ActivoCard } from './ActivoCard';
export { default as DetalleActivoModal } from './DetalleActivoModal';

// Formularios (CRUD + ciclo de vida)
export { default as ActivoForm } from './ActivoForm';
export { default as AsignarActivoForm } from './AsignarActivoForm';
export { default as DevolverActivoForm } from './DevolverActivoForm';
export { default as BajaActivoForm } from './BajaActivoForm';

// Selectores de catálogo
export { default as TipoActivoSelector } from './TipoActivoSelector';
export { default as UbicacionSelector } from './UbicacionSelector';

// Primitivas de formulario e iconos SVG del módulo
export * from './FormFields';
export * from './Icons';
