// src/lib/agenda-blend.ts
//
// Cálculo de la agenda de producción de Biochar Blend: cuánta materia prima
// compromete cada pedido y hasta dónde alcanza el stock de bodega.
//
// Es una función PURA, separada del endpoint, por dos razones:
//   1. Es la regla de negocio del módulo (la cobertura acumulada) y se puede
//      probar con escenarios completos sin tocar Airtable.
//   2. Los pedidos reales están todos cancelados hoy, así que sin tests la regla
//      no se ejercitaría nunca.

import type {
  Cobertura,
  EventoAgenda,
  MateriaPrimaTerna,
  ResumenAgenda,
} from '@/types/agenda-blend';

/**
 * Estados (ya mapeados a los de la app) que NO comprometen materia prima:
 * el pedido salió del compromiso, sea porque se despachó o porque se canceló.
 */
export const ESTADOS_CERRADOS = new Set(['Despachado', 'Cancelado']);

/** Fecha sintética para ordenar al final los pedidos sin compromiso de entrega. */
const SIN_FECHA = '9999-12-31';

/** Datos mínimos de un pedido para agendarlo. */
export interface PedidoAgendable {
  pedidoRecordId: string;
  idPedidoCore: string;
  cliente: string;
  nit: string;
  /** Fecha de entrega comprometida (ISO). Vacío si no tiene. */
  fecha: string;
  kg: number;
  estado: string;
  empaque: string;
  observaciones: string;
  /** 'detalle' | 'notas' | 'sin-dato': de dónde se leyeron los KG. */
  kgFuente: string;
  detalleRecordId: string;
}

export interface Proporciones {
  pctBiochar: number;
  pctAbono: number;
  pctBiologicos: number;
}

/**
 * Ordena los pedidos por fecha de entrega y calcula, para cada uno, la materia
 * prima que consume y si el stock alcanza a cubrirlo.
 *
 * ⚠️ LA COBERTURA ES ACUMULADA. El stock es UNO y lo comparten todos los pedidos:
 * evaluar cada pedido contra el stock total por separado diría que los cinco
 * pedidos de la semana están cubiertos cuando en realidad solo alcanza para los
 * dos primeros. La demanda se acumula en orden de entrega —el orden en que hay
 * que producir— y un pedido queda 'cubierto' solo si el stock alcanza para él Y
 * para todo lo que vence antes.
 *
 * Estados de cobertura:
 *   - 'cubierto'   → el stock cubre este pedido y todos los anteriores
 *   - 'parcial'    → el déficit es menor que lo que pide este pedido: alcanza para parte
 *   - 'sin_stock'  → la materia prima ya se agotó con los pedidos anteriores
 *   - 'no_aplica'  → pedido cerrado (despachado/cancelado) o sin KG
 *
 * @param pedidos Pedidos a agendar, en cualquier orden.
 * @param disponible Stock actual de las tres materias primas.
 * @param pct Proporciones de la fórmula del Blend.
 */
export function calcularAgenda(
  pedidos: PedidoAgendable[],
  disponible: MateriaPrimaTerna,
  pct: Proporciones
): { eventos: EventoAgenda[]; resumen: ResumenAgenda } {
  const ordenados = [...pedidos].sort((a, b) =>
    (a.fecha || SIN_FECHA).localeCompare(b.fecha || SIN_FECHA)
  );

  const acumulado = { biochar: 0, abono: 0, biologicos: 0 };
  let kgComprometidos = 0;
  let kgCubiertos = 0;
  let primeraFechaSinCobertura: string | null = null;

  const eventos: EventoAgenda[] = ordenados.map((pedido) => {
    const cerrado = ESTADOS_CERRADOS.has(pedido.estado);

    const requerido: MateriaPrimaTerna = {
      biochar: redondear(pedido.kg * pct.pctBiochar),
      abono: redondear(pedido.kg * pct.pctAbono),
      biologicos: redondear(pedido.kg * pct.pctBiologicos),
    };

    let cobertura: Cobertura = 'no_aplica';
    let limitante: string | null = null;

    if (!cerrado && pedido.kg > 0) {
      acumulado.biochar = redondear(acumulado.biochar + requerido.biochar);
      acumulado.abono = redondear(acumulado.abono + requerido.abono);
      acumulado.biologicos = redondear(acumulado.biologicos + requerido.biologicos);
      kgComprometidos = redondear(kgComprometidos + pedido.kg);

      // Materia prima con el mayor déficit contra la demanda acumulada: es la
      // que limita. Si ninguna tiene déficit, el pedido está cubierto.
      const deficits: Array<[keyof MateriaPrimaTerna, number]> = [
        ['biochar', acumulado.biochar - disponible.biochar],
        ['abono', acumulado.abono - disponible.abono],
        ['biologicos', acumulado.biologicos - disponible.biologicos],
      ];
      const peor = deficits.reduce((a, b) => (b[1] > a[1] ? b : a));

      if (peor[1] <= 0) {
        cobertura = 'cubierto';
        kgCubiertos = redondear(kgCubiertos + pedido.kg);
      } else {
        cobertura = peor[1] < requerido[peor[0]] ? 'parcial' : 'sin_stock';
        limitante = peor[0];
        if (!primeraFechaSinCobertura && pedido.fecha) {
          primeraFechaSinCobertura = pedido.fecha;
        }
      }
    }

    return {
      pedidoRecordId: pedido.pedidoRecordId,
      idPedidoCore: pedido.idPedidoCore,
      cliente: pedido.cliente,
      nit: pedido.nit,
      fecha: pedido.fecha,
      kg: pedido.kg,
      estado: pedido.estado,
      empaque: pedido.empaque,
      observaciones: pedido.observaciones,
      requerido,
      acumulado: { ...acumulado },
      cobertura,
      limitante,
      kgFuente: pedido.kgFuente,
      detalleRecordId: pedido.detalleRecordId,
    };
  });

  const abiertos = eventos.filter((e) => !ESTADOS_CERRADOS.has(e.estado));

  return {
    eventos,
    resumen: {
      pedidosTotales: eventos.length,
      pedidosAbiertos: abiertos.length,
      kgComprometidos,
      kgCubiertos,
      kgSinCobertura: redondear(kgComprometidos - kgCubiertos),
      primeraFechaSinCobertura,
      pedidosSinDetalle: eventos.filter((e) => e.kgFuente === 'notas').length,
    },
  };
}

/** Redondea a 2 decimales evitando la basura del punto flotante (0.1+0.2). */
function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
