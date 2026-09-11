import { NextResponse } from 'next/server';
import { listarPedidosBlend } from '@/lib/pedidos-blend-core';
import { lotesDisponiblesBlend } from '@/lib/despacho-blend';

/**
 * GET /api/pirolisis/pedidos
 *
 * TODOS los pedidos de Biochar Blend según Sirius Pedidos Core, cada uno marcado
 * como pendiente o cerrado. El corte por estado lo hace la pantalla con sus
 * filtros: devolver solo los pendientes dejaba sin forma de consultar lo enviado,
 * lo completado y lo cancelado, que es el historial comercial del producto.
 *
 * Va en SU PROPIO endpoint y no dentro de `/inventario/bodega-sirius` aunque se
 * pinten en la misma pantalla: son cuatro bases distintas (pedidos, clientes,
 * remisiones e inventario) y meterlas en la misma llamada haría que un Core lento
 * —o caído— demorara o tumbara el inventario, que es lo que la pantalla existe
 * para mostrar. Así la sección de pedidos carga aparte y falla aparte.
 *
 * `pedidos: null` significa "no se pudo saber" (Pedidos Core sin configurar o sin
 * responder), que no es lo mismo que un array vacío: ese afirma que no hay ningún
 * pedido. La pantalla dice cuál de los dos es.
 *
 * Por eso un fallo también responde 200: la sección es un complemento del
 * inventario, y un 500 aquí solo lograría que la pantalla mostrara un error por
 * algo que no le impide hacer su trabajo.
 *
 * Viene también `lotes`: los lotes de Blend producidos con lo que queda sin
 * despachar en cada uno. Van con los pedidos y no en su propia llamada porque son
 * las dos mitades de la misma decisión —de qué lote sale lo que este pedido
 * necesita—, y el formulario de despacho no puede abrirse sin ellos.
 */
export async function GET() {
  try {
    const [pedidos, lotes] = await Promise.all([
      listarPedidosBlend(),
      lotesDisponiblesBlend().catch((err) => {
        console.error('⚠️ No se pudieron leer los lotes de Blend disponibles:', err);
        return [];
      }),
    ]);
    return NextResponse.json({ pedidos, lotes }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET pirolisis/pedidos:', message);
    return NextResponse.json({ pedidos: null, lotes: [], error: message }, { status: 200 });
  }
}
