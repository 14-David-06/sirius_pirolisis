/**
 * Remisiones retroactivas de las ventas de pirólisis de 2026 que no son de
 * Guaicaramo: una por factura, sobre remisiones vacías que ya existen en el Core.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * Finanzas factura desde Flujo de caja y cada factura necesita su remisión. Estas
 * ventas salieron sin documento: el despacho se llevaba en la hoja de bodega, y
 * sus Salidas ya están en el libro mayor (`scripts/blend-ventas-hoja.mjs`).
 * SIRIUS-REM-0205…0214 se crearon el 2026-10-06 y se anularon el 21-oct «por error
 * en el sistema», sin cliente, productos ni personas: se reutilizan en vez de
 * gastar números nuevos. SIRIUS-REM-0102 («NULA») es la de reserva.
 *
 * ═══ SOLO DOCUMENTO ═══════════════════════════════════════════════════════════
 * No escribe Salidas: el inventario ya se descontó, y pasar por `Despachar` lo
 * descontaría dos veces. Quedan en `Entregada` directo: en `Pendiente` o
 * `En Tránsito` las podría cerrar la firma pública de DataLab (CLAUDE.md §8).
 *
 * La marca `[lote:…]` es el `produccion_destino_id` de la Salida que ya existe:
 * el lote, o `SAL-<CLIENTE>-<fecha>` en las ventas de la hoja que no tenían lote
 * (ese código es también la Entrada del Blend y el destino de su biochar). Con la
 * misma llave en los dos lados, el CO₂ del documento sale del biochar real de esa
 * venta, y `lotesDisponiblesBlend()` toma el MÁXIMO entre lo remitido y lo salido,
 * así que el lote no se descuenta dos veces.
 *
 * `Fecha de Remisión` es la fecha de creación del registro (2026-10-06) y Airtable
 * no la deja cambiar. La del despacho va en `Fecha Pedido Despachado`, que es la
 * que imprime el PDF y la que copia Flujo de caja.
 *
 * Las que no se pueden aplicar todavía llevan `bloqueo`: el ensayo genera su PDF
 * de revisión, pero `--apply` las salta.
 *
 * ═══ VENTAS QUE SALIERON COMO MUESTRA ═════════════════════════════════════════
 * Lo de Invernalia salió de lo que se sacó para ExpoAgroFuturo (`SAL-MUE-…`): el
 * inventario ya bajó, pero como muestra. `reclasifica` pasa esos kg de la Salida
 * de muestra a una Salida de venta `DESP-<REM>…`, sin cambiar el total. No es
 * cosmético: una remisión de biochar sin su `DESP-<REM>-<bache>` compromete sus
 * kg en `saldosDespachables()`, y la bodega los descontaría otra vez.
 *
 * El PDF público (S3) lo sube `publicarDocumentoRemision()`, que importa
 * `server-only`: sin `--conditions=react-server` ese paso se salta y Flujo de
 * caja queda sin enlace al documento.
 *
 * Uso:
 *   npx tsx scripts/remisiones-retroactivas-2026.ts --guardar ./pdfs     # dry-run + PDFs de revisión
 *   npx tsx scripts/remisiones-retroactivas-2026.ts --remision SIRIUS-REM-0205 --guardar ./pdfs
 *   npx tsx --conditions=react-server scripts/remisiones-retroactivas-2026.ts [--remision …] --apply
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

interface Retroactiva {
  codigo: string;
  /** `Factura No.` en Flujo de caja (el reporte contable la llama FEV-0000…). */
  factura: string;
  /** Factura del flete de este despacho; igual a `factura` si va en la misma. */
  flete?: string;
  /** `CL-XXXX`, o null si el cliente no está en Clients Core. */
  idCliente: string | null;
  /** Como lo escribe la factura: el PDF lo usa solo si no hay `idCliente`. */
  cliente: string;
  producto: 'blend' | 'biochar';
  kg: number;
  /** $/kg facturado. Inparme conserva el de 2025, no el del catálogo. */
  precio: number;
  /** Fecha del despacho (`YYYY-MM-DD`). */
  fecha: string;
  /** Blend: el `produccion_destino_id` de la Salida que ya está en el libro mayor. */
  lote?: string;
  /** Biochar: de qué bache sale cada kg (las marcas `[bache:S=kg]`). */
  baches?: { bache: string; kg: number }[];
  /** Quien entregó, de Sirius. */
  responsable?: string;
  /** `Fecha Recibido`, si se sabe. */
  recibido?: string;
  /** Lo que el PDF dice además de la factura. */
  nota?: string;
  /** `documento_referencia` de la Salida de muestra de la que salieron estos kg. */
  reclasifica?: string;
  /** Blend: el biochar puro que viajó en la misma entrega (remisión mixta). */
  biochar?: { baches: { bache: string; kg: number }[]; precio: number; reclasifica?: string };
  /** Por qué `--apply` no la toca todavía. */
  bloqueo?: string;
}

// Fechas: las de la factura. El libro mayor tiene las cinco primeras un mes antes
// (15-mar, 23-mar, 7-abr, 14-abr), pero Guarila sale del lote BLEND-2026-04-30, que
// no existía el 7-abr: la hoja de bodega corrió el mes. Invernalia: «ENTREGADA EL
// 23 DE OCTUBRE», según las observaciones de su factura.
const PLAN: Retroactiva[] = [
  { codigo: 'SIRIUS-REM-0205', factura: 'SRFE1521', flete: 'SRFE1521', idCliente: 'CL-0002', cliente: 'BELLACRUZ DEL LLANO S A S', producto: 'blend', kg: 3440, precio: 1400, fecha: '2026-04-15', lote: 'SAL-BELLACRUZ-2026-03-15' },
  { codigo: 'SIRIUS-REM-0206', factura: 'SRFE1529', flete: 'SRFE1525', idCliente: 'CL-0009', cliente: 'SAPUGA SA', producto: 'blend', kg: 7500, precio: 1400, fecha: '2026-04-23', lote: 'SAL-SAPUGA-2026-03-23' },
  { codigo: 'SIRIUS-REM-0207', factura: 'SRFE1530', flete: 'SRFE1526', idCliente: 'CL-0016', cliente: 'AGROPECUARIA LA LOMA S.A.S', producto: 'blend', kg: 4000, precio: 1400, fecha: '2026-04-23', lote: 'SAL-LA-LOMA-2026-03-23' },
  { codigo: 'SIRIUS-REM-0208', factura: 'SRFE1532', idCliente: 'CL-0003', cliente: 'AGRICOLA GUARILA SAS', producto: 'blend', kg: 5000, precio: 1400, fecha: '2026-05-07', lote: 'BLEND-2026-04-30' },
  { codigo: 'SIRIUS-REM-0209', factura: 'SRFE1536', idCliente: 'CL-0003', cliente: 'AGRICOLA GUARILA SAS', producto: 'blend', kg: 12330, precio: 1400, fecha: '2026-05-14', lote: 'BLEND-2026-04-30' },
  { codigo: 'SIRIUS-REM-0210', factura: 'SRFE1553', idCliente: 'CL-0023', cliente: 'INPARME S.A.S', producto: 'blend', kg: 10010, precio: 1190, fecha: '2026-07-01', lote: 'BLEND-2026-06-24' },
  {
    codigo: 'SIRIUS-REM-0211', factura: 'SRFE1563', idCliente: null, cliente: 'NANOMOF S.A.S.', producto: 'biochar', kg: 200, precio: 4000, fecha: '2026-08-11',
    bloqueo: 'NANOMOF no está en Clients Core, y el libro mayor no tiene la Salida de esos 200 kg: falta saber de qué bache salieron',
  },
  { codigo: 'SIRIUS-REM-0212', factura: 'SRFE1574', idCliente: 'CL-0002', cliente: 'BELLACRUZ DEL LLANO S A S', producto: 'blend', kg: 770, precio: 1400, fecha: '2026-09-01', lote: 'SAL-BELLACRUZ-2026-09-01' },
  {
    codigo: 'SIRIUS-REM-0213', factura: 'SRFE1584', idCliente: null, cliente: 'AGRO OCAMPO ALVAREZ SAS', producto: 'blend', kg: 120, precio: 1400, fecha: '2026-10-05',
    bloqueo: 'Agro Ocampo no está en Clients Core, y los 120 kg no tienen Salida ni lote en el libro mayor',
  },
  // Invernalia: una entrega con los dos productos, una remisión mixta (el
  // documento lista lo que salió en ese viaje). Los dos salieron de la muestra de
  // ExpoAgroFuturo (David, 2026-10-27). El Blend sale del lote BLEND-2026-10-20 y
  // no del de PED-0093, que es de un pedido de otro cliente.
  {
    codigo: 'SIRIUS-REM-0214', factura: 'SRFE1598', idCliente: 'CL-0092', cliente: 'INVERNALIA LA JAGUA GARZON SAS', producto: 'blend', kg: 25, precio: 1400, fecha: '2026-10-23',
    lote: 'BLEND-2026-10-20', responsable: 'Angelica Maria Herrera Romero', recibido: '2026-10-23',
    nota: 'Recibido por INVERNALIA LA JAGUA GARZON SAS el 23 de octubre de 2026.',
    reclasifica: 'SAL-MUE-2026-10-20',
    biochar: { baches: [{ bache: 'S-00140', kg: 25 }], precio: 4000, reclasifica: 'SAL-MUE-2026-10-20-S-00140' },
  },
];

/** Las notas de una remisión vacía que se puede reutilizar. */
const NOTAS_REUTILIZABLE = /^(Anulada por error en el sistema|NULA)/;
const r2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  // `config.ts` lee el entorno al importarse: primero el entorno, después los módulos.
  loadEnvLocal();
  const { config } = await import('../src/lib/config');
  const { assertCodigoSimbolico, escapeAirtableValue } = await import('../src/lib/airtable-escape');
  const core = await import('../src/lib/remisiones-core');
  const blend = await import('../src/lib/blend-remisiones-core');
  const { getProduccionPorLote } = await import('../src/lib/blend-produccion-core');
  const consts = await import('../src/lib/remision-pirolisis.constants');
  const { construirDatosPdf, adjuntarPdfRemision, generarPdfRemision } = await import('../src/lib/blend-remision-pdf');
  const { generateBlendRemisionPdf, formatDateES } = await import('../src/lib/blend-remision-pdf-generator');
  const fc = await import('../src/lib/flujo-caja-remisiones');
  const { fechaBogota } = await import('../src/lib/fecha-bogota');
  const biocharCore = await import('../src/lib/biochar-inventario-core');
  const { notasProductoRemitido } = await import('../src/lib/despacho-biochar.calculos');
  const publicar = await import('../src/lib/remision-documento-s3.server')
    .then((m) => m.publicarDocumentoRemision)
    .catch(() => null);
  const inv = {
    base: config.airtable.inventarioProdCoreBaseId ?? '',
    token: config.airtable.inventarioProdCoreToken ?? '',
    movimientos: config.airtable.inventarioProdCoreMovimientosTable ?? '',
  };

  const { AT, ESTADO_REMISION, atRemisiones } = core;
  const { baseId, token, remisionesTable, productosTable } = core.remisionesCoreConfig();
  if (!productosTable) throw new Error('AIRTABLE_TABLE_PRODUCTOS_REMITIDOS no configurado');
  const productoId = {
    blend: config.airtable.inventarioProdCoreBiocharBlendProductId ?? '',
    biochar: config.airtable.inventarioProdCoreBiocharPuroProductId ?? '',
  };
  if (!productoId.blend || !productoId.biochar) throw new Error('Faltan los códigos de producto de Blend o de biochar');

  const hoy = fechaBogota();
  const guardar = argumento('--guardar');
  const unaSola = argumento('--remision');
  if (unaSola) assertCodigoSimbolico(unaSola, 'código de remisión');
  const plan = unaSola ? PLAN.filter((r) => r.codigo === unaSola) : PLAN;
  if (!plan.length) throw new Error(`${unaSola} no está en el plan`);

  // ── Esquema: antes de escribir, las opciones reales de los selects ──────────
  const fcCfg = fc.flujoCajaConfig();
  try {
    await verificarEsquemaCore();
    console.log('✓ Esquema de Remisiones Core verificado');
    if (!fcCfg) throw new Error(`Flujo de caja no configurado: falta ${fc.faltantesFlujoCaja().join(', ')}`);
    await fc.verificarEsquemaFlujoCaja(fcCfg);
    console.log('✓ Esquema de Flujo de caja verificado\n');
  } catch (err) {
    if (APPLY) throw err;
    console.log(`⚠️ ${err instanceof Error ? err.message : err} (con --apply esto detiene todo)\n`);
  }

  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'} — ${plan.length} remisión(es)\n`);

  let fallos = 0;
  for (const r of plan) {
    const cruda = await leerCruda(r.codigo);
    if (!cruda) {
      console.log(`✗ ${r.codigo}: no existe en el Core`);
      fallos++;
      continue;
    }
    const situacion = situacionDe(r, cruda);
    const prevista = await remisionPrevista(r, cruda.recordId);
    const datos = construirDatosPdf(prevista);

    console.log(
      `• ${r.codigo} ← ${r.factura} · ${datos.cliente} (${r.idCliente ?? 'sin código'}) · ` +
        `${datos.producto} ${r.kg} kg · ${r.fecha} · CO₂ ${datos.co2_secuestrado_kg} kg · ` +
        `${marcasDe(r)} · entrega: ${r.responsable ?? '—'} · hoy: ${situacion}`
    );
    console.log(`  Observaciones: ${datos.observaciones}`);
    if (r.reclasifica) console.log(`  ↺ pasa ${r.kg} kg de la muestra ${r.reclasifica} a la venta de ${r.codigo}`);
    if (r.bloqueo) console.log(`  ⛔ ${r.bloqueo}`);

    if (guardar) {
      mkdirSync(guardar, { recursive: true });
      const archivo = join(guardar, `${r.codigo}_${r.factura}.pdf`);
      writeFileSync(archivo, await generateBlendRemisionPdf(datos));
      console.log(`  PDF de revisión → ${archivo}`);
    }

    if (!APPLY || r.bloqueo) continue;
    if (situacion === 'ocupada') {
      console.log('  ✗ no es una remisión vacía ni una ya aplicada por este script: no se toca');
      fallos++;
      continue;
    }
    try {
      await aplicar(r, cruda, situacion);
    } catch (err) {
      console.log(`  ✗ ${err instanceof Error ? err.message : err}`);
      fallos++;
    }
  }

  if (!APPLY) console.log('\nNada se escribió. Repetir con --apply para escribir las que no tienen bloqueo.');
  if (fallos) process.exitCode = 1;

  // ── Funciones ────────────────────────────────────────────────────────────────

  async function verificarEsquemaCore(): Promise<void> {
    const data = await atRemisiones(`${AT}/meta/bases/${baseId}/tables`, token);
    const tabla = (data.tables ?? []).find((t: { id: string }) => t.id === remisionesTable);
    if (!tabla) throw new Error('Remisiones Core: no se encontró la tabla de remisiones');
    type Campo = { name: string; type: string; options?: { choices?: { name: string }[] } };
    const campo = (n: string) => (tabla.fields as Campo[]).find((f) => f.name === n);
    const problemas: string[] = [];
    for (const n of ['Area Origen', 'Estado', 'ID Cliente', 'ID Pedido', 'Responsable Entrega', 'Fecha Pedido Despachado', 'Fecha Recibido', 'Notas de Remisión', 'URL Remision Generada']) {
      if (!campo(n)) problemas.push(`falta «${n}»`);
    }
    const opcion = (n: string, v: string) => {
      const opciones = campo(n)?.options?.choices?.map((c) => c.name) ?? [];
      if (!opciones.includes(v)) problemas.push(`«${n}» no tiene la opción «${v}»`);
    };
    opcion('Estado', ESTADO_REMISION.entregada);
    opcion('Area Origen', consts.AREA_ORIGEN_PIROLISIS);
    if (problemas.length) throw new Error(`Esquema de Remisiones Core inesperado: ${problemas.join('; ')}`);
  }

  async function leerCruda(codigo: string) {
    const q = new URLSearchParams({ filterByFormula: `{ID} = '${escapeAirtableValue(codigo)}'`, maxRecords: '2' });
    const data = await atRemisiones(`${AT}/${baseId}/${remisionesTable}?${q}`, token);
    if ((data.records ?? []).length > 1) throw new Error(`Hay dos remisiones ${codigo} en el Core`);
    const rec = data.records?.[0];
    return rec ? consts.remisionCrudaDeRegistro(rec) : null;
  }

  /**
   * - `vacia`: la anulada sin nada, lista para reutilizar.
   * - `a-medias`: un intento anterior creó el producto remitido y no llegó al PATCH.
   * - `aplicada`: ya tiene el producto, los kg y la marca de este plan.
   * - `ocupada`: cualquier otra cosa. No se toca: podría ser una remisión real.
   */
  function situacionDe(r: Retroactiva, c: NonNullable<Awaited<ReturnType<typeof leerCruda>>>) {
    const anuladaVacia = c.estado === ESTADO_REMISION.cancelada && NOTAS_REUTILIZABLE.test(c.notas) &&
      !c.personasIds.length && !c.documentos.length;
    if (anuladaVacia && c.kgRollup === 0) return 'vacia' as const;
    // Las filas de `Productos Remitidos` hechas: el rollup suma todas. Con más de
    // una, un intento a medias puede haber dejado solo una.
    const kgFilas = filasDe(r).map((f) => f.kg);
    const kgEsperado = r2(kgFilas.reduce((t, k) => t + k, 0));
    if (anuladaVacia && kgFilas.some((_, i) => Math.abs(c.kgRollup - r2(kgFilas.slice(0, i + 1).reduce((t, k) => t + k, 0))) < 0.01)) {
      return 'a-medias' as const;
    }
    if (consts.tipoRemision(c) === r.producto && Math.abs(c.kgRollup - kgEsperado) < 0.01 &&
        consts.prefijoMarcas(c.notas).startsWith(marcasDe(r).replace(/ [^[\]]+$/, ''))) {
      return 'aplicada' as const;
    }
    return 'ocupada' as const;
  }

  /** Las filas de `Productos Remitidos`: el producto y, en una mixta, el biochar. */
  function filasDe(r: Retroactiva) {
    const bachesPropios = r.producto === 'biochar' ? r.baches ?? [] : [];
    const filas = [{
      productoId: productoId[r.producto],
      kg: r2(r.kg),
      notas: r.producto === 'blend' ? `Lote ${r.lote}` : notasProductoRemitido(bachesPropios),
    }];
    if (r.biochar) {
      filas.push({
        productoId: productoId.biochar,
        kg: r2(r.biochar.baches.reduce((t, b) => t + b.kg, 0)),
        notas: notasProductoRemitido(r.biochar.baches),
      });
    }
    return filas;
  }

  function marcasDe(r: Retroactiva): string {
    if (r.producto === 'blend') {
      if (!r.lote) return consts.NOMBRE_PRODUCTO.blend;
      // Mixta: el rollup suma los dos productos, así que el Blend lleva su [kg-lote:]
      // aunque sea un solo lote (ver remision-pirolisis.constants.ts).
      const mixta = r.biochar ? ` [kg-lote:${r.lote}=${r2(r.kg)}] ${consts.marcasBaches(r.biochar.baches)}` : '';
      return `[lote:${r.lote}]${mixta} ${consts.NOMBRE_PRODUCTO.blend}`;
    }
    return r.baches?.length ? `${consts.marcasBaches(r.baches)} ${consts.NOMBRE_PRODUCTO.biochar}` : consts.NOMBRE_PRODUCTO.biochar;
  }

  function notasDe(r: Retroactiva): string {
    const flete = !r.flete ? '' : r.flete === r.factura ? ' (producto y flete)' : `; el flete va en la factura ${r.flete}`;
    // Lo que va después de « — » lo imprime el PDF: que el papel diga que se
    // expidió después del despacho, para que nadie lo lea como el de ese día.
    return `${marcasDe(r)}${consts.SEPARADOR_OBSERVACIONES}Soporte de la factura ${r.factura}${flete}. ` +
      (r.nota ? `${r.nota} ` : '') +
      `Remisión expedida el ${formatDateES(hoy)}, con posterioridad al despacho.`;
  }

  /**
   * La remisión como quedará en el Core después de `--apply`, para el PDF de
   * revisión. El CO₂ se deriva igual que en `mapRemision()`: el Blend con la
   * proporción real de biochar del lote (cae a la fórmula si no la hay) y el
   * biochar puro con sus kg.
   */
  async function remisionPrevista(r: Retroactiva, recordId: string): Promise<import('../src/lib/blend-remisiones-core').RemisionBlend> {
    let kgBiochar = r.kg;
    if (r.producto === 'blend') {
      let proporcion: number | undefined;
      if (r.lote) {
        const prod = await getProduccionPorLote(r.lote).catch(() => null);
        const kgB = prod?.baches.reduce((t, b) => t + b.kg, 0) ?? 0;
        if (prod && prod.kgTotal > 0 && kgB > 0) proporcion = kgB / prod.kgTotal;
      }
      kgBiochar = blend.composicionDeDespacho(r.kg, proporcion).biochar;
    }
    const kgBiocharMixta = r.biochar ? r.biochar.baches.reduce((t, b) => t + b.kg, 0) : 0;
    const clienteNombre = r.idCliente ? await core.nombreCliente(r.idCliente) : r.cliente;
    return {
      recordId,
      codigo: r.codigo,
      estado: ESTADO_REMISION.entregada,
      idPedido: '',
      idCliente: r.idCliente ?? '',
      clienteNombre,
      idAreaCliente: '',
      areaClienteNombre: '',
      lote: r.lote ?? '',
      lotes: r.lote ? [{ lote: r.lote, kg: r.kg }] : [],
      kgTotal: r.kg,
      fechaRemision: '2026-10-06',
      fechaDespacho: r.fecha,
      fechaRecibido: r.recibido ?? '',
      responsableEntrega: r.responsable ?? '',
      documentoUrl: '',
      notas: notasDe(r),
      personas: [],
      tipo: r.producto,
      productoId: productoId[r.producto],
      productoNombre: consts.NOMBRE_PRODUCTO[r.producto],
      idDespacho: null,
      bachesRemitidos: r.producto === 'biochar' ? r.baches ?? [] : r.biochar?.baches ?? [],
      recibidaEn: null,
      correoEnviadoEn: null,
      documentos: [],
      composicion: { biochar: r2(kgBiochar), abono: 0, agua: 0, biologicos: 0 },
      co2SecuestradoKg: blend.co2Secuestrado(r2(kgBiochar + kgBiocharMixta)),
      baches: [],
    };
  }

  /**
   * Producto remitido, después el PATCH, después el PDF y Flujo de caja. Primero
   * el producto: si el PATCH falla, la remisión sigue anulada (con kg, que el
   * reintento reconoce como `a-medias`); al revés quedaría una `Entregada` sin
   * nada remitido.
   */
  async function aplicar(r: Retroactiva, c: NonNullable<Awaited<ReturnType<typeof leerCruda>>>, situacion: string) {
    if (!r.idCliente) throw new Error('sin cliente');
    if (r.producto === 'blend' ? !r.lote : !r.baches?.length) throw new Error('sin lote o sin baches');
    if (r.reclasifica && r.producto === 'biochar' && r.baches!.length !== 1) {
      throw new Error('reclasificar una muestra de biochar se hace bache por bache: un bache por remisión');
    }

    // Una fila por producto. `a-medias`: las que falten, en orden.
    if (situacion === 'vacia' || situacion === 'a-medias') {
      let hechas = r2(c.kgRollup);
      for (const f of filasDe(r)) {
        if (hechas >= f.kg - 0.01) {
          hechas = r2(hechas - f.kg);
          continue;
        }
        await atRemisiones(`${AT}/${baseId}/${productosTable}`, token, {
          method: 'POST',
          body: JSON.stringify({
            records: [{ fields: { 'ID Producto': f.productoId, Cantidad: f.kg, Unidad: 'Kg', 'Remisión vinculada': [c.recordId], Notas: f.notas } }],
          }),
        });
        console.log(`  ✓ producto remitido: ${f.productoId} ${f.kg} kg`);
      }
    }

    if (situacion !== 'aplicada') {
      await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${c.recordId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          fields: {
            'Area Origen': consts.AREA_ORIGEN_PIROLISIS,
            Estado: ESTADO_REMISION.entregada,
            'ID Cliente': r.idCliente,
            'ID Pedido': '',
            'Responsable Entrega': r.responsable ?? '',
            'Fecha Pedido Despachado': r.fecha,
            ...(r.recibido ? { 'Fecha Recibido': r.recibido } : {}),
            'Notas de Remisión': notasDe(r),
            // Traía el número suelto («205»): no es un enlace, y Flujo de caja solo
            // copia uno del bucket público.
            'URL Remision Generada': '',
          },
        }),
      });
      console.log('  ✓ remisión');
    }

    if (r.reclasifica) {
      await reclasificarMuestra(r, r.producto === 'blend'
        ? { producto: 'blend', kg: r.kg, lote: r.lote, muestra: r.reclasifica }
        : { producto: 'biochar', kg: r.kg, bache: r.baches![0].bache, muestra: r.reclasifica });
    }
    if (r.biochar?.reclasifica) {
      for (const b of r.biochar.baches) {
        await reclasificarMuestra(r, { producto: 'biochar', kg: b.kg, bache: b.bache, muestra: r.biochar.reclasifica });
      }
    }

    // Releída del Core: el PDF y Flujo de caja salen de lo que quedó escrito,
    // no del plan.
    let remision = await blend.resolverRemision(c.recordId);
    if (!remision || remision.tipo !== r.producto || Math.abs(remision.kgTotal - r.kg) > 0.01 ||
        blend.lineasDeRemision(remision).length !== filasDe(r).length) {
      throw new Error(`al releerla no quedó como se esperaba (${remision?.tipo} · ${remision?.kgTotal} kg)`);
    }

    // El mismo PDF en el Core y en S3.
    const bytes = await generarPdfRemision(remision);
    const doc = await adjuntarPdfRemision(remision, { bytes });
    console.log(doc.ok ? '  ✓ PDF adjunto en el Core' : `  ✗ PDF: ${doc.error}`);
    if (!fc.urlDocumentoRemision(remision)) {
      if (publicar) {
        console.log(`  ✓ PDF público: ${await publicar(c.recordId, bytes)}`);
        remision = (await blend.resolverRemision(c.recordId)) ?? remision;
      } else {
        console.log('  – PDF público omitido: correr con --conditions=react-server');
      }
    }

    if (!fcCfg) throw new Error('Flujo de caja no configurado');
    // El precio facturado, no el del catálogo: Inparme va a 1.190. El vínculo con
    // la factura (`Factura Relacionada`) lo hace finanzas, como en todas.
    const filas = fc.filasFlujoCaja(remision, {
      precioUnitario: r.precio,
      precios: r.biochar ? { [productoId.biochar]: r.biochar.precio } : {},
      urlDocumento: fc.urlDocumentoRemision(remision),
    });
    const res = await fc.escribirRemisionFlujoCaja(fcCfg, filas);
    console.log(`  ✓ Flujo de caja: ${res.accion} (Numero Remision ${filas.numero}, ${filas.productos.length} línea(s))`);
  }

  /**
   * Pasa `p.kg` de la Salida de muestra `p.muestra` a la Salida de venta de la
   * remisión (de su Blend, o de un bache de su biochar). Primero la de venta y después se rebaja la muestra: si el script se
   * corta en medio, sobra un descuento que el reintento corrige, en vez de faltar
   * uno. Las dos mitades se reconocen solas: la venta por su
   * `documento_referencia`, la muestra por la referencia escrita en sus
   * observaciones.
   */
  async function reclasificarMuestra(
    r: Retroactiva,
    p: { producto: 'blend' | 'biochar'; kg: number; lote?: string; bache?: string; muestra: string }
  ) {
    if (!inv.base || !inv.token || !inv.movimientos) throw new Error('Inventario Production Core no configurado');
    const venta = p.producto === 'blend' ? `DESP-${r.codigo}` : consts.referenciaDespachoBache(r.codigo, p.bache!);

    const q = new URLSearchParams({
      filterByFormula: `AND({documento_referencia} = '${escapeAirtableValue(p.muestra)}', {product_id} = '${escapeAirtableValue(productoId[p.producto])}')`,
    });
    const muestras = (await atRemisiones(`${AT}/${inv.base}/${inv.movimientos}?${q}`, inv.token)).records ?? [];
    if (muestras.length !== 1) throw new Error(`se esperaba una Salida ${p.muestra} y hay ${muestras.length}`);
    const muestra = muestras[0];
    const kgMuestra = Number(muestra.fields['cantidad']) || 0;
    const obs = String(muestra.fields['observaciones'] ?? '');
    const yaRebajada = obs.includes(venta);

    const qv = new URLSearchParams({ filterByFormula: `{documento_referencia} = '${escapeAirtableValue(venta)}'`, maxRecords: '1' });
    const yaVendida = ((await atRemisiones(`${AT}/${inv.base}/${inv.movimientos}?${qv}`, inv.token)).records ?? []).length > 0;

    if (!yaRebajada && kgMuestra < p.kg) throw new Error(`la muestra ${p.muestra} tiene ${kgMuestra} kg y se necesitan ${p.kg}`);
    if (p.producto === 'blend' && !yaRebajada) {
      const reparto = blend.lotesDeNotas(obs, kgMuestra);
      const delLote = reparto.find((l) => l.lote === p.lote);
      if (!delLote || delLote.kg <= p.kg) throw new Error(`la muestra ${p.muestra} no tiene más de ${p.kg} kg del lote ${p.lote}`);
    }

    if (!yaVendida) {
      const comun = {
        cantidad: r2(p.kg),
        documento: venta,
        observaciones: `Venta a ${r.cliente} (${r.idCliente}), factura ${r.factura}. Salió de lo separado como ` +
          `muestra en ${p.muestra}; reclasificado el ${hoy}.`,
      };
      if (p.producto === 'biochar') {
        await biocharCore.crearMovimientoBiocharPuro({
          tipo: 'Salida',
          kg: comun.cantidad,
          bacheOrigen: p.bache!,
          produccionDestino: r.codigo,
          documentoReferencia: venta,
          motivo: 'Despacho Remisión',
          fecha: r.fecha,
          responsable: r.responsable,
          ubicacionOrigen: r.codigo,
          ubicacionDestino: r.idCliente!,
          observaciones: `Despacho comercial de ${consts.NOMBRE_PRODUCTO.biochar} del bache ${p.bache} ` +
            `(remisión ${r.codigo}). ${comun.observaciones}`,
        });
      } else {
        // Los mismos campos que `registrarSalidaInventario()` de un despacho de
        // Blend, vinculada al stock en el POST, como la muestra.
        await atRemisiones(`${AT}/${inv.base}/${inv.movimientos}`, inv.token, {
          method: 'POST',
          body: JSON.stringify({
            records: [{
              fields: {
                product_id: productoId.blend,
                tipo_movimiento: 'Salida',
                cantidad: comun.cantidad,
                unidad_medida: 'kg',
                ubicacion_origen_id: r.codigo,
                ubicacion_destino_id: r.idCliente,
                motivo: 'Despacho Remisión',
                documento_referencia: venta,
                responsable: r.responsable ?? '',
                fecha_movimiento: `${r.fecha}T12:00:00.000Z`,
                observaciones: `Despacho de Biochar Blend del lote ${p.lote} (remisión ${r.codigo}). ${comun.observaciones}`,
                Stock_Actual: muestra.fields['Stock_Actual'],
              },
            }],
          }),
        });
      }
      console.log(`  ✓ Salida de venta ${venta}: ${p.kg} kg`);
    }

    if (!yaRebajada) {
      let nuevasObs = obs;
      if (p.producto === 'blend') {
        // El reparto por lote de la muestra lo lee `lotesDisponiblesBlend()`: tiene
        // que seguir sumando lo que dice `cantidad`.
        const marca = new RegExp(`\\[kg-lote:${p.lote}=([0-9.]+)\\]`);
        const m = obs.match(marca);
        if (m) nuevasObs = obs.replace(marca, `[kg-lote:${p.lote}=${r2(Number(m[1]) - p.kg)}]`);
      }
      nuevasObs += ` · ${hoy}: ${p.kg} kg eran la venta a ${r.cliente} (${r.codigo}, factura ${r.factura}) y pasaron a ${venta}.`;
      await atRemisiones(`${AT}/${inv.base}/${inv.movimientos}/${muestra.id}`, inv.token, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { cantidad: r2(kgMuestra - p.kg), observaciones: nuevasObs } }),
      });
      console.log(`  ✓ muestra ${p.muestra}: ${kgMuestra} → ${r2(kgMuestra - p.kg)} kg`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
