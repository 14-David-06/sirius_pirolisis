/**
 * @jest-environment node
 */

/**
 * La máquina de pasos de `/recibir`. Lo que se protege: que cada respuesta de
 * `/api/recibir/*` lleve a la pantalla correcta, que lo digitado no se pierda al
 * reintentar, que un error de campo no reemplace el formulario, y que los cuerpos
 * que salen cumplan el contrato D.9 a D.11. Datos inventados.
 */

import {
  BORRADOR_VACIO,
  clavePantalla,
  cuerpoConfirmar,
  ESTADO_INICIAL,
  falloDeRespuesta,
  leerConsulta,
  leerExito,
  MENSAJES_CAMPO,
  reducirRecepcion,
  segundosRetryAfter,
  tituloError,
  tokenDeFragmento,
  validarCedula,
  validarConocida,
  validarRegistro,
  type AccionRecepcion,
  type EstadoRecepcion,
  type ResumenRemision,
} from '@/app/recibir/recepcion.estado';
import { MENSAJES_RECEPCION, TEXTO_AUTORIZACION_DATOS } from '@/lib/recepcion/textos';

const TOKEN = 'v1.recAAAAAAAAAAAAAA.abc12.ABCDEFGHIJKLMNOPQRSTUV';

const RESUMEN: ResumenRemision = {
  codigo: 'SIRIUS-REM-9001',
  producto: 'Biochar',
  kg: 200,
  cliente: 'FINCA DE PRUEBA SAS',
  area: 'Sanidad',
  fechaDespacho: '2026-10-21',
};

function correr(...acciones: AccionRecepcion[]): EstadoRecepcion {
  return acciones.reduce(reducirRecepcion, ESTADO_INICIAL);
}

const EN_CEDULA: AccionRecepcion[] = [
  { tipo: 'token', token: TOKEN },
  { tipo: 'consultado', estado: 'pendiente', resumen: RESUMEN, venceEl: '2026-10-28' },
];

describe('reducirRecepcion: carga', () => {
  it('sin token muestra «enlace incompleto» sin reintento', () => {
    const e = correr({ tipo: 'token', token: null });
    expect(e.paso).toEqual({ tipo: 'error', codigo: 'enlace_incompleto', detalle: {}, volverA: null });
    expect(tituloError('enlace_incompleto')).toBe('Enlace incompleto');
  });

  it('con token queda cargando, y una remisión pendiente pasa a la cédula', () => {
    expect(correr({ tipo: 'token', token: TOKEN }).paso).toEqual({ tipo: 'cargando' });
    const e = correr(...EN_CEDULA);
    expect(e.paso).toEqual({ tipo: 'cedula' });
    expect(e.resumen).toEqual(RESUMEN);
    expect(e.venceEl).toBe('2026-10-28');
  });

  it.each([
    ['recibida', 'ya_recibida'],
    ['anulada', 'anulada'],
    ['no_despachada', 'no_despachada'],
  ] as const)('estado %s → pantalla de error %s', (estado, codigo) => {
    const e = correr(
      { tipo: 'token', token: TOKEN },
      { tipo: 'consultado', estado, resumen: RESUMEN, venceEl: null, fechaRecibido: '2026-10-20' },
    );
    expect(e.paso).toMatchObject({ tipo: 'error', codigo, volverA: null });
    if (estado === 'recibida') expect(e.paso).toMatchObject({ detalle: { fechaRecibido: '2026-10-20' } });
  });

  it('una caída al consultar ofrece reintentar, y reintentar vuelve a cargando', () => {
    const e = correr({ tipo: 'token', token: TOKEN }, { tipo: 'fallo', codigo: 'no_disponible' });
    expect(e.paso).toMatchObject({ tipo: 'error', codigo: 'no_disponible', volverA: 'consultar' });
    expect(reducirRecepcion(e, { tipo: 'reintentar' }).paso).toEqual({ tipo: 'cargando' });
  });

  it('un enlace inválido o vencido no ofrece reintentar', () => {
    for (const codigo of ['enlace_invalido', 'enlace_vencido'] as const) {
      const e = correr({ tipo: 'token', token: TOKEN }, { tipo: 'fallo', codigo });
      expect(e.paso).toMatchObject({ tipo: 'error', codigo, volverA: null });
      expect(reducirRecepcion(e, { tipo: 'reintentar' })).toBe(e);
    }
  });
});

describe('reducirRecepcion: identificación', () => {
  it('enviar bloquea el formulario que está a la vista', () => {
    const e = correr(...EN_CEDULA, { tipo: 'campo', campo: 'cedula', valor: '1.234.567' }, { tipo: 'enviar' });
    expect(e.paso).toEqual({ tipo: 'enviando', desde: { tipo: 'cedula' } });
    // Enviar dos veces no apila otro envío.
    expect(reducirRecepcion(e, { tipo: 'enviar' })).toBe(e);
  });

  it('cédula conocida → paso conocida con lo enmascarado', () => {
    const e = correr(
      ...EN_CEDULA,
      { tipo: 'enviar' },
      { tipo: 'identificado', cedula: '1234567', conocida: true, nombre: 'Ana M. P.', correo: 'a***z@correo.test' },
    );
    expect(e.paso).toEqual({ tipo: 'conocida', nombre: 'Ana M. P.', correo: 'a***z@correo.test' });
    expect(e.cedula).toBe('1234567');
  });

  it('cédula desconocida → registro con la cédula guardada', () => {
    const e = correr(...EN_CEDULA, { tipo: 'enviar' }, { tipo: 'identificado', cedula: '1234567', conocida: false });
    expect(e.paso).toEqual({ tipo: 'registro', motivo: 'no_encontrada' });
    expect(e.cedula).toBe('1234567');
  });

  it('«No soy yo» pasa al registro con la misma cédula y descarta el correo opcional', () => {
    const e = correr(
      ...EN_CEDULA,
      { tipo: 'enviar' },
      { tipo: 'identificado', cedula: '1234567', conocida: true, nombre: 'Ana M. P.', correo: null },
      { tipo: 'campo', campo: 'correoConocida', valor: 'otra@correo.test' },
      { tipo: 'campo', campo: 'autorizaConocida', valor: true },
      { tipo: 'no_soy_yo' },
    );
    expect(e.paso).toEqual({ tipo: 'registro', motivo: 'no_soy_yo' });
    expect(e.cedula).toBe('1234567');
    expect(e.borrador.correoConocida).toBe('');
    expect(e.borrador.autorizaConocida).toBe(false);
  });

  it('«Cambiar» vuelve a la cédula y olvida la identificada', () => {
    const e = correr(
      ...EN_CEDULA,
      { tipo: 'enviar' },
      { tipo: 'identificado', cedula: '1234567', conocida: false },
      { tipo: 'cambiar_cedula' },
    );
    expect(e.paso).toEqual({ tipo: 'cedula' });
    expect(e.cedula).toBeNull();
  });

  it('cedula_invalida del servidor vuelve al formulario con el error en línea', () => {
    const e = correr(...EN_CEDULA, { tipo: 'enviar' }, { tipo: 'fallo', codigo: 'cedula_invalida' });
    expect(e.paso).toEqual({ tipo: 'cedula' });
    expect(e.errores).toEqual({ cedula: MENSAJES_CAMPO.cedula });
  });
});

describe('reducirRecepcion: confirmación', () => {
  const EN_REGISTRO: AccionRecepcion[] = [
    ...EN_CEDULA,
    { tipo: 'enviar' },
    { tipo: 'identificado', cedula: '1234567', conocida: false },
    { tipo: 'campo', campo: 'nombre', valor: 'Ana María Prueba' },
  ];

  it('datos_invalidos con campos marca cada campo del registro', () => {
    const e = correr(...EN_REGISTRO, { tipo: 'enviar' }, { tipo: 'fallo', codigo: 'datos_invalidos', campos: ['celular', 'correo'] });
    expect(e.paso).toEqual({ tipo: 'registro', motivo: 'no_encontrada' });
    expect(e.errores).toEqual({ celular: MENSAJES_CAMPO.celular, correo: MENSAJES_CAMPO.correo });
  });

  it('datos_invalidos sin campos reconocibles va al resumen general', () => {
    const e = correr(...EN_REGISTRO, { tipo: 'enviar' }, { tipo: 'fallo', codigo: 'datos_invalidos', campos: ['raro'] });
    expect(e.errores).toEqual({ general: MENSAJES_RECEPCION.datos_invalidos.texto });
  });

  it('falta_autorizacion en la conocida marca su casilla, no la del registro', () => {
    const e = correr(
      ...EN_CEDULA,
      { tipo: 'enviar' },
      { tipo: 'identificado', cedula: '1234567', conocida: true, nombre: 'Ana M. P.', correo: null },
      { tipo: 'enviar' },
      { tipo: 'fallo', codigo: 'falta_autorizacion' },
    );
    expect(e.paso.tipo).toBe('conocida');
    expect(e.errores).toEqual({ autorizaConocida: MENSAJES_CAMPO.autorizaConocida });
  });

  it('requiere_registro al confirmar como conocida pasa al registro', () => {
    const e = correr(
      ...EN_CEDULA,
      { tipo: 'enviar' },
      { tipo: 'identificado', cedula: '1234567', conocida: true, nombre: 'Ana M. P.', correo: null },
      { tipo: 'enviar' },
      { tipo: 'fallo', codigo: 'requiere_registro' },
    );
    expect(e.paso).toEqual({ tipo: 'registro', motivo: 'no_encontrada' });
  });

  it('una caída al confirmar conserva lo digitado y «Reintentar» vuelve al formulario', () => {
    const e = correr(...EN_REGISTRO, { tipo: 'enviar' }, { tipo: 'fallo', codigo: 'error_interno' });
    expect(e.paso).toMatchObject({ tipo: 'error', codigo: 'error_interno', volverA: { tipo: 'registro' } });
    const r = reducirRecepcion(e, { tipo: 'reintentar' });
    expect(r.paso).toEqual({ tipo: 'registro', motivo: 'no_encontrada' });
    expect(r.borrador.nombre).toBe('Ana María Prueba');
  });

  it('demasiados_intentos lleva la espera y se puede reintentar', () => {
    const e = correr(...EN_REGISTRO, { tipo: 'enviar' }, falloDeRespuesta(429, { ok: false, error: 'demasiados_intentos' }, '300'));
    expect(e.paso).toMatchObject({ tipo: 'error', codigo: 'demasiados_intentos', detalle: { reintentarEnSeg: 300 } });
    expect((e.paso as { volverA: unknown }).volverA).toEqual({ tipo: 'registro', motivo: 'no_encontrada' });
  });

  it.each(['ya_recibida', 'recibida_por_otra_persona', 'anulada', 'texto_desactualizado'] as const)(
    '%s al confirmar es pantalla final, sin reintento',
    (codigo) => {
      const e = correr(...EN_REGISTRO, { tipo: 'enviar' }, { tipo: 'fallo', codigo });
      expect(e.paso).toMatchObject({ tipo: 'error', codigo, volverA: null });
    },
  );

  it('confirmado → éxito', () => {
    const datos = {
      codigo: 'SIRIUS-REM-9001',
      fechaRecibido: '2026-10-21',
      recibidaEn: '2026-10-21T20:04:05.000Z',
      yaRecibida: false,
      correo: { estado: 'enviado' as const, a: 'a***z@correo.test' },
    };
    const e = correr(...EN_REGISTRO, { tipo: 'enviar' }, { tipo: 'confirmado', datos });
    expect(e.paso).toEqual({ tipo: 'exito', datos });
  });

  it('corregir un campo apaga su error y el resumen general', () => {
    const e = correr(
      ...EN_REGISTRO,
      { tipo: 'errores', errores: { nombre: 'x', celular: 'y', general: 'z' } },
      { tipo: 'campo', campo: 'nombre', valor: 'Ana María Prueba Dos' },
    );
    expect(e.errores).toEqual({ celular: 'y' });
  });
});

describe('clavePantalla', () => {
  it('enviando comparte la clave del formulario: el foco no salta a mitad del envío', () => {
    expect(clavePantalla({ tipo: 'enviando', desde: { tipo: 'cedula' } })).toBe(clavePantalla({ tipo: 'cedula' }));
    expect(clavePantalla({ tipo: 'cedula' })).not.toBe(clavePantalla({ tipo: 'registro', motivo: 'no_soy_yo' }));
  });
});

describe('validación', () => {
  it('validarCedula normaliza puntos y espacios', () => {
    expect(validarCedula({ ...BORRADOR_VACIO, cedula: ' 1.234.567 ' })).toEqual({ ok: true, valor: '1234567' });
    expect(validarCedula({ ...BORRADOR_VACIO, cedula: '12' })).toEqual({
      ok: false,
      errores: { cedula: MENSAJES_CAMPO.cedula },
    });
  });

  it('validarConocida: el correo es opcional, pero si se escribe exige formato y autorización', () => {
    expect(validarConocida(BORRADOR_VACIO)).toEqual({ ok: true, valor: { correo: null } });
    expect(validarConocida({ ...BORRADOR_VACIO, correoConocida: 'mal' })).toEqual({
      ok: false,
      errores: { correoConocida: MENSAJES_CAMPO.correoConocida, autorizaConocida: MENSAJES_CAMPO.autorizaConocida },
    });
    expect(validarConocida({ ...BORRADOR_VACIO, correoConocida: ' Ana@Correo.Test ', autorizaConocida: true })).toEqual({
      ok: true,
      valor: { correo: 'ana@correo.test' },
    });
  });

  it('validarRegistro exige todo, incluida la casilla, y normaliza', () => {
    const r = validarRegistro(BORRADOR_VACIO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(['autoriza', 'celular', 'correo', 'nombre']);

    expect(
      validarRegistro({
        ...BORRADOR_VACIO,
        nombre: '  ana   maría prueba ',
        celular: '300 123 4567',
        correo: 'Ana@Correo.Test',
        autoriza: true,
      }),
    ).toEqual({ ok: true, valor: { nombre: 'ana maría prueba', celular: '+57 3001234567', correo: 'ana@correo.test' } });
  });
});

describe('cuerpos de confirmar (D.11)', () => {
  const v = TEXTO_AUTORIZACION_DATOS.version;

  it('conocida sin correo no manda autorización', () => {
    expect(cuerpoConfirmar(TOKEN, '1234567', 'conocida', { correo: null })).toEqual({
      token: TOKEN,
      cedula: '1234567',
      modo: 'conocida',
      textoVersion: v,
    });
  });

  it('conocida con correo manda la autorización', () => {
    expect(cuerpoConfirmar(TOKEN, '1234567', 'conocida', { correo: 'a@b.co' })).toEqual({
      token: TOKEN,
      cedula: '1234567',
      modo: 'conocida',
      correo: 'a@b.co',
      autorizaDatos: true,
      textoVersion: v,
    });
  });

  it('nueva manda los datos en `nuevo` con la autorización', () => {
    const nuevo = { nombre: 'Ana Prueba', celular: '+57 3001234567', correo: 'a@b.co' };
    expect(cuerpoConfirmar(TOKEN, '1234567', 'nueva', nuevo)).toEqual({
      token: TOKEN,
      cedula: '1234567',
      modo: 'nueva',
      nuevo,
      autorizaDatos: true,
      textoVersion: v,
    });
  });
});

describe('lectura de respuestas', () => {
  it('falloDeRespuesta usa el `error` del cuerpo, o el HTTP si no lo reconoce', () => {
    expect(falloDeRespuesta(410, { ok: false, error: 'enlace_vencido', venceEl: '2026-10-28' })).toEqual({
      tipo: 'fallo',
      codigo: 'enlace_vencido',
      detalle: { venceEl: '2026-10-28' },
    });
    expect(falloDeRespuesta(404, '<html>')).toMatchObject({ codigo: 'enlace_invalido' });
    expect(falloDeRespuesta(503, null)).toMatchObject({ codigo: 'no_disponible' });
    expect(falloDeRespuesta(502, { error: 'inventado' })).toMatchObject({ codigo: 'error_interno' });
    expect(falloDeRespuesta(400, { error: 'datos_invalidos', campos: ['nombre', 3] })).toMatchObject({
      codigo: 'datos_invalidos',
      campos: ['nombre'],
    });
  });

  it('segundosRetryAfter acepta segundos y fecha HTTP', () => {
    expect(segundosRetryAfter('120')).toBe(120);
    expect(segundosRetryAfter(new Date(1_000_000 + 90_000).toUTCString(), 1_000_000)).toBe(90);
    expect(segundosRetryAfter('basura')).toBeUndefined();
    expect(segundosRetryAfter(null)).toBeUndefined();
  });

  it('leerConsulta valida la forma y rechaza lo incompleto', () => {
    expect(
      leerConsulta({ estado: 'pendiente', remision: { ...RESUMEN, area: null }, venceEl: '2026-10-28', textoVersion: 'x' }),
    ).toEqual({
      tipo: 'consultado',
      estado: 'pendiente',
      resumen: { ...RESUMEN, area: null },
      venceEl: '2026-10-28',
      fechaRecibido: null,
    });
    expect(leerConsulta({ estado: 'otro', remision: RESUMEN })).toBeNull();
    expect(leerConsulta({ estado: 'pendiente' })).toBeNull();
  });

  it('leerExito exige ok:true y degrada un estado de correo desconocido', () => {
    expect(leerExito({ ok: false })).toBeNull();
    expect(
      leerExito({ ok: true, codigo: 'SIRIUS-REM-9001', fechaRecibido: '2026-10-21', recibidaEn: 'x', correo: { estado: 'raro' } }),
    ).toMatchObject({ yaRecibida: false, correo: { estado: 'no_enviado', a: null } });
  });
});

describe('tokenDeFragmento', () => {
  it('toma el token del fragmento y descarta lo que no puede ser un token', () => {
    expect(tokenDeFragmento(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenDeFragmento(`#${encodeURIComponent(TOKEN)}`)).toBe(TOKEN);
    expect(tokenDeFragmento('')).toBeNull();
    expect(tokenDeFragmento('#')).toBeNull();
    expect(tokenDeFragmento('#<script>')).toBeNull();
    expect(tokenDeFragmento(`#${'a'.repeat(201)}`)).toBeNull();
  });
});
