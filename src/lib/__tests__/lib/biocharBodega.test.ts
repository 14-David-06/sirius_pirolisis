import { marcaBache, registrarEntradaBiocharBodega, ESTADO_BACHE_BODEGA } from '@/lib/biochar-bodega';

describe('marcaBache', () => {
  it('encierra el código entre corchetes', () => {
    expect(marcaBache('BACHE-0042')).toBe('[BACHE:BACHE-0042]');
  });

  it('no permite que un bache sea prefijo de otro', () => {
    // Es la razón de los corchetes: la búsqueda de idempotencia usa FIND() sobre
    // las notas, y sin el cierre el bache B-1 encontraría al B-10.
    const b1 = marcaBache('B-1');
    const b10 = marcaBache('B-10');

    expect(b10.includes(b1)).toBe(false);
  });
});

describe('registrarEntradaBiocharBodega', () => {
  const original = process.env.AIRTABLE_BLEND_BIOCHAR_RECORD_ID;

  afterEach(() => {
    if (original === undefined) delete process.env.AIRTABLE_BLEND_BIOCHAR_RECORD_ID;
    else process.env.AIRTABLE_BLEND_BIOCHAR_RECORD_ID = original;
  });

  it('se omite sin error cuando el insumo Biochar no está configurado', async () => {
    delete process.env.AIRTABLE_BLEND_BIOCHAR_RECORD_ID;

    const resultado = await registrarEntradaBiocharBodega({
      codigoBache: 'BACHE-0001',
      kg: 500,
    });

    // ok:true a propósito: mover un bache a bodega NO debe fallar porque el
    // inventario todavía no esté montado.
    expect(resultado.ok).toBe(true);
    expect(resultado.omitido).toBe(true);
    expect(resultado.motivo).toContain('AIRTABLE_BLEND_BIOCHAR_RECORD_ID');
    expect(resultado.movimientoId).toBeUndefined();
  });

  it('no hace ninguna petición de red cuando se omite', async () => {
    delete process.env.AIRTABLE_BLEND_BIOCHAR_RECORD_ID;
    // `fetch` no existe en el entorno jsdom de los tests: se instala un doble.
    const fetchMock = jest.fn();
    const previo = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    await registrarEntradaBiocharBodega({ codigoBache: 'BACHE-0002', kg: 100 });

    expect(fetchMock).not.toHaveBeenCalled();
    (globalThis as { fetch?: unknown }).fetch = previo;
  });
});

describe('ESTADO_BACHE_BODEGA', () => {
  it('coincide exactamente con el valor que escribe /sistema-baches', () => {
    // Si este string cambia en Airtable, el enganche del PATCH deja de dispararse
    // en silencio: por eso está centralizado en una constante.
    expect(ESTADO_BACHE_BODEGA).toBe('Bache Completo Bodega');
  });
});
