// src/lib/produccion-para-despacho.ts
//
// Cuánto Blend se puede producir AHORA para cubrir un pedido, y con qué.
//
// ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
// El Blend no se almacena esperando pedidos: se produce contra el pedido. Con el
// botón de despachar al lado del saldo, exigirle al operador que primero adivine
// cuánto producir, en otra pantalla, y vuelva a despachar, es pedirle que haga a
// mano la cuenta que la app ya tiene todos los datos para hacer —y equivocarse en
// esa cuenta significa producir de menos (otro viaje) o de más (Blend que nadie
// pidió, con biochar que ya no se puede vender puro).
//
// Este módulo NO escribe: resuelve el plan. Quien escribe es `runProduccionBlend()`,
// que ya sabe hacerlo y trae su propia idempotencia. Acá solo se decide CUÁNTO y
// DE CUÁLES BACHES, para poder mostrarlo antes de confirmar.
//
// ═══ LA CUENTA ════════════════════════════════════════════════════════════════
// La fórmula del Blend (`config.blend`) dice qué proporción del producto es cada
// componente: biochar 20%, abono 74%, agua 5%, biológicos 0,7%. De esos cuatro,
// solo el biochar y el abono están en este inventario —el agua y los biológicos no
// se llevan acá—, así que el techo de producción es el menor de los dos:
//
//   máximo producible = min(biochar / 0,20 ; abono / 0,74)
//
// ⚠️ Los cuatro porcentajes suman 99,7%, no 100 (decisión abierta con DataLab, §5
// de CLAUDE.md). No se fuerza el cuadre: los KG de Blend producidos son un dato
// PESADO, y acá solo se ESTIMA cuánto saldrá para poder planear. El número real lo
// confirma quien pesa.
//
// ═══ QUÉ BACHES ═══════════════════════════════════════════════════════════════
// LOS QUE DIGA EL OPERADOR. Quien despacha tiene las lonas delante y sabe de cuál
// sacó el biochar; la app no puede saberlo. Y el bache es la unidad de la
// contabilidad de carbono —`bache_origen_id` en cada Salida del Core es lo que
// sostiene "de qué bache salió cada kg"—, así que inventarlo es escribir una
// trazabilidad falsa que después nadie puede contradecir.
//
// Por eso `planearProduccionParaDespacho()` recibe los consumos ya elegidos, con
// sus KG pesados, y este módulo solo valida que alcancen. El reparto FIFO que
// había antes quedó como una propuesta editable del formulario: sugiere, no
// decide.

import { config } from './config';
import { fetchBachesConBiochar } from './baches-biochar';
import { getStockAbono } from './abono-inventario-core';

/** Restos de redondeo: por debajo de esto no hay nada que producir. */
const TOLERANCIA_KG = 0.01;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ConsumoBachePlan {
  codigo: string;
  /** KG de biochar que aportaría este bache. */
  kg: number;
  /** KG que tiene antes de la producción. */
  disponible: number;
}

export interface PlanProduccion {
  /** KG de Blend que se producirían. 0 = no se puede producir nada. */
  kgBlend: number;
  kgBiochar: number;
  kgAbono: number;
  baches: ConsumoBachePlan[];
  /** Lo máximo que daría el inventario completo, aunque el pedido pida menos. */
  kgMaximoProducible: number;
  /** Existencias con las que se hizo la cuenta. */
  biocharDisponible: number;
  abonoDisponible: number;
  /** Qué componente pone el techo, cuando el plan no cubre lo pedido. */
  limitante: 'biochar' | 'abono' | 'ninguno';
}

/** Lo que el operador marcó y pesó: qué bache y cuánto salió de él. */
export interface ConsumoBacheElegido {
  codigo: string;
  /** KG de biochar pesados de ese bache. */
  kg: number;
}

/**
 * La selección de baches no sirve para producir lo pedido.
 *
 * Va aparte de `DespachoInvalido` para que `despacho-blend.ts` no tenga que
 * adivinar por el texto si el problema fue del pedido o de los baches.
 */
export class SeleccionBachesInvalida extends Error {}

/**
 * Un pesaje real difiere de la fórmula en centésimas, no en múltiplos.
 *
 * El margen deja pasar la diferencia de balanza sin frenar al operador, y atrapa
 * el dedo gordo que digita 480 donde van 0,48 — que descontaría del inventario
 * mil veces el biochar del despacho, sin que nada falle: las fórmulas de Airtable
 * admiten negativos (§3 de CLAUDE.md) y el descuadre solo aparecería en el
 * siguiente conteo físico.
 */
const MARGEN_EXCESO_BIOCHAR = 1.1;

/**
 * Qué habría que producir para tener `kgObjetivo` de Blend, con lo que hay hoy.
 *
 * `elegidos` es lo que el operador marcó y pesó, y es lo que se va a descontar:
 * la fórmula solo decide si esa cantidad ALCANZA, no la reemplaza. Se valida que
 * cada bache exista, tenga ese saldo, y que la suma cubra el biochar que el Blend
 * necesita sin pasarse del margen de balanza.
 *
 * Si el inventario no alcanza devuelve el plan por lo que SÍ alcanza —un despacho
 * parcial es mejor que un viaje perdido— y dice cuál de los dos componentes es el
 * que limita, que es lo que el operador necesita para saber qué pedir.
 *
 * `kgBlend: 0` significa que no hay con qué producir; el plan igual trae las
 * existencias, para poder explicarlo en vez de mostrar un botón apagado.
 */
export async function planearProduccionParaDespacho(
  kgObjetivo: number,
  elegidos: ConsumoBacheElegido[]
): Promise<PlanProduccion> {
  const { pctBiochar, pctAbono } = config.blend;

  const [baches, abonoDisponible] = await Promise.all([
    fetchBachesConBiochar(),
    getStockAbono().then((kg) => kg ?? 0),
  ]);

  const biocharDisponible = r2(baches.reduce((total, b) => total + b.kg, 0));

  // El techo de cada componente, traducido a KG de producto terminado. Se calcula
  // sobre TODO el inventario, no sobre lo marcado: es lo que explica en pantalla
  // cuánto se podría producir si el operador marcara más baches.
  const topeBiochar = pctBiochar > 0 ? biocharDisponible / pctBiochar : 0;
  const topeAbono = pctAbono > 0 ? abonoDisponible / pctAbono : 0;
  const kgMaximoProducible = r2(Math.max(0, Math.min(topeBiochar, topeAbono)));

  const kgBlend = r2(Math.max(0, Math.min(kgObjetivo, kgMaximoProducible)));

  const vacio: PlanProduccion = {
    kgBlend: 0,
    kgBiochar: 0,
    kgAbono: 0,
    baches: [],
    kgMaximoProducible,
    biocharDisponible,
    abonoDisponible,
    limitante: topeBiochar <= topeAbono ? 'biochar' : 'abono',
  };
  // Sin nada que producir no se mira la selección: el despacho saldrá de bodega o
  // no saldrá, y quejarse de los baches acá confundiría el diagnóstico.
  if (kgBlend <= TOLERANCIA_KG) return vacio;

  const kgBiocharNecesario = r2(kgBlend * pctBiochar);
  const kgAbono = r2(kgBlend * pctAbono);

  const consumos = validarSeleccion(elegidos, baches, kgBiocharNecesario);

  return {
    kgBlend,
    kgBiochar: r2(consumos.reduce((t, b) => t + b.kg, 0)),
    kgAbono,
    baches: consumos,
    kgMaximoProducible,
    biocharDisponible,
    abonoDisponible,
    limitante:
      kgBlend + TOLERANCIA_KG >= kgObjetivo
        ? 'ninguno'
        : topeBiochar <= topeAbono
          ? 'biochar'
          : 'abono',
  };
}

/**
 * Que lo marcado sea despachable: baches reales, con saldo, y que sumen el
 * biochar que el Blend necesita.
 *
 * Cada fallo dice el número concreto, no "selección inválida": el operador está
 * en la bodega con el celular y tiene que poder corregir sin volver a la oficina.
 */
function validarSeleccion(
  elegidos: ConsumoBacheElegido[],
  baches: Awaited<ReturnType<typeof fetchBachesConBiochar>>,
  kgBiocharNecesario: number
): ConsumoBachePlan[] {
  if (!elegidos.length) {
    throw new SeleccionBachesInvalida(
      `Hay que producir ${kgBiocharNecesario} kg de biochar y no se eligió ningún bache. ` +
        'Marca de cuáles salió el biochar: es lo que queda como trazabilidad del lote.'
    );
  }

  const porCodigo = new Map(baches.map((b) => [b.codigo, b]));
  const vistos = new Set<string>();
  const consumos: ConsumoBachePlan[] = [];

  for (const elegido of elegidos) {
    const codigo = elegido.codigo?.trim();
    if (!codigo) throw new SeleccionBachesInvalida('Un bache llegó sin código.');

    // Repetido no se suma en silencio: dos filas del mismo bache casi siempre son
    // un doble clic, y sumarlas descontaría el doble.
    if (vistos.has(codigo)) {
      throw new SeleccionBachesInvalida(`El bache ${codigo} viene repetido en la selección.`);
    }
    vistos.add(codigo);

    const bache = porCodigo.get(codigo);
    if (!bache) {
      throw new SeleccionBachesInvalida(
        `El bache ${codigo} no tiene biochar disponible en bodega.`
      );
    }

    const kg = r2(Number(elegido.kg));
    if (!Number.isFinite(kg) || kg <= TOLERANCIA_KG) {
      throw new SeleccionBachesInvalida(`Los KG del bache ${codigo} deben ser mayores que cero.`);
    }
    if (kg > bache.kg + TOLERANCIA_KG) {
      throw new SeleccionBachesInvalida(
        `El bache ${codigo} solo tiene ${r2(bache.kg)} kg y se están sacando ${kg} kg.`
      );
    }

    consumos.push({ codigo, kg, disponible: r2(bache.kg) });
  }

  const kgMarcado = r2(consumos.reduce((t, b) => t + b.kg, 0));

  if (kgMarcado + TOLERANCIA_KG < kgBiocharNecesario) {
    throw new SeleccionBachesInvalida(
      `Los baches marcados aportan ${kgMarcado} kg de biochar y el Blend necesita ` +
        `${kgBiocharNecesario} kg. Faltan ${r2(kgBiocharNecesario - kgMarcado)} kg.`
    );
  }
  if (kgMarcado > kgBiocharNecesario * MARGEN_EXCESO_BIOCHAR + TOLERANCIA_KG) {
    throw new SeleccionBachesInvalida(
      `Los baches marcados aportan ${kgMarcado} kg de biochar para un Blend que necesita ` +
        `${kgBiocharNecesario} kg. Revisa los KG digitados: descontar de más deja el ` +
        'inventario de biochar por debajo de lo que hay en bodega.'
    );
  }

  return consumos;
}
