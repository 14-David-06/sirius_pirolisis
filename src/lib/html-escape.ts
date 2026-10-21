// src/lib/html-escape.ts
//
// Escape de texto que se interpola en HTML (el correo de recepción).
//
// Ese HTML lleva valores que escribió alguien de afuera —el nombre de quien
// recibe, las observaciones del despacho, el nombre comercial del cliente— y sale
// con la marca de Sirius. Sin escape, un nombre con `<a href=…>` pondría un enlace
// en un correo legítimo de la empresa. Hasta 2026-10 no había ningún escape HTML
// en el proyecto: el notificador que se borró interpolaba todo tal cual.

const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa `& < > " '`, suficiente para el contenido de un elemento y para un
 * atributo entre comillas. `null`/`undefined` → cadena vacía.
 *
 * No sirve para meter texto dentro de `<script>`, `<style>` ni de una URL: el
 * correo no lleva ninguno de los tres con datos dinámicos, y así debe seguir.
 */
export function escapeHtml(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}
