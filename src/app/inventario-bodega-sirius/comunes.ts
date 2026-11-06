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

/**
 * Clase de los campos de formulario de la pantalla.
 *
 * ⚠️ El fondo oscuro de las opciones va por DESCENDIENTE (`[&_option]`), no por
 * hijo directo (`[&>option]`): dentro de un `<optgroup>` la opción ya no es hija
 * del select, se queda con el fondo blanco del navegador y hereda el texto blanco
 * del campo — la lista se ve en blanco (pasó con «Quién se lleva el pedido»,
 * 2026-11-06). La etiqueta del grupo va más tenue y sus opciones vuelven a blanco.
 */
export const CAMPO =
  'mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7836] [&_option]:bg-slate-800 [&_option]:text-white [&_optgroup]:bg-slate-800 [&_optgroup]:text-white/60';

/** KG con separador de miles y dos decimales. */
export const kg = (n: number) =>
  `${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

/**
 * Cuánto de un despacho de Blend sale de cada lote: se vacían en el orden recibido
 * (los del pedido primero, después los libres) hasta cubrir `kg`.
 *
 * Los KG los digita el operador porque un pedido puede salir en VARIAS entregas
 * programadas (SIRIUS-PED-0134: 3 t en tres viajes, 2026-11-09…13). Antes el
 * formulario mandaba siempre todo lo producido, y un pedido con dos toneladas en
 * bodega no se podía despachar en dos camiones.
 *
 * Devuelve `null` si `kg` no es positivo o los lotes no alcanzan: un reparto que
 * no suma lo pedido no se muestra, porque el servidor lo rechazaría igual.
 */
export function repartirKgEnLotes<T extends { lote: string; kgDisponibles: number }>(
  lotes: T[],
  kg: number
): Array<{ lote: string; kg: number; origen: T }> | null {
  const objetivo = Math.round(kg * 100) / 100;
  if (!Number.isFinite(objetivo) || objetivo <= 0) return null;

  const reparto: Array<{ lote: string; kg: number; origen: T }> = [];
  let resto = objetivo;
  for (const l of lotes) {
    if (resto <= 0.005) break;
    const toma = Math.round(Math.min(resto, l.kgDisponibles) * 100) / 100;
    if (toma <= 0.005) continue;
    reparto.push({ lote: l.lote, kg: toma, origen: l });
    resto = Math.round((resto - toma) * 100) / 100;
  }
  return resto > 0.005 ? null : reparto;
}
