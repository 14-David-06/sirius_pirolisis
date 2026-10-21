// src/lib/recepcion/datos-personales.ts
//
// Validación, normalización y máscaras de los datos personales de quien recibe
// una remisión. Los usan la página pública `/recibir` y el servidor, así que las
// dos aplican exactamente la misma regla.
//
// Sin imports, a propósito: entra en el bundle del navegador.
//
// Las regex no usan `\p{L}` ni otras novedades de ES2018: el `target` del
// proyecto es ES2017 y TypeScript las rechaza. Las letras del español van como
// rangos Latin-1 (`À-Ö Ø-ö ø-ÿ`), que dejan fuera `×` y `÷`.

/**
 * Cédula, cédula de extranjería o pasaporte, en una sola forma canónica:
 * mayúsculas y sin puntos, comas, espacios ni guiones.
 *
 * Las cédulas llegan escritas de todas las formas (`1.234.567`, `1234567 `) y
 * así están también en `Personas` y en Personal Cliente. Se compara siempre la
 * forma canónica; comparar el texto tal cual dejaba a la misma persona como dos.
 *
 * @returns null si no queda un documento plausible (5 a 15 letras o números).
 */
export function normalizarCedula(valor: unknown): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const canonica = String(valor).trim().toUpperCase().replace(/[.,\s-]/g, '');
  return /^[0-9A-Z]{5,15}$/.test(canonica) ? canonica : null;
}

/**
 * Celular en la forma que se guarda: `+57 3XXXXXXXXX` para Colombia, o
 * `+<indicativo><número>` para uno del exterior escrito con `+`.
 *
 * Un número de 10 dígitos sin `+` solo se acepta si es un celular colombiano: sin
 * indicativo no hay forma de saber de qué país es, y adivinarlo mandaría el
 * WhatsApp a un desconocido.
 */
export function normalizarCelularCO(valor: unknown): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const limpio = String(valor).trim().replace(/[\s().-]/g, '');

  const colombiano = /^(?:\+?57)?(3\d{9})$/.exec(limpio);
  if (colombiano) return `+57 ${colombiano[1]}`;
  // Con +57 tiene que ser un celular: un fijo (60X) no recibe la confirmación.
  if (limpio.startsWith('+57')) return null;
  return /^\+\d{8,15}$/.test(limpio) ? limpio : null;
}

/**
 * ¿Es un correo que Airtable va a aceptar? Conservadora a propósito: un campo
 * `email` con un valor que no le gusta responde 422 y tumba el PATCH completo,
 * con todo lo demás que llevaba.
 *
 * Tolera espacios alrededor (el autocompletar del celular agrega uno al final);
 * hay que guardar `normalizarCorreo(valor)`, no el valor tal cual.
 */
export function esCorreoValido(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const correo = valor.trim();
  if (correo.length > 254 || /\s/.test(correo)) return false;
  const m = /^([A-Za-z0-9._%+-]{1,64})@((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24})$/.exec(correo);
  if (!m) return false;
  const local = m[1];
  return !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
}

/** Minúsculas y sin espacios alrededor: así se compara y así se guarda. */
export function normalizarCorreo(valor: string): string {
  return valor.trim().toLowerCase();
}

/** Espacios colapsados y acentos en su forma compuesta (NFC), como se guarda el nombre. */
export function normalizarNombre(valor: string): string {
  return valor.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * Nombre y apellido: 5 a 80 caracteres, al menos dos palabras con letras, y solo
 * letras, espacios, apóstrofo, punto y guion.
 *
 * Sin dígitos, `@`, `/` ni `:` a propósito: el nombre se imprime en el correo
 * que sale con la marca de Sirius, y ahí no se puede colar una URL.
 */
export function nombreValido(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const nombre = normalizarNombre(valor);
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' .-]{5,80}$/.test(nombre)) return false;
  const palabras = nombre.split(' ').filter((p) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(p));
  return palabras.length >= 2;
}

/** Partículas que no aportan a reconocer el nombre: «María de los Ángeles» → «María Á.». */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

function capitalizar(palabra: string): string {
  return palabra
    .toLowerCase()
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('-');
}

/**
 * `JUAN CARLOS PÉREZ GÓMEZ` → `Juan C. P. G.`
 *
 * Lo que ve quien escribe una cédula en la página pública. Basta para que la
 * persona se reconozca, y no para que un extraño sepa a quién pertenece.
 */
export function enmascararNombre(nombre: string): string {
  const palabras = normalizarNombre(typeof nombre === 'string' ? nombre : '')
    .split(' ')
    .filter(Boolean);
  if (!palabras.length) return '';
  const [primera, ...resto] = palabras;
  const iniciales = resto
    .filter((p) => !PARTICULAS.has(p.toLowerCase()))
    .map((p) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.exec(p)?.[0])
    .filter((letra): letra is string => Boolean(letra))
    .map((letra) => `${letra.toUpperCase()}.`);
  return [capitalizar(primera), ...iniciales].join(' ');
}

/**
 * `juanperez@gmail.com` → `j***z@gmail.com`
 *
 * El dominio queda visible: basta para que la persona reconozca su buzón, y el
 * correo completo es lo que se protege.
 */
export function enmascararCorreo(correo: string): string {
  const limpio = normalizarCorreo(typeof correo === 'string' ? correo : '');
  const arroba = limpio.lastIndexOf('@');
  if (arroba < 1) return '***';
  const local = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);
  const visible = local.length > 1 ? `${local[0]}***${local[local.length - 1]}` : `${local}***`;
  return `${visible}@${dominio}`;
}

/** `1234565095` → `•••• 5095`. Nunca se muestra entera fuera del documento. */
export function enmascararCedula(cedula: string): string {
  const canonica = String(cedula ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return canonica.length > 4 ? `•••• ${canonica.slice(-4)}` : '••••';
}
