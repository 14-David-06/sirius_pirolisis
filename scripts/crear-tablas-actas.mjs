#!/usr/bin/env node
/**
 * Crea en PiroliApp las dos tablas del Acta de Entrega de Biochar:
 * `Receptores Biochar` y `Actas Entrega Biochar`.
 *
 * POR QUÉ EN PIROLIAPP Y NO EN UN CORE: el acta es evidencia metodológica de la
 * planta de pirólisis (numeral 5.4.2 de la Puro Biochar Methodology), no un
 * documento comercial. Meterla en Pedidos/Remisiones Core mezclaría entregas sin
 * contraprestación con los reportes de venta.
 *
 * ⚠️ LÍMITES DE LA API DE AIRTABLE que condicionan el diseño:
 *   - No se pueden crear campos computados: ni `formula` ni `autoNumber`
 *     (`UNSUPPORTED_FIELD_TYPE_FOR_CREATE`). Por eso el consecutivo NO es un
 *     autoNumber: `ID Acta` es un texto que la app calcula como el mayor
 *     consecutivo existente + 1, verificando que no esté tomado antes de escribir.
 *     Es aceptable porque las actas se crean de una en una y a mano; si algún día
 *     se crean en paralelo, la defensa es agregar un autoNumber DESDE LA UI (eso sí
 *     se puede) y leerlo en vez de calcularlo.
 *   - Los campos no se pueden BORRAR por API: equivocarse aquí se arregla a mano
 *     desde la UI. De ahí el --dry-run.
 *
 * Es idempotente: si una tabla ya existe, no la toca; si le faltan campos, los
 * agrega. Correrlo dos veces no rompe nada.
 *
 * Uso:
 *   node scripts/crear-tablas-actas.mjs           # dry-run
 *   node scripts/crear-tablas-actas.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const AT = 'https://api.airtable.com/v0';

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) throw new Error('No se encontró .env.local en el directorio actual');
  const env = {};
  for (const linea of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const TOKEN = env.AIRTABLE_GLOBAL_TOKEN;
const BASE = env.AIRTABLE_BASE_ID;
if (!TOKEN || !BASE) throw new Error('Faltan AIRTABLE_GLOBAL_TOKEN o AIRTABLE_BASE_ID en .env.local');

const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const sel = (...opciones) => ({
  type: 'singleSelect',
  options: { choices: opciones.map((name) => ({ name })) },
});
const txt = { type: 'singleLineText' };
const memo = { type: 'multilineText' };
const nro = (precision = 2) => ({ type: 'number', options: { precision } });
const fecha = { type: 'date', options: { dateFormat: { name: 'iso' } } };

/** Categorías de uso previsto de la Tabla 3.2 (Puro Biochar Methodology 2025 V2). */
const CATEGORIAS_USO = [
  'AF1/AF2 — Enmienda de suelo agrícola aplicada directamente (uso final)',
  'AF3 — Sustrato de cultivo en maceta, vivero o invernadero (uso en cascada)',
  'AF4 — Sustrato de plantación forestal para producción de plántulas',
  'Otro',
];

const TABLAS = [
  {
    name: 'Receptores Biochar',
    description:
      'Terceros que reciben biochar sin contraprestación comercial (universidades, ONG, agricultores). ' +
      'No son clientes de Sirius Clients Core: una donación no genera pedido ni factura.',
    fields: [
      { name: 'Nombre Receptor', ...txt },
      {
        name: 'Tipo Receptor',
        ...sel('Universidad', 'Centro de investigación', 'ONG', 'Agricultor individual', 'Empresa', 'Otro'),
      },
      { name: 'Persona Contacto', ...txt },
      { name: 'Documento Identificacion', ...txt, description: 'NIT o cédula del receptor.' },
      { name: 'Direccion', ...txt },
      { name: 'Municipio', ...txt },
      { name: 'Departamento', ...txt },
      { name: 'Telefono', ...txt },
      { name: 'Correo', type: 'email' },
      {
        name: 'Es Intermediario',
        type: 'checkbox',
        options: { icon: 'check', color: 'greenBright' },
        description:
          'Redistribuye el biochar entre usuarios finales. Obliga a mantener trazabilidad ' +
          'por porción (sección 6 del acta).',
      },
      { name: 'Observaciones', ...memo },
      { name: 'Realiza Registro', ...txt },
    ],
  },
  {
    name: 'Actas Entrega Biochar',
    description:
      'Acta de entrega de biochar para investigación, ensayo de campo, piloto o donación, sin ' +
      'contraprestación comercial. Evidencia del uso previsto declarado (numeral 5.4.2 Puro Biochar ' +
      'Methodology 2022 V3 / numeral 3.6 Edition 2025 V2). NO es una remisión ni un pedido.',
    fields: [
      // 1. Identificación del acta
      {
        name: 'ID Acta',
        ...txt,
        description:
          'ACTA-BC-XXXX. Consecutivo calculado por la app (la API no permite crear autoNumber).',
      },
      { name: 'Fecha Entrega', ...fecha },
      { name: 'Elaborado Por', ...txt },
      { name: 'Cargo Elaborado Por', ...txt },
      { name: 'ID Responsable Core', ...txt, description: 'SIRIUS-PER-XXXX de Nomina Core (FK simbólica).' },
      {
        name: 'Estado Acta',
        ...sel('Borrador', 'Generada', 'Firmada', 'Atestada', 'Anulada'),
        description:
          'El inventario se descuenta al GENERAR el acta, no al firmar: el biochar ya salió ' +
          'físicamente. Atestada = el receptor entregó la Atestación de Uso posterior.',
      },

      // 2. Lote entregado
      { name: 'Tipo Biochar', ...sel('Biochar Puro', 'Biochar Blend') },
      {
        name: 'Lote Entregado',
        ...txt,
        description: 'Códigos de bache (S-00XXX) para puro, o lote BLEND-… para blend. FK simbólica.',
      },
      { name: 'Detalle Por Bache', ...memo, description: 'KG tomados de cada bache: S-00171=487.78' },
      { name: 'Vinculo Registro Produccion', type: 'url' },
      { name: 'Cantidad Entregada KG', ...nro(2), description: 'Lo que declaró el operador, en la base indicada.' },
      {
        name: 'Base Cantidad',
        ...sel('Seca', 'Húmeda'),
        description:
          'El inventario se lleva en masa SECA. Si la entrega se pesó húmeda, la app convierte con ' +
          'la humedad del lote antes de descontar.',
      },
      { name: 'Cantidad Seca KG', ...nro(2), description: 'Lo realmente descontado del inventario.' },
      { name: 'Cantidad Humeda KG', ...nro(2) },
      { name: 'Humedad Lote Pct', ...nro(2) },
      { name: 'CO2 Secuestrado KG', ...nro(4), description: 'Informativo. Los CORCs NO se transfieren (sección 7).' },

      // 3. Receptor
      {
        name: 'Receptor',
        type: 'multipleRecordLinks',
        options: { linkedTableId: '__RECEPTORES__' },
      },
      { name: 'Actua Como Intermediario', type: 'checkbox', options: { icon: 'check', color: 'yellowBright' } },

      // 4. Proyecto y uso previsto
      { name: 'Nombre Proyecto', ...txt },
      { name: 'Ubicacion Aplicacion', ...txt },
      { name: 'Coordenadas GPS', ...txt },
      { name: 'Categoria Uso Previsto', ...sel(...CATEGORIAS_USO) },
      { name: 'Categoria Uso Otro', ...txt },
      { name: 'Fecha Estimada Aplicacion', ...fecha },
      { name: 'Duracion Estimada Ensayo', ...txt },

      // Evidencia y documento
      {
        name: 'Registro Fotografico Entrega',
        type: 'multipleAttachments',
        description: 'Fotos de la entrega, capturadas en el formulario ANTES de firmar.',
      },
      { name: 'Documento Acta', type: 'multipleAttachments' },
      { name: 'URL Documento Acta', type: 'url' },
      { name: 'Firma Sirius', type: 'multipleAttachments' },
      { name: 'Nombre Firma Sirius', ...txt },
      { name: 'Cargo Firma Sirius', ...txt },
      { name: 'Firma Receptor', type: 'multipleAttachments' },
      { name: 'Nombre Firma Receptor', ...txt },
      { name: 'Cargo Firma Receptor', ...txt },
      { name: 'Fecha Firma', ...fecha },
      { name: 'Observaciones', ...memo },
    ],
  },
];

async function api(url, init) {
  const res = await fetch(url, { headers: H, ...init });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
}

const existentes = (await api(`${AT}/meta/bases/${BASE}/tables`)).tables;
const porNombre = new Map(existentes.map((t) => [t.name, t]));
const idsCreados = {};

console.log(`\n${APPLY ? '🚀 APLICANDO' : '🔍 DRY-RUN'} — base PiroliApp, ${existentes.length} tablas existentes\n`);

for (const tabla of TABLAS) {
  // Resuelve el link a Receptores, que puede haberse creado en esta misma corrida.
  const campos = tabla.fields.map((f) =>
    f.options?.linkedTableId === '__RECEPTORES__'
      ? { ...f, options: { linkedTableId: idsCreados['Receptores Biochar'] ?? porNombre.get('Receptores Biochar')?.id } }
      : f
  );

  const yaExiste = porNombre.get(tabla.name);

  if (!yaExiste) {
    console.log(`+ CREAR tabla "${tabla.name}" con ${campos.length} campos`);
    for (const f of campos) console.log(`    ${String(f.type).padEnd(20)} ${f.name}`);

    if (!APPLY) {
      idsCreados[tabla.name] = `tbl__${tabla.name.replace(/\W/g, '')}__DRYRUN`;
      continue;
    }

    const faltaLink = campos.find((f) => f.type === 'multipleRecordLinks' && !f.options?.linkedTableId);
    if (faltaLink) throw new Error(`No se pudo resolver la tabla enlazada de "${faltaLink.name}"`);

    const creada = await api(`${AT}/meta/bases/${BASE}/tables`, {
      method: 'POST',
      body: JSON.stringify({ name: tabla.name, description: tabla.description, fields: campos }),
    });
    idsCreados[tabla.name] = creada.id;
    console.log(`  ✅ ${tabla.name} → ${creada.id}\n`);
    continue;
  }

  // La tabla ya existe: solo se agregan los campos que falten.
  idsCreados[tabla.name] = yaExiste.id;
  const presentes = new Set(yaExiste.fields.map((f) => f.name));
  const faltantes = campos.filter((f) => !presentes.has(f.name));

  console.log(`= La tabla "${tabla.name}" ya existe (${yaExiste.id})`);
  if (!faltantes.length) {
    console.log('  sin campos por agregar\n');
    continue;
  }
  for (const f of faltantes) {
    console.log(`  + campo ${String(f.type).padEnd(20)} ${f.name}`);
    if (!APPLY) continue;
    await api(`${AT}/meta/bases/${BASE}/tables/${yaExiste.id}/fields`, {
      method: 'POST',
      body: JSON.stringify(f),
    });
  }
  console.log();
}

console.log('── Variables para .env.local ──');
console.log(`AIRTABLE_RECEPTORES_BIOCHAR_TABLE_ID=${idsCreados['Receptores Biochar']}`);
console.log(`AIRTABLE_ACTAS_BIOCHAR_TABLE_ID=${idsCreados['Actas Entrega Biochar']}`);
if (!APPLY) console.log('\n(dry-run: no se creó nada. Repetir con --apply)');
