// src/lib/recepcion/qr.ts
//
// El QR del enlace de recepción: en PNG para el PDF y como data URL para la UI.
//
// Se genera aquí, en memoria, y NO con `/api/generate-qr`: esa ruta es pública y
// sube la imagen a S3 con la URL en los metadatos, y esta URL lleva el token, que
// es una credencial.

import QRCode from 'qrcode';

/**
 * Corrección de errores M: aguanta un papel doblado o manchado sin que el código
 * crezca tanto como con Q o H. 384 px alcanza para imprimirlo a 96 pt sin que se
 * pixele, y el margen de 1 módulo lo deja ocupar su recuadro.
 */
const OPCIONES = { errorCorrectionLevel: 'M', margin: 1, width: 384 } as const;

/** Un enlace de recepción mide ~90 caracteres: lo de más no es uno. */
const LARGO_MAXIMO = 512;

function enlaceValido(url: string): string {
  if (typeof url !== 'string' || url.length > LARGO_MAXIMO || !/^https?:\/\/\S+$/.test(url)) {
    throw new Error('El QR solo se genera para un enlace http(s)');
  }
  return url;
}

/** PNG del QR, para incrustarlo en el PDF de la remisión. */
export async function qrPng(url: string): Promise<Uint8Array> {
  const png = await QRCode.toBuffer(enlaceValido(url), { ...OPCIONES, type: 'png' });
  return new Uint8Array(png);
}

/** `data:image/png;base64,…`, para mostrarlo en la UI sin otra petición. */
export async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(enlaceValido(url), { ...OPCIONES, type: 'image/png' });
}
