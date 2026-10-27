/**
 * @jest-environment node
 */

/**
 * El contrato de las remisiones de pirólisis en Remisiones Core. Lo que se
 * protege: que las marcas de trazabilidad vayan y vuelvan sin pérdida, que nada
 * escrito después de « — » (texto del operador) entre a la trazabilidad, que
 * una remisión del laboratorio nunca se lea como de PiroliApp, y que el estado
 * del pedido solo diga `Enviado` cuando de verdad salió todo. Datos inventados.
 */

import {
  AREA_ORIGEN_PIROLISIS,
  CAMPOS_REMISION_CRUDA,
  ESTADOS_RECIBIBLES,
  NOMBRE_PRODUCTO,
  SEPARADOR_OBSERVACIONES,
  bachesDeNotas,
  conMarca,
  correoDeNotas,
  esEstadoRecibible,
  esIdDespacho,
  estadoPedidoTrasRemitir,
  idDespachoDeNotas,
  kgLotesExplicitos,
  kgRemitidoDeRemision,
  marcaCorreo,
  marcaDespacho,
  marcaDespachoLocal,
  marcaRecibida,
  marcasBaches,
  notasRemisionBiochar,
  prefijoMarcas,
  recibidaDeNotas,
  referenciaDespachoBache,
  remisionCrudaDeRegistro,
  tipoRemision,
  type RemisionCruda,
} from '@/lib/remision-pirolisis.constants';

const UUID = '3f2a9c4e-8b1d-4e6f-9a0b-1c2d3e4f5a6b';
const OTRO_UUID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const ID_BLEND = 'SIRIUS-PRODUCT-0016';
const ID_BIOCHAR = 'SIRIUS-PRODUCT-0015';
const IDS = { blend: ID_BLEND, biochar: ID_BIOCHAR };

/** Lo que `construirDatosPdf` imprime como observaciones (blend-remision-pdf.ts). */
const observacionesDelPdf = (notas: string) => notas.split(' — ').slice(1).join(' — ').trim();

function cruda(parcial: Partial<RemisionCruda>): RemisionCruda {
  return {
    recordId: 'recPRUEBA00000001',
    codigo: 'SIRIUS-REM-9001',
    numeracion: 8903,
    estado: 'Pendiente',
    areaOrigen: 'Producción',
    idPedido: 'SIRIUS-PED-9001',
    idCliente: 'CL-9001',
    idAreaCliente: '',
    notas: '',
    kgRollup: 0,
    fechaDespacho: '2026-10-21',
    fechaRecibido: '',
    personasIds: [],
    documentos: [],
    ...parcial,
  };
}

describe('constantes', () => {
  it('nombres de producto, área y estados recibibles', () => {
    expect(NOMBRE_PRODUCTO).toEqual({ blend: 'Biochar Blend', biochar: 'Biochar' });
    expect(AREA_ORIGEN_PIROLISIS).toBe('Producción');
    expect(ESTADOS_RECIBIBLES).toEqual(['Pendiente', 'En Tránsito']);
    expect(esEstadoRecibible('En Tránsito')).toBe(true);
    expect(esEstadoRecibible('Borrador')).toBe(false);
    expect(esEstadoRecibible('Entregada')).toBe(false);
    expect(SEPARADOR_OBSERVACIONES).toBe(' — ');
  });
});

describe('marcas de baches', () => {
  it('van y vuelven, con dos decimales aunque los kg sean enteros', () => {
    const reparto = [
      { bache: 'S-00140', kg: 75 },
      { bache: 'S-00141', kg: 125.456 },
    ];
    const marcas = marcasBaches(reparto);
    expect(marcas).toBe('[bache:S-00140=75.00] [bache:S-00141=125.46]');
    expect(bachesDeNotas(marcas)).toEqual([
      { bache: 'S-00140', kg: 75 },
      { bache: 'S-00141', kg: 125.46 },
    ]);
  });

  it('rechazan un bache mal escrito, repetido o sin kg', () => {
    expect(() => marcasBaches([{ bache: 'S-140', kg: 1 }])).toThrow('Código de bache inválido');
    expect(() => marcasBaches([{ bache: 'S-00140]', kg: 1 }])).toThrow('Código de bache inválido');
    expect(() =>
      marcasBaches([
        { bache: 'S-00140', kg: 1 },
        { bache: 'S-00140', kg: 2 },
      ])
    ).toThrow('dos veces');
    expect(() => marcasBaches([{ bache: 'S-00140', kg: 0 }])).toThrow('Kg inválidos');
    expect(() => marcasBaches([{ bache: 'S-00140', kg: 0.004 }])).toThrow('Kg inválidos');
    expect(() => marcasBaches([{ bache: 'S-00140', kg: Number.NaN }])).toThrow('Kg inválidos');
  });

  it('solo se leen antes de « — »: lo que escribe el operador no entra a la trazabilidad', () => {
    const notas = `[bache:S-00140=75.00] [desp:${UUID}] Biochar — devolver [bache:S-00999=500.00] si sobra`;
    expect(bachesDeNotas(notas)).toEqual([{ bache: 'S-00140', kg: 75 }]);
  });

  it('una marca repetida se suma, y una mal formada se ignora', () => {
    expect(bachesDeNotas('[bache:S-00140=10.00] [bache:S-00140=5.50] [bache:S-1=3] Biochar')).toEqual([
      { bache: 'S-00140', kg: 15.5 },
    ]);
  });
});

describe('notasRemisionBiochar', () => {
  it('marcas, llave del despacho, etiqueta y las observaciones después de « — »', () => {
    const notas = notasRemisionBiochar(
      [
        { bache: 'S-00140', kg: 75 },
        { bache: 'S-00141', kg: 125 },
      ],
      UUID,
      '  Entregar en la bodega 2  '
    );
    expect(notas).toBe(
      `[bache:S-00140=75.00] [bache:S-00141=125.00] [desp:${UUID}] Biochar — Entregar en la bodega 2`
    );
    expect(observacionesDelPdf(notas)).toBe('Entregar en la bodega 2');
    expect(idDespachoDeNotas(notas)).toBe(UUID);
    expect(tipoRemision({ areaOrigen: 'Producción', notas })).toBe('biochar');
  });

  it('sin observaciones no lleva « — »: el PDF no imprime nada', () => {
    const notas = notasRemisionBiochar([{ bache: 'S-00140', kg: 75 }], UUID);
    expect(notas).toBe(`[bache:S-00140=75.00] [desp:${UUID}] Biochar`);
    expect(notas).not.toContain(SEPARADOR_OBSERVACIONES);
    expect(observacionesDelPdf(notas)).toBe('');
  });

  it('exige al menos un bache y una llave válida', () => {
    expect(() => notasRemisionBiochar([], UUID)).toThrow('al menos un bache');
    expect(() => notasRemisionBiochar([{ bache: 'S-00140', kg: 1 }], 'no-es-uuid')).toThrow(
      'Llave de despacho inválida'
    );
  });
});

describe('llave del despacho', () => {
  it('solo acepta UUID v4 en minúsculas (FIND distingue mayúsculas)', () => {
    expect(esIdDespacho(UUID)).toBe(true);
    expect(esIdDespacho(UUID.toUpperCase())).toBe(false);
    expect(esIdDespacho('3f2a9c4e-8b1d-1e6f-9a0b-1c2d3e4f5a6b')).toBe(false); // v1
    expect(esIdDespacho('3f2a9c4e-8b1d-4e6f-7a0b-1c2d3e4f5a6b')).toBe(false); // variante
    expect(esIdDespacho('')).toBe(false);
    expect(esIdDespacho(42)).toBe(false);
    expect(esIdDespacho(null)).toBe(false);
  });

  it('va y vuelve, y no se lee después de « — »', () => {
    expect(marcaDespacho(UUID)).toBe(`[desp:${UUID}]`);
    expect(idDespachoDeNotas(`[lote:BLEND-2026-10-21] [desp:${UUID}] Biochar Blend`)).toBe(UUID);
    expect(idDespachoDeNotas(`[lote:BLEND-2026-10-21] Biochar Blend — [desp:${UUID}]`)).toBeNull();
    expect(idDespachoDeNotas('')).toBeNull();
    expect(() => marcaDespacho('x')).toThrow();
  });
});

describe('conMarca', () => {
  const instante = new Date('2026-10-21T20:04:05.123Z');

  it('inserta después de la última marca y antes de la etiqueta, sin tocar lo que sigue a « — »', () => {
    const notas = '[lote:BLEND-2026-10-21-SIRIUS-PED-9001] Biochar Blend — Dejar en portería';
    const con = conMarca(notas, marcaRecibida(instante));
    expect(con).toBe(
      '[lote:BLEND-2026-10-21-SIRIUS-PED-9001] [recibida:2026-10-21T20:04:05.123Z] Biochar Blend — Dejar en portería'
    );
    expect(observacionesDelPdf(con)).toBe(observacionesDelPdf(notas));
  });

  it('reemplaza la marca del mismo tipo y deja las demás', () => {
    const una = conMarca(`[bache:S-00140=75.00] [desp:${UUID}] Biochar`, marcaCorreo(instante));
    const otra = conMarca(una, marcaCorreo(new Date('2026-10-22T13:00:00.000Z')));
    expect(otra).toBe(`[bache:S-00140=75.00] [desp:${UUID}] [correo:2026-10-22T13:00:00.000Z] Biochar`);
    expect(correoDeNotas(otra)).toBe('2026-10-22T13:00:00.000Z');
    expect(bachesDeNotas(otra)).toEqual([{ bache: 'S-00140', kg: 75 }]);
    expect(idDespachoDeNotas(otra)).toBe(UUID);
  });

  it('una marca igual escrita por el operador después de « — » no se toca ni se lee', () => {
    const notas = `[desp:${UUID}] Biochar — ojo: [correo:2020-01-01T00:00:00.000Z]`;
    const con = conMarca(notas, marcaCorreo(instante));
    expect(con).toBe(`[desp:${UUID}] [correo:2026-10-21T20:04:05.123Z] Biochar — ojo: [correo:2020-01-01T00:00:00.000Z]`);
    expect(correoDeNotas(con)).toBe('2026-10-21T20:04:05.123Z');
    expect(correoDeNotas(notas)).toBeNull();
  });

  it('funciona con notas vacías o sin marcas', () => {
    expect(conMarca('', marcaDespacho(UUID))).toBe(`[desp:${UUID}]`);
    expect(conMarca('Biochar Blend', marcaDespacho(UUID))).toBe(`[desp:${UUID}] Biochar Blend`);
    expect(conMarca(' — solo observación', marcaDespacho(UUID))).toBe(`[desp:${UUID}] — solo observación`);
  });

  it('no deja reemplazar marcas que se repiten (lote, kg-lote, bache) ni marcas mal formadas', () => {
    expect(() => conMarca('[lote:A] Biochar Blend', '[lote:B]')).toThrow('valor único');
    expect(() => conMarca('', '[bache:S-00140=1.00]')).toThrow('valor único');
    expect(() => conMarca('', '[kg-lote:A=1]')).toThrow('valor único');
    expect(() => conMarca('', 'recibida:2026')).toThrow('mal formada');
    expect(() => conMarca('', '[recibida:con espacio]')).toThrow('mal formada');
    expect(() => conMarca('', '[recibida:a]b]')).toThrow('mal formada');
  });
});

describe('marcas de recepción y de correo', () => {
  it('guardan el instante con hora, en UTC', () => {
    const d = new Date('2026-10-22T03:30:00.000Z');
    expect(marcaRecibida(d)).toBe('[recibida:2026-10-22T03:30:00.000Z]');
    expect(recibidaDeNotas(`[lote:X] ${marcaRecibida(d)} Biochar Blend`)).toBe('2026-10-22T03:30:00.000Z');
    expect(recibidaDeNotas('[lote:X] Biochar Blend — [recibida:2026-10-22T03:30:00.000Z]')).toBeNull();
    expect(recibidaDeNotas('[recibida:ayer] Biochar')).toBeNull();
    expect(() => marcaRecibida(new Date('no'))).toThrow();
  });
});

describe('prefijoMarcas', () => {
  it('es lo anterior al primer « — », o todo si no hay', () => {
    expect(prefijoMarcas('[lote:A] Biochar Blend — uno — dos')).toBe('[lote:A] Biochar Blend');
    expect(prefijoMarcas('[lote:A] Biochar Blend')).toBe('[lote:A] Biochar Blend');
    // Un guion o un em dash sin espacios no separa.
    expect(prefijoMarcas('[lote:A] Biochar—Blend - x')).toBe('[lote:A] Biochar—Blend - x');
    expect(prefijoMarcas(undefined as unknown as string)).toBe('');
  });
});

describe('tipoRemision', () => {
  it('Producción con [lote:] es Blend y con [bache:] es biochar', () => {
    expect(tipoRemision({ areaOrigen: 'Producción', notas: '[lote:BLEND-2026-06-24] Biochar Blend' })).toBe('blend');
    expect(tipoRemision({ areaOrigen: 'Producción', notas: `[bache:S-00140=75.00] [desp:${UUID}] Biochar` })).toBe(
      'biochar'
    );
  });

  it('una remisión del laboratorio es null aunque traiga marcas', () => {
    expect(tipoRemision({ areaOrigen: 'Laboratorio', notas: '[lote:BLEND-2026-06-24] Biochar Blend' })).toBeNull();
    expect(tipoRemision({ areaOrigen: '', notas: '[lote:BLEND-2026-06-24] Biochar Blend' })).toBeNull();
  });

  it('la prueba vieja de la sincronización ([blend:TEST-DIAG]) es null', () => {
    expect(tipoRemision({ areaOrigen: 'Producción', notas: '[blend:TEST-DIAG] Cliente: Prueba' })).toBeNull();
  });

  it('las marcas escritas después de « — » no cuentan', () => {
    expect(tipoRemision({ areaOrigen: 'Producción', notas: 'Despacho — [lote:BLEND-2026-06-24]' })).toBeNull();
    expect(tipoRemision({ areaOrigen: 'Producción', notas: 'Despacho — [bache:S-00140=1.00]' })).toBeNull();
  });

  it('tolera el área con acento descompuesto (NFD) o espacios', () => {
    const nfd = ' Producción ';
    expect(tipoRemision({ areaOrigen: nfd, notas: '[lote:BLEND-2026-06-24] Biochar Blend' })).toBe('blend');
  });
});

describe('referencias de despacho', () => {
  it('la Salida del Core y la marca de la remisión local', () => {
    expect(referenciaDespachoBache('SIRIUS-REM-0231', 'S-00140')).toBe('DESP-SIRIUS-REM-0231-S-00140');
    expect(marcaDespachoLocal('SIRIUS-REM-0231')).toBe('[DESPACHO:SIRIUS-REM-0231]');
  });

  it('rechazan un record ID o un código mal formado en vez de escribir una referencia rota', () => {
    expect(() => referenciaDespachoBache('recPRUEBA00000001', 'S-00140')).toThrow('Código de remisión inválido');
    expect(() => referenciaDespachoBache('SIRIUS-REM-0231', '140')).toThrow('Código de bache inválido');
    expect(() => marcaDespachoLocal('SIRIUS-REM-02]')).toThrow('Código de remisión inválido');
  });
});

describe('remisionCrudaDeRegistro', () => {
  it('lee los campos por nombre y tolera rollups y fórmulas raros', () => {
    const r = remisionCrudaDeRegistro({
      id: 'recPRUEBA00000002',
      fields: {
        [CAMPOS_REMISION_CRUDA.codigo]: 'SIRIUS-REM-9002 ',
        [CAMPOS_REMISION_CRUDA.numeracion]: 8904,
        [CAMPOS_REMISION_CRUDA.estado]: 'En Tránsito',
        [CAMPOS_REMISION_CRUDA.areaOrigen]: 'Producción',
        [CAMPOS_REMISION_CRUDA.idPedido]: 'SIRIUS-PED-9002',
        [CAMPOS_REMISION_CRUDA.idCliente]: 'CL-9002',
        [CAMPOS_REMISION_CRUDA.idAreaCliente]: 'AC-9002',
        [CAMPOS_REMISION_CRUDA.notas]: `[bache:S-00140=75.00] [desp:${UUID}] Biochar`,
        [CAMPOS_REMISION_CRUDA.kgRollup]: { specialValue: 'NaN' },
        [CAMPOS_REMISION_CRUDA.fechaDespacho]: '2026-10-21',
        [CAMPOS_REMISION_CRUDA.fechaRecibido]: '2026-10-22T00:00:00.000Z',
        [CAMPOS_REMISION_CRUDA.personas]: ['recPRUEBA00000003', 7, null],
        [CAMPOS_REMISION_CRUDA.documentos]: [
          { id: 'attPRUEBA00000001', filename: 'SIRIUS-REM-9002.pdf' },
          { id: 'attPRUEBA00000002' },
        ],
      },
    });
    expect(r).toEqual({
      recordId: 'recPRUEBA00000002',
      codigo: 'SIRIUS-REM-9002',
      numeracion: 8904,
      estado: 'En Tránsito',
      areaOrigen: 'Producción',
      idPedido: 'SIRIUS-PED-9002',
      idCliente: 'CL-9002',
      idAreaCliente: 'AC-9002',
      notas: `[bache:S-00140=75.00] [desp:${UUID}] Biochar`,
      kgRollup: 0,
      fechaDespacho: '2026-10-21',
      fechaRecibido: '2026-10-22',
      personasIds: ['recPRUEBA00000003'],
      documentos: ['SIRIUS-REM-9002.pdf'],
    });
  });

  it('un registro sin campos da valores vacíos, no undefined', () => {
    const r = remisionCrudaDeRegistro({ id: 'recPRUEBA00000004', fields: {} });
    expect(r.codigo).toBe('');
    expect(r.numeracion).toBe(0);
    expect(r.notas).toBe('');
    expect(r.personasIds).toEqual([]);
    expect(r.documentos).toEqual([]);
  });
});

describe('kgRemitidoDeRemision', () => {
  it('Blend: el rollup de Productos Remitidos', () => {
    expect(
      kgRemitidoDeRemision(cruda({ notas: '[lote:BLEND-2026-06-24] Biochar Blend', kgRollup: 1446.98 }))
    ).toEqual({ tipo: 'blend', kg: 1446.98 });
  });

  it('biochar: la suma de las marcas, no el rollup (que el Core muestra sin decimales)', () => {
    expect(
      kgRemitidoDeRemision(
        cruda({ notas: `[bache:S-00140=75.25] [bache:S-00141=124.50] [desp:${UUID}] Biochar`, kgRollup: 200 })
      )
    ).toEqual({ tipo: 'biochar', kg: 199.75 });
  });

  it('una remisión ajena es null', () => {
    expect(kgRemitidoDeRemision(cruda({ areaOrigen: 'Laboratorio', notas: '[lote:X] Biochar Blend', kgRollup: 9 }))).toBeNull();
  });

  it('mixta (Blend con biochar puro): solo el Blend, de [kg-lote:], no el rollup que suma los dos', () => {
    const notas = '[lote:BLEND-2026-10-20] [kg-lote:BLEND-2026-10-20=25] [bache:S-00140=25.00] Biochar Blend — obs';
    expect(kgRemitidoDeRemision(cruda({ notas, kgRollup: 50 }))).toEqual({ tipo: 'blend', kg: 25 });
  });
});

describe('kgLotesExplicitos', () => {
  it('suma [kg-lote:] solo si cada lote tiene la suya, y solo antes de « — »', () => {
    expect(kgLotesExplicitos('[lote:A] [lote:B] [kg-lote:A=2.21] [kg-lote:B=997.79] Biochar Blend')).toBe(1000);
    expect(kgLotesExplicitos('[lote:A] [kg-lote:A=25] Biochar Blend')).toBe(25);
    expect(kgLotesExplicitos('[lote:A] [lote:B] [kg-lote:A=2.21] Biochar Blend')).toBeNull();
    expect(kgLotesExplicitos('[lote:A] Biochar Blend — [kg-lote:A=9]')).toBeNull();
    expect(kgLotesExplicitos('Biochar Blend')).toBeNull();
  });
});

describe('estadoPedidoTrasRemitir', () => {
  const remitido = (pares: Array<[string, number]>) => new Map(pares);

  it('Enviado cuando cada producto quedó cubierto', () => {
    expect(estadoPedidoTrasRemitir([{ productoId: ID_BIOCHAR, kg: 200 }], remitido([[ID_BIOCHAR, 200]]), IDS)).toBe(
      'Enviado'
    );
  });

  it('Enviado Parcial si falta, con tolerancia de 0,01 kg', () => {
    const lineas = [{ productoId: ID_BLEND, kg: 100 }];
    expect(estadoPedidoTrasRemitir(lineas, remitido([[ID_BLEND, 99.99]]), IDS)).toBe('Enviado');
    expect(estadoPedidoTrasRemitir(lineas, remitido([[ID_BLEND, 99.98]]), IDS)).toBe('Enviado Parcial');
    expect(estadoPedidoTrasRemitir(lineas, remitido([]), IDS)).toBe('Enviado Parcial');
  });

  it('pedido mixto: no basta con despachar de sobra uno de los dos productos', () => {
    const lineas = [
      { productoId: ID_BLEND, kg: 1000 },
      { productoId: ID_BIOCHAR, kg: 200 },
    ];
    expect(estadoPedidoTrasRemitir(lineas, remitido([[ID_BLEND, 1500]]), IDS)).toBe('Enviado Parcial');
    expect(estadoPedidoTrasRemitir(lineas, remitido([[ID_BLEND, 1000], [ID_BIOCHAR, 200]]), IDS)).toBe('Enviado');
  });

  it('suma las líneas del mismo producto', () => {
    const lineas = [
      { productoId: ID_BIOCHAR, kg: 120 },
      { productoId: ID_BIOCHAR, kg: 80 },
    ];
    expect(estadoPedidoTrasRemitir(lineas, remitido([[ID_BIOCHAR, 120]]), IDS)).toBe('Enviado Parcial');
    expect(estadoPedidoTrasRemitir(lineas, remitido([[ID_BIOCHAR, 200]]), IDS)).toBe('Enviado');
  });

  it('una línea ajena (de otro producto) deja el pedido en parcial', () => {
    const lineas = [
      { productoId: ID_BIOCHAR, kg: 200 },
      { productoId: 'SIRIUS-PRODUCT-9999', kg: 1 },
    ];
    expect(estadoPedidoTrasRemitir(lineas, remitido([[ID_BIOCHAR, 200]]), IDS)).toBe('Enviado Parcial');
  });

  it('sin líneas, sin cantidad pedida o sin IDs configurados no afirma que esté completo', () => {
    expect(estadoPedidoTrasRemitir([], remitido([[ID_BIOCHAR, 200]]), IDS)).toBe('Enviado Parcial');
    expect(estadoPedidoTrasRemitir([{ productoId: ID_BIOCHAR, kg: 0 }], remitido([[ID_BIOCHAR, 5]]), IDS)).toBe(
      'Enviado Parcial'
    );
    expect(
      estadoPedidoTrasRemitir([{ productoId: '', kg: 5 }], remitido([['', 5]]), { blend: '', biochar: '' })
    ).toBe('Enviado Parcial');
  });
});

describe('compatibilidad con las remisiones de Blend existentes', () => {
  it('las notas de crearRemision (uno y varios lotes) se leen como Blend y conservan sus observaciones', () => {
    const una = '[lote:BLEND-2026-09-22-SIRIUS-PED-9003] Biochar Blend — Entregar a portería';
    const varias =
      '[lote:BLEND-2026-09-22-SIRIUS-PED-9003] [lote:BLEND-2026-09-24-SIRIUS-PED-9003] ' +
      '[kg-lote:BLEND-2026-09-22-SIRIUS-PED-9003=1446.98] [kg-lote:BLEND-2026-09-24-SIRIUS-PED-9003=585.23] ' +
      'Biochar Blend';
    const marcasDeLote = (n: string) => prefijoMarcas(n).match(/\[(?:kg-)?lote:[^\]]*\]/g) ?? [];
    for (const notas of [una, varias]) {
      expect(tipoRemision({ areaOrigen: 'Producción', notas })).toBe('blend');
      const conRecepcion = conMarca(conMarca(notas, marcaRecibida(new Date())), marcaDespacho(OTRO_UUID));
      expect(observacionesDelPdf(conRecepcion)).toBe(observacionesDelPdf(notas));
      expect(marcasDeLote(conRecepcion)).toEqual(marcasDeLote(notas));
      expect(tipoRemision({ areaOrigen: 'Producción', notas: conRecepcion })).toBe('blend');
    }
  });
});
