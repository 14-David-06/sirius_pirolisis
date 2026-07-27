import 'server-only';

import { config } from './config';

/**
 * Field IDs y Table IDs de Sirius Activos Core.
 *
 * ⚠️ MÓDULO SERVER-ONLY. El `import 'server-only'` hace que el build falle si
 * un componente cliente lo importa, aunque sea de forma indirecta.
 *
 * Antes estos IDs vivían hardcodeados en `activos.constants.ts`, que además
 * exporta constantes de UI y por eso lo importan componentes `"use client"`:
 * el resultado era que el base ID, los table IDs y los 51 field IDs terminaban
 * en el bundle que se descarga en el navegador. `activos.constants.ts` quedó
 * únicamente con constantes de presentación.
 *
 * Los valores se configuran en `.env.local` (ver `.env.example`).
 */

const faltantes: string[] = [];

/**
 * Lee un field ID obligatorio.
 *
 * Devuelve `string` (no `string | undefined`) para que pueda usarse como clave
 * de objeto; si falta la variable, acumula su nombre y al final del módulo se
 * lanza un error con la lista completa. Fallar aquí es preferible a mandarle a
 * Airtable un PATCH con claves `undefined`, que corrompería el registro.
 */
function fieldId(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    faltantes.push(nombre);
    return '';
  }
  return valor;
}

/** Field IDs de la tabla Activos Fijos. */
export const ACTIVOS_FIELD_IDS = {
  codigoActivo: fieldId('AIRTABLE_ACTIVO_CODIGO_ACTIVO_FIELD_ID'),
  id: fieldId('AIRTABLE_ACTIVO_ID_FIELD_ID'),
  nombreActivo: fieldId('AIRTABLE_ACTIVO_NOMBRE_ACTIVO_FIELD_ID'),
  descripcion: fieldId('AIRTABLE_ACTIVO_DESCRIPCION_FIELD_ID'),
  tipoActivo: fieldId('AIRTABLE_ACTIVO_TIPO_ACTIVO_FIELD_ID'),
  categoria: fieldId('AIRTABLE_ACTIVO_CATEGORIA_FIELD_ID'),
  numeroSerie: fieldId('AIRTABLE_ACTIVO_NUMERO_SERIE_FIELD_ID'),
  codigoInterno: fieldId('AIRTABLE_ACTIVO_CODIGO_INTERNO_FIELD_ID'),
  estadoOperativo: fieldId('AIRTABLE_ACTIVO_ESTADO_OPERATIVO_FIELD_ID'),
  ubicacionActual: fieldId('AIRTABLE_ACTIVO_UBICACION_ACTUAL_FIELD_ID'),
  areaResponsable: fieldId('AIRTABLE_ACTIVO_AREA_RESPONSABLE_FIELD_ID'),
  responsableAsignado: fieldId('AIRTABLE_ACTIVO_RESPONSABLE_ASIGNADO_FIELD_ID'),
  fechaAdquisicion: fieldId('AIRTABLE_ACTIVO_FECHA_ADQUISICION_FIELD_ID'),
  valorAdquisicion: fieldId('AIRTABLE_ACTIVO_VALOR_ADQUISICION_FIELD_ID'),
  proveedor: fieldId('AIRTABLE_ACTIVO_PROVEEDOR_FIELD_ID'),
  marca: fieldId('AIRTABLE_ACTIVO_MARCA_FIELD_ID'),
  modelo: fieldId('AIRTABLE_ACTIVO_MODELO_FIELD_ID'),
  requiereVencimiento: fieldId('AIRTABLE_ACTIVO_REQUIERE_VENCIMIENTO_FIELD_ID'),
  fechaVencimiento: fieldId('AIRTABLE_ACTIVO_FECHA_VENCIMIENTO_FIELD_ID'),
  diasParaVencimiento: fieldId('AIRTABLE_ACTIVO_DIAS_PARA_VENCIMIENTO_FIELD_ID'),
  requiereMantenimiento: fieldId('AIRTABLE_ACTIVO_REQUIERE_MANTENIMIENTO_FIELD_ID'),
  proximoMantenimiento: fieldId('AIRTABLE_ACTIVO_PROXIMO_MANTENIMIENTO_FIELD_ID'),
  vidaUtilEstimada: fieldId('AIRTABLE_ACTIVO_VIDA_UTIL_ESTIMADA_FIELD_ID'),
  anioBajaEstimado: fieldId('AIRTABLE_ACTIVO_ANIO_BAJA_ESTIMADO_FIELD_ID'),
  historialEventos: fieldId('AIRTABLE_ACTIVO_HISTORIAL_EVENTOS_FIELD_ID'),
  estaAsignado: fieldId('AIRTABLE_ACTIVO_ESTA_ASIGNADO_FIELD_ID'),
  notas: fieldId('AIRTABLE_ACTIVO_NOTAS_FIELD_ID'),
  fotoActivo: fieldId('AIRTABLE_ACTIVO_FOTO_ACTIVO_FIELD_ID'),
  asignaciones: fieldId('AIRTABLE_ACTIVO_ASIGNACIONES_FIELD_ID'),
  ultimaAsignacion: fieldId('AIRTABLE_ACTIVO_ULTIMA_ASIGNACION_FIELD_ID'),
  ultimaDevolucion: fieldId('AIRTABLE_ACTIVO_ULTIMA_DEVOLUCION_FIELD_ID'),
} as const;

/** Field IDs de la tabla Asignaciones. */
export const ASIGNACIONES_FIELD_IDS = {
  responsable: fieldId('AIRTABLE_ASIGNACION_RESPONSABLE_FIELD_ID'),
  activo: fieldId('AIRTABLE_ASIGNACION_ACTIVO_FIELD_ID'),
  nombreActivo: fieldId('AIRTABLE_ASIGNACION_NOMBRE_ACTIVO_FIELD_ID'),
  codigoActivo: fieldId('AIRTABLE_ASIGNACION_CODIGO_ACTIVO_FIELD_ID'),
  areaResponsable: fieldId('AIRTABLE_ASIGNACION_AREA_RESPONSABLE_FIELD_ID'),
  fechaAsignacion: fieldId('AIRTABLE_ASIGNACION_FECHA_ASIGNACION_FIELD_ID'),
  fechaDevolucion: fieldId('AIRTABLE_ASIGNACION_FECHA_DEVOLUCION_FIELD_ID'),
  estadoAsignacion: fieldId('AIRTABLE_ASIGNACION_ESTADO_ASIGNACION_FIELD_ID'),
  ubicacionDestino: fieldId('AIRTABLE_ASIGNACION_UBICACION_DESTINO_FIELD_ID'),
  propositoUso: fieldId('AIRTABLE_ASIGNACION_PROPOSITO_USO_FIELD_ID'),
  condicionAlAsignar: fieldId('AIRTABLE_ASIGNACION_CONDICION_AL_ASIGNAR_FIELD_ID'),
  condicionAlDevolver: fieldId('AIRTABLE_ASIGNACION_CONDICION_AL_DEVOLVER_FIELD_ID'),
  observacionesAsignacion: fieldId('AIRTABLE_ASIGNACION_OBSERVACIONES_ASIGNACION_FIELD_ID'),
  observacionesDevolucion: fieldId('AIRTABLE_ASIGNACION_OBSERVACIONES_DEVOLUCION_FIELD_ID'),
  diasEnUso: fieldId('AIRTABLE_ASIGNACION_DIAS_EN_USO_FIELD_ID'),
  usuarioQueAsigna: fieldId('AIRTABLE_ASIGNACION_USUARIO_QUE_ASIGNA_FIELD_ID'),
  usuarioQueRecibe: fieldId('AIRTABLE_ASIGNACION_USUARIO_QUE_RECIBE_FIELD_ID'),
  evidenciaAsignacion: fieldId('AIRTABLE_ASIGNACION_EVIDENCIA_ASIGNACION_FIELD_ID'),
  evidenciaDevolucion: fieldId('AIRTABLE_ASIGNACION_EVIDENCIA_DEVOLUCION_FIELD_ID'),
  requiereMantenimiento: fieldId('AIRTABLE_ASIGNACION_REQUIERE_MANTENIMIENTO_FIELD_ID'),
} as const;

/**
 * IDs de base y tablas de Sirius Activos Core.
 * Reexpuestos desde `config` para que las rutas de activos tengan un único
 * punto de acceso; los valores siguen viniendo de variables de entorno.
 */
export const ACTIVOS_TABLE_IDS = {
  base: config.airtable.activosCoreBaseId,
  activosFijos: config.airtable.activosFijosTableId,
  asignaciones: config.airtable.asignacionesTableId,
  tiposActivo: config.airtable.tiposActivoTableId,
  ubicaciones: config.airtable.ubicacionesTableId,
  hojaVidaActivo: config.airtable.hojaVidaActivoTableId,
} as const;

/** Nombres de las variables de entorno que faltan por configurar. */
export const MISSING_ACTIVOS_ENV_VARS: readonly string[] = faltantes;

if (faltantes.length > 0) {
  console.error(
    `❌ Sirius Activos Core: faltan ${faltantes.length} field IDs en el entorno.\n` +
    `   Las rutas de /api/activos que los usen fallarán.\n` +
    `   Configúralos en .env.local (ver .env.example):\n` +
    faltantes.map((v) => `   - ${v}`).join('\n')
  );
}

/**
 * Lanza si falta algún field ID. Llamar al inicio de las rutas que escriben en
 * Airtable: es mejor devolver un 500 explícito que enviar un PATCH con claves
 * vacías, que Airtable rechaza con un error opaco o —peor— aplica a medias.
 */
export function assertActivosFieldIds(): void {
  if (faltantes.length > 0) {
    throw new Error(
      `Configuración de Sirius Activos Core incompleta. Variables de entorno faltantes: ${faltantes.join(', ')}`
    );
  }
}
