/**
 * Adjunta el PDF a las remisiones de Biochar Blend que no tienen documento en
 * Sirius Remisiones Core (`Documento Remision`).
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * Hasta el 2026-10-02 el PDF lo adjuntaba la firma digital del receptor. Al pasar
 * la firma a papel nadie lo hacía: la remisión quedaba en la tabla sin documento,
 * y el PDF solo existía dentro de PiroliApp, con sesión. Desde este cambio el
 * despacho lo adjunta al emitir (`adjuntarPdfRemision()`); esto es para las que
 * quedaron en medio, como SIRIUS-REM-0202.
 *
 * Pasa por el MISMO código que el despacho —`construirDatosPdf()` y el
 * generador—, no por una copia: un documento distinto según quién lo adjuntó
 * sería peor que ninguno.
 *
 * Idempotente: sin `--remision`, solo toca las que no tienen documento. Con
 * `--remision` lo REEMPLAZA aunque ya tenga uno (queda uno solo, el nuevo).
 *
 * Uso:
 *   npx tsx scripts/adjuntar-pdf-remisiones.ts                      # dry-run, todas las que falten
 *   npx tsx scripts/adjuntar-pdf-remisiones.ts --remision SIRIUS-REM-0202
 *   npx tsx scripts/adjuntar-pdf-remisiones.ts --remision SIRIUS-REM-0202 --guardar ./pdfs
 *   npx tsx scripts/adjuntar-pdf-remisiones.ts [--remision …] --apply
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
  const { resolverRemision, ESTADO_REMISION } = await import('../src/lib/blend-remisiones-core');
  const { construirDatosPdf, adjuntarPdfRemision } = await import('../src/lib/blend-remision-pdf');
  const { generateBlendRemisionPdf } = await import('../src/lib/blend-remision-pdf-generator');

  const baseId = config.airtable.remisionesCoreBaseId;
  const token = config.airtable.remisionesCoreToken;
  const tabla = config.airtable.remisionesCoreRemisionesTable;
  if (!baseId || !token || !tabla) throw new Error('Sirius Remisiones Core no configurado');

  const unaSola = argumento('--remision');
  const guardar = argumento('--guardar');
  let codigos: string[];

  if (unaSola) {
    assertCodigoSimbolico(unaSola, 'código de remisión');
    codigos = [unaSola];
  } else {
    // Lectura completa y filtro en JS: `Documento Remision` es un adjunto y la
    // marca `[lote:…]` es lo que distingue una de Blend de una del laboratorio.
    const registros: { fields: Record<string, unknown> }[] = [];
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
      .filter((r) => /\[lote:[A-Za-z0-9\-_]+\]/.test(String(r.fields['Notas de Remisión'] ?? '')))
      .filter((r) => r.fields['Estado'] !== ESTADO_REMISION.cancelada)
      .filter((r) => !(r.fields['Documento Remision'] as unknown[] | undefined)?.length)
      .map((r) => String(r.fields['ID'] ?? ''))
      .filter(Boolean)
      .sort();
  }

  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'} — ${codigos.length} remisión(es): ${codigos.join(', ') || '(ninguna)'}\n`);

  let fallos = 0;
  for (const codigo of codigos) {
    const remision = await resolverRemision(codigo);
    if (!remision) {
      console.log(`✗ ${codigo}: no existe en el Core`);
      fallos++;
      continue;
    }
    if (!remision.lotes.length) {
      console.log(`✗ ${codigo}: no es una remisión de Blend (sin marca [lote:…])`);
      fallos++;
      continue;
    }

    const datos = construirDatosPdf(remision);
    console.log(
      `• ${codigo} — ${datos.cliente} · ${datos.pedido_id} · ${datos.kg_total} kg · ` +
        `${remision.lote} · ${remision.estado} · transportista: ${datos.transportista?.nombre ?? '—'}`
    );

    if (guardar) {
      mkdirSync(guardar, { recursive: true });
      const archivo = join(guardar, `${codigo}.pdf`);
      writeFileSync(archivo, await generateBlendRemisionPdf(datos));
      console.log(`  PDF de revisión → ${archivo}`);
    }

    if (!APPLY) continue;
    const paso = await adjuntarPdfRemision(remision);
    if (paso.ok) console.log(`  ✓ adjuntado (${(paso.detail as { bytes: number }).bytes} bytes)`);
    else {
      console.log(`  ✗ ${paso.error}`);
      fallos++;
    }
  }

  if (!APPLY && codigos.length) console.log('\nNada se escribió. Repetir con --apply para adjuntar.');
  if (fallos) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
