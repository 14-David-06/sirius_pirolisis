/**
 * Barrel export para componentes de inventario
 * Simplifica imports en la página principal
 */

export { default as EstadisticasGenerales } from './EstadisticasGenerales';
export { default as AlertasInventario } from './AlertasInventario';
export { default as VencimientosProximos } from './VencimientosProximos';
export { default as MetricasSection } from './MetricasSection';
export { default as PaqueteLonasCard } from './PaqueteLonasCard';
export { default as InventarioTable } from './InventarioTable';
export { default as ItemCard } from './ItemCard';
export { default as RegistrarInsumoForm } from './RegistrarInsumoForm';
export { default as IngresoInsumoForm } from './IngresoInsumoForm';
export { default as EditarInsumoPanel } from './EditarInsumoPanel';

// Iconos SVG del módulo (sustituyen los emojis en títulos y botones)
export * from './Icons';
