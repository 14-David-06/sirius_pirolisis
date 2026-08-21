import { NextResponse } from 'next/server';
import { resolverBiocharDisponible } from '@/lib/baches-biochar';
import {
  fetchBachesBiocharCore,
  fetchMovimientosBiocharPuro,
  type BacheBiocharCore,
} from '@/lib/biochar-inventario-core';

/**
 * GET /api/pirolisis/inventario/bodega-sirius
 *
 * La vista de BODEGA del biochar puro: el saldo, el desglose por bache y el
 * movimiento a movimiento, todo desde Sirius Inventario Production Core.
 *
 * Es una vista distinta a la del Sistema de Baches, no una repetición: allá la
 * pregunta es "cómo va la producción de este bache" y la fuente es la fórmula de
 * la tabla de baches; acá es "qué hay en bodega y de dónde salió cada kg", y la
 * fuente es el libro mayor que comparte el ecosistema. El saldo sale del mismo
 * `resolverBiocharDisponible()` que el resto de la app para que ninguna pantalla
 * muestre un número propio.
 *
 * Las tres lecturas van en paralelo y ninguna es fatal por su cuenta: un fallo
 * leyendo el detalle no debe dejar la pantalla sin el total, que es el dato que
 * casi siempre se viene a buscar.
 */

/** Por debajo de esto un bache se considera vacío: son restos de redondeo. */
const TOLERANCIA_VACIO_KG = 0.01;

/**
 * Estado del bache VISTO DESDE BODEGA. No es `Estado Bache` de PiroliApp: ese
 * depende del monitoreo y del cierre del bache, y acá la única pregunta es qué
 * queda del biochar que entró.
 *
 * Se deriva aquí, en un solo sitio, porque el mismo criterio alimenta los
 * contadores de los filtros y los totales: si la pantalla clasificara por su
 * cuenta, un chip podría decir "12 agotados" mientras el KPI cuenta otra cosa —
 * que es exactamente el error que tenía esta vista.
 */
export type EstadoBodega = 'completo' | 'parcial' | 'agotado' | 'sobregirado';

function estadoBodega(b: BacheBiocharCore): EstadoBodega {
  if (b.kg < -TOLERANCIA_VACIO_KG) return 'sobregirado';
  if (Math.abs(b.kg) <= TOLERANCIA_VACIO_KG) return 'agotado';
  return b.kgConsumido > TOLERANCIA_VACIO_KG ? 'parcial' : 'completo';
}

export async function GET() {
  try {
    const [disponible, baches, movimientos] = await Promise.all([
      resolverBiocharDisponible(),
      fetchBachesBiocharCore().catch((err) => {
        console.error('⚠️ No se pudo leer el desglose por bache:', err);
        return null;
      }),
      fetchMovimientosBiocharPuro().catch((err) => {
        console.error('⚠️ No se pudieron leer los movimientos de biochar:', err);
        return null;
      }),
    ]);

    // Más reciente primero: lo que interesa al abrir es el último movimiento.
    const ordenados = movimientos
      ? [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha))
      : null;

    // Se devuelven TODOS los baches, agotados incluidos, y el filtrado se hace en
    // la pantalla. Recortar la lista aquí dejaba los totales históricos calculados
    // sobre los baches sobrevivientes: el consumo daba 0 kg porque el bache que se
    // consumió por completo era justo el que se había excluido.
    const clasificados = baches?.map((b) => ({ ...b, estado: estadoBodega(b) })) ?? null;

    const totales = clasificados
      ? {
          ingresado: redondear(clasificados.reduce((s, b) => s + b.kgIngresado, 0)),
          consumido: redondear(clasificados.reduce((s, b) => s + b.kgConsumido, 0)),
          saldo: redondear(clasificados.reduce((s, b) => s + b.kg, 0)),
          porEstado: {
            completo: clasificados.filter((b) => b.estado === 'completo').length,
            parcial: clasificados.filter((b) => b.estado === 'parcial').length,
            agotado: clasificados.filter((b) => b.estado === 'agotado').length,
            sobregirado: clasificados.filter((b) => b.estado === 'sobregirado').length,
          },
        }
      : null;

    return NextResponse.json(
      { disponible, baches: clasificados, totales, movimientos: ordenados },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET inventario/bodega-sirius:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
