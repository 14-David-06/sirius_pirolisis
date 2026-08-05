// src/lib/actas-biochar.constants.ts
//
// Contrato compartido del Acta de Entrega de Biochar entre el servicio, el PDF y el
// formulario. Sin imports: el formulario es un componente de cliente y no puede
// arrastrar `config` ni el cliente de Airtable.
//
// El acta documenta una entrega de biochar SIN contraprestación comercial, para
// investigación, ensayo de campo, piloto demostrativo o donación. Es evidencia del
// uso previsto declarado (numeral 5.4.2 de la Puro Biochar Methodology 2022 V3, con
// los principios del numeral 3.6 de la Edition 2025 V2). No es una remisión ni un
// pedido: no hay factura, no hay cliente y no toca los Core comerciales.

/** Nombres REALES de los campos en Airtable. La API indexa `fields` por nombre. */
export const ACTA_FIELDS = {
  idActa: 'ID Acta',
  fechaEntrega: 'Fecha Entrega',
  elaboradoPor: 'Elaborado Por',
  cargoElaboradoPor: 'Cargo Elaborado Por',
  idResponsableCore: 'ID Responsable Core',
  estado: 'Estado Acta',
  tipoBiochar: 'Tipo Biochar',
  loteEntregado: 'Lote Entregado',
  detallePorBache: 'Detalle Por Bache',
  vinculoProduccion: 'Vinculo Registro Produccion',
  cantidadEntregada: 'Cantidad Entregada KG',
  baseCantidad: 'Base Cantidad',
  cantidadSeca: 'Cantidad Seca KG',
  cantidadHumeda: 'Cantidad Humeda KG',
  humedadPct: 'Humedad Lote Pct',
  co2: 'CO2 Secuestrado KG',
  receptor: 'Receptor',
  actuaComoIntermediario: 'Actua Como Intermediario',
  nombreProyecto: 'Nombre Proyecto',
  ubicacionAplicacion: 'Ubicacion Aplicacion',
  coordenadasGps: 'Coordenadas GPS',
  categoriaUso: 'Categoria Uso Previsto',
  categoriaUsoOtro: 'Categoria Uso Otro',
  fechaEstimadaAplicacion: 'Fecha Estimada Aplicacion',
  duracionEnsayo: 'Duracion Estimada Ensayo',
  registroFotografico: 'Registro Fotografico Entrega',
  documentoActa: 'Documento Acta',
  urlDocumentoActa: 'URL Documento Acta',
  firmaSirius: 'Firma Sirius',
  nombreFirmaSirius: 'Nombre Firma Sirius',
  cargoFirmaSirius: 'Cargo Firma Sirius',
  firmaReceptor: 'Firma Receptor',
  nombreFirmaReceptor: 'Nombre Firma Receptor',
  cargoFirmaReceptor: 'Cargo Firma Receptor',
  fechaFirma: 'Fecha Firma',
  observaciones: 'Observaciones',
} as const;

export const RECEPTOR_FIELDS = {
  nombre: 'Nombre Receptor',
  tipo: 'Tipo Receptor',
  personaContacto: 'Persona Contacto',
  documento: 'Documento Identificacion',
  direccion: 'Direccion',
  municipio: 'Municipio',
  departamento: 'Departamento',
  telefono: 'Telefono',
  correo: 'Correo',
  esIntermediario: 'Es Intermediario',
  observaciones: 'Observaciones',
  realizaRegistro: 'Realiza Registro',
} as const;

/**
 * Estados del acta. Son las opciones reales del singleSelect: mandar un valor que
 * no esté aquí devuelve 422.
 *
 * El inventario se descuenta al pasar a `Generada`, no al firmar: el biochar ya
 * salió físicamente de la planta, y esperar la firma dejaría el stock mintiendo
 * mientras el receptor no firme. `Atestada` es el cierre metodológico: el receptor
 * entregó la Atestación de Uso con evidencia de la aplicación real.
 */
export const ESTADO_ACTA = {
  borrador: 'Borrador',
  generada: 'Generada',
  firmada: 'Firmada',
  atestada: 'Atestada',
  anulada: 'Anulada',
} as const;

export type EstadoActa = (typeof ESTADO_ACTA)[keyof typeof ESTADO_ACTA];

/**
 * Qué se entrega, y de qué libro mayor sale.
 *
 * No son dos variantes cosméticas: el biochar puro es el insumo `Biochar Puro` de
 * Sirius Insumos Core y sale de BACHES concretos (es lo que sostiene la
 * trazabilidad de carbono); el Blend es producto terminado en Sirius Inventario
 * Production Core y sale de un LOTE `BLEND-…` ya producido.
 */
export const TIPO_BIOCHAR = {
  puro: 'Biochar Puro',
  blend: 'Biochar Blend',
} as const;

export type TipoBiochar = (typeof TIPO_BIOCHAR)[keyof typeof TIPO_BIOCHAR];

export function esTipoBiochar(valor: unknown): valor is TipoBiochar {
  return valor === TIPO_BIOCHAR.puro || valor === TIPO_BIOCHAR.blend;
}

/**
 * Base de la cantidad del acta. SIEMPRE seca (decisión de David, 2026-08-05).
 *
 * El acta física deja la casilla abierta entre húmeda y seca, pero la planta maneja
 * todo en masa seca y así se elimina de raíz el descuadre más probable: registrar el
 * peso de la balanza (húmedo) contra un inventario que se lleva en seco dejaba el
 * bache con biochar que no existe. No hay conversión porque no hay dos caminos: los
 * KG que se digitan son secos, y el formulario lo dice.
 *
 * El valor es el literal del singleSelect `Base Cantidad` en Airtable: la opción
 * `Húmeda` sigue existiendo en el campo (Airtable no permite borrar opciones por
 * API) pero la app nunca la escribe.
 */
export const BASE_SECA = 'Seca' as const;

/**
 * Categorías de uso previsto (Tabla 3.2, Puro Biochar Methodology Edition 2025 V2).
 * Los strings son las opciones del singleSelect en Airtable, literales.
 */
export const CATEGORIAS_USO = [
  'AF1/AF2 — Enmienda de suelo agrícola aplicada directamente (uso final)',
  'AF3 — Sustrato de cultivo en maceta, vivero o invernadero (uso en cascada)',
  'AF4 — Sustrato de plantación forestal para producción de plántulas',
  'Otro',
] as const;

export type CategoriaUso = (typeof CATEGORIAS_USO)[number];

export const TIPOS_RECEPTOR = [
  'Universidad',
  'Centro de investigación',
  'ONG',
  'Agricultor individual',
  'Empresa',
  'Otro',
] as const;

/** Prefijo del consecutivo del acta. */
export const PREFIJO_ACTA = 'ACTA-BC';

/** `ACTA-BC-0007` a partir del consecutivo. */
export function codigoActa(consecutivo: number): string {
  return `${PREFIJO_ACTA}-${String(consecutivo).padStart(4, '0')}`;
}

/** Consecutivo de un código de acta, o 0 si no tiene el formato esperado. */
export function consecutivoDeCodigo(codigo: unknown): number {
  const m = String(codigo ?? '').match(new RegExp(`^${PREFIJO_ACTA}-(\\d+)$`));
  return m ? Number(m[1]) : 0;
}

/**
 * Normaliza una humedad leída del monitoreo a un % usable, o 0 si no hay dato.
 *
 * La humedad NO entra en ningún cálculo: es informativa, la exige la sección 2 del
 * acta. Se sanea igual porque el lookup del monitoreo es texto libre y un valor
 * absurdo impreso en un documento firmado es un problema.
 */
export function normalizarHumedad(humedadPct: unknown): number {
  const n = Number(humedadPct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.min(n, 99) * 100) / 100;
}
