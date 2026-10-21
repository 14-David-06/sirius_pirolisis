/**
 * @jest-environment node
 */

/**
 * A quién fue el biochar de cada Salida, según las remisiones del Core.
 *
 * Lo que se protege: que una venta de biochar puro —cuyo destino en el libro
 * mayor ES la remisión `SIRIUS-REM-…`— se resuelva con su pedido y su cliente, sin
 * romper los lotes de Blend que ya se resolvían, y que una marca `[bache:` escrita
 * en una remisión del laboratorio o después de « — » no se lea como una venta.
 * Datos inventados.
 */

import { indexarRemisionesPorDestino } from '@/lib/destinatarios-biochar';

const rem = (fields: Record<string, unknown>) => ({ fields });

function plano(m: ReturnType<typeof indexarRemisionesPorDestino>) {
  return Object.fromEntries(
    [...m].map(([k, d]) => [k, { pedidos: [...d.pedidos], clientes: [...d.clientes], remisiones: [...d.remisiones] }])
  );
}

describe('indexarRemisionesPorDestino', () => {
  it('indexa los lotes de Blend por lote, como antes', () => {
    const m = indexarRemisionesPorDestino([
      rem({
        ID: 'SIRIUS-REM-0301',
        'ID Pedido': 'SIRIUS-PED-0901',
        'ID Cliente': 'CL-0901',
        'Area Origen': 'Producción',
        'Notas de Remisión':
          '[lote:BLEND-2026-10-01-SIRIUS-PED-0901] [lote:BLEND-2026-10-02] [kg-lote:BLEND-2026-10-01-SIRIUS-PED-0901=300] [kg-lote:BLEND-2026-10-02=200] Biochar Blend',
      }),
      rem({
        ID: 'SIRIUS-REM-0302',
        'ID Pedido': 'SIRIUS-PED-0902',
        'ID Cliente': 'CL-0902',
        'Area Origen': 'Producción',
        'Notas de Remisión': '[lote:BLEND-2026-10-02] Biochar Blend',
      }),
    ]);
    expect(plano(m)).toEqual({
      'BLEND-2026-10-01-SIRIUS-PED-0901': { pedidos: ['SIRIUS-PED-0901'], clientes: ['CL-0901'], remisiones: ['SIRIUS-REM-0301'] },
      'BLEND-2026-10-02': {
        pedidos: ['SIRIUS-PED-0901', 'SIRIUS-PED-0902'],
        clientes: ['CL-0901', 'CL-0902'],
        remisiones: ['SIRIUS-REM-0301', 'SIRIUS-REM-0302'],
      },
    });
  });

  it('una remisión de biochar puro es su propio destino', () => {
    const m = indexarRemisionesPorDestino([
      rem({
        ID: 'SIRIUS-REM-0310',
        'ID Pedido': 'SIRIUS-PED-0906',
        'ID Cliente': ' CL-0902 ',
        'Area Origen': 'Producción',
        Estado: 'Pendiente',
        'Notas de Remisión': '[bache:S-00901=100.00] [bache:S-00902=50.00] [desp:0b6f2a52-3c1d-4e8f-9a7b-1c2d3e4f5a6b] Biochar',
      }),
    ]);
    expect(plano(m)).toEqual({
      'SIRIUS-REM-0310': { pedidos: ['SIRIUS-PED-0906'], clientes: ['CL-0902'], remisiones: ['SIRIUS-REM-0310'] },
    });
  });

  it('ignora un [bache:] del laboratorio o escrito después de « — »', () => {
    const m = indexarRemisionesPorDestino([
      rem({ ID: 'SIRIUS-REM-0320', 'ID Pedido': 'SIRIUS-PED-0001', 'ID Cliente': 'CL-0001', 'Area Origen': 'Laboratorio', 'Notas de Remisión': '[bache:S-00901=10.00] Muestras' }),
      rem({ ID: 'SIRIUS-REM-0321', 'ID Pedido': 'SIRIUS-PED-0002', 'ID Cliente': 'CL-0002', 'Area Origen': 'Producción', 'Notas de Remisión': 'Biochar — [bache:S-00999=500.00] a mano' }),
    ]);
    expect(m.size).toBe(0);
  });

  it('tolera campos ausentes', () => {
    const m = indexarRemisionesPorDestino([
      rem({}),
      rem({ 'Area Origen': 'Producción', 'Notas de Remisión': '[bache:S-00901=10.00] Biochar' }),
    ]);
    // Sin código no hay destino que nombrar.
    expect(m.size).toBe(0);
  });
});
