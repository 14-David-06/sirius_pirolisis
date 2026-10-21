/**
 * @jest-environment node
 */

/**
 * Escape HTML del correo de recepción: lo que escribe alguien de afuera (su
 * nombre, las observaciones, el nombre del cliente) no puede convertirse en
 * marcado dentro de un correo con la marca de Sirius.
 */

import { escapeHtml } from '@/lib/html-escape';

describe('escapeHtml', () => {
  it('escapa los cinco caracteres con significado en HTML', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>A & B</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;A &amp; B&lt;/a&gt;'
    );
  });

  it('un script queda como texto', () => {
    const salida = escapeHtml('<script>alert(1)</script>');
    expect(salida).not.toContain('<');
    expect(salida).not.toContain('>');
    expect(salida).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('el ampersand va primero: no deja entidades a medias', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('deja intactos los acentos, la eñe y los emojis', () => {
    expect(escapeHtml('Recibió Núñez — 1.446,98 kg')).toBe('Recibió Núñez — 1.446,98 kg');
  });

  it('null y undefined dan cadena vacía; los números se convierten', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(1446.98)).toBe('1446.98');
    expect(escapeHtml(0)).toBe('0');
  });
});
