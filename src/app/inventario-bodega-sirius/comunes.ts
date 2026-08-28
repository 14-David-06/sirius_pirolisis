/**
 * Lo que comparten la pantalla de bodega y sus formularios.
 *
 * Vive aparte porque `page.tsx` es un archivo de ruta de Next: exportar de él
 * cualquier cosa que no sea el default (o los `metadata`, `runtime`… que Next
 * reconoce) rompe la comprobación de tipos de la ruta. Y un `SelectorBache` que no
 * se puede importar es un `SelectorBache` que no se puede probar.
 */

/** Estado del bache VISTO DESDE BODEGA. Lo deriva el endpoint, no la pantalla. */
export type EstadoBodega = 'completo' | 'parcial' | 'agotado' | 'sobregirado';

export interface BacheBodega {
  codigo: string;
  kg: number;
  kgIngresado: number;
  kgConsumido: number;
  lotes: string[];
  estado: EstadoBodega;
}

/**
 * Un bache que existe pero del que no se puede sacar biochar —consumido, todavía
 * en planta, histórico, o sin monitoreo—. Se muestra igual, en gris y con el
 * motivo: negar que exista es lo que hacía que la ausencia pareciera un bug.
 */
export interface BacheNoDisponible {
  codigo: string;
  motivo: string;
}

/** Clase de los campos de formulario de la pantalla. */
export const CAMPO =
  'mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7836] [&>option]:bg-slate-800';

/** KG con separador de miles y dos decimales. */
export const kg = (n: number) =>
  `${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
