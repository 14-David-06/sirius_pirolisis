/**
 * @jest-environment node
 */

/**
 * El PDF de la remisión de pirólisis, por estado y por producto.
 *
 * Lo que se protege: que una remisión por recibir lleve su QR y ningún receptor
 * (nadie recibió todavía), que una entregada por enlace diga cuándo con hora,
 * que la heredada siga mostrando al transportista, que una cancelada no parezca
 * válida, que el biochar diga «Biochar» con CO₂ = kg × factor, y que sin NIT
 * configurado no se imprima uno inventado. También que el mapeo de una remisión
 * de biochar o ajena no lea lotes del inventario. Datos inventados.
 */

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { AirtableFalso } from '@/test-utils/airtable-falso';

const B_REM = 'baseRemFalsa';
const B_INV = 'baseInvFalsa';
const T = { remisiones: 'tblRemisiones', personas: 'tblPersonas', movimientos: 'tblMovimientos' };
const FACTOR = 2.5;

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B_REM,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_TABLE_PERSONAS_REMISION: T.personas,
    AIRTABLE_BASE_SIRIUS_INVENTARIO: B_INV,
    AIRTABLE_API_KEY_SIRIUS_INVENTARIO: 'token-falso',
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: T.movimientos,
    AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID: 'PRODUCTO-BLEND-FALSO',
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: 'PRODUCTO-PURO-FALSO',
    FACTOR_SECUESTRO_CO2: String(FACTOR),
  });
  // Sin NIT configurado: el documento no debe imprimir ninguno.
  delete process.env.EMPRESA_NIT;
}

type Pdf = typeof import('@/lib/blend-remision-pdf');
type Core = typeof import('@/lib/blend-remisiones-core');
type Gen = typeof import('@/lib/blend-remision-pdf-generator');
type Qr = typeof import('@/lib/recepcion/qr');
let pdf: Pdf;
let core: Core;
let gen: Gen;
let qr: Qr;

beforeAll(async () => {
  entorno();
  pdf = await import('@/lib/blend-remision-pdf');
  core = await import('@/lib/blend-remisiones-core');
  gen = await import('@/lib/blend-remision-pdf-generator');
  qr = await import('@/lib/recepcion/qr');
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

type Remision = import('@/lib/blend-remisiones-core').RemisionBlend;

const TRANSPORTISTA = {
  recordId: 'recTRANSPORTISTA01'.slice(0, 17), codigo: 'PER-REM-0010', nombre: 'Conductor Ficticio',
  tipo: 'Transportista', cedula: '10203040', email: '', telefono: '+57 3000000000',
};
const RECEPTOR_VIEJO = {
  recordId: 'recRECEPTORVIEJO01'.slice(0, 17), codigo: 'PER-REM-0009', nombre: 'Receptor Anterior',
  tipo: 'Receptor', cedula: '50607080', email: '', telefono: '',
};
const RECEPTOR = {
  recordId: 'recRECEPTORNUEVO01'.slice(0, 17), codigo: 'PER-REM-0012', nombre: 'Receptora Ficticia',
  tipo: 'Receptor', cedula: '30405060', email: 'receptora@ejemplo.test', telefono: '',
};

function remision(cambios: Partial<Remision> = {}): Remision {
  return {
    recordId: 'recREMISIONFALSA1'.slice(0, 17),
    codigo: 'SIRIUS-REM-0230',
    estado: 'En Tránsito',
    idPedido: 'SIRIUS-PED-0901',
    idCliente: 'CL-0901',
    clienteNombre: 'Finca Sintética S.A.S.',
    idAreaCliente: '',
    areaClienteNombre: '',
    lote: 'BLEND-A',
    lotes: [{ lote: 'BLEND-A', kg: 100 }],
    kgTotal: 100,
    fechaRemision: '2026-10-21',
    fechaDespacho: '2026-10-21',
    fechaRecibido: '',
    responsableEntrega: 'Operario Uno Prueba',
    documentoUrl: '',
    notas: '[lote:BLEND-A] Biochar Blend — Entregar en portería',
    personas: [TRANSPORTISTA],
    tipo: 'blend',
    productoId: 'PRODUCTO-BLEND-FALSO',
    productoNombre: 'Biochar Blend',
    idDespacho: null,
    bachesRemitidos: [],
    recibidaEn: null,
    correoEnviadoEn: null,
    documentos: [],
    composicion: { biochar: 20, abono: 74, agua: 5, biologicos: 0.7 },
    co2SecuestradoKg: 50,
    baches: [],
    ...cambios,
  };
}

async function contarImagenes(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  let n = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) n++;
  }
  return n;
}

describe('construirDatosPdf', () => {
  it('por recibir: bloque pendiente con el QR y el vencimiento, sin receptor', async () => {
    const png = await qr.qrPng('https://piroliapp.ejemplo.test/recibir#v1.token');
    const d = pdf.construirDatosPdf(remision(), { qrPng: png, venceEl: '2026-10-28' });
    expect(d.recepcion_pendiente).toEqual({ qr_png: png, vence_el: '2026-10-28' });
    expect(d.receptor).toBeUndefined();
    expect(d.fecha_recibido).toBeUndefined();
    expect(d.transportista).toEqual({ nombre: 'Conductor Ficticio', cedula: '10203040' });
    expect(d.observaciones).toBe('Entregar en portería');
    expect(d.anulada).toBeUndefined();
  });

  it('entregada por enlace: el Receptor de mayor PER-REM y la fecha con hora', () => {
    const d = pdf.construirDatosPdf(
      remision({
        estado: 'Entregada',
        fechaRecibido: '2026-10-21',
        recibidaEn: '2026-10-21T20:04:00.000Z',
        personas: [TRANSPORTISTA, RECEPTOR_VIEJO, RECEPTOR],
      })
    );
    expect(d.receptor).toEqual({ nombre: 'Receptora Ficticia', cedula: '30405060' });
    expect(d.fecha_recibido).toBe('2026-10-21');
    expect(d.recepcion_confirmada?.fecha_hora).toMatch(/^21 de octubre de 2026, \d{1,2}:04/);
    expect(d.recepcion_pendiente).toBeUndefined();
  });

  it('entregada heredada, sin Receptor: el transportista recibió al cargar, en la fecha del despacho', () => {
    const d = pdf.construirDatosPdf(remision({ estado: 'Entregada', fechaDespacho: '2026-10-02' }));
    expect(d.receptor).toEqual({ nombre: 'Conductor Ficticio', cedula: '10203040' });
    expect(d.fecha_recibido).toBe('2026-10-02');
    expect(d.recepcion_confirmada).toBeUndefined();
  });

  it('cancelada: anulada, sin recepción ni QR aunque llegue uno', async () => {
    const png = await qr.qrPng('https://piroliapp.ejemplo.test/recibir#v1.token');
    const d = pdf.construirDatosPdf(remision({ estado: 'Cancelada' }), { qrPng: png, venceEl: '2026-10-28' });
    expect(d.anulada).toBe(true);
    expect(d.recepcion_pendiente).toBeUndefined();
    expect(d.receptor).toBeUndefined();
  });

  it('biochar: el producto se llama «Biochar» y el NIT vacío no se imprime', () => {
    const d = pdf.construirDatosPdf(
      remision({ tipo: 'biochar', productoNombre: 'Biochar', notas: '[bache:S-00140=200.00] Biochar', kgTotal: 200, co2SecuestradoKg: 500 })
    );
    expect(d.producto).toBe('Biochar');
    expect(d.co2_secuestrado_kg).toBe(500);
    expect(d.empresa_nit).toBe('');
    expect(gen.lineaRazonSocial(d.empresa_nit)).toBe('S.A.S. ZOMAC');
    expect(gen.lineaRazonSocial(' 900.000.000-0 ')).toBe('S.A.S. ZOMAC  |  NIT: 900.000.000-0');
  });
});

describe('generarPdfRemision', () => {
  it('cada estado produce un PDF válido; el pendiente con enlace lleva UNA imagen más (el QR)', async () => {
    const enlace = { url: 'https://piroliapp.ejemplo.test/recibir#v1.token', venceEl: '2026-10-28' };
    const sinEnlace = await pdf.generarPdfRemision(remision());
    const conEnlace = await pdf.generarPdfRemision(remision(), { enlace });
    expect((await contarImagenes(conEnlace)) - (await contarImagenes(sinEnlace))).toBe(1);

    // Entregada o anulada: el enlace se ignora, nunca un QR vivo en un documento cerrado.
    const entregada = await pdf.generarPdfRemision(
      remision({ estado: 'Entregada', recibidaEn: '2026-10-21T20:04:00.000Z', personas: [TRANSPORTISTA, RECEPTOR] }),
      { enlace }
    );
    const anulada = await pdf.generarPdfRemision(remision({ estado: 'Cancelada' }), { enlace });
    expect(await contarImagenes(entregada)).toBe(await contarImagenes(sinEnlace));
    expect(await contarImagenes(anulada)).toBe(await contarImagenes(sinEnlace));

    const biochar = await pdf.generarPdfRemision(
      remision({ tipo: 'biochar', productoNombre: 'Biochar', lotes: [], lote: '' })
    );
    for (const bytes of [sinEnlace, conEnlace, entregada, anulada, biochar]) {
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it('adjuntarPdfRemision sin opciones sigue funcionando (script de adjuntos) y acepta bytes ya hechos', async () => {
    const falso = new AirtableFalso();
    const id = falso.sembrar(B_REM, T.remisiones, { Estado: 'Pendiente' });
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);

    const r = remision({ recordId: id });
    const paso = await pdf.adjuntarPdfRemision(r);
    expect(paso).toMatchObject({ step: 'documento', ok: true, detail: { archivo: 'SIRIUS-REM-0230.pdf' } });

    const paso2 = await pdf.adjuntarPdfRemision(r, { bytes: new Uint8Array([1, 2]), nombreArchivo: 'SIRIUS-REM-0230-recibida.pdf' });
    expect(paso2).toMatchObject({ ok: true, detail: { bytes: 2, archivo: 'SIRIUS-REM-0230-recibida.pdf' } });
  });
});

describe('mapeo de la remisión (resolverRemision)', () => {
  function core0(fields: Record<string, unknown>) {
    const falso = new AirtableFalso();
    const id = falso.sembrar(B_REM, T.remisiones, {
      ID: 'SIRIUS-REM-0230',
      'ID Pedido': 'SIRIUS-PED-0901',
      'ID Cliente': 'CL-0901',
      Estado: 'En Tránsito',
      'Fecha de Remisión': '2026-10-21T15:00:00.000Z',
      ...fields,
    });
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
    return { falso, id };
  }

  it('biochar: kg de las marcas, CO₂ = kg × factor, y ninguna lectura del inventario', async () => {
    const id = '0b6f3a52-6d1e-4c8a-9f3e-2a1b4c5d6e7f';
    const { falso } = core0({
      'Area Origen': 'Producción',
      'Notas de Remisión': `[bache:S-00140=75.25] [bache:S-00141=124.75] [desp:${id}] [recibida:2026-10-21T20:04:00.000Z] Biochar — Obs`,
      'Total Cantidad Remitida': 200,
    });
    const r = (await core.resolverRemision('SIRIUS-REM-0230'))!;
    expect(r.tipo).toBe('biochar');
    expect(r.productoNombre).toBe('Biochar');
    expect(r.productoId).toBe('PRODUCTO-PURO-FALSO');
    expect(r.kgTotal).toBe(200);
    expect(r.bachesRemitidos).toEqual([{ bache: 'S-00140', kg: 75.25 }, { bache: 'S-00141', kg: 124.75 }]);
    expect(r.co2SecuestradoKg).toBe(200 * FACTOR);
    expect(r.idDespacho).toBe(id);
    expect(r.recibidaEn).toBe('2026-10-21T20:04:00.000Z');
    expect(r.lotes).toEqual([]);
    expect(falso.llamadas.filter((l) => l.base === B_INV)).toHaveLength(0);
  });

  it('ajena (DataLab con «[lote:» en las notas): sin derivados y sin leer lotes', async () => {
    const { falso } = core0({
      'Area Origen': 'Laboratorio',
      'Notas de Remisión': '[lote:BLEND-A] biológicos',
      'Total Cantidad Remitida': 30,
    });
    const r = (await core.resolverRemision('SIRIUS-REM-0230'))!;
    expect(r.tipo).toBe('ajena');
    expect(r.productoNombre).toBe('');
    expect(r.lotes).toEqual([]);
    expect(r.co2SecuestradoKg).toBe(0);
    expect(falso.llamadas.filter((l) => l.base === B_INV)).toHaveLength(0);
  });

  it('Blend: sigue leyendo el lote para la proporción real', async () => {
    const { falso } = core0({
      'Area Origen': 'Producción',
      'Notas de Remisión': '[lote:BLEND-A] Biochar Blend',
      'Total Cantidad Remitida': 100,
    });
    const r = (await core.resolverRemision('SIRIUS-REM-0230'))!;
    expect(r.tipo).toBe('blend');
    expect(r.productoNombre).toBe('Biochar Blend');
    expect(r.lotes).toEqual([{ lote: 'BLEND-A', kg: 100 }]);
    expect(falso.llamadas.filter((l) => l.base === B_INV).length).toBeGreaterThan(0);
  });
});
