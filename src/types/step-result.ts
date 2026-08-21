/**
 * Resultado de un paso en una operación que toca varias bases Core.
 *
 * No hay transacciones entre bases de Airtable: en vez de fallar en silencio,
 * cada paso captura su propio error y reporta aquí si se aplicó, si se saltó
 * (ya estaba escrito) o por qué falló. Los pasos best-effort elevan la
 * respuesta a 207 Multi-Status con el array de steps, para que el operador vea
 * qué quedó a medias.
 */
export interface StepResult {
  step: string;
  ok: boolean;
  /** El paso no hizo falta (ya estaba escrito, o no había nada que cambiar). */
  skipped?: boolean;
  detail?: unknown;
  error?: string;
}
