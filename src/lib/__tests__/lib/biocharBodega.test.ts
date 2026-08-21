import { registrarEntradaBiocharBodega, ESTADO_BACHE_BODEGA } from '@/lib/biochar-bodega';
import { referenciaEntradaBodega } from '@/lib/biochar-inventario-core';

describe('referenciaEntradaBodega', () => {
  it('prefija el código del bache', () => {
    expect(referenciaEntradaBodega('S-00221')).toBe('BODEGA-S-00221');
  });

  it('no permite que un bache sea prefijo de otro', () => {
    // La idempotencia compara `documento_referencia` por igualdad exacta, no con
    // FIND() sobre las notas como antes: `BODEGA-S-1` nunca es `BODEGA-S-10`.
    expect(referenciaEntradaBodega('S-1')).not.toBe(referenciaEntradaBodega('S-10'));
  });
});

describe('registrarEntradaBiocharBodega', () => {
  it('se omite sin error cuando el producto Biochar Puro no está configurado', async () => {
    // Next no carga `.env.local` con NODE_ENV=test, así que la variable no existe
    // y `credencialesBiocharPuro()` devuelve null.
    const resultado = await registrarEntradaBiocharBodega({
      codigoBache: 'BACHE-0001',
      kg: 500,
    });

    // ok:true a propósito: mover un bache a bodega NO debe fallar porque el
    // inventario todavía no esté montado.
    expect(resultado.ok).toBe(true);
    expect(resultado.omitido).toBe(true);
    expect(resultado.motivo).toContain('AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID');
    expect(resultado.movimientoId).toBeUndefined();
  });

  it('no hace ninguna petición de red cuando se omite', async () => {
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
