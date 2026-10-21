// src/lib/recepcion/textos.ts
//
// Lo que lee quien recibe una remisión: la autorización de datos, el aviso de
// privacidad, los mensajes de la página pública y el texto para compartir el
// enlace por WhatsApp. Trato de usted.
//
// Sin imports, a propósito: entra en el bundle del navegador, y el texto legal
// tiene que ser el mismo en la página, en el servidor que lo verifica y en la
// prueba que se guarda.

/**
 * Autorización de tratamiento de datos (Ley 1581 de 2012, Decreto 1377 de 2013).
 *
 * VERSIONADA: la prueba que se guarda (`Autorizaciones Datos Personales`) lleva la
 * versión y el SHA-256 de ESTE texto, que es lo que acredita qué aceptó la persona
 * (Decreto 1377, art. 8). Cualquier cambio —también del contacto— es una versión
 * nueva, y la página con la versión vieja recibe `texto_desactualizado`. Por eso el
 * contacto va escrito aquí y no se lee de `RECEPCION_CONTACTO_DATOS`: con la
 * variable, una misma versión podría corresponder a dos textos distintos.
 */
export const TEXTO_AUTORIZACION_DATOS: { readonly version: '2026-10-21'; readonly texto: string } = {
  version: '2026-10-21',
  texto:
    'Autorizo a SIRIUS REGENERATIVE SOLUTIONS S.A.S. ZOMAC, como responsable del tratamiento, ' +
    'a recolectar, almacenar y usar mi nombre, número de identificación, celular y correo ' +
    'electrónico con la finalidad de registrar y acreditar la recepción de esta remisión, ' +
    'enviarme copia del documento y contactarme sobre esta entrega, conforme a la Ley 1581 de ' +
    '2012 y el Decreto 1377 de 2013. Mis datos se guardan en servicios en la nube que actúan ' +
    'como encargados del tratamiento, incluso fuera de Colombia. Como titular puedo conocer, ' +
    'actualizar, rectificar y suprimir mis datos y revocar esta autorización escribiendo a ' +
    'adm@siriusregenerative.com.',
};

/**
 * A quien ya está registrado se le muestra este aviso, sin casilla: no entrega
 * ningún dato nuevo, así que no hay una autorización nueva que pedirle. Si agrega
 * un correo, eso sí es un dato nuevo y vuelve la casilla.
 */
export const AVISO_PRIVACIDAD_CONOCIDA =
  'Sus datos ya están registrados en Sirius. SIRIUS REGENERATIVE SOLUTIONS S.A.S. ZOMAC los usa ' +
  'para registrar esta recepción y enviarle copia del documento, conforme a la Ley 1581 de 2012 ' +
  'y el Decreto 1377 de 2013. Puede conocer, actualizar, rectificar o suprimir sus datos, o ' +
  'revocar su autorización, escribiendo a adm@siriusregenerative.com.';

/** Los errores de la recepción pública, tal como los devuelve `/api/recibir/*`. */
export const ERRORES_RECEPCION = [
  'enlace_invalido',
  'enlace_vencido',
  'ya_recibida',
  'anulada',
  'no_despachada',
  'cedula_invalida',
  'datos_invalidos',
  'falta_autorizacion',
  'requiere_registro',
  'texto_desactualizado',
  'recibida_por_otra_persona',
  'demasiados_intentos',
  'no_disponible',
  'error_interno',
] as const;

export type ErrorRecepcion = (typeof ERRORES_RECEPCION)[number];

/** Para leer el `error` de una respuesta: lo que no se reconoce se trata como `error_interno`. */
export function esErrorRecepcion(valor: unknown): valor is ErrorRecepcion {
  return (ERRORES_RECEPCION as readonly unknown[]).includes(valor);
}

/**
 * Título y texto de cada error. Los textos no llevan marcadores (`{fecha}`) para
 * que pintarlos tal cual nunca muestre una llave sin reemplazar; el dato del caso
 * lo agrega `textoErrorRecepcion`.
 */
export const MENSAJES_RECEPCION: Record<ErrorRecepcion, { titulo: string; texto: string }> = {
  enlace_invalido: {
    titulo: 'Enlace no válido',
    texto: 'Revise que lo haya abierto completo, o pida uno nuevo a quien le despachó el producto.',
  },
  enlace_vencido: {
    titulo: 'Este enlace venció',
    texto: 'Pida a Sirius un enlace nuevo: el que trae la remisión impresa ya no sirve.',
  },
  ya_recibida: {
    titulo: 'Esta remisión ya fue recibida',
    texto: 'Si no fue usted quien confirmó la recepción, escriba a adm@siriusregenerative.com.',
  },
  anulada: {
    titulo: 'Remisión anulada',
    texto: 'Esta remisión fue anulada. No hay nada que confirmar.',
  },
  no_despachada: {
    titulo: 'Esta remisión aún no ha salido',
    texto: 'El despacho todavía no está completo. Inténtelo de nuevo cuando le llegue el producto.',
  },
  cedula_invalida: {
    titulo: 'Revise el número de documento',
    texto: 'Escriba su número de documento: entre 5 y 15 números o letras.',
  },
  datos_invalidos: {
    titulo: 'Revise sus datos',
    texto: 'Escriba su nombre y apellido, su número de celular y un correo electrónico válido.',
  },
  falta_autorizacion: {
    titulo: 'Falta su autorización',
    texto: 'Para continuar debe autorizar el tratamiento de sus datos personales.',
  },
  requiere_registro: {
    titulo: 'Necesitamos sus datos',
    texto:
      'No encontramos ese documento entre las personas registradas de este cliente. ' +
      'Complete sus datos para confirmar la recepción.',
  },
  texto_desactualizado: {
    titulo: 'La autorización cambió',
    texto: 'El texto de autorización se actualizó. Recargue la página para leer la versión vigente.',
  },
  recibida_por_otra_persona: {
    titulo: 'Otra persona ya confirmó',
    texto:
      'Alguien confirmó esta recepción hace un momento. Si no fue usted, escriba a ' +
      'adm@siriusregenerative.com.',
  },
  demasiados_intentos: {
    titulo: 'Demasiados intentos',
    texto: 'Espere unos minutos y vuelva a intentarlo.',
  },
  no_disponible: {
    titulo: 'Servicio no disponible',
    texto: 'No pudimos completar la confirmación en este momento. Inténtelo de nuevo en unos minutos.',
  },
  error_interno: {
    titulo: 'No pudimos completar la confirmación',
    texto: 'Revise su conexión e inténtelo de nuevo.',
  },
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * `2026-10-28` → «28 de octubre de 2026». Es la regla de `fechaLegible()` de
 * fecha-bogota.ts, repetida aquí porque este módulo no puede tener imports. Parte
 * el texto: `new Date('2026-10-28')` es medianoche UTC, en Bogotá el día anterior.
 */
function fechaLegible(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return fecha;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

function formatoKg(kg: number): string {
  return (Number.isFinite(kg) ? kg : 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** El dato del caso que completa un mensaje de error, cuando lo hay. */
export interface DetalleErrorRecepcion {
  /** `YYYY-MM-DD`: el último día en que valió el enlace. */
  venceEl?: string;
  /** `YYYY-MM-DD`: el día en que se confirmó la recepción. */
  fechaRecibido?: string;
  /** Segundos para poder reintentar (la cabecera `Retry-After` del 429). */
  reintentarEnSeg?: number;
}

/** El texto del error con el dato del caso: «Venció el 28 de octubre de 2026. …». */
export function textoErrorRecepcion(codigo: ErrorRecepcion, detalle: DetalleErrorRecepcion = {}): string {
  const base = MENSAJES_RECEPCION[codigo].texto;
  if (codigo === 'enlace_vencido' && detalle.venceEl) {
    return `Venció el ${fechaLegible(detalle.venceEl)}. ${base}`;
  }
  if (codigo === 'ya_recibida' && detalle.fechaRecibido) {
    return `Se confirmó el ${fechaLegible(detalle.fechaRecibido)}. ${base}`;
  }
  if (codigo === 'demasiados_intentos' && detalle.reintentarEnSeg && detalle.reintentarEnSeg > 0) {
    const minutos = Math.max(1, Math.ceil(detalle.reintentarEnSeg / 60));
    return `Espere ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} y vuelva a intentarlo.`;
  }
  return base;
}

/**
 * El mensaje para compartir el enlace de recepción por WhatsApp.
 *
 * Sin datos personales, por construcción: no recibe cédulas, nombres ni correos.
 * El mensaje se reenvía, queda en el celular del conductor y en la vista previa
 * del chat; lo único sensible es el enlace, y ese vence y sirve una sola vez.
 */
export function mensajeWhatsAppRecepcion(d: {
  codigo: string;
  producto: string;
  kg: number;
  venceEl: string;
  url: string;
}): string {
  return [
    `Sirius Regenerative Solutions: remisión ${d.codigo}`,
    `${d.producto}, ${formatoKg(d.kg)} kg.`,
    `Cuando reciba el producto, confirme la recepción en este enlace (vale hasta el ${fechaLegible(d.venceEl)}):`,
    d.url,
    'Debe abrirlo quien recibe: le pediremos su número de documento.',
  ].join('\n');
}

/**
 * Número en la forma que pide `wa.me` (solo dígitos, con indicativo), o null.
 *
 * Diez dígitos que empiezan por 3 son un celular colombiano. Cualquier otro
 * número solo se usa si trae `+`: sin indicativo, `wa.me` lo leería como de otro
 * país y abriría el chat de un desconocido. Es la regla de `normalizarCelularCO()`
 * (datos-personales.ts), repetida porque este módulo no puede tener imports.
 */
function numeroWhatsApp(telefono?: string | null): string | null {
  const limpio = (telefono ?? '').trim().replace(/[\s().-]/g, '');
  const colombiano = /^(?:\+?57)?(3\d{9})$/.exec(limpio);
  if (colombiano) return `57${colombiano[1]}`;
  if (limpio.startsWith('+57')) return null;
  return /^\+\d{8,15}$/.test(limpio) ? limpio.slice(1) : null;
}

/**
 * Enlace de WhatsApp con el texto ya escrito: al chat del teléfono si se puede
 * leer uno, o al selector de contactos (`wa.me/?text=`) si no.
 */
export function urlWhatsApp(texto: string, telefono?: string | null): string {
  const numero = numeroWhatsApp(telefono);
  return `https://wa.me/${numero ?? ''}?text=${encodeURIComponent(texto)}`;
}
