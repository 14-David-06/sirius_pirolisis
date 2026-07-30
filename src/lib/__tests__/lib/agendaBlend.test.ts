import { calcularAgenda, type PedidoAgendable } from '@/lib/agenda-blend';

/** Proporciones reales de la fórmula del Blend (config.blend por defecto). */
const PCT = { pctBiochar: 0.2, pctAbono: 0.74, pctBiologicos: 0.007 };

function pedido(over: Partial<PedidoAgendable> = {}): PedidoAgendable {
  return {
    pedidoRecordId: over.pedidoRecordId ?? 'rec1',
    idPedidoCore: over.idPedidoCore ?? 'SIRIUS-PED-0001',
    cliente: over.cliente ?? 'Cliente',
    nit: over.nit ?? '',
    fecha: over.fecha ?? '2026-08-01',
    kg: over.kg ?? 1000,
    estado: over.estado ?? 'Recibido',
    empaque: over.empaque ?? 'Big Bag',
    observaciones: over.observaciones ?? '',
    kgFuente: over.kgFuente ?? 'detalle',
    detalleRecordId: over.detalleRecordId ?? 'recDet1',
  };
}

/** Stock holgado para que nada limite salvo lo que el test quiera limitar. */
const STOCK_AMPLIO = { biochar: 100000, abono: 100000, biologicos: 1000 };

describe('calcularAgenda', () => {
  it('ordena los pedidos por fecha de entrega, no por el orden recibido', () => {
    const { eventos } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'c', fecha: '2026-09-15' }),
        pedido({ pedidoRecordId: 'a', fecha: '2026-08-01' }),
        pedido({ pedidoRecordId: 'b', fecha: '2026-08-20' }),
      ],
      STOCK_AMPLIO,
      PCT
    );

    expect(eventos.map((e) => e.pedidoRecordId)).toEqual(['a', 'b', 'c']);
  });

  it('deja los pedidos sin fecha al final', () => {
    const { eventos } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'sin-fecha', fecha: '' }),
        pedido({ pedidoRecordId: 'con-fecha', fecha: '2026-12-31' }),
      ],
      STOCK_AMPLIO,
      PCT
    );

    expect(eventos.map((e) => e.pedidoRecordId)).toEqual(['con-fecha', 'sin-fecha']);
  });

  it('aplica la fórmula del Blend a cada pedido', () => {
    const { eventos } = calcularAgenda([pedido({ kg: 1000 })], STOCK_AMPLIO, PCT);

    expect(eventos[0].requerido).toEqual({ biochar: 200, abono: 740, biologicos: 7 });
  });

  it('acumula la demanda en orden de entrega: el stock es uno y se comparte', () => {
    // 4 pedidos de 1000 kg → 740 kg de abono cada uno. Con 1600 kg de abono:
    //   p1 acumula  740 → cubierto
    //   p2 acumula 1480 → cubierto (quedan 120 kg libres)
    //   p3 acumula 2220 → déficit 620 < 740 que pide ⇒ parcial (esos 120 kg cubren algo)
    //   p4 acumula 2960 → déficit 1360 > 740 que pide ⇒ sin_stock (ya no queda nada)
    const { eventos, resumen } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'p1', fecha: '2026-08-01', kg: 1000 }),
        pedido({ pedidoRecordId: 'p2', fecha: '2026-08-02', kg: 1000 }),
        pedido({ pedidoRecordId: 'p3', fecha: '2026-08-03', kg: 1000 }),
        pedido({ pedidoRecordId: 'p4', fecha: '2026-08-04', kg: 1000 }),
      ],
      { biochar: 100000, abono: 1600, biologicos: 1000 },
      PCT
    );

    expect(eventos.map((e) => e.cobertura)).toEqual([
      'cubierto',
      'cubierto',
      'parcial',
      'sin_stock',
    ]);
    expect(eventos[2].limitante).toBe('abono');
    expect(eventos[2].acumulado.abono).toBe(2220);
    expect(eventos[3].acumulado.abono).toBe(2960);
    expect(resumen.kgComprometidos).toBe(4000);
    expect(resumen.kgCubiertos).toBe(2000);
    expect(resumen.kgSinCobertura).toBe(2000);
    expect(resumen.primeraFechaSinCobertura).toBe('2026-08-03');
  });

  it('marca "parcial" cuando el stock cubre parte del pedido y "sin_stock" cuando ya se agotó', () => {
    // Un solo pedido de 1000 kg pide 740 de abono; hay 500 → déficit 240 < 740
    // ⇒ parcial (alcanza para parte). El segundo pedido ya no tiene nada.
    const { eventos } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'p1', fecha: '2026-08-01', kg: 1000 }),
        pedido({ pedidoRecordId: 'p2', fecha: '2026-08-02', kg: 1000 }),
      ],
      { biochar: 100000, abono: 500, biologicos: 1000 },
      PCT
    );

    expect(eventos[0].cobertura).toBe('parcial');
    expect(eventos[1].cobertura).toBe('sin_stock');
  });

  it('identifica la materia prima que limita, no solo que falta algo', () => {
    // Abono y biochar sobran; los biológicos (7 L por tonelada) no.
    const { eventos } = calcularAgenda(
      [pedido({ kg: 1000 })],
      { biochar: 100000, abono: 100000, biologicos: 3 },
      PCT
    );

    expect(eventos[0].cobertura).toBe('parcial');
    expect(eventos[0].limitante).toBe('biologicos');
  });

  it('los pedidos despachados y cancelados no comprometen materia prima', () => {
    const { eventos, resumen } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'cancelado', fecha: '2026-08-01', kg: 5000, estado: 'Cancelado' }),
        pedido({ pedidoRecordId: 'despachado', fecha: '2026-08-02', kg: 5000, estado: 'Despachado' }),
        pedido({ pedidoRecordId: 'abierto', fecha: '2026-08-03', kg: 1000, estado: 'Recibido' }),
      ],
      { biochar: 100000, abono: 1000, biologicos: 1000 },
      PCT
    );

    expect(eventos[0].cobertura).toBe('no_aplica');
    expect(eventos[1].cobertura).toBe('no_aplica');
    // El pedido abierto está cubierto porque los 10.000 kg cerrados no consumieron.
    expect(eventos[2].cobertura).toBe('cubierto');
    expect(resumen.pedidosTotales).toBe(3);
    expect(resumen.pedidosAbiertos).toBe(1);
    expect(resumen.kgComprometidos).toBe(1000);
  });

  it('no compromete nada cuando todos los pedidos están cerrados', () => {
    const { resumen } = calcularAgenda(
      [pedido({ estado: 'Cancelado', kg: 1500 }), pedido({ estado: 'Despachado', kg: 100 })],
      STOCK_AMPLIO,
      PCT
    );

    expect(resumen.kgComprometidos).toBe(0);
    expect(resumen.kgSinCobertura).toBe(0);
    expect(resumen.primeraFechaSinCobertura).toBeNull();
  });

  it('cuenta los pedidos cuyos KG salieron de las notas (detalle desvinculado en Core)', () => {
    const { resumen } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'p1', kgFuente: 'notas' }),
        pedido({ pedidoRecordId: 'p2', kgFuente: 'detalle' }),
        pedido({ pedidoRecordId: 'p3', kgFuente: 'notas' }),
      ],
      STOCK_AMPLIO,
      PCT
    );

    expect(resumen.pedidosSinDetalle).toBe(2);
  });

  it('ignora los pedidos sin KG en lugar de contarlos como cubiertos', () => {
    const { eventos, resumen } = calcularAgenda(
      [pedido({ kg: 0 })],
      STOCK_AMPLIO,
      PCT
    );

    expect(eventos[0].cobertura).toBe('no_aplica');
    expect(resumen.kgComprometidos).toBe(0);
  });

  it('no arrastra basura de punto flotante en los acumulados', () => {
    const { eventos } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'p1', fecha: '2026-08-01', kg: 100 }),
        pedido({ pedidoRecordId: 'p2', fecha: '2026-08-02', kg: 100 }),
        pedido({ pedidoRecordId: 'p3', fecha: '2026-08-03', kg: 100 }),
      ],
      STOCK_AMPLIO,
      PCT
    );

    // 0.7 + 0.7 + 0.7 en flotante daría 2.0999999999999996
    expect(eventos[2].acumulado.biologicos).toBe(2.1);
  });

  it('no revive la primera fecha en riesgo si un pedido posterior vuelve a caber', () => {
    // p1 (grande) no cabe; p2 (chico) tampoco debería reponer la fecha en riesgo.
    const { resumen } = calcularAgenda(
      [
        pedido({ pedidoRecordId: 'p1', fecha: '2026-08-01', kg: 10000 }),
        pedido({ pedidoRecordId: 'p2', fecha: '2026-08-02', kg: 10 }),
      ],
      { biochar: 100000, abono: 1000, biologicos: 1000 },
      PCT
    );

    expect(resumen.primeraFechaSinCobertura).toBe('2026-08-01');
  });
});
