/**
 * Registra en Flujo de caja (`Remisiones Pirolisis` + `Productos Remisiones
 * Pirolisis`) las remisiones de PiroliApp que ya existen en Sirius Remisiones Core.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * Desde el 2026-10-22 la recepción por enlace deja la copia para finanzas como
 * último paso (`registrarRemisionFlujoCaja()`). Las remisiones anteriores nunca
 * llegaron, y las que se cierran a mano (firma en papel) no pasan por la
 * recepción: esto las trae. Pasa por el MISMO código que la recepción.
 *
 * Antes de escribir verifica el esquema: que los vínculos que se usan apunten a
 * las tablas de pirólisis y no a las del laboratorio, de las que se clonaron.
 *
 * Idempotente por `Numero Remision`: repetirlo actualiza, no duplica.
 *
 * Uso:
 *   npx tsx scripts/registrar-remisiones-flujo-caja.ts                        # dry-run, todas
 *   npx tsx scripts/registrar-remisiones-flujo-caja.ts --remision SIRIUS-REM-0228
 *   npx tsx scripts/registrar-remisiones-flujo-caja.ts [--remision …] --apply
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carga .env.local sin depender de `dotenv` (no está en package.json). */
function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    let contenido: string;
    try {
      contenido = readFileSync(resolve(process.cwd(), file), 'utf8');
    } catch {
      continue;
    }
    for (const linea of contenido.split(/\r?\n/)) {
      const match = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, clave, crudo] = match;
      if (process.env[clave] !== undefined) continue;
      process.env[clave] = crudo.trim().replace(/^(['"])([\S\s]*)\1$/, '$2');
    }
  }
}

const APPLY = process.argv.includes('--apply');

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  // `config.ts` lee el entorno al importarse: primero el entorno, después los módulos.
  loadEnvLocal();
  const { config } = await import('../src/lib/config');
  const { assertCodigoSimbolico } = await import('../src/lib/airtable-escape');
  const { resolverRemision } = await import('../src/lib/blend-remisiones-core');
  const { tipoRemision, remisionCrudaDeRegistro } = await import('../src/lib/remision-pirolisis.constants');
  const fc = await import('../src/lib/flujo-caja-remisiones');

  const baseId = config.airtable.remisionesCoreBaseId;
  const token = config.airtable.remisionesCoreToken;
  const tabla = config.airtable.remisionesCoreRemisionesTable;
  if (!baseId || !token || !tabla) throw new Error('Sirius Remisiones Core no configurado');

  const cfg = fc.flujoCajaConfig();
  if (!cfg) throw new Error(`Flujo de caja no configurado: falta ${fc.faltantesFlujoCaja().join(', ')}`);
  try {
    await fc.verificarEsquemaFlujoCaja(cfg);
    console.log('✓ Esquema de Flujo de caja verificado\n');
  } catch (err) {
    // Sin esquema verificado no se escribe; el ensayo sigue para mostrar qué iría.
    if (APPLY) throw err;
    console.log(`⚠️ No se pudo verificar el esquema (con --apply esto detiene todo): ${err instanceof Error ? err.message : err}\n`);
  }

  const unaSola = argumento('--remision');
  let codigos: string[];
  if (unaSola) {
    assertCodigoSimbolico(unaSola, 'código de remisión');
    codigos = [unaSola];
  } else {
    // Lectura completa y filtro en JS con `tipoRemision()`: en la tabla conviven
    // las del laboratorio, y el área sola no las distingue.
    const registros: { id: string; fields: Record<string, unknown> }[] = [];
    let offset: string | undefined;
    do {
      const url = new URL(`https://api.airtable.com/v0/${baseId}/${tabla}`);
      url.searchParams.set('pageSize', '100');
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(data)}`);
      registros.push(...data.records);
      offset = data.offset;
    } while (offset);
    codigos = registros
      .filter((r) => tipoRemision(remisionCrudaDeRegistro(r)))
      .map((r) => String(r.fields['ID'] ?? ''))
      .filter(Boolean)
      .sort();
  }

  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'} — ${codigos.length} remisión(es): ${codigos.join(', ') || '(ninguna)'}\n`);

  const precios = new Map<string, number | null>();
  let fallos = 0;
  for (const codigo of codigos) {
    const remision = await resolverRemision(codigo);
    if (!remision) {
      console.log(`✗ ${codigo}: no existe en el Core`);
      fallos++;
      continue;
    }
    const omitir = fc.motivoParaOmitir(remision);
    if (omitir) {
      console.log(`– ${codigo}: se omite (${omitir})`);
      continue;
    }
    if (!precios.has(remision.productoId)) precios.set(remision.productoId, await fc.precioCatalogo(remision.productoId));
    const precio = precios.get(remision.productoId);
    if (!precio) {
      console.log(`✗ ${codigo}: ${remision.productoId} no tiene Precio Venta Unitario en el catálogo`);
      fallos++;
      continue;
    }

    const filas = fc.filasFlujoCaja(remision, { precioUnitario: precio, urlDocumento: fc.urlDocumentoRemision(remision) });
    const linea = filas.producto;
    console.log(
      `• ${codigo} — ${remision.estado} · ${filas.remision['Nombre Cliente']} · ` +
        `${linea['Producto']} ${linea['Cantidad Kg']} kg × $${precio} · ` +
        `lleva: ${filas.remision['Nombre Lleva'] ?? '—'} · recibe: ${filas.remision['Nombre Recibe'] ?? '—'}`
    );
    if (!APPLY) continue;
    try {
      const r = await fc.escribirRemisionFlujoCaja(cfg, filas);
      console.log(`  ✓ ${r.accion}`);
    } catch (err) {
      console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
      fallos++;
    }
  }

  if (!APPLY && codigos.length) console.log('\nNada se escribió. Repetir con --apply para registrar.');
  if (fallos) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
