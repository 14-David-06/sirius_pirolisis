/**
 * @jest-environment node
 */

/**
 * La copia de las remisiones en Flujo de caja (`flujo-caja-remisiones.ts`).
 *
 * Lo que se protege:
 *  - sin precio del catálogo NO se escribe nada: la fórmula de Flujo de caja
 *    caería a la tarifa del laboratorio (49.500 por unidad);
 *  - repetir actualiza la misma fila por `Numero Remision`, no la duplica;
 *  - la línea se vincula desde el producto, y el link de la remisión nunca se
 *    PATCHea (reemplazaría las líneas que haya puesto finanzas);
 *  - una remisión sin receptor no borra nada al actualizar.
 *
 * Datos inventados.
 */

import { AirtableFalso, resumenEscritura } from '@/test-utils/airtable-falso';
import type { RemisionBlend } from '@/lib/blend-remisiones-core';

const B_FC = 'baseFlujoFalsa';
const B_PROD = 'baseProdFalsa';
const T = { remisiones: 'tblRemPiroFalsa', productos: 'tblProdPiroFalsa', catalogo: 'tblCatalogoFalso' };

type Mod = typeof import('@/lib/flujo-caja-remisiones');
let fc: Mod;

beforeAll(async () => {
  delete process.env.VERCEL_ENV;
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_FLUJO_CAJA_BASE_ID: B_FC,
    AIRTABLE_FLUJO_CAJA_TOKEN: 'token-flujo-falso',
    AIRTABLE_FLUJO_CAJA_REMISIONES_PIROLISIS_TABLE: T.remisiones,
    AIRTABLE_FLUJO_CAJA_PRODUCTOS_REMISIONES_PIROLISIS_TABLE: T.productos,
    AIRTABLE_PRODUCTS_BASE_ID: B_PROD,
    AIRTABLE_PRODUCTS_TABLE_ID: T.catalogo,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: 'SIRIUS-PRODUCT-0015',
    RECEPCION_URL_BASE: 'https://piroliapp.falso.test',
  });
  fc = await import('@/lib/flujo-caja-remisiones');
});

afterEach(() => jest.restoreAllMocks());

function remision(cambios: Partial<RemisionBlend> = {}): RemisionBlend {
  return {
    recordId: 'recREMFALSA000001',
    codigo: 'SIRIUS-REM-0228',
    estado: 'Entregada',
    idPedido: 'SIRIUS-PED-0127',
    idCliente: 'CL-9001',
    clienteNombre: 'FINCA DE PRUEBA S.A.S.',
    idAreaCliente: '',
    areaClienteNombre: '',
    lote: 'BLEND-2026-10-20, BLEND-2026-10-22',
    lotes: [
      { lote: 'BLEND-2026-10-20', kg: 2.21 },
      { lote: 'BLEND-2026-10-22', kg: 997.79 },
    ],
    kgTotal: 1000,
    fechaRemision: '2026-10-22',
    fechaDespacho: '2026-10-22',
    fechaRecibido: '2026-10-22',
    responsableEntrega: 'Operador Inventado',
    documentoUrl: '',
    notas: '[lote:BLEND-2026-10-20] Biochar Blend',
    personas: [
      { recordId: 'recPERFALSA000001', codigo: 'PER-REM-9001', nombre: 'Lleva Inventada', tipo: 'Transportista', cedula: '99000001', email: '', telefono: '' },
      { recordId: 'recPERFALSA000002', codigo: 'PER-REM-9002', nombre: 'Recibe Inventado', tipo: 'Receptor', cedula: '99000002', email: '', telefono: '' },
    ],
    tipo: 'blend',
    productoId: 'SIRIUS-PRODUCT-0016',
    productoNombre: 'Biochar Blend',
    idDespacho: null,
    bachesRemitidos: [],
    recibidaEn: '2026-10-22T19:40:00.000Z',
    correoEnviadoEn: null,
    documentos: [],
    composicion: { biochar: 200, abono: 740, agua: 50, biologicos: 7 },
    co2SecuestradoKg: 500,
    baches: [],
    ...cambios,
  };
}

function falsoConCatalogo(precio: number | null) {
  const falso = new AirtableFalso({ prefijo: 'FLUJO' });
  falso.sembrar(B_PROD, T.catalogo, {
    'Codigo Producto': 'SIRIUS-PRODUCT-0016',
    ...(precio !== null ? { 'Precio Venta Unitario': precio } : {}),
  });
  jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
  return falso;
}

describe('filasFlujoCaja', () => {
  it('arma la remisión y su línea de producto en kg, con el código del producto', () => {
    const f = fc.filasFlujoCaja(remision(), { precioUnitario: 1400, urlDocumento: 'https://x.test/doc' });
    expect(f.numero).toBe(228);
    expect(f.remision).toMatchObject({
      'Numero Remision': 228,
      'Nombre Cliente': 'FINCA DE PRUEBA S.A.S.',
      'Código Cliente': 'CL-9001',
      'Nombre Responsable Entrega': 'Operador Inventado',
      'Nombre Recibe': 'Recibe Inventado',
      'Cedula Recibe': 99000002,
      'Fecha Recibio': '2026-10-22',
      'Nombre Lleva': 'Lleva Inventada',
      'Cedula Lleva': 99000001,
      'Fecha Llevo': '2026-10-22',
      'Documento Remisión': 'https://x.test/doc',
      'Fecha Creacion': '2026-10-22T17:00:00.000Z',
    });
    expect(f.remision['Observaciones Remisión']).toBe(
      'SIRIUS-REM-0228 | Pedido: SIRIUS-PED-0127 | Área origen: Producción | Productos: Biochar Blend 1000 kg | ' +
        'Total: 1000 kg | Estado: Entregada | Lotes: BLEND-2026-10-20 (2.21 kg), BLEND-2026-10-22 (997.79 kg) | ' +
        'Personal: PER-REM-9001, PER-REM-9002'
    );
    expect(f.productos).toEqual([{
      'Cantidad Kg': 1000,
      Producto: 'Biochar Blend',
      'Código Producto': 'SIRIUS-PRODUCT-0016',
      'Precio por Kg': 1400,
      'Fecha Creacion': '2026-10-22T17:00:00.000Z',
    }]);
    // El link de la remisión nunca va en la fila: se vincula desde la línea.
    expect(f.remision).not.toHaveProperty('Productos Remisiones Pirolisis');
  });

  it('por recibir: no manda los campos del receptor (no borra nada al actualizar)', () => {
    const f = fc.filasFlujoCaja(
      remision({ estado: 'En Tránsito', fechaRecibido: '', recibidaEn: null, personas: remision().personas.slice(0, 1) }),
      { precioUnitario: 1400 }
    );
    expect(f.remision).not.toHaveProperty('Nombre Recibe');
    expect(f.remision).not.toHaveProperty('Cedula Recibe');
    expect(f.remision).not.toHaveProperty('Fecha Recibio');
    expect(f.remision).not.toHaveProperty('Documento Remisión');
    expect(f.remision['Nombre Lleva']).toBe('Lleva Inventada');
  });

  it('mixta: una línea por producto, cada una a su precio, y el total de las dos', () => {
    const mixta = remision({ kgTotal: 25, lotes: [{ lote: 'BLEND-2026-10-20', kg: 25 }], lote: 'BLEND-2026-10-20', bachesRemitidos: [{ bache: 'S-00140', kg: 25 }] });
    const f = fc.filasFlujoCaja(mixta, { precioUnitario: 1400, precios: { 'SIRIUS-PRODUCT-0015': 4000 } });
    expect(f.productos.map((l) => [l['Producto'], l['Código Producto'], l['Cantidad Kg'], l['Precio por Kg']])).toEqual([
      ['Biochar Blend', 'SIRIUS-PRODUCT-0016', 25, 1400],
      ['Biochar', 'SIRIUS-PRODUCT-0015', 25, 4000],
    ]);
    expect(f.remision['Observaciones Remisión']).toContain('Productos: Biochar Blend 25 kg, Biochar 25 kg | Total: 50 kg');
    // Sin el precio de la segunda línea no se arma: valdría 0 en Flujo de caja.
    expect(() => fc.filasFlujoCaja(mixta, { precioUnitario: 1400 })).toThrow(/Sin precio para Biochar/);
  });

  it('una cédula con letras no va al campo número: queda en las observaciones', () => {
    const personas = [{ ...remision().personas[1], cedula: 'PE123456' }];
    const f = fc.filasFlujoCaja(remision({ personas }), { precioUnitario: 1400 });
    expect(f.remision).not.toHaveProperty('Cedula Recibe');
    expect(f.remision['Observaciones Remisión']).toContain('Cédula recibe: PE123456');
  });
});

describe('cedulaNumerica', () => {
  it.each([
    ['1.234.567', 1234567],
    ['99000001', 99000001],
    ['PE123456', null],
    ['0123456', null],
    ['', null],
    [undefined, null],
  ])('%p → %p', (entrada, esperado) => {
    expect(fc.cedulaNumerica(entrada as string | undefined)).toBe(esperado);
  });
});

describe('registrarRemisionFlujoCaja', () => {
  it('la primera vez crea la remisión y una línea vinculada desde el producto', async () => {
    const falso = falsoConCatalogo(1400);
    const paso = await fc.registrarRemisionFlujoCaja(remision());
    expect(paso).toMatchObject({ step: 'flujo_caja', ok: true, detail: { accion: 'creada', numero: 228 } });

    const escrituras = falso.escrituras().map(resumenEscritura);
    expect(escrituras.map((e) => `${e.metodo} ${e.tabla}`)).toEqual([`POST ${T.remisiones}`, `POST ${T.productos}`]);
    const [rem] = falso.registros(B_FC, T.remisiones);
    const [linea] = falso.registros(B_FC, T.productos);
    expect(linea.fields['Remisión Pirolisis']).toEqual([rem.id]);
    expect(linea.fields['Precio por Kg']).toBe(1400);
    // Sin copia pública en el Core no se escribe enlace: el de PiroliApp pide login.
    expect(rem.fields).not.toHaveProperty('Documento Remisión');
  });

  it('mixta: crea una línea por producto con el precio de cada uno en el catálogo', async () => {
    const falso = falsoConCatalogo(1400);
    falso.sembrar(B_PROD, T.catalogo, { 'Codigo Producto': 'SIRIUS-PRODUCT-0015', 'Precio Venta Unitario': 4000 });
    const paso = await fc.registrarRemisionFlujoCaja(remision({ kgTotal: 25, bachesRemitidos: [{ bache: 'S-00140', kg: 25 }] }));
    expect(paso).toMatchObject({ ok: true, detail: { accion: 'creada' } });
    const [rem] = falso.registros(B_FC, T.remisiones);
    const lineas = falso.registros(B_FC, T.productos);
    expect(lineas.map((l) => [l.fields['Producto'], l.fields['Precio por Kg'], l.fields['Remisión Pirolisis']])).toEqual([
      ['Biochar Blend', 1400, [rem.id]],
      ['Biochar', 4000, [rem.id]],
    ]);
  });

  it('copia a Documento Remisión la URL pública de S3, nunca un texto suelto del Core', async () => {
    const s3 = 'https://siriuspirolisis.s3.us-east-1.amazonaws.com/blend-remisiones/recREMFALSA000001-1.pdf';
    const falso = falsoConCatalogo(1400);
    await fc.registrarRemisionFlujoCaja(remision({ documentoUrl: s3 }));
    expect(falso.registros(B_FC, T.remisiones)[0].fields['Documento Remisión']).toBe(s3);

    const otro = falsoConCatalogo(1400);
    await fc.registrarRemisionFlujoCaja(remision({ documentoUrl: '202' }));
    expect(otro.registros(B_FC, T.remisiones)[0].fields).not.toHaveProperty('Documento Remisión');
  });

  it('al actualizar NO pisa el precio que la línea ya tenía (puede estar facturado)', async () => {
    const falso = falsoConCatalogo(1400);
    const linea = falso.sembrar(B_FC, T.productos, { Producto: 'Biochar Blend', 'Cantidad Kg': 1000, 'Precio por Kg': 1190 });
    falso.sembrar(B_FC, T.remisiones, { 'Numero Remision': 228, 'Productos Remisiones Pirolisis': [linea] });

    await fc.registrarRemisionFlujoCaja(remision());
    expect(falso.registro(B_FC, T.productos, linea)?.fields['Precio por Kg']).toBe(1190);
  });

  it('la segunda vez actualiza la misma fila y su línea, sin duplicar ni tocar el link', async () => {
    const falso = falsoConCatalogo(1400);
    const lineaPrevia = falso.sembrar(B_FC, T.productos, { Producto: 'Biochar Blend', 'Cantidad Kg': 990 });
    const otraLinea = falso.sembrar(B_FC, T.productos, { Producto: 'Flete', 'Cantidad Kg': 1 });
    const remPrevia = falso.sembrar(B_FC, T.remisiones, {
      'Numero Remision': 228,
      'Productos Remisiones Pirolisis': [lineaPrevia, otraLinea],
    });

    const paso = await fc.registrarRemisionFlujoCaja(remision());
    expect(paso).toMatchObject({ ok: true, detail: { accion: 'actualizada' } });
    expect(falso.registros(B_FC, T.remisiones)).toHaveLength(1);
    expect(falso.registros(B_FC, T.productos)).toHaveLength(2);

    const escrituras = falso.escrituras().map(resumenEscritura);
    expect(escrituras.map((e) => `${e.metodo} ${e.recordId}`)).toEqual([`PATCH ${remPrevia}`, `PATCH ${lineaPrevia}`]);
    expect(escrituras[0].body).not.toHaveProperty(['fields', 'Productos Remisiones Pirolisis']);
    expect(falso.registro(B_FC, T.productos, lineaPrevia)?.fields['Cantidad Kg']).toBe(1000);
    expect(falso.registro(B_FC, T.productos, otraLinea)?.fields['Cantidad Kg']).toBe(1);
  });

  it('sin precio en el catálogo no escribe nada', async () => {
    const falso = falsoConCatalogo(null);
    const paso = await fc.registrarRemisionFlujoCaja(remision());
    expect(paso.ok).toBe(false);
    expect(paso.error).toMatch(/Precio Venta Unitario/);
    expect(falso.escrituras()).toEqual([]);
  });

  it('omite canceladas, borradores y remisiones ajenas', async () => {
    const falso = falsoConCatalogo(1400);
    for (const r of [remision({ estado: 'Cancelada' }), remision({ estado: 'Borrador' }), remision({ tipo: 'ajena' })]) {
      expect(await fc.registrarRemisionFlujoCaja(r)).toMatchObject({ ok: true, skipped: true });
    }
    expect(falso.llamadas).toEqual([]);
  });

  it('si Airtable falla, el paso lo reporta sin lanzar ni filtrar el token', async () => {
    const falso = new AirtableFalso({
      fallar: (ll) => (ll.metodo === 'POST' ? { status: 403, body: { error: 'INVALID_PERMISSIONS', token: 'patFALSO00000000001.abcdefabcdefabcdefabcdef' } } : null),
    });
    falso.sembrar(B_PROD, T.catalogo, { 'Codigo Producto': 'SIRIUS-PRODUCT-0016', 'Precio Venta Unitario': 1400 });
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
    const paso = await fc.registrarRemisionFlujoCaja(remision());
    expect(paso.ok).toBe(false);
    expect(paso.error).toMatch(/403/);
    expect(paso.error).not.toContain('patFALSO00000000001');
  });
});
