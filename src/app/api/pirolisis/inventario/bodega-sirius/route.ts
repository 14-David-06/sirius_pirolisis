import { NextResponse } from 'next/server';
import { fetchBachesNoDisponibles, resolverBiocharDisponible } from '@/lib/baches-biochar';
import {
  fetchBachesBiocharCore,
  fetchMovimientosBiocharPuro,
  type BacheBiocharCore,
} from '@/lib/biochar-inventario-core';
import { resumenAbono } from '@/lib/abono-inventario-core';
import { resumenBlend } from '@/lib/blend-inventario-core';

/**
 * GET /api/pirolisis/inventario/bodega-sirius
 *
 * Lo que hay en la bodega de pirólisis según Sirius Inventario Production Core:
 * el biochar puro (`SIRIUS-PRODUCT-0015`) y el abono 4G (`SIRIUS-PRODUCT-0020`),
 * los dos componentes que la planta almacena para producir Biochar Blend, y el
 * Biochar Blend mismo (`SIRIUS-PRODUCT-0016`), que es lo que sale de ellos.
 *
 * El Blend va en la misma respuesta porque las tres cifras solo significan algo
 * juntas: es el mismo libro mayor leído en sus dos extremos —lo que entró como
 * materia prima y lo que salió como producto—, y en pantallas separadas nadie
 * puede contrastarlas.
 *
 * Es una vista distinta a la del Sistema de Baches, no una repetición: allá la
 * pregunta es "cómo va la producción de este bache" y la fuente es la fórmula de
 * la tabla de baches; acá es "qué hay en bodega y de dónde salió cada kg", y la
 * fuente es el libro mayor que comparte el ecosistema. El saldo del biochar sale
 * del mismo `resolverBiocharDisponible()` que el resto de la app para que ninguna
 * pantalla muestre un número propio.
 *
 * Los tres productos se leen en paralelo y ninguna lectura es fatal por su cuenta:
 * que falte el abono no debe dejar la pantalla sin el biochar, ni al revés. Un
 * producto llega en `null` mientras no esté configurado en el Core, que es un
 * estado normal —no un error— hasta que corra su migración.
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
    const [disponible, baches, noDisponibles, movimientos, abono, blend] = await Promise.all([
      resolverBiocharDisponible(),
      fetchBachesBiocharCore().catch((err) => {
        console.error('⚠️ No se pudo leer el desglose por bache:', err);
        return null;
      }),
      // Los baches que NO tienen biochar que sacar, con el motivo de cada uno. Van
      // en la misma respuesta a propósito: son parte de "qué hay en bodega", y
      // separarlos en otra llamada es como la pantalla terminó ofreciendo una lista
      // con huecos que no sabía explicar.
      fetchBachesNoDisponibles().catch((err) => {
        console.error('⚠️ No se pudieron leer los baches no disponibles:', err);
        return [];
      }),
      fetchMovimientosBiocharPuro().catch((err) => {
        console.error('⚠️ No se pudieron leer los movimientos de biochar:', err);
        return null;
      }),
      resumenAbono().catch((err) => {
        console.error('⚠️ No se pudo leer el inventario de abono 4G:', err);
        return null;
      }),
      resumenBlend().catch((err) => {
        console.error('⚠️ No se pudo leer el inventario de Biochar Blend:', err);
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
      {
        biochar: {
          disponible,
          baches: clasificados,
          noDisponibles,
          totales,
          movimientos: ordenados,
        },
        abono,
        blend,
      },
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
