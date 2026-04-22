// src/application/services/EUseCalculator.ts
// Lógica pura de cálculo eUse — compartida entre Calcular y Preview use cases.

import {
  EUseConstantes,
  EUseRemisionDetalle,
  EUseRemisionRaw,
  EUseClienteDistancia,
  EUseResumen,
  TipoVehiculo,
} from '../../domain/entities/EUseCalculo';

const round = (n: number) => Math.round(n * 1000000) / 1000000;

function normalizar(s: string): string {
  return (s || '').trim().toLowerCase();
}

/**
 * Cruce robusto cliente↔distancia.
 * 1. Match exacto case-insensitive + trim.
 * 2. Si no, includes() bidireccional (uno contiene al otro) — soporta sufijos legales.
 * 3. Si nada match → null.
 */
export function buscarDistanciaCliente(
  nombreRemision: string,
  clientes: EUseClienteDistancia[]
): EUseClienteDistancia | null {
  const target = normalizar(nombreRemision);
  if (!target) return null;

  // 1. Exacto
  for (const c of clientes) {
    if (normalizar(c.nombre) === target) return c;
  }

  // 2. Bidireccional includes()
  for (const c of clientes) {
    const n = normalizar(c.nombre);
    if (!n) continue;
    if (n.includes(target) || target.includes(n)) return c;
  }

  return null;
}

export interface EUseCalculoOutput {
  desglose: EUseRemisionDetalle[];
  resumen: EUseResumen;
}

export class EUseCalculadorError extends Error {
  constructor(public readonly remisionesSinMatch: { remision_id: string; cliente: string; remision_numero: string }[]) {
    super(
      `No se pudo calcular eUse: ${remisionesSinMatch.length} remisión(es) sin distancia registrada en Clientes. ` +
      `Detalle: ${remisionesSinMatch.map(r => `[${r.remision_numero || r.remision_id} → "${r.cliente}"]`).join(', ')}`
    );
    this.name = 'EUseCalculadorError';
  }
}

/**
 * Aplica reglas eUse a una lista de remisiones y un catálogo de clientes con distancia.
 * Lanza EUseCalculadorError si alguna remisión no tiene match — nunca calcula con distancia 0.
 */
export function calcularEUse(
  remisiones: EUseRemisionRaw[],
  clientes: EUseClienteDistancia[],
  constantes: EUseConstantes
): EUseCalculoOutput {
  const sinMatch: { remision_id: string; cliente: string; remision_numero: string }[] = [];
  const desglose: EUseRemisionDetalle[] = [];

  let remisionesLiviano = 0;
  let remisionesPesado = 0;
  let emisionesLivianoKg = 0;
  let emisionesPesadoKg = 0;

  for (const r of remisiones) {
    const cliente = buscarDistanciaCliente(r.cliente, clientes);
    if (!cliente) {
      sinMatch.push({
        remision_id: r.remision_id,
        remision_numero: r.remision_numero,
        cliente: r.cliente,
      });
      continue;
    }

    const ton = r.kg_despachados / 1000;
    const tipo: TipoVehiculo = ton <= constantes.umbral_ton ? 'liviano' : 'pesado';
    const fe = tipo === 'liviano' ? constantes.fe_euse_liviano : constantes.fe_euse_pesado;
    const emisiones = ton * cliente.distancia_km * fe;

    if (tipo === 'liviano') {
      remisionesLiviano++;
      emisionesLivianoKg += emisiones;
    } else {
      remisionesPesado++;
      emisionesPesadoKg += emisiones;
    }

    desglose.push({
      remision_id: r.remision_id,
      remision_numero: r.remision_numero,
      cliente: r.cliente,
      cliente_match: cliente.nombre,
      fecha_evento: r.fecha_evento,
      kg_despachados: round(r.kg_despachados),
      ton_despachados: round(ton),
      distancia_km: cliente.distancia_km,
      tipo_vehiculo: tipo,
      factor_emision_usado: fe,
      emisiones_kg: round(emisiones),
    });
  }

  if (sinMatch.length > 0) {
    throw new EUseCalculadorError(sinMatch);
  }

  const emisionesTotalKg = emisionesLivianoKg + emisionesPesadoKg;

  const resumen: EUseResumen = {
    remisiones_liviano: remisionesLiviano,
    remisiones_pesado: remisionesPesado,
    emisiones_liviano_kg: round(emisionesLivianoKg),
    emisiones_pesado_kg: round(emisionesPesadoKg),
    emisiones_total_kg: round(emisionesTotalKg),
    emisiones_total_ton: round(emisionesTotalKg / 1000),
  };

  return { desglose, resumen };
}
