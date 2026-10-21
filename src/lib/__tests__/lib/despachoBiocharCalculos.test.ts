/**
 * @jest-environment node
 */

/**
 * Las cuentas puras del despacho de biochar: lo comprometido, lo despachable, la
 * validación del reparto confirmado y la forma del cuerpo. Datos inventados.
 */

import {
  estadoActivacion,
  formatoKg,
  kgDespachadosBiochar,
  notasProductoRemitido,
  saldosDespachables,
  validarFormaDespacho,
  validarRepartoConfirmado,
} from '@/lib/despacho-biochar.calculos';
import type { RemisionCruda } from '@/lib/remision-pirolisis.constants';

const UUID = '0b6f3a52-6d1e-4c8a-9f3e-2a1b4c5d6e7f';

function remision(p: Partial<RemisionCruda>): RemisionCruda {
  return {
    recordId: 'recFALSO000000001',
    codigo: 'SIRIUS-REM-0900',
    numeracion: 802,
    estado: 'Pendiente',
    areaOrigen: 'Producción',
    idPedido: 'SIRIUS-PED-0900',
    idCliente: 'CL-0900',
    idAreaCliente: '',
    notas: '',
    kgRollup: 0,
    fechaDespacho: '2026-10-21',
    fechaRecibido: '',
    personasIds: [],
    documentos: [],
    ...p,
  };
}

const saldos = [
  { codigo: 'S-00140', kg: 100 },
  { codigo: 'S-00141', kg: 200 },
  { codigo: 'S-00142', kg: 0 },
];

describe('saldosDespachables', () => {
  it('sin remisiones, lo despachable es el saldo del Core', () => {
    expect(saldosDespachables(saldos, [], new Set())).toEqual([
      { bache: 'S-00140', saldoCore: 100, comprometido: 0, disponible: 100 },
      { bache: 'S-00141', saldoCore: 200, comprometido: 0, disponible: 200 },
    ]);
  });

  it('un Borrador sin Salidas compromete sus kg; una Cancelada no', () => {
    const rems = [
      remision({ codigo: 'SIRIUS-REM-0901', estado: 'Borrador', notas: `[bache:S-00140=30.00] [desp:${UUID}] Biochar` }),
      remision({ codigo: 'SIRIUS-REM-0902', estado: 'Cancelada', notas: '[bache:S-00141=50.00] Biochar' }),
    ];
    const r = saldosDespachables(saldos, rems, new Set());
    expect(r.find((s) => s.bache === 'S-00140')).toMatchObject({ comprometido: 30, disponible: 70 });
    expect(r.find((s) => s.bache === 'S-00141')).toMatchObject({ comprometido: 0, disponible: 200 });
  });

  it('con la Salida DESP-<REM>-<S> ya escrita no se cuenta dos veces', () => {
    const rems = [remision({ codigo: 'SIRIUS-REM-0901', notas: '[bache:S-00140=30.00] [bache:S-00141=20.00] Biochar' })];
    const r = saldosDespachables(saldos, rems, new Set(['DESP-SIRIUS-REM-0901-S-00140']));
    expect(r.find((s) => s.bache === 'S-00140')).toMatchObject({ comprometido: 0, disponible: 100 });
    expect(r.find((s) => s.bache === 'S-00141')).toMatchObject({ comprometido: 20, disponible: 180 });
  });

  it('se puede excluir la propia remisión (completar no se cobra a sí misma)', () => {
    const rems = [remision({ codigo: 'SIRIUS-REM-0901', estado: 'Borrador', notas: '[bache:S-00140=30.00] Biochar' })];
    const r = saldosDespachables(saldos, rems, new Set(), { excluirRemision: 'SIRIUS-REM-0901' });
    expect(r.find((s) => s.bache === 'S-00140')).toMatchObject({ comprometido: 0, disponible: 100 });
  });

  it('ignora remisiones de Blend, del laboratorio y marcas escritas después de « — »', () => {
    const rems = [
      remision({ notas: '[lote:BLEND-2026-10-01] Biochar Blend', kgRollup: 500 }),
      remision({ areaOrigen: 'Laboratorio', notas: '[bache:S-00140=99.00] Biochar' }),
      remision({ codigo: 'SIRIUS-REM-0903', notas: '[bache:S-00141=10.00] Biochar — ojo [bache:S-00140=40.00]' }),
    ];
    const r = saldosDespachables(saldos, rems, new Set());
    expect(r.find((s) => s.bache === 'S-00140')).toMatchObject({ comprometido: 0 });
    expect(r.find((s) => s.bache === 'S-00141')).toMatchObject({ comprometido: 10 });
  });

  it('lo comprometido de más nunca da disponible negativo', () => {
    const rems = [remision({ estado: 'Borrador', notas: '[bache:S-00140=150.00] Biochar' })];
    expect(saldosDespachables(saldos, rems, new Set())[0]).toMatchObject({ saldoCore: 100, comprometido: 150, disponible: 0 });
  });
});

describe('validarRepartoConfirmado', () => {
  const disp = saldosDespachables(saldos, [], new Set());

  it('acepta un reparto que suma y cabe', () => {
    expect(validarRepartoConfirmado([{ bache: 'S-00140', kg: 100 }, { bache: 'S-00141', kg: 50 }], disp, 150)).toBeNull();
  });

  it('rechaza un reparto que no suma el total', () => {
    expect(validarRepartoConfirmado([{ bache: 'S-00140', kg: 100 }], disp, 150)).toMatch(/suma 100,00 kg/);
  });

  it('rechaza un bache repetido, un código raro y kg no positivos', () => {
    expect(validarRepartoConfirmado([{ bache: 'S-00140', kg: 10 }, { bache: 'S-00140', kg: 10 }], disp, 20)).toMatch(/dos veces/);
    expect(validarRepartoConfirmado([{ bache: 'S-140', kg: 10 }], disp, 10)).toMatch(/inválido/);
    expect(validarRepartoConfirmado([{ bache: 'S-00140', kg: 0 }], disp, 0)).toMatch(/mayores que cero/);
  });

  it('rechaza cuando el saldo cambió desde el ensayo', () => {
    const despues = saldosDespachables([{ codigo: 'S-00140', kg: 60 }], [], new Set());
    expect(validarRepartoConfirmado([{ bache: 'S-00140', kg: 100 }], despues, 100)).toMatch(/saldo cambió.*S-00140/);
  });

  it('rechaza un reparto vacío o de más de 60 baches', () => {
    expect(validarRepartoConfirmado([], disp, 0)).toMatch(/vacío/);
    const muchos = Array.from({ length: 61 }, (_, n) => ({ bache: `S-${String(n + 1).padStart(5, '0')}`, kg: 1 }));
    expect(validarRepartoConfirmado(muchos, disp, 61)).toMatch(/máximo 60/);
  });
});

describe('kgDespachadosBiochar', () => {
  it('suma las marcas de las no canceladas, Borrador incluido', () => {
    expect(
      kgDespachadosBiochar([
        remision({ estado: 'Entregada', notas: '[bache:S-00140=75.00] [bache:S-00141=125.00] Biochar' }),
        remision({ estado: 'Borrador', notas: '[bache:S-00142=10.50] Biochar' }),
        remision({ estado: 'Cancelada', notas: '[bache:S-00143=99.00] Biochar' }),
        remision({ notas: '[lote:BLEND-X] Biochar Blend', kgRollup: 300 }),
      ])
    ).toBe(210.5);
  });
});

describe('textos y estado', () => {
  it('formatoKg con miles y coma decimal', () => {
    expect(formatoKg(1234.5)).toBe('1.234,50');
    expect(formatoKg(75)).toBe('75,00');
    expect(formatoKg(-0.18)).toBe('-0,18');
  });

  it('notasProductoRemitido', () => {
    expect(notasProductoRemitido([{ bache: 'S-00140', kg: 75 }, { bache: 'S-00141', kg: 125 }])).toBe(
      'Baches S-00140 (75,00 kg), S-00141 (125,00 kg)'
    );
    expect(notasProductoRemitido([{ bache: 'S-00140', kg: 1500 }])).toBe('Bache S-00140 (1.500,00 kg)');
  });

  it('estadoActivacion', () => {
    expect(estadoActivacion(true)).toBe('En Tránsito');
    expect(estadoActivacion(false)).toBe('Pendiente');
  });
});

describe('validarFormaDespacho', () => {
  const base = { idPedido: 'SIRIUS-PED-0900', responsableEntrega: 'Operario Prueba' };

  it('un ensayo mínimo es válido', () => {
    const r = validarFormaDespacho({ ...base, dryRun: true, kg: '200' }, { exigirReparto: true });
    expect(r).toEqual({ ok: true, datos: expect.objectContaining({ idPedido: 'SIRIUS-PED-0900', dryRun: true, kg: 200 }) });
  });

  it('confirmar biochar exige idDespacho y reparto; el Blend no', () => {
    expect(validarFormaDespacho({ ...base }, { exigirReparto: true })).toEqual({ ok: false, error: expect.stringMatching(/idDespacho/) });
    expect(validarFormaDespacho({ ...base, idDespacho: UUID }, { exigirReparto: true })).toEqual({ ok: false, error: expect.stringMatching(/reparto/) });
    expect(validarFormaDespacho({ ...base }, { exigirReparto: false }).ok).toBe(true);
  });

  it.each([
    [{ idPedido: 'PED-1' }, /idPedido/],
    [{ kg: -5 }, /kg/],
    [{ idDespacho: 'no-es-uuid' }, /idDespacho/],
    [{ reparto: [{ bache: 'S-1', kg: 5 }] }, /Bache inválido/],
    [{ reparto: [] }, /entre 1 y 60/],
    [{ responsableEntrega: 'x' }, /responsableEntrega/],
    [{ transportista: { nombre: 'Conductor Prueba', cedula: '12' } }, /cédula/],
    [{ transportista: { nombre: 'Conductor Prueba', cedula: '1234567', email: 'no es correo' } }, /correo/],
    [{ idAreaCliente: 'AREA-1' }, /idAreaCliente/],
    [{ fechaDespacho: '21/10/2026' }, /fechaDespacho/],
    [{ observaciones: 'a'.repeat(501) }, /500/],
    [{ observaciones: 'con \u0007 campana' }, /control/],
  ])('rechaza %j', (cambio, error) => {
    const r = validarFormaDespacho({ ...base, dryRun: true, ...cambio }, { exigirReparto: true });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(error) });
  });

  it('normaliza la cédula y el correo del transportista; uno vacío es ninguno', () => {
    const r = validarFormaDespacho(
      { ...base, dryRun: true, transportista: { nombre: ' Conductor Prueba ', cedula: '1.234.567', email: ' Uno@Ejemplo.COM ' } },
      { exigirReparto: true }
    );
    expect(r.ok && r.datos.transportista).toEqual({ nombre: 'Conductor Prueba', cedula: '1234567', email: 'uno@ejemplo.com' });
    const vacio = validarFormaDespacho({ ...base, dryRun: true, transportista: { nombre: '', cedula: '' } }, { exigirReparto: true });
    expect(vacio.ok && vacio.datos.transportista).toBeUndefined();
  });
});
