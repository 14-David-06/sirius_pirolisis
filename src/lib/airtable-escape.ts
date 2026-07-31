// src/lib/airtable-escape.ts
//
// Escape de valores que van dentro de un `filterByFormula` de Airtable.
//
// ⚠️ POR QUÉ EXISTE: una fórmula de Airtable se arma por concatenación de texto,
// así que un valor sin escapar es inyección de fórmula. El caso peligroso no es
// hipotético: la firma de una remisión es un endpoint PÚBLICO y sin autenticar
// (el cliente lo abre desde el celular en la finca), y busca a la persona por
// cédula con `{Cedula} = '...'`. Una cédula con una comilla rompe la fórmula, y
// una construida a propósito cambia a quién se está consultando.
//
// El patrón `valor.replace(/'/g, "\\'")` que había disperso por las rutas es
// insuficiente: no escapa la barra invertida, así que un valor terminado en `\`
// se come la comilla de cierre.

/**
 * Escapa un valor para interpolarlo dentro de comillas simples en una
 * `filterByFormula`.
 *
 * Orden importante: la barra invertida PRIMERO. Si se escapan las comillas antes,
 * la barra que se acaba de agregar se volvería a escapar y el resultado quedaría
 * mal (`\'` → `\\'`, que en la fórmula es una barra literal más un fin de cadena).
 *
 * @example
 *   `{Cedula} = '${escapeAirtableValue(cedula)}'`
 */
export function escapeAirtableValue(valor: unknown): string {
  return String(valor ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

/**
 * Igual que `escapeAirtableValue` pero además valida el formato de un código
 * simbólico Sirius (`SIRIUS-PED-0001`, `CL-0003`, `BLEND-2026-06-24`, …).
 *
 * Se usa cuando el valor viene de la URL o de un body público: si no parece un
 * código, es mejor rechazar la consulta que dejar pasar texto arbitrario a una
 * fórmula, aunque vaya escapado.
 *
 * @throws Si el valor tiene caracteres fuera de `[A-Za-z0-9-_]`.
 */
export function assertCodigoSimbolico(valor: string, nombreCampo = 'código'): string {
  if (!/^[A-Za-z0-9\-_]{1,64}$/.test(valor)) {
    throw new Error(`El ${nombreCampo} "${valor}" no tiene un formato válido`);
  }
  return valor;
}

/** `true` si el identificador es un record ID de Airtable y no un código legible. */
export function esRecordId(valor: string): boolean {
  return /^rec[A-Za-z0-9]{14}$/.test(valor);
}
