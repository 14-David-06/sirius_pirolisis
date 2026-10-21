import { NextResponse } from 'next/server';
import { listarPedidosBlend, listarPedidosPirolisis, type PedidoBlend } from '@/lib/pedidos-blend-core';
import { lotesDisponiblesBlend } from '@/lib/despacho-blend';

export const runtime = 'nodejs';

/**
 * GET /api/pirolisis/pedidos
 *
 * TODOS los pedidos de pirólisis según Sirius Pedidos Core, cada uno marcado
 * como pendiente o cerrado: `pedidos` (Biochar Blend, 0016) y `pedidosBiochar`
 * (biochar puro, 0015). Un pedido mixto aparece en las dos listas, cada fila con
 * SUS kg. El corte por estado lo hace la pantalla con sus filtros.
 *
 * Las dos listas salen de UNA lectura de Pedidos Core (`listarPedidosPirolisis`):
 * leerla una vez por producto duplicaría las requests contra el rate limit de la
 * base (§3 de CLAUDE.md) y podría mostrar los dos lados de un pedido mixto en
 * momentos distintos.
 *
 * Va en SU PROPIO endpoint y no dentro de `/inventario/bodega-sirius`: son cuatro
 * bases distintas y un Core lento —o caído— no debe tumbar el inventario.
 *
 * `null` significa "no se pudo saber" (sin configurar o sin responder), que no es
 * lo mismo que `[]`: ese afirma que no hay pedidos. Por eso un fallo también
 * responde 200: la sección es un complemento del inventario.
 *
 * Viene también `lotes`: los lotes de Blend con lo que queda sin despachar, que
 * el formulario de despacho de Blend necesita para abrirse.
 */
export async function GET() {
  try {
    const [pirolisis, lotes] = await Promise.all([
      listarPedidosPirolisis(),
      lotesDisponiblesBlend().catch((err) => {
        console.error('⚠️ No se pudieron leer los lotes de Blend disponibles:', err);
        return [];
      }),
    ]);

    // Sin el biochar puro configurado no hay lista combinada; el Blend sigue
    // funcionando solo, como antes de que existiera el despacho de biochar.
    let pedidos: PedidoBlend[] | null;
    if (pirolisis) {
      // La lista de Blend con la forma de siempre: sin los campos del biochar.
      pedidos = pirolisis.blend.map(({ producto: _p, despachoIncompleto: _d, ...pedido }) => pedido);
    } else {
      pedidos = await listarPedidosBlend();
    }

    return NextResponse.json(
      { pedidos, pedidosBiochar: pirolisis ? pirolisis.biochar : null, lotes },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET pirolisis/pedidos:', message);
    return NextResponse.json({ pedidos: null, pedidosBiochar: null, lotes: [], error: message }, { status: 200 });
  }
}
