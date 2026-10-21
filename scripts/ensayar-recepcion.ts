/**
 * Ensaya la recepción por enlace SIN escribir nada: arma los enlaces, los QR, los
 * PDF y el correo tal como saldrían, para revisarlos a ojo o escanearlos con el
 * celular.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * La recepción la usa alguien de afuera, en un celular, con un QR impreso. Eso no
 * se prueba con tests: hay que escanear el papel con la cámara de iOS, con Lens y
 * desde el navegador de WhatsApp, y ver que el `#` del enlace sobrevive. Este
 * script da el material sin tocar Airtable (con `--fixtures`) o leyendo una
 * remisión real (con `--remision`), nunca escribiendo.
 *
 * Solo lectura, siempre: no tiene `--apply` porque no hay nada que aplicar. No
 * importa ningún `*.server.ts` (corre fuera de Next).
 *
 * Uso:
 *   # 1) Servidor con datos de prueba y correo simulado:
 *   #    RECEPCION_FIXTURES=1 CORREO_MODO=simular CORREO_GUARDAR_EN=<dir> npx next dev -H 0.0.0.0
 *   # 2) Enlaces para el celular (la IP de la LAN, no localhost):
 *   npx tsx scripts/ensayar-recepcion.ts --fixtures --base http://192.168.1.20:3000
 *   npx tsx scripts/ensayar-recepcion.ts --fixtures --guardar ./ensayo        # + PDF, QR y correo
 *   # 3) Una remisión real (lectura): el PDF tal como está y el correo que saldría
 *   npx tsx scripts/ensayar-recepcion.ts --remision SIRIUS-REM-0204 --guardar ./ensayo
 *   npx tsx scripts/ensayar-recepcion.ts --remision SIRIUS-REM-0204 --como-pendiente --guardar ./ensayo
 *
 * ⚠️ Lo que se guarda con `--remision` lleva datos personales reales (nombre y
 * cédula en el PDF): una carpeta temporal fuera del repositorio, y se borra después.
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

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const tiene = (bandera: string) => process.argv.includes(bandera);

/** La base de los enlaces: `--base`, o la del entorno, o localhost. Sin barra final. */
function baseEnlaces(): string {
  const base = argumento('--base') || process.env.RECEPCION_URL_BASE || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = new URL(/^[a-z]+:\/\//i.test(base) ? base : `http://${base}`);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function guardarEn(dir: string | undefined, nombre: string, contenido: Uint8Array | string): void {
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, nombre), contenido);
  console.log(`   💾 ${join(dir, nombre)}`);
}

async function ensayarFixtures(guardar: string | undefined) {
  const fx = await import('../src/lib/recepcion/fixtures');
  const { generarPdfRemision } = await import('../src/lib/blend-remision-pdf');
  const { qrPng } = await import('../src/lib/recepcion/qr');
  const { correoRecepcion, datosCorreoDesdeRemision } = await import('../src/lib/recepcion/correo-recepcion');
  const { fechaBogota, sumarDiasFecha } = await import('../src/lib/fecha-bogota');

  const base = baseEnlaces();
  const ahora = new Date();
  const venceEl = sumarDiasFecha(fechaBogota(ahora), 7);
  console.log(`\n🔗 Enlaces de fixtures (base ${base}). El servidor debe correr con RECEPCION_FIXTURES=1.\n`);

  for (const r of fx.remisionesFixtures()) {
    const url = `${base}/recibir#${fx.tokenFixture(r.recordId, ahora)}`;
    console.log(`• ${r.codigo} · ${r.estado}`);
    console.log(`  ${url}`);
    const rb = fx.remisionBlendFixture(r.recordId)!;
    if (guardar) {
      guardarEn(guardar, `${r.codigo}.pdf`, await generarPdfRemision(rb, { enlace: { url, venceEl } }));
      guardarEn(guardar, `${r.codigo}-qr.png`, await qrPng(url));
    }
  }

  const vencido = `${base}/recibir#${fx.tokenFixture(fx.FIXTURE_IDS.blendPendiente, ahora, -2)}`;
  console.log(`• Enlace VENCIDO (debe dar 410)\n  ${vencido}`);
  console.log(`• Enlace ALTERADO (debe dar 404)\n  ${vencido.slice(0, -3)}xyz`);

  const c = fx.CEDULAS_FIXTURES;
  console.log('\n🪪 Cédulas de prueba:');
  console.log(`  ${c.transportista}  transportista sin correo → copia Receptor, correo solo a la copia`);
  console.log(`  ${c.receptorPrevio}  receptor previo del cliente, con correo → se reutiliza`);
  console.log(`  ${c.personalConCorreo}  personal del cliente con correo → copia Receptor`);
  console.log(`  ${c.personalSinCorreo}  personal del cliente sin correo → pide correo opcional`);
  console.log('  cualquier otra (5-15 caracteres) → registro de persona nueva');

  if (guardar) {
    const rb = fx.remisionBlendFixture(fx.FIXTURE_IDS.biocharEnTransito)!;
    const d = datosCorreoDesdeRemision(rb, { nombre: 'Carlos Simulado Ficticio', cedula: c.personalConCorreo }, ahora.toISOString());
    const { asunto, html } = correoRecepcion(d);
    guardarEn(guardar, 'correo-recepcion.html', html);
    console.log(`   ✉️  Asunto: ${asunto}`);
  }
}

async function ensayarRemision(codigo: string, comoPendiente: boolean, guardar: string | undefined) {
  const { assertCodigoSimbolico } = await import('../src/lib/airtable-escape');
  const { resolverRemision } = await import('../src/lib/blend-remisiones-core');
  const { generarPdfRemision } = await import('../src/lib/blend-remision-pdf');
  const { correoRecepcion, datosCorreoDesdeRemision } = await import('../src/lib/recepcion/correo-recepcion');
  const { firmarTokenRecepcion } = await import('../src/lib/recepcion/token');
  const { fechaBogota, finDelDiaBogotaSeg, sumarDiasFecha } = await import('../src/lib/fecha-bogota');
  const { secretoValido } = await import('../src/lib/sesion-firma');

  assertCodigoSimbolico(codigo, 'código de remisión');
  const leida = await resolverRemision(codigo);
  if (!leida) throw new Error(`No existe la remisión ${codigo}`);
  if (leida.tipo === 'ajena') throw new Error(`${codigo} no es de PiroliApp (Area Origen / marcas): no se ensaya`);
  console.log(`\n📄 ${leida.codigo} · ${leida.productoNombre} ${leida.kgTotal} kg · ${leida.estado}`);

  // `--como-pendiente`: la misma remisión como si todavía viajara, para ver el
  // bloque con QR. Es una copia en memoria: nada se escribe.
  const r = comoPendiente
    ? {
        ...leida,
        estado: 'En Tránsito',
        fechaRecibido: '',
        recibidaEn: null,
        correoEnviadoEn: null,
        personas: leida.personas.filter((p) => p.tipo !== 'Receptor'),
      }
    : leida;

  let enlace: { url: string; venceEl: string } | null = null;
  if (comoPendiente) {
    const secreto = process.env.RECEPCION_SECRET?.trim();
    if (secretoValido(secreto)) {
      const venceEl = sumarDiasFecha(fechaBogota(new Date()), 7);
      const token = firmarTokenRecepcion(r.recordId, finDelDiaBogotaSeg(venceEl), secreto);
      enlace = { url: `${baseEnlaces()}/recibir#${token}`, venceEl };
      // Un enlace auténtico de una remisión real: no se imprime, va solo en el PDF.
      console.log(`   🔐 Enlace firmado (vence el ${venceEl}); va solo en el QR del PDF.`);
    } else {
      console.log('   ⚠️  Sin RECEPCION_SECRET: el bloque de recepción sale sin QR.');
    }
  }

  const pdf = await generarPdfRemision(r, { enlace });
  console.log(`   PDF: ${pdf.byteLength} bytes`);
  guardarEn(guardar, `${r.codigo}${comoPendiente ? '-pendiente' : ''}.pdf`, pdf);

  if (!comoPendiente && r.estado === 'Entregada') {
    const receptor = r.personas
      .filter((p) => p.tipo === 'Receptor')
      .sort((a, b) => b.codigo.localeCompare(a.codigo, 'es', { numeric: true }))[0];
    const quien = receptor ?? r.personas.find((p) => p.tipo === 'Transportista');
    if (quien) {
      const d = datosCorreoDesdeRemision(r, { nombre: quien.nombre, cedula: quien.cedula }, r.recibidaEn ?? r.fechaRecibido);
      const { asunto, html } = correoRecepcion(d);
      console.log(`   ✉️  Asunto: ${asunto}`);
      guardarEn(guardar, `${r.codigo}-correo.html`, html);
    }
  }
}

async function main() {
  // `config.ts` lee el entorno al importarse: primero el entorno, después los módulos.
  loadEnvLocal();
  const guardar = argumento('--guardar');
  const codigo = argumento('--remision');

  if (tiene('--fixtures')) return ensayarFixtures(guardar);
  if (codigo) return ensayarRemision(codigo, tiene('--como-pendiente'), guardar);

  console.log('Uso: npx tsx scripts/ensayar-recepcion.ts [--fixtures | --remision CODIGO [--como-pendiente]] [--guardar <dir>] [--base <url>]');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
