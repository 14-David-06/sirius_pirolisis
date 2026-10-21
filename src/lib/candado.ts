// src/lib/candado.ts
//
// Exclusión mutua en memoria, por clave.
//
// Airtable no tiene transacciones: dos despachos simultáneos podrían leer el
// mismo saldo de un bache y sacarle los mismos kg, y dos confirmaciones de la
// misma remisión podrían mandar dos correos. `conCandado('despacho-biochar', …)`
// o `conCandado('recepcion:' + recId, …)` hace que, dentro de una instancia, la
// segunda espere a que termine la primera y lea lo que esta escribió.
//
// ⚠️ Es POR INSTANCIA: dos funciones de Vercel no comparten memoria. Por eso los
// flujos además releen y verifican después de escribir; el candado reduce la
// ventana de la carrera, no la cierra.

/** Lo que espera una operación a que se libere la anterior antes de rendirse. */
const ESPERA_MAXIMA_MS = 30_000;

/**
 * Cola por clave: la promesa que se resuelve cuando termina el último que entró.
 * Se borra al quedar libre para que el mapa no crezca con cada remisión.
 */
const colas = new Map<string, Promise<void>>();

/**
 * La espera se agotó porque otra operación con la misma clave sigue en curso.
 * Se lanza en vez de seguir sin el candado: dos despachos a la vez es justo lo
 * que se quiere evitar. La ruta la traduce a «intente de nuevo».
 */
export class CandadoOcupado extends Error {
  constructor(readonly clave: string) {
    super(`Hay otra operación en curso sobre «${clave}». Intente de nuevo en unos segundos.`);
    this.name = 'CandadoOcupado';
  }
}

/**
 * Ejecuta `fn` cuando ninguna otra llamada con la misma `clave` esté corriendo, en
 * orden de llegada. Libera la clave aunque `fn` falle.
 *
 * La espera tiene tope (`esperaMaxMs`): un `fetch` colgado podría retener la
 * clave varios minutos, y sin tope cada despacho siguiente de esa instancia se
 * quedaría esperando hasta que lo mate el `maxDuration` de la ruta, sin decir por qué.
 */
export async function conCandado<T>(
  clave: string,
  fn: () => Promise<T>,
  opciones: { esperaMaxMs?: number } = {}
): Promise<T> {
  const anterior = colas.get(clave);
  let liberar!: () => void;
  const propia = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  // El siguiente espera a que terminen el anterior Y esta: si esta se rinde por
  // tiempo, el siguiente sigue esperando al que de verdad tiene la clave.
  const cola = (anterior ?? Promise.resolve()).then(() => propia);
  colas.set(clave, cola);

  try {
    if (anterior) await esperar(anterior, clave, opciones.esperaMaxMs ?? ESPERA_MAXIMA_MS);
    return await fn();
  } finally {
    liberar();
    // Se limpia cuando la COLA termina, no al salir: si esta llamada se rindió por
    // tiempo, el anterior sigue con la clave y borrarla ya dejaría entrar al
    // siguiente sin esperarlo.
    void cola.then(() => {
      if (colas.get(clave) === cola) colas.delete(clave);
    });
  }
}

async function esperar(anterior: Promise<void>, clave: string, maxMs: number): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => reject(new CandadoOcupado(clave)), maxMs);
  });
  try {
    await Promise.race([anterior, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}
