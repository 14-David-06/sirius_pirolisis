import { escapeAirtableValue } from '@/lib/airtable-escape';
import type { StepResult } from '@/lib/blend-deduction';

/**
 * Creación automática de un Balance de Masa desde la telemetría del tablero.
 *
 * El script del tablero copia `Registro_Proceso.xlsx` y lo reenvía cada pocos
 * minutos. De ese archivo se toma SOLO la última fila y se crea UN balance.
 *
 * El balance no se escribe a mano aquí: se delega en `POST /api/balance-masa/create`,
 * el mismo camino que usa el formulario. Eso importa porque crear el balance no es
 * insertar una fila — arrastra la agrupación en baches (a las 20 lonas cierra el
 * bache, auto-deduce un Big Bag y abre el siguiente) y la trazabilidad del paquete
 * de lonas. Duplicar esa lógica aquí la dejaría divergir del formulario.
 *
 * Por eso mismo la deduplicación es obligatoria: sin ella, un archivo reenviado 12
 * veces por hora inflaría el bache y dispararía cierres y deducciones de inventario
 * que nunca ocurrieron en planta.
 */

/**
 * Cada balance de masa corresponde a una lona de 25 kg (decisión de David,
 * 2026-08-11). El Excel del tablero es telemetría del PLC y no trae el peso, así
 * que es constante y no un dato del archivo.
 */
export const PESO_BIOCHAR_LONA_KG = 25;

/** Campo llave de deduplicación en `Balances Masa`. */
const CAMPO_FECHA_HORA = 'Fecha Hora Registro';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_GLOBAL_TOKEN;
const AIRTABLE_BALANCE_MASA_TABLE = process.env.AIRTABLE_BALANCE_MASA_TABLE;
const AIRTABLE_TURNOS_TABLE = process.env.AIRTABLE_TURNOS_TABLE_ID || 'Turno Pirolisis';

export interface ResultadoBalanceDesdeRegistro {
  ok: boolean;
  balanceId: string | null;
  /** true si la fila ya se había ingresado antes: no se creó nada. */
  yaExistia: boolean;
  fechaHora: string | null;
  turnoId: string | null;
  pesoBiochar: number;
  steps: StepResult[];
  /** Advertencias propagadas por `/api/balance-masa/create` (lonas, Big Bag). */
  warnings?: Record<string, boolean>;
}

type ValorCelda = string | number | boolean | null;

/** Lo que se manda a `/api/balance-masa/create`, con los nombres que ese endpoint espera. */
interface DatosBalance {
  pesoBiochar: number;
  temperaturaR1: number;
  temperaturaR2: number;
  temperaturaR3: number;
  temperaturaH1?: number;
  temperaturaH2?: number;
  temperaturaH3?: number;
  temperaturaH4?: number;
  realizaRegistro: string;
  turnoPirolisis?: string[];
}

/** Telemetría que no viaja en el create: se escribe en un PATCH posterior. */
interface CamposTelemetria {
  [CAMPO_FECHA_HORA]: string;
  KW?: number;
  KWH?: number;
  'Temp Gas'?: number;
  'Flujo Gas'?: number;
  'Totalizador Gas'?: number;
}

export class RegistroInvalidoError extends Error {}

function apiUrl(tabla: string, query = ''): string {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tabla)}${query}`;
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
}

/**
 * Los valores llegan del PLC en float32 (438.89251708984375). Los campos de
 * Airtable son `precision: 2`; redondear aquí evita guardar ruido que la UI
 * mostraría truncado de todas formas.
 */
function numero(valor: ValorCelda): number | undefined {
  if (typeof valor === 'number' && Number.isFinite(valor)) return Math.round(valor * 100) / 100;
  if (typeof valor === 'string') {
    const n = Number(valor.replace(',', '.'));
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return undefined;
}

function fechaHoraISO(valor: ValorCelda): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new RegistroInvalidoError(
      `La última fila no tiene "Fecha Hora"; sin ella no hay llave de deduplicación y el balance se duplicaría en cada envío.`
    );
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new RegistroInvalidoError(`"Fecha Hora" no es una fecha válida: ${valor}`);
  }
  return fecha.toISOString();
}

/**
 * Busca un balance ya ingresado para ese instante.
 *
 * `IS_SAME(..., 'second')` y no una igualdad de texto porque Airtable devuelve el
 * dateTime en su propia normalización, que no coincide carácter a carácter con el
 * ISO que se envió.
 */
async function buscarBalanceExistente(fechaISO: string): Promise<string | null> {
  const formula = `IS_SAME({${CAMPO_FECHA_HORA}}, DATETIME_PARSE('${escapeAirtableValue(fechaISO)}'), 'second')`;
  const url = apiUrl(
    AIRTABLE_BALANCE_MASA_TABLE!,
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`
  );

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Error consultando balances existentes: ${await res.text()}`);
  }
  const data = await res.json();
  return data.records?.[0]?.id ?? null;
}

/**
 * Turno abierto = tiene inicio y no tiene fin. Misma fórmula que `/api/turno/check`,
 * pero sin filtrar por usuario: el tablero no tiene sesión.
 *
 * Devuelve también el operador porque es quien firma el balance: el ingreso es
 * automático, pero la responsabilidad del registro es de quien está en planta.
 */
export async function resolverTurnoAbierto(): Promise<{ id: string; operador: string | null } | null> {
  const formula = `AND({Fecha Inicio Turno} != BLANK(), {Fecha Fin Turno} = BLANK())`;
  const url = apiUrl(
    AIRTABLE_TURNOS_TABLE,
    `?filterByFormula=${encodeURIComponent(formula)}` +
      `&sort%5B0%5D%5Bfield%5D=Fecha%20Inicio%20Turno&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=1`
  );

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const turno = data.records?.[0];
  if (!turno) return null;

  const operador = turno.fields?.Operador;
  return { id: turno.id, operador: typeof operador === 'string' && operador.trim() ? operador.trim() : null };
}

function mapear(valores: Record<string, ValorCelda>): {
  datos: Omit<DatosBalance, 'turnoPirolisis'>;
  telemetria: CamposTelemetria;
} {
  const r1 = numero(valores.R1);
  const r2 = numero(valores.R2);
  const r3 = numero(valores.R3);

  // El create rechaza el balance sin las tres de reactor: mejor un error legible aquí.
  if (r1 === undefined || r2 === undefined || r3 === undefined) {
    throw new RegistroInvalidoError(
      `La última fila no trae las tres temperaturas de reactor (R1=${valores.R1}, R2=${valores.R2}, R3=${valores.R3}).`
    );
  }

  const telemetria: CamposTelemetria = { [CAMPO_FECHA_HORA]: fechaHoraISO(valores['Fecha Hora']) };
  // Se omite la clave cuando el PLC no reportó el valor: mandar null borraría el campo.
  const kw = numero(valores.KW);
  const kwh = numero(valores.KWH);
  const tempGas = numero(valores['Temp Gas']);
  const flujoGas = numero(valores['Flujo Gas']);
  const totalizadorGas = numero(valores['Totalizador Gas']);
  if (kw !== undefined) telemetria.KW = kw;
  if (kwh !== undefined) telemetria.KWH = kwh;
  if (tempGas !== undefined) telemetria['Temp Gas'] = tempGas;
  if (flujoGas !== undefined) telemetria['Flujo Gas'] = flujoGas;
  if (totalizadorGas !== undefined) telemetria['Totalizador Gas'] = totalizadorGas;

  return {
    datos: {
      pesoBiochar: PESO_BIOCHAR_LONA_KG,
      temperaturaR1: r1,
      temperaturaR2: r2,
      temperaturaR3: r3,
      temperaturaH1: numero(valores.H1),
      temperaturaH2: numero(valores.H2),
      temperaturaH3: numero(valores.H3),
      temperaturaH4: numero(valores.H4),
      // `Temperatura Ducto (G9)` no viaja: el archivo del tablero no trae esa columna.
      realizaRegistro: '',
    },
    telemetria,
  };
}

export interface OpcionesBalance {
  /** Queda en `Realiza Registro`. */
  realizaRegistro?: string;
  /** Devuelve el plan sin escribir nada. */
  dryRun?: boolean;
}

export async function crearBalanceDesdeRegistro(
  valores: Record<string, ValorCelda>,
  opciones: OpcionesBalance = {}
): Promise<ResultadoBalanceDesdeRegistro> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_BALANCE_MASA_TABLE) {
    throw new Error(
      'Configuración de Airtable incompleta: faltan AIRTABLE_BASE_ID, AIRTABLE_TOKEN o AIRTABLE_BALANCE_MASA_TABLE'
    );
  }

  const { datos, telemetria } = mapear(valores);
  const fechaHora = telemetria[CAMPO_FECHA_HORA];

  const steps: StepResult[] = [];
  const base = {
    fechaHora,
    pesoBiochar: PESO_BIOCHAR_LONA_KG,
    turnoId: null as string | null,
    warnings: undefined as Record<string, boolean> | undefined,
  };

  // 1. Deduplicación — ANTES de cualquier escritura.
  const existente = await buscarBalanceExistente(fechaHora);
  if (existente) {
    steps.push({
      step: 'deduplicacion',
      ok: true,
      skipped: true,
      detail: `Ya existe el balance ${existente} para ${fechaHora}: no se crea nada.`,
    });
    return { ok: true, balanceId: existente, yaExistia: true, steps, ...base };
  }
  steps.push({ step: 'deduplicacion', ok: true, detail: `Sin balance previo para ${fechaHora}` });

  // 2. Turno abierto — best-effort: un balance sin turno es recuperable, perderlo no.
  let turno: { id: string; operador: string | null } | null = null;
  try {
    turno = await resolverTurnoAbierto();
    steps.push({
      step: 'turno_abierto',
      ok: true,
      skipped: !turno,
      detail: turno
        ? { turnoId: turno.id, operador: turno.operador }
        : 'No hay turno abierto: el balance queda sin vincular.',
    });
  } catch (error) {
    steps.push({
      step: 'turno_abierto',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const turnoId = turno?.id ?? null;
  base.turnoId = turnoId;

  // El balance lo firma quien está de turno, no el proceso que lo ingirió: el dato
  // entra solo, pero la responsabilidad del registro es de quien está en planta.
  // Sin turno abierto no hay a quién atribuirlo y queda explícito en vez de inventado.
  datos.realizaRegistro =
    opciones.realizaRegistro?.trim() || turno?.operador || 'Sin turno abierto';

  if (opciones.dryRun) {
    steps.push({
      step: 'dry_run',
      ok: true,
      skipped: true,
      detail: { datos: { ...datos, turnoPirolisis: turnoId ? [turnoId] : [] }, telemetria },
    });
    return { ok: true, balanceId: null, yaExistia: false, steps, ...base };
  }

  // 3. Crear el balance por el camino normal de la app (crítico).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const createRes = await fetch(`${appUrl}/api/balance-masa/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...datos, turnoPirolisis: turnoId ? [turnoId] : [] }),
  });
  const createBody = await createRes.json().catch(() => ({}));

  if (!createRes.ok || !createBody?.balanceId) {
    steps.push({
      step: 'crear_balance',
      ok: false,
      error: createBody?.error || createBody?.details || `HTTP ${createRes.status}`,
    });
    return { ok: false, balanceId: null, yaExistia: false, steps, ...base };
  }

  const balanceId: string = createBody.balanceId;
  base.warnings = createBody.warnings;
  steps.push({ step: 'crear_balance', ok: true, detail: balanceId });

  // 4. Escribir la telemetría y la llave de deduplicación.
  //    Si esto falla, el balance queda creado pero SIN llave, así que el próximo
  //    envío del mismo archivo lo duplicaría. Por eso el paso es crítico para el
  //    resultado (207) aunque el balance ya exista: hay que reintentar o escribir
  //    la fecha a mano.
  const patchRes = await fetch(apiUrl(AIRTABLE_BALANCE_MASA_TABLE, `/${balanceId}`), {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields: telemetria }),
  });

  if (!patchRes.ok) {
    steps.push({
      step: 'telemetria',
      ok: false,
      error: `El balance ${balanceId} quedó sin ${CAMPO_FECHA_HORA}: el próximo envío lo duplicará. ${await patchRes.text()}`,
    });
    return { ok: false, balanceId, yaExistia: false, steps, ...base };
  }

  steps.push({ step: 'telemetria', ok: true, detail: telemetria });
  return { ok: true, balanceId, yaExistia: false, steps, ...base };
}
