// src/lib/recepcion/enlace.server.ts
// ⚠️ SERVER-SIDE ONLY. Emite y verifica los enlaces de recepción de remisiones.
//
// El secreto se lee del entorno en cada llamada, no al importar: así un test fija
// la variable antes de usarla, y el valor nunca pasa por `config`, que también
// entra en páginas de cliente.
//
//   RECEPCION_SECRET           ≥ 32 caracteres. Firma y verifica; sin él no hay enlaces.
//   RECEPCION_SECRET_ANTERIOR  opcional: solo verifica, mientras dura una rotación.
//   RECEPCION_URL_BASE         dominio público (o NEXT_PUBLIC_APP_URL); https en producción.
//   SESSION_SECRET             en producción, EMITIR exige la sesión firmada: con la
//                              cookie sin firma cualquiera fabrica una sesión, y los
//                              códigos de remisión son consecutivos.
//
// Rotación: el valor viejo pasa a RECEPCION_SECRET_ANTERIOR y el nuevo a
// RECEPCION_SECRET; el anterior se quita a los 30 días, cuando ya no queda enlace
// vivo firmado con él. Para matar TODOS los enlaces se cambia el secreto sin
// dejar anterior, y se vuelven a compartir desde la bodega.

import 'server-only';
import { config } from '../config';
import { esRecordId } from '../airtable-escape';
import { fechaBogota, finDelDiaBogotaSeg, sumarDiasFecha } from '../fecha-bogota';
import { sanearError } from '../log-seguro';
import { sesionFirmada } from '../sesion-config.server';
import { secretoValido } from '../sesion-firma';
import type { StepResult } from '@/types/step-result';
import {
  VIGENCIA_MAXIMA_SEG,
  firmarTokenRecepcion,
  huellaToken,
  verificarTokenRecepcion,
  type ResultadoToken,
} from './token';

export interface EnlaceRecepcion {
  /** `<base>/recibir#<token>`: en el fragmento, que el navegador no le manda a nadie. */
  url: string;
  token: string;
  /** `YYYY-MM-DD` en Bogotá: el último día en que el enlace vale. */
  venceEl: string;
  expSeg: number;
}

const esProduccion = () => process.env.NODE_ENV === 'production';

/** Recorta espacios: pegar el valor en Vercel suele arrastrar un salto de línea. */
function secretoActual(): string | null {
  const secreto = process.env.RECEPCION_SECRET?.trim();
  return secretoValido(secreto) ? secreto : null;
}

/**
 * El actual primero. El anterior solo no basta: sin un secreto actual la
 * recepción está «no configurada», igual que la sesión sin SESSION_SECRET.
 */
function secretosVigentes(): string[] {
  const actual = secretoActual();
  if (!actual) return [];
  const anterior = process.env.RECEPCION_SECRET_ANTERIOR?.trim();
  return secretoValido(anterior) && anterior !== actual ? [actual, anterior] : [actual];
}

/**
 * La base pública de los enlaces, sin barra final, o null si no sirve.
 *
 * En producción tiene que ser https: con http, quien intercepte la página puede
 * leer el fragmento y con él confirmar la recepción. En desarrollo, sin variable,
 * es `http://localhost:3000`.
 */
function urlBaseEnlaces(): string | null {
  const candidata = config.recepcion.urlBase || (esProduccion() ? '' : 'http://localhost:3000');
  if (!candidata) return null;
  // Un dominio sin protocolo es el error clásico al cargar la variable en Vercel.
  const conProtocolo = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidata) ? candidata : `https://${candidata}`;
  let url: URL;
  try {
    url = new URL(conProtocolo);
  } catch {
    return null;
  }
  const protocoloValido = url.protocol === 'https:' || (url.protocol === 'http:' && !esProduccion());
  if (!protocoloValido || url.search || url.hash || url.username || url.password) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * Si se pueden emitir enlaces, o qué variables faltan. Nombra la variable, nunca
 * su valor: el mensaje llega a la UI del operador y a los logs.
 */
export function recepcionConfigurada(): { ok: true } | { ok: false; falta: string[] } {
  const falta: string[] = [];
  if (!secretoActual()) falta.push('RECEPCION_SECRET');
  if (!urlBaseEnlaces()) falta.push('RECEPCION_URL_BASE');
  if (esProduccion() && !sesionFirmada()) falta.push('SESSION_SECRET');
  return falta.length ? { ok: false, falta } : { ok: true };
}

/**
 * El enlace de recepción de una remisión, o null si la recepción no está
 * configurada (ver `recepcionConfigurada`).
 *
 * Vence al terminar el día en Bogotá, `ttlDias` días después de hoy. Es
 * determinista por día: el PDF que se adjunta y el que se descarga ese mismo día
 * llevan el mismo QR. No se guarda en ningún lado; se vuelve a emitir cuando haga
 * falta.
 */
export function crearEnlaceRecepcion(recordId: string, ahora: Date = new Date()): EnlaceRecepcion | null {
  if (!esRecordId(recordId)) throw new Error('Record ID inválido para el enlace de recepción');
  if (!recepcionConfigurada().ok) return null;

  const secreto = secretoActual() as string;
  const base = urlBaseEnlaces() as string;
  const venceEl = sumarDiasFecha(fechaBogota(ahora), config.recepcion.ttlDias);
  const expSeg = finDelDiaBogotaSeg(venceEl);
  const token = firmarTokenRecepcion(recordId, expSeg, secreto);
  return { url: `${base}/recibir#${token}`, token, venceEl, expSeg };
}

/**
 * Verifica un token sin tocar Airtable. Solo pide los secretos: lo que ya se
 * emitió sigue verificando aunque falte la URL base o la sesión firmada, que son
 * condiciones para EMITIR.
 */
export function verificarEnlaceRecepcion(
  token: string,
  ahora: Date = new Date()
): ResultadoToken | { ok: false; motivo: 'no_configurado' } {
  const secretos = secretosVigentes();
  if (!secretos.length) return { ok: false, motivo: 'no_configurado' };
  return verificarTokenRecepcion(token, secretos, Math.floor(ahora.getTime() / 1000), VIGENCIA_MAXIMA_SEG);
}

/**
 * El paso `enlace` de un despacho (Blend o biochar), con la regla de una sola vez:
 *
 * - sin configuración y fuera de producción → `skipped`: en local no es una falla;
 * - sin configuración en producción → `ok:false`, que eleva la respuesta a 207:
 *   la remisión salió y nadie va a poder confirmarla por enlace;
 * - el mensaje nombra lo que falta, nunca un valor, y el detalle lleva la huella
 *   del token, no el token.
 */
export function pasoEnlaceRecepcion(
  recordId: string,
  ahora: Date = new Date()
): { paso: StepResult; enlace: EnlaceRecepcion | null } {
  const estado = recepcionConfigurada();
  if (!estado.ok) {
    const error = `Enlace de recepción no configurado: falta ${estado.falta.join(', ')}`;
    return {
      enlace: null,
      paso: esProduccion()
        ? { step: 'enlace', ok: false, error }
        : { step: 'enlace', ok: false, skipped: true, error },
    };
  }
  try {
    const enlace = crearEnlaceRecepcion(recordId, ahora);
    if (!enlace) return { enlace: null, paso: { step: 'enlace', ok: false, error: 'No se pudo emitir el enlace' } };
    return {
      enlace,
      paso: { step: 'enlace', ok: true, detail: { venceEl: enlace.venceEl, huella: huellaToken(enlace.token) } },
    };
  } catch (err) {
    return { enlace: null, paso: { step: 'enlace', ok: false, error: sanearError(err) } };
  }
}
