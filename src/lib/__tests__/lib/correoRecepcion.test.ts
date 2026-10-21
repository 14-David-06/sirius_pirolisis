/**
 * @jest-environment node
 */

/**
 * El correo de recepción: lo que sale con la marca de Sirius hacia alguien de
 * afuera. Se protege que nada de lo que escribió un tercero se interprete como
 * HTML, que no haya enlaces ni imágenes, que la cédula vaya enmascarada y que los
 * destinatarios los decida el servidor (receptor + copia fija, sin repetidos).
 *
 * Datos inventados.
 */

import {
  correoRecepcion,
  datosCorreoDesdeRemision,
  destinatariosRecepcion,
  type DatosCorreoRecepcion,
} from '@/lib/recepcion/correo-recepcion';
import type { RemisionBlend } from '@/lib/blend-remisiones-core';

const BASE: DatosCorreoRecepcion = {
  codigo: 'SIRIUS-REM-9232',
  idPedido: 'SIRIUS-PED-9001',
  cliente: 'FINCA DE PRUEBA S.A.S.',
  area: 'Sanidad',
  producto: 'Biochar',
  kg: 200,
  co2Kg: 500,
  fechaDespacho: '2026-10-21',
  recibidaEnIso: '2026-10-21T20:04:00.000Z',
  receptorNombre: 'Juana Prueba Ficticia',
  receptorCedula: '99001234',
  contactoDatos: 'adm@siriusregenerative.com',
};

describe('correoRecepcion', () => {
  it('arma el asunto con código, producto, kg y cliente', () => {
    const { asunto } = correoRecepcion(BASE);
    expect(asunto).toBe('Remisión SIRIUS-REM-9232 recibida · Biochar 200,00 kg · FINCA DE PRUEBA S.A.S.');
  });

  it('marca el reenvío en el asunto y en el saludo', () => {
    const { asunto, html } = correoRecepcion({ ...BASE, reenvio: true });
    expect(asunto.startsWith('Reenvío: Remisión SIRIUS-REM-9232')).toBe(true);
    expect(html).toContain('Le reenviamos el documento');
  });

  it('recorta el cliente para no pasar de 150 caracteres y quita los controles del asunto', () => {
    const { asunto } = correoRecepcion({ ...BASE, cliente: `CLIENTE\r\nBcc: x ${'Y'.repeat(300)}` });
    expect(asunto.length).toBeLessThanOrEqual(150);
    expect(asunto).not.toMatch(/[\r\n]/);
    expect(asunto).toContain('Biochar 200,00 kg');
  });

  it('escapa todo lo que escribió un tercero', () => {
    const { html } = correoRecepcion({
      ...BASE,
      receptorNombre: 'Ana <a href="https://malo.example">clic</a>',
      cliente: 'X & <script>alert(1)</script>',
      observaciones: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;a href=&quot;https://malo.example&quot;&gt;');
    expect(html).toContain('X &amp; &lt;script&gt;');
  });

  it('no lleva enlaces ni imágenes', () => {
    const { html } = correoRecepcion(BASE);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<a\s/i);
    expect(html).not.toMatch(/<img/i);
  });

  it('enmascara la cédula: nunca la imprime completa', () => {
    const { html } = correoRecepcion(BASE);
    expect(html).not.toContain('99001234');
    expect(html).toContain('•••• 1234');
  });

  it('dice qué hacer si no fue usted, y usa colores sólidos', () => {
    const { html } = correoRecepcion(BASE);
    expect(html).toContain('Si usted no confirmó esta recepción');
    expect(html).toContain('responda este correo');
    expect(html).toContain('bgcolor="#111111"');
    expect(html).not.toMatch(/gradient/i);
    expect(html).toContain('ENTREGADA');
  });

  it('muestra la fecha y hora de recepción en Bogotá', () => {
    const { html } = correoRecepcion(BASE);
    // 20:04 UTC = 15:04 en Bogotá.
    expect(html).toContain('21 de octubre de 2026');
    expect(html).toContain('15:04');
  });

  it('agrega la franja interna cuando quien recibió no tiene correo', () => {
    expect(correoRecepcion(BASE).html).not.toContain('Copia interna');
    expect(correoRecepcion({ ...BASE, sinCorreoReceptor: true }).html).toContain('Copia interna');
  });
});

describe('destinatariosRecepcion', () => {
  const CC = ['adm@siriusregenerative.com', 'David@SiriusRegenerative.com'];

  it('Para = receptor; CC = la copia fija, en minúsculas', () => {
    expect(destinatariosRecepcion('Juana@Example.com ', CC)).toEqual({
      para: ['juana@example.com'],
      cc: ['adm@siriusregenerative.com', 'david@siriusregenerative.com'],
      sinCorreoReceptor: false,
    });
  });

  it('quita de CC lo que ya va en Para y los repetidos', () => {
    const r = destinatariosRecepcion('adm@siriusregenerative.com', [...CC, 'ADM@siriusregenerative.com']);
    expect(r.para).toEqual(['adm@siriusregenerative.com']);
    expect(r.cc).toEqual(['david@siriusregenerative.com']);
  });

  it('sin correo del receptor, la copia pasa a ser el Para', () => {
    expect(destinatariosRecepcion(null, CC)).toEqual({
      para: ['adm@siriusregenerative.com', 'david@siriusregenerative.com'],
      cc: [],
      sinCorreoReceptor: true,
    });
  });

  it('descarta un correo inválido del receptor', () => {
    expect(destinatariosRecepcion('no-es-correo', CC).sinCorreoReceptor).toBe(true);
  });
});

describe('datosCorreoDesdeRemision', () => {
  it('toma solo las observaciones del operador, nunca las marcas', () => {
    const r = {
      codigo: 'SIRIUS-REM-9232',
      idPedido: 'SIRIUS-PED-9001',
      idCliente: 'CL-9001',
      clienteNombre: 'FINCA DE PRUEBA S.A.S.',
      idAreaCliente: 'AC-9001',
      areaClienteNombre: 'Sanidad',
      productoNombre: 'Biochar',
      kgTotal: 200,
      co2SecuestradoKg: 500,
      fechaDespacho: '2026-10-21',
      fechaRemision: '2026-10-21',
      notas: '[bache:S-09001=200.00] [desp:0b6f3a52-6d1e-4c8a-9f3e-2a1b4c5d6e7f] Biochar — Llevar a la bodega 2',
    } as RemisionBlend;
    const d = datosCorreoDesdeRemision(r, { nombre: 'Juana Prueba', cedula: '99001234' }, '2026-10-21T20:04:00.000Z');
    expect(d.observaciones).toBe('Llevar a la bodega 2');
    expect(d.area).toBe('Sanidad');
    expect(d.cliente).toBe('FINCA DE PRUEBA S.A.S.');
    expect(correoRecepcion(d).html).not.toContain('[bache:');
  });
});
