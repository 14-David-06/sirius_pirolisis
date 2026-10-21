#!/usr/bin/env node
/**
 * Verifica el esquema de Airtable del que dependen las remisiones comerciales de
 * pirólisis (despacho de biochar puro y de Blend, recepción por enlace, prueba de
 * la autorización de datos) y crea lo único que todavía no existe.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * Despachar y recibir toca cinco bases, cuatro de ellas compartidas con las otras
 * apps de Sirius, y las trampas de CLAUDE.md §3 no fallan en un ensayo: fallan en
 * el primer despacho real. Un singleSelect sin la opción que se escribe es un 422 que
 * tumba el POST completo; un field ID viejo en el entorno se lee como `undefined`
 * sin ningún error; un link que apunta a otra tabla escribe donde no es. Este
 * script las busca ANTES y contra el esquema real, en vez de asumirlo (§7).
 *
 * Los nombres, tipos y opciones esperados se repiten aquí a propósito: un .mjs no
 * puede importar los .ts de `src/lib`, y esta lista ES el contrato que el código
 * asume (sección B de la especificación). Si el código cambia un nombre, se cambia
 * aquí también.
 *
 * ═══ QUÉ HACE ═════════════════════════════════════════════════════════════════
 *   (sin acción)             Verifica. Solo lee: la Meta API de cada base y las
 *                            filas de `Stock_Actual`. Sale con código 1 ante
 *                            cualquier discrepancia; los avisos no lo cambian.
 *   --crear-autorizaciones   Crea en PiroliApp la tabla `Autorizaciones Datos
 *                            Personales` (prueba de la Ley 1581), o le agrega los
 *                            campos que le falten, e imprime el valor de
 *                            AIRTABLE_AUTORIZACIONES_DATOS_TABLE_ID.
 *   --describir              Amplía la descripción de `produccion_destino_id` en
 *                            Inventario Production Core con el código SIRIUS-REM-…
 *                            de un despacho comercial.
 *
 * Las acciones son dry-run sin `--apply` e idempotentes: una segunda corrida no
 * vuelve a escribir lo que ya está.
 *
 * ⚠️ La Meta API no crea campos calculados, no cambia el tipo de un campo y no lo
 * borra: lo que quede mal se arregla a mano en la UI. De ahí el dry-run.
 *
 * Token: AIRTABLE_GLOBAL_TOKEN con `schema.bases:read` (y `schema.bases:write`
 * para `--apply`). La fila de `Stock_Actual` se lee con el token que usa la app.
 *
 * Uso:
 *   node scripts/esquema-remisiones-pirolisis.mjs
 *   node scripts/esquema-remisiones-pirolisis.mjs --crear-autorizaciones [--apply]
 *   node scripts/esquema-remisiones-pirolisis.mjs --describir [--apply]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AT = 'https://api.airtable.com/v0';
const META = `${AT}/meta/bases`;

const USO = [
  'Uso:',
  '  node scripts/esquema-remisiones-pirolisis.mjs                                   verifica (solo lectura)',
  '  node scripts/esquema-remisiones-pirolisis.mjs --crear-autorizaciones [--apply]  tabla de autorizaciones',
  '  node scripts/esquema-remisiones-pirolisis.mjs --describir [--apply]             descripción de produccion_destino_id',
].join('\n');

const ARGS = process.argv.slice(2);
if (ARGS.includes('--help') || ARGS.includes('-h')) {
  console.log(USO);
  process.exit(0);
}
const desconocidos = ARGS.filter((a) => !['--apply', '--crear-autorizaciones', '--describir'].includes(a));
if (desconocidos.length) {
  // Con un `--aplly` la acción correría en dry-run, y quien no lea el encabezado
  // creería haber creado la tabla. Mejor no correr nada.
  console.error(`Argumento desconocido: ${desconocidos.join(' ')}\n\n${USO}`);
  process.exit(1);
}
const APPLY = ARGS.includes('--apply');
const CREAR_AUTORIZACIONES = ARGS.includes('--crear-autorizaciones');
const DESCRIBIR = ARGS.includes('--describir');

// ─────────────────────────────────────────────────────────────────────────────
// Entorno
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `.env.local` de la raíz del repo, sin pisar lo que ya trae el proceso (como hace
 * Next). Así se ensaya la variable de la tabla recién creada desde la línea de
 * comandos antes de copiarla al archivo.
 */
function cargarEntorno() {
  const env = {};
  const archivo = path.join(RAIZ, '.env.local');
  if (fs.existsSync(archivo)) {
    for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    }
  }
  for (const [clave, valor] of Object.entries(process.env)) {
    if (valor) env[clave] = valor;
  }
  return env;
}

const env = cargarEntorno();
const TOKEN = env.AIRTABLE_GLOBAL_TOKEN;
if (!TOKEN) {
  console.error('Falta AIRTABLE_GLOBAL_TOKEN (en .env.local o en el entorno del proceso).');
  process.exit(1);
}
// La fila de stock se lee con el MISMO token que usa la app (config.ts): si la app
// no puede leerla, la verificación tampoco debe darla por buena.
const TOKEN_INVENTARIO = env.AIRTABLE_API_KEY_SIRIUS_INVENTARIO || TOKEN;

// ─────────────────────────────────────────────────────────────────────────────
// El contrato: lo que el código asume de cada base
// ─────────────────────────────────────────────────────────────────────────────

const TEXTO = 'singleLineText';
const MEMO = 'multilineText';
const SELECT = 'singleSelect';
const LINK = 'multipleRecordLinks';

const BASES = {
  piroliapp: { titulo: 'PiroliApp', variable: 'AIRTABLE_BASE_ID' },
  remisiones: { titulo: 'Sirius Remisiones Core', variable: 'AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE' },
  pedidos: { titulo: 'Sirius Pedidos Core', variable: 'AIRTABLE_PEDIDOS_CORE_BASE_ID' },
  inventario: { titulo: 'Sirius Inventario Production Core', variable: 'AIRTABLE_BASE_SIRIUS_INVENTARIO' },
  clientes: { titulo: 'Sirius Clients Core (solo lectura)', variable: 'AIRTABLE_CLIENTES_BASE_ID' },
};

/**
 * Field IDs de `Remisiones Baches Pirolisis` que `config.ts` declara y que usan
 * otros caminos sobre la misma tabla (entrega y recepción heredadas, acta de
 * entrega, eUse), no el despacho. Sin variable no es un error de este flujo; con
 * variable tienen que existir: escribir un field ID que no existe es un 422 que
 * tumba el POST completo, y leerlo da `undefined` sin ningún error.
 */
const CAMPOS_REMISION_LOCAL_OTROS_CAMINOS = [
  'AIRTABLE_REMISIONES_ID_FIELD_ID',
  'AIRTABLE_REMISIONES_ID_NUMERICO_FIELD_ID',
  'AIRTABLE_REMISIONES_NIT_CLIENTE_FIELD_ID',
  'AIRTABLE_REMISIONES_RESPONSABLE_ENTREGA_FIELD_ID',
  'AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_ENTREGA_FIELD_ID',
  'AIRTABLE_REMISIONES_TELEFONO_ENTREGA_FIELD_ID',
  'AIRTABLE_REMISIONES_EMAIL_ENTREGA_FIELD_ID',
  'AIRTABLE_REMISIONES_RESPONSABLE_RECIBE_FIELD_ID',
  'AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_RECIBE_FIELD_ID',
  'AIRTABLE_REMISIONES_TELEFONO_RECIBE_FIELD_ID',
  'AIRTABLE_REMISIONES_EMAIL_RECIBE_FIELD_ID',
  'AIRTABLE_REMISIONES_OBSERVACIONES_RECEPCION_FIELD_ID',
  'AIRTABLE_REMISIONES_VEHICULO_RECIBE_FIELD_ID',
  'AIRTABLE_REMISIONES_COLOR_VEHICULO_RECIBE_FIELD_ID',
  'AIRTABLE_REMISIONES_PLACA_VEHICULO_RECIBE_FIELD_ID',
];

/**
 * Declarados en `config.ts` pero sin ningún lector ni escritor en el código (solo
 * `validateEnvVars` exige que existan). Un ID que ya no corresponde a ningún campo
 * es un aviso de limpieza, no un error: nada lo usa. La limpieza empieza por
 * `config.ts`, porque `validateEnvVars` lanza en desarrollo si se borra la
 * variable primero. Si algún código vuelve a usar uno, pasa a la lista de arriba.
 */
const CAMPOS_REMISION_LOCAL_SIN_USO = [
  'AIRTABLE_REMISIONES_DOCUMENTO_REMISION_FIELD_ID',
  'AIRTABLE_REMISIONES_QR_DOCUMENTO_FIELD_ID',
  'AIRTABLE_REMISIONES_FIRMA_ENTREGA_FIELD_ID',
  'AIRTABLE_REMISIONES_FIRMA_RECIBE_FIELD_ID',
];

/**
 * Cada campo se busca por `nombre` (las bases que se acceden por nombre) o por la
 * `variable` que guarda su field ID (las tablas de PiroliApp que `config.ts` mapea).
 *
 *   tipo       tipo o lista de tipos aceptados; sin `tipo` solo se exige que exista.
 *   resultado  tipo que debe dar una fórmula o un rollup.
 *   opciones   valores que el código ESCRIBE o COMPARA: si el campo es un select y
 *              falta uno, es un error (escribirlo da 422; compararlo, nunca empata).
 *   otras      opciones que la sección B registra pero el código no usa: si faltan
 *              es solo un aviso de que el esquema cambió.
 *   enlaza     tabla a la que debe apuntar el link.
 *   critico    con `variable`: sin ella el flujo no funciona (error, no aviso).
 *   sinUso     con `variable`: ningún código la usa; si no existe, solo es un aviso.
 *   uso        por qué importa; se imprime junto al error.
 */
const TABLAS = {
  remisiones: {
    base: 'remisiones',
    variable: 'AIRTABLE_TABLE_REMISIONES',
    campos: [
      { nombre: 'ID', tipo: 'formula', resultado: TEXTO, uso: 'el código SIRIUS-REM-… que nombran las Salidas y el enlace' },
      { nombre: 'numeracion', tipo: 'autoNumber', uso: 'decide la remisión líder si dos despachos iguales chocan' },
      { nombre: 'ID Cliente', tipo: TEXTO },
      { nombre: 'ID Pedido', tipo: TEXTO },
      { nombre: 'ID Area Cliente', tipo: TEXTO },
      { nombre: 'Responsable Entrega', tipo: TEXTO },
      { nombre: 'Notas de Remisión', tipo: MEMO, uso: 'guarda las marcas de trazabilidad antes del primer « — »' },
      {
        nombre: 'Area Origen',
        tipo: SELECT,
        opciones: ['Producción'],
        otras: ['Laboratorio', 'Almacén', 'Ventas'],
        uso: 'Producción es lo que separa una remisión de pirólisis de una del laboratorio',
      },
      {
        nombre: 'Estado',
        tipo: SELECT,
        opciones: ['Borrador', 'Pendiente', 'En Tránsito', 'Entregada', 'Cancelada'],
        uso: 'el despacho escribe Borrador, Pendiente, En Tránsito y Cancelada; la recepción, Entregada',
      },
      { nombre: 'Fecha Pedido Despachado', tipo: 'date' },
      { nombre: 'Fecha Recibido', tipo: 'date' },
      { nombre: 'Documento Remision', tipo: 'multipleAttachments' },
      { nombre: 'Total Cantidad Remitida', tipo: 'rollup', resultado: 'number' },
      { nombre: 'Personas', tipo: LINK, enlaza: 'personas' },
      { nombre: 'Fecha de Remisión', tipo: 'createdTime' },
      { nombre: 'URL Remision Generada' },
    ],
  },
  productosRemitidos: {
    base: 'remisiones',
    variable: 'AIRTABLE_TABLE_PRODUCTOS_REMITIDOS',
    campos: [
      { nombre: 'Remisión vinculada', tipo: LINK, enlaza: 'remisiones' },
      { nombre: 'Cantidad', tipo: 'number' },
      { nombre: 'Unidad', tipo: [TEXTO, SELECT], opciones: ['Kg'] },
      { nombre: 'ID Producto', tipo: TEXTO },
      { nombre: 'Notas', tipo: [TEXTO, MEMO] },
    ],
  },
  personas: {
    base: 'remisiones',
    variable: 'AIRTABLE_TABLE_PERSONAS_REMISION',
    campos: [
      { nombre: 'Codigo Persona Remision', tipo: 'formula', resultado: TEXTO },
      { nombre: 'Nombre Completo', tipo: TEXTO },
      { nombre: 'Cedula', tipo: TEXTO, uso: 'la búsqueda por cédula se compara en JS sobre este texto' },
      { nombre: 'Base Origen', tipo: [TEXTO, SELECT], opciones: ['PiroliApp (Pirolisis)', 'Sirius Clients Core'] },
      { nombre: 'Tipo de Usuario', tipo: SELECT, opciones: ['Transportista', 'Receptor'] },
      { nombre: 'Correo Electrónico', tipo: 'email', uso: 'un correo mal formado es un 422: se valida antes de escribir' },
      { nombre: 'Teléfono', tipo: 'phoneNumber' },
      { nombre: 'ID Origen', tipo: MEMO },
    ],
  },
  pedidos: {
    base: 'pedidos',
    variable: 'AIRTABLE_PEDIDOS_CORE_PEDIDOS_TABLE',
    campos: [
      { nombre: 'ID Pedido Core', tipo: 'formula', resultado: TEXTO },
      {
        nombre: 'Estado',
        tipo: SELECT,
        opciones: ['Recibido', 'Procesando', 'Enviado', 'Completado', 'Cancelado', 'Enviado Parcial'],
        uso: 'el despacho escribe Enviado / Enviado Parcial y separa pendientes de cerrados con los demás',
      },
      { nombre: 'Origen del Pedido', tipo: SELECT, opciones: ['PiroliApp (Pirolisis)'], otras: ['DataLab (Laboratorio)'] },
      { nombre: 'ID Cliente Core', tipo: TEXTO },
      { nombre: 'ID Area Cliente', tipo: TEXTO },
      { nombre: 'Detalles del Pedido', tipo: LINK, enlaza: 'detallesPedido' },
      { nombre: 'Notas', tipo: [TEXTO, MEMO, 'richText'] },
      { nombre: 'Fecha de Pedido', tipo: ['dateTime', 'date'] },
    ],
  },
  detallesPedido: {
    base: 'pedidos',
    variable: 'AIRTABLE_PEDIDOS_CORE_DETALLES_TABLE',
    campos: [
      { nombre: 'Pedido', tipo: LINK, enlaza: 'pedidos' },
      { nombre: 'ID Producto Core', tipo: TEXTO, uso: 'el filtro por producto (0015 / 0016) es una fórmula sobre este texto' },
      { nombre: 'Cantidad Pedido', tipo: 'number' },
    ],
  },
  movimientos: {
    base: 'inventario',
    variable: 'AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS',
    campos: [
      { nombre: 'product_id', tipo: TEXTO },
      { nombre: 'ubicacion_origen_id', tipo: TEXTO, uso: 'lo despachado de Blend se cruza por este campo' },
      { nombre: 'ubicacion_destino_id', tipo: TEXTO },
      { nombre: 'unidad_medida', tipo: TEXTO },
      { nombre: 'motivo', tipo: TEXTO },
      { nombre: 'documento_referencia', tipo: TEXTO, uso: 'es la llave de idempotencia (DESP-<remisión>-<bache>)' },
      { nombre: 'responsable', tipo: TEXTO },
      { nombre: 'bache_origen_id', tipo: TEXTO },
      { nombre: 'produccion_destino_id', tipo: TEXTO },
      {
        nombre: 'tipo_movimiento',
        tipo: SELECT,
        opciones: ['Entrada', 'Salida'],
        otras: ['Transferencia', 'Ajuste', 'Merma', 'Devolución'],
      },
      { nombre: 'cantidad', tipo: 'number' },
      { nombre: 'fecha_movimiento', tipo: 'dateTime' },
      { nombre: 'observaciones', tipo: MEMO },
      {
        nombre: 'Stock_Actual',
        tipo: LINK,
        enlaza: 'stock',
        uso: 'se vincula en el POST: un movimiento sin vincular es invisible para el saldo',
      },
      { nombre: 'id_movimiento', tipo: 'formula' },
    ],
  },
  stock: {
    base: 'inventario',
    variable: 'AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK',
    campos: [
      { nombre: 'producto_id', tipo: TEXTO },
      { nombre: 'stock_actual', tipo: 'formula', resultado: 'number' },
    ],
  },
  clientes: {
    base: 'clientes',
    variable: 'AIRTABLE_CLIENTES_TABLE_ID',
    campos: [
      { nombre: 'ID', tipo: ['formula', TEXTO], resultado: TEXTO },
      { nombre: 'Cliente', tipo: TEXTO, uso: 'eUse cruza la remisión local con este nombre exacto' },
      { nombre: 'Nit' },
      { nombre: 'distancia_bodega_km', tipo: 'number', uso: 'eUse lanza un error si el cliente no la tiene' },
      { nombre: 'Personal Clientes', tipo: LINK, enlaza: 'personalCliente' },
      { nombre: 'Areas Cliente', tipo: LINK, enlaza: 'areasCliente' },
      // eUse lee esta tabla por field ID: un ID viejo le quita el nombre o la distancia.
      { variable: 'AIRTABLE_CLIENTES_NOMBRE_FIELD_ID', nombre: 'Cliente', critico: true },
      { variable: 'AIRTABLE_CLIENTES_DISTANCIA_FIELD_ID', nombre: 'distancia_bodega_km', critico: true },
    ],
  },
  personalCliente: {
    base: 'clientes',
    variable: 'AIRTABLE_CLIENTES_PERSONAL_TABLE_ID',
    campos: [
      { nombre: 'Codigo Persona Cliente', tipo: 'formula', resultado: TEXTO },
      { nombre: 'Nombre Completo', tipo: TEXTO },
      { nombre: 'Cedula', tipo: TEXTO },
      { nombre: 'Email', tipo: 'email' },
      { nombre: 'Email Notificacion', tipo: 'email' },
      { nombre: 'Teléfono', tipo: 'phoneNumber' },
      { nombre: 'Cliente', tipo: LINK, enlaza: 'clientes' },
      { nombre: 'Estado Personal', tipo: SELECT, opciones: ['Inactivo'], otras: ['Activo'] },
    ],
  },
  areasCliente: {
    base: 'clientes',
    variable: 'AIRTABLE_CLIENTES_AREAS_TABLE_ID',
    campos: [
      { nombre: 'ID', tipo: ['formula', TEXTO], resultado: TEXTO },
      { nombre: 'Nombre Area', tipo: TEXTO },
      { nombre: 'Estado Area', tipo: SELECT, opciones: ['Activo', 'Inactivo'] },
    ],
  },
  baches: {
    base: 'piroliapp',
    variable: 'AIRTABLE_BACHES_TABLE_ID',
    campos: [
      { nombre: 'Codigo Bache', tipo: 'formula', resultado: TEXTO },
      {
        nombre: 'Estado Bache',
        tipo: SELECT,
        opciones: ['Bache Agotado', 'Bache Completo Bodega', 'Bache Incompleto', 'Bache en proceso', 'Bache Completo Planta'],
        uso: 'el despacho escribe Agotado / Incompleto y el selector explica los demás',
      },
      {
        nombre: 'Origen Registro',
        tipo: SELECT,
        opciones: ['Migrado PiroliApp V2'],
        uso: 'es la marca por la que se excluyen los 61 baches migrados',
      },
      { nombre: 'Total Cantidad Actual Biochar Seco', tipo: 'formula', resultado: 'number' },
    ],
  },
  remisionesBaches: {
    base: 'piroliapp',
    variable: 'AIRTABLE_REMISIONES_BACHES_TABLE_ID',
    campos: [
      {
        variable: 'AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID',
        nombre: 'Fecha Evento',
        tipo: 'date',
        critico: true,
        uso: 'eUse filtra el periodo por esta fecha',
      },
      { variable: 'AIRTABLE_REMISIONES_REALIZA_REGISTRO_FIELD_ID', nombre: 'Realiza Registro', tipo: TEXTO, critico: true },
      {
        variable: 'AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID',
        nombre: 'Observaciones',
        tipo: MEMO,
        critico: true,
        uso: 'lleva [DESPACHO:<remisión>] y el código además la busca por nombre',
      },
      {
        variable: 'AIRTABLE_REMISIONES_CLIENTE_FIELD_ID',
        nombre: 'Cliente',
        tipo: TEXTO,
        critico: true,
        uso: 'eUse lo cruza con Clients Core por nombre exacto',
      },
      {
        variable: 'AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID',
        nombre: 'Bache Pirolisis Alterado',
        tipo: LINK,
        enlaza: 'baches',
        critico: true,
      },
      {
        variable: 'AIRTABLE_REMISIONES_DETALLE_CANTIDADES_FIELD_ID',
        nombre: 'Detalle Cantidades Bache Pirolisis',
        tipo: LINK,
        enlaza: 'detalleCantidades',
        critico: true,
        uso: 'el código además lo lee por nombre',
      },
      ...CAMPOS_REMISION_LOCAL_OTROS_CAMINOS.map((variable) => ({ variable })),
      ...CAMPOS_REMISION_LOCAL_SIN_USO.map((variable) => ({ variable, sinUso: true })),
    ],
  },
  detalleCantidades: {
    base: 'piroliapp',
    variable: 'AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID',
    campos: [
      {
        variable: 'AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID',
        nombre: 'Cantidad Especificada (KG)',
        tipo: 'number',
        critico: true,
        uso: 'es lo que baja la fórmula del bache',
      },
      {
        variable: 'AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID',
        nombre: 'Remisiones Baches Pirolisis',
        tipo: LINK,
        enlaza: 'remisionesBaches',
        critico: true,
      },
      { variable: 'AIRTABLE_DETALLE_BACHE_PIROLISIS_FIELD_ID', nombre: 'Bache Pirolisis', tipo: LINK, enlaza: 'baches', critico: true },
      {
        variable: 'AIRTABLE_DETALLE_ID_PRODUCCION_BLEND_FIELD_ID',
        nombre: 'ID Produccion Blend',
        tipo: TEXTO,
        critico: true,
        uso: 'el despacho lo deja vacío; la producción lo llena con el lote',
      },
    ],
  },
};

/**
 * Productos que necesitan su fila en `Stock_Actual`: el saldo es una fórmula sobre
 * los movimientos VINCULADOS a esa fila, así que sin ella una Salida del despacho
 * no baja el saldo. Si hay dos, el código vincula a la primera que encuentra y el
 * saldo queda partido entre ambas.
 */
const PRODUCTOS_CON_STOCK = [
  { variable: 'AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID', etiqueta: 'biochar puro' },
  { variable: 'AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID', etiqueta: 'Biochar Blend' },
];

/**
 * La prueba de la autorización de datos (Ley 1581). Los nombres son el contrato de
 * `CAMPOS_AUTORIZACION` en `src/lib/recepcion/autorizaciones.ts`, que la lee y la
 * escribe por NOMBRE de campo.
 *
 * `Referencia` es texto y no autonumber porque la API no crea campos calculados; el
 * instante en milisegundos ya la hace única por acto.
 */
const AUTORIZACIONES = {
  nombre: 'Autorizaciones Datos Personales',
  variable: 'AIRTABLE_AUTORIZACIONES_DATOS_TABLE_ID',
  descripcion:
    'Prueba de la autorización de tratamiento de datos personales que da quien recibe una ' +
    'remisión por el enlace de recepción de PiroliApp (Ley 1581 de 2012; el Decreto 1377 de 2013, ' +
    'art. 8, obliga a conservarla). De SOLO INSERCIÓN: la app agrega una fila por cada acto y nunca ' +
    'edita ni borra; un reintento agrega otra fila, y es correcto. Celular y correo no se repiten ' +
    'aquí: viven en Personas de Sirius Remisiones Core. La revocación se marca a mano.',
  campos: [
    {
      name: 'Referencia',
      type: TEXTO,
      description: 'AUT-<remisión>-<epoch en ms>. Texto y no autonumber: la API no crea campos calculados.',
    },
    {
      name: 'Fecha Hora',
      type: 'dateTime',
      options: { timeZone: 'America/Bogota', dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' } },
      description: 'Instante en que se aceptó la autorización.',
    },
    { name: 'Remision', type: TEXTO, description: 'SIRIUS-REM-XXXX que se estaba recibiendo (FK simbólica a Remisiones Core).' },
    { name: 'Nombre Completo', type: TEXTO, description: 'Titular que autoriza.' },
    { name: 'Cedula', type: TEXTO, description: 'Número de identificación del titular.' },
    {
      name: 'Datos Autorizados',
      type: TEXTO,
      description:
        'Qué datos cubre: «nombre, cédula, celular, correo» al registrarse, o «correo» al agregarle ' +
        'el correo a una persona ya conocida.',
    },
    { name: 'Texto Version', type: TEXTO, description: 'Versión del texto legal que se mostró.' },
    {
      name: 'Texto SHA256',
      type: TEXTO,
      description: 'Huella SHA-256 del texto exacto que se mostró: prueba qué se aceptó aunque el texto cambie después.',
    },
    { name: 'Canal', type: TEXTO, description: 'Por dónde se otorgó (por ejemplo, el enlace de recepción).' },
    { name: 'IP', type: TEXTO, description: 'IP de quien aceptó: evidencia técnica del acto.' },
    { name: 'User Agent', type: TEXTO, description: 'Navegador de quien aceptó, recortado a 200 caracteres.' },
    {
      name: 'Revocada',
      type: 'checkbox',
      options: { icon: 'check', color: 'redBright' },
      description: 'Se marca A MANO cuando el titular revoca la autorización. La app nunca la escribe.',
    },
    {
      name: 'Fecha Revocacion',
      type: 'date',
      options: { dateFormat: { name: 'iso' } },
      description: 'Fecha en que se registró la revocación (a mano).',
    },
  ],
};

/**
 * Lo que se agrega a la descripción de `produccion_destino_id`. Se AGREGA y no se
 * reemplaza: la base es compartida y el texto actual puede tener redacción ajena
 * que no hay por qué perder. Va sin tildes y con su misma forma («Para … es …»)
 * para que se lea como una sola descripción. `MARCA_DESCRIPCION` es la llave de
 * idempotencia.
 */
const MARCA_DESCRIPCION = 'SIRIUS-REM-';
const FRASE_DESPACHO =
  'Para la Salida de biochar puro de un despacho comercial (venta con remision) es el codigo ' +
  'SIRIUS-REM-XXXX de la remision en Sirius Remisiones Core, el mismo para todos sus baches; la llave ' +
  'de idempotencia de cada Salida va en documento_referencia (DESP-<remision>-<bache>).';
const DESCRIPCION_SIN_TEXTO_PREVIO =
  'FK simbolica al destino del biochar. Para un consumo de produccion es el lote BLEND-AAAA-MM-DD; ' +
  'para una salida que no es produccion, la referencia SAL-<MOTIVO>-<fecha>-<bache>. ' +
  FRASE_DESPACHO;

// ─────────────────────────────────────────────────────────────────────────────
// Airtable
// ─────────────────────────────────────────────────────────────────────────────

const pausa = () => new Promise((r) => setTimeout(r, 220)); // 5 req/s por base

async function airtable(url, { method = 'GET', body, token = TOKEN } = {}) {
  // Defensa en profundidad: aunque una rama olvide preguntar por --apply, un dry-run
  // no puede escribir. Un script que muta producción tiene que poder ensayarse.
  if (method !== 'GET' && !APPLY) throw new Error(`Escritura ${method} bloqueada: falta --apply`);

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  await pausa();

  if (!res.ok) {
    const e = data?.error;
    const detalle = typeof e === 'string' ? e : [e?.type, e?.message].filter(Boolean).join(': ');
    const pista = [401, 403, 404].includes(res.status)
      ? ' (¿el token ve esta base y tiene el scope schema.bases:read, o schema.bases:write con --apply?)'
      : '';
    throw new Error(`Airtable ${method} ${res.status}${detalle ? ` ${detalle}` : ''}${pista}`);
  }
  return data ?? {};
}

const cacheTablas = new Map();

/** Esquema de una base por la Meta API, una sola lectura por base. */
async function tablasDe(claveBase) {
  if (cacheTablas.has(claveBase)) return cacheTablas.get(claveBase);
  const { variable } = BASES[claveBase];
  const baseId = env[variable];
  if (!baseId) throw new Error(`falta la variable ${variable}`);
  const { tables } = await airtable(`${META}/${baseId}/tables`);
  cacheTablas.set(claveBase, tables ?? []);
  return tables ?? [];
}

/** El entorno puede guardar el ID o el nombre de la tabla: la API acepta los dos. */
function buscarTabla(tablas, idONombre) {
  if (!idONombre) return null;
  return tablas.find((t) => t.id === idONombre || t.name === idONombre) ?? null;
}

async function leerTodo(baseId, tabla, token, campos = []) {
  const registros = [];
  let offset;
  do {
    const url = new URL(`${AT}/${baseId}/${encodeURIComponent(tabla)}`);
    url.searchParams.set('pageSize', '100');
    for (const c of campos) url.searchParams.append('fields[]', c);
    if (offset) url.searchParams.set('offset', offset);
    const data = await airtable(url.toString(), { token });
    registros.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return registros;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparación
// ─────────────────────────────────────────────────────────────────────────────

const lista = (xs) => xs.map((x) => `«${x}»`).join(', ');

/** Para sugerir el campo que existe con otro nombre ("Cantidad " con espacio final, tildes). */
const normalizar = (s) =>
  String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Las fórmulas pueden devolver `{ specialValue: 'NaN' }` en vez de un número. */
function aNumero(v) {
  const n = typeof v === 'object' && v !== null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const kg = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });

/**
 * Compara un campo contra lo esperado. Devuelve `{ problemas, omitido }`: `omitido`
 * marca una variable opcional sin definir, que no es un problema de este flujo.
 */
function verificarCampo(tabla, esp, tablasBase) {
  const problemas = [];
  const etiqueta = esp.variable ? `${esp.variable}${esp.nombre ? ` («${esp.nombre}»)` : ''}` : `«${esp.nombre}»`;
  const error = (texto) => problemas.push({ nivel: 'error', texto: esp.uso ? `${texto} — ${esp.uso}` : texto });
  const aviso = (texto) => problemas.push({ nivel: 'aviso', texto });

  let campo;
  if (esp.variable) {
    const valor = env[esp.variable];
    if (!valor) {
      if (esp.critico) error(`${etiqueta}: falta la variable`);
      return { problemas, omitido: !esp.critico };
    }
    campo = tabla.fields.find((f) => f.id === valor || f.name === valor);
    if (!campo) {
      const texto = `${etiqueta}: la variable no corresponde a ningún campo de «${tabla.name}» (¿un field ID viejo?)`;
      if (esp.sinUso) aviso(`${texto}; ningún código la usa: quitarla de config.ts y después del entorno`);
      else error(texto);
      return { problemas };
    }
    if (campo.id !== valor) {
      // Las lecturas por field ID usan `returnFieldsByFieldId=true`: con un nombre
      // en la variable, `fields[valor]` es siempre undefined.
      error(`${etiqueta}: la variable guarda el NOMBRE «${valor}» y no el field ID`);
    }
    if (esp.nombre && campo.name !== esp.nombre) {
      error(`${esp.variable} apunta a «${campo.name}» y se esperaba «${esp.nombre}»`);
    }
  } else {
    campo = tabla.fields.find((f) => f.name === esp.nombre);
    if (!campo) {
      const parecido = tabla.fields.find((f) => normalizar(f.name) === normalizar(esp.nombre));
      error(
        `${etiqueta}: no existe` +
          (parecido ? ` (hay «${parecido.name}»; el código lo busca con el nombre exacto)` : '')
      );
      return { problemas };
    }
  }

  const tipos = [].concat(esp.tipo ?? []);
  if (tipos.length && !tipos.includes(campo.type)) {
    error(`${etiqueta}: es ${campo.type} y se esperaba ${tipos.join(' o ')}`);
    return { problemas };
  }

  if ((campo.type === 'formula' || campo.type === 'rollup') && campo.options?.isValid === false) {
    error(`${etiqueta}: la fórmula tiene un error en Airtable`);
  }

  const resultado = campo.options?.result?.type;
  if (esp.resultado && (campo.type === 'formula' || campo.type === 'rollup') && resultado) {
    const aceptados = [].concat(esp.resultado);
    if (!aceptados.includes(resultado)) error(`${etiqueta}: da ${resultado} y se esperaba ${aceptados.join(' o ')}`);
  }

  if (campo.type === SELECT || campo.type === 'multipleSelects') {
    const hay = new Set((campo.options?.choices ?? []).map((c) => c.name));
    const faltan = (esp.opciones ?? []).filter((o) => !hay.has(o));
    if (faltan.length) error(`${etiqueta}: le faltan las opciones ${lista(faltan)}`);
    const faltanOtras = (esp.otras ?? []).filter((o) => !hay.has(o));
    if (faltanOtras.length) aviso(`${etiqueta}: ya no tiene ${lista(faltanOtras)} (el código no las usa)`);
  }

  if (esp.enlaza) {
    const destino = buscarTabla(tablasBase, env[TABLAS[esp.enlaza].variable]);
    const enlazada = campo.options?.linkedTableId;
    // Sin destino resuelto ya hay un error por la tabla misma; no se duplica aquí.
    if (destino && enlazada !== destino.id) {
      const otra = tablasBase.find((t) => t.id === enlazada);
      error(`${etiqueta}: enlaza a «${otra?.name ?? 'otra base'}» y se esperaba «${destino.name}»`);
    }
  }

  return { problemas };
}

function verificarTabla(clave, tablasBase) {
  const def = TABLAS[clave];
  const tabla = buscarTabla(tablasBase, env[def.variable]);
  if (!tabla) {
    const texto = env[def.variable]
      ? `${def.variable} no corresponde a ninguna tabla de la base`
      : `falta la variable ${def.variable}`;
    return { titulo: def.variable, tabla: null, problemas: [{ nivel: 'error', texto }], verificados: 0, omitidos: [] };
  }

  const problemas = [];
  const omitidos = [];
  let verificados = 0;
  for (const esp of def.campos) {
    const r = verificarCampo(tabla, esp, tablasBase);
    problemas.push(...r.problemas);
    if (r.omitido) omitidos.push(esp.variable);
    else verificados++;
  }
  return { titulo: tabla.name, tabla, problemas, verificados, omitidos };
}

/** Compara la tabla de autorizaciones con lo que va a crear `--crear-autorizaciones`. */
function compararAutorizaciones(tabla) {
  const problemas = [];
  const porNombre = new Map(tabla.fields.map((f) => [f.name, f]));
  const primario = tabla.fields.find((f) => f.id === tabla.primaryFieldId);
  if (primario && primario.name !== AUTORIZACIONES.campos[0].name) {
    problemas.push({
      nivel: 'error',
      texto: `el campo primario es «${primario.name}» y se esperaba «${AUTORIZACIONES.campos[0].name}»`,
    });
  }
  const faltantes = [];
  for (const c of AUTORIZACIONES.campos) {
    const real = porNombre.get(c.name);
    if (!real) faltantes.push(c);
    else if (real.type !== c.type) {
      problemas.push({ nivel: 'error', texto: `«${c.name}» es ${real.type} y se esperaba ${c.type} (corregir a mano en la UI)` });
    }
  }
  return { problemas, faltantes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificación (solo lectura)
// ─────────────────────────────────────────────────────────────────────────────

const conteo = { errores: 0, avisos: 0 };

function imprimir(titulo, problemas, detalleOk) {
  const errores = problemas.filter((p) => p.nivel === 'error');
  conteo.errores += errores.length;
  conteo.avisos += problemas.length - errores.length;

  if (!problemas.length) {
    console.log(`  ✓ ${titulo}${detalleOk ? ` — ${detalleOk}` : ''}`);
    return;
  }
  console.log(`  ${errores.length ? '✗' : '!'} ${titulo}`);
  for (const p of problemas) console.log(`      ${p.nivel === 'error' ? 'ERROR' : 'AVISO'}  ${p.texto}`);
}

async function verificarStock() {
  const def = TABLAS.stock;
  const baseId = env[BASES.inventario.variable];
  const tablaStock = env[def.variable];
  if (!baseId || !tablaStock) return; // ya reportado al verificar la tabla

  let filas;
  try {
    // Lectura completa y cruce en JS: la tabla tiene pocas filas, y así se cuentan
    // también los duplicados, que una consulta con maxRecords=1 escondería.
    filas = await leerTodo(baseId, tablaStock, TOKEN_INVENTARIO, ['producto_id', 'stock_actual']);
  } catch (err) {
    imprimir('Stock_Actual (filas)', [{ nivel: 'error', texto: `no se pudo leer: ${err.message}` }]);
    return;
  }

  for (const p of PRODUCTOS_CON_STOCK) {
    const producto = env[p.variable];
    const titulo = `Stock_Actual de ${p.etiqueta}`;
    if (!producto) {
      imprimir(titulo, [{ nivel: 'error', texto: `falta la variable ${p.variable}` }]);
      continue;
    }
    const suyas = filas.filter((f) => String(f.fields?.producto_id ?? '').trim() === producto.trim());
    if (suyas.length === 1) {
      imprimir(titulo, [], `${producto}: una fila, saldo ${kg(aNumero(suyas[0].fields?.stock_actual))} kg`);
    } else if (!suyas.length) {
      imprimir(titulo, [
        { nivel: 'error', texto: `${producto} no tiene fila: las Salidas del despacho no bajarían el saldo` },
      ]);
    } else {
      imprimir(titulo, [
        { nivel: 'error', texto: `${producto} tiene ${suyas.length} filas: el saldo quedaría partido entre ellas` },
      ]);
    }
  }
}

function verificarDescripcion(tablaMovimientos) {
  const campo = tablaMovimientos.fields.find((f) => f.name === 'produccion_destino_id');
  if (!campo) return; // ya es un error de la tabla
  const actual = String(campo.description ?? '');
  imprimir(
    'Descripción de produccion_destino_id',
    actual.includes(MARCA_DESCRIPCION)
      ? []
      : [{ nivel: 'aviso', texto: 'no menciona el código SIRIUS-REM-… del despacho: correr --describir --apply' }],
    'menciona SIRIUS-REM-…'
  );
}

function verificarAutorizaciones(tablasPiroli) {
  const titulo = `Tabla «${AUTORIZACIONES.nombre}»`;
  const valor = env[AUTORIZACIONES.variable];
  const porVariable = buscarTabla(tablasPiroli, valor);
  const porNombre = tablasPiroli.find((t) => t.name === AUTORIZACIONES.nombre) ?? null;
  const consecuencia = 'mientras tanto, registrar a una persona nueva al recibir responde 503';

  if (!porVariable && !porNombre) {
    const texto = valor
      ? `${AUTORIZACIONES.variable} no corresponde a ninguna tabla de PiroliApp y la tabla no existe`
      : 'la tabla no existe: correr --crear-autorizaciones --apply';
    imprimir(titulo, [{ nivel: 'error', texto: `${texto}; ${consecuencia}` }]);
    return;
  }
  if (!porVariable) {
    const texto = valor
      ? `${AUTORIZACIONES.variable} no corresponde a ninguna tabla; la tabla existe como ${porNombre.id}`
      : `la tabla existe pero falta ${AUTORIZACIONES.variable}=${porNombre.id} en el entorno`;
    imprimir(titulo, [{ nivel: 'error', texto: `${texto}; ${consecuencia}` }]);
    return;
  }
  if (porVariable.name !== AUTORIZACIONES.nombre) {
    // Comparar sus campos solo listaría como "faltantes" los de otra tabla.
    imprimir(titulo, [
      { nivel: 'error', texto: `${AUTORIZACIONES.variable} apunta a «${porVariable.name}», que es otra tabla` },
    ]);
    return;
  }

  const { problemas, faltantes } = compararAutorizaciones(porVariable);
  if (faltantes.length) {
    problemas.push({
      nivel: 'error',
      texto: `le faltan los campos ${lista(faltantes.map((c) => c.name))}: correr --crear-autorizaciones --apply`,
    });
  }
  imprimir(titulo, problemas, `${AUTORIZACIONES.campos.length} campos`);
}

async function verificar() {
  console.log('\nEsquema de las remisiones de pirólisis — VERIFICACIÓN (solo lectura)\n');
  if (APPLY) console.log('(--apply no hace nada sin una acción: la verificación nunca escribe)\n');

  for (const [claveBase, base] of Object.entries(BASES)) {
    console.log(base.titulo);
    let tablasBase;
    try {
      tablasBase = await tablasDe(claveBase);
    } catch (err) {
      imprimir('esquema de la base', [{ nivel: 'error', texto: `no se pudo leer: ${err.message}` }]);
      console.log();
      continue;
    }

    for (const clave of Object.keys(TABLAS).filter((c) => TABLAS[c].base === claveBase)) {
      const r = verificarTabla(clave, tablasBase);
      const detalle = `${r.verificados} campos${r.omitidos.length ? `; sin variable (opcional): ${r.omitidos.join(', ')}` : ''}`;
      imprimir(r.titulo, r.problemas, detalle);
      if (r.omitidos.length && r.problemas.length) console.log(`      sin variable (opcional): ${r.omitidos.join(', ')}`);
      if (clave === 'movimientos' && r.tabla) verificarDescripcion(r.tabla);
    }

    if (claveBase === 'inventario') await verificarStock();
    if (claveBase === 'piroliapp') verificarAutorizaciones(tablasBase);
    console.log();
  }

  console.log(
    `Resumen: ${conteo.errores} ${conteo.errores === 1 ? 'error' : 'errores'} y ` +
      `${conteo.avisos} ${conteo.avisos === 1 ? 'aviso' : 'avisos'}.`
  );
  if (conteo.errores) {
    console.log('Hay discrepancias: el código asumiría un esquema que no existe. Ver los ERROR de arriba.');
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Acciones
// ─────────────────────────────────────────────────────────────────────────────

function imprimirVariable(tablaId) {
  console.log('\n── Para el entorno (.env.local y Vercel: Production y Preview) ──');
  console.log(`${AUTORIZACIONES.variable}=${tablaId}`);
}

async function crearAutorizaciones() {
  console.log(`\nTabla «${AUTORIZACIONES.nombre}» en PiroliApp — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}\n`);
  const baseId = env[BASES.piroliapp.variable];
  const tablas = await tablasDe('piroliapp');

  const valor = env[AUTORIZACIONES.variable];
  const porVariable = buscarTabla(tablas, valor);
  const tabla = porVariable ?? tablas.find((t) => t.name === AUTORIZACIONES.nombre) ?? null;
  if (valor && !porVariable) {
    console.log(`! ${AUTORIZACIONES.variable} no corresponde a ninguna tabla de PiroliApp: hay que corregirla.`);
  }

  if (!tabla) {
    console.log(`+ CREAR la tabla con ${AUTORIZACIONES.campos.length} campos (el primero es el primario):`);
    for (const c of AUTORIZACIONES.campos) console.log(`    ${c.type.padEnd(16)} ${c.name}`);
    if (!APPLY) {
      console.log('\n(dry-run: no se creó nada. Repetir con --apply; el ID de la tabla se imprime al crearla)');
      return;
    }
    const creada = await airtable(`${META}/${baseId}/tables`, {
      method: 'POST',
      body: { name: AUTORIZACIONES.nombre, description: AUTORIZACIONES.descripcion, fields: AUTORIZACIONES.campos },
    });
    console.log(`\n✓ Creada «${creada.name}» con ${creada.fields?.length ?? 0} campos.`);
    imprimirVariable(creada.id);
    return;
  }

  if (tabla.name !== AUTORIZACIONES.nombre) {
    // La variable apunta a otra tabla. Agregarle 13 campos sería irreversible desde
    // aquí: la Meta API no borra campos, y habría que quitarlos a mano uno por uno.
    console.log(`✗ ${AUTORIZACIONES.variable} apunta a «${tabla.name}», que es otra tabla: no se le agrega nada.`);
    console.log('  Corregir la variable (o quitarla para que el script busque la tabla por nombre).');
    process.exitCode = 1;
    return;
  }

  console.log(`= La tabla ya existe («${tabla.name}»)`);
  const { problemas, faltantes } = compararAutorizaciones(tabla);
  for (const p of problemas) console.log(`  ERROR  ${p.texto}`);
  if (!faltantes.length) console.log('  sin campos por agregar');
  for (const c of faltantes) {
    console.log(`  + campo ${c.type.padEnd(16)} ${c.name}`);
    if (!APPLY) continue;
    await airtable(`${META}/${baseId}/tables/${tabla.id}/fields`, { method: 'POST', body: c });
    console.log('    ✓ creado');
  }
  if (faltantes.length && !APPLY) console.log('\n(dry-run: no se agregó nada. Repetir con --apply)');
  if (problemas.length) process.exitCode = 1;
  imprimirVariable(tabla.id);
}

async function describir() {
  console.log(`\nDescripción de produccion_destino_id (Inventario Production Core) — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}\n`);
  const baseId = env[BASES.inventario.variable];
  const tablas = await tablasDe('inventario');
  const tabla = buscarTabla(tablas, env[TABLAS.movimientos.variable]);
  if (!tabla) throw new Error(`${TABLAS.movimientos.variable} no corresponde a ninguna tabla de la base`);
  const campo = tabla.fields.find((f) => f.name === 'produccion_destino_id');
  if (!campo) throw new Error(`«${tabla.name}» no tiene el campo produccion_destino_id`);

  const actual = String(campo.description ?? '').trim();
  if (actual.includes(MARCA_DESCRIPCION)) {
    console.log(`✓ Ya menciona ${MARCA_DESCRIPCION}…: nada que hacer.\n  «${actual}»`);
    return;
  }

  const nueva = actual ? `${actual}${/[.!?…]$/.test(actual) ? '' : '.'} ${FRASE_DESPACHO}` : DESCRIPCION_SIN_TEXTO_PREVIO;
  console.log(`Antes:   «${actual || '(vacía)'}»`);
  console.log(`Después: «${nueva}»`);

  if (!APPLY) {
    console.log('\n(dry-run: no se cambió nada. Repetir con --apply)');
    return;
  }
  await airtable(`${META}/${baseId}/tables/${tabla.id}/fields/${campo.id}`, {
    method: 'PATCH',
    body: { description: nueva },
  });
  console.log('\n✓ Descripción actualizada.');
}

// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  if (!CREAR_AUTORIZACIONES && !DESCRIBIR) {
    await verificar();
    return;
  }
  if (CREAR_AUTORIZACIONES) await crearAutorizaciones();
  if (DESCRIBIR) await describir();
  if (APPLY) console.log('\nVolver a correr sin argumentos para verificar el esquema completo.');
})().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
