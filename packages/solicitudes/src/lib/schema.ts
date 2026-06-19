// Subset de Airtable schema para el módulo de solicitudes.
// Cubre únicamente las tablas de Novedades Nómina (appnRVYZMd4EAQoRF).
// Los nombres de tabla se leen de env vars para permitir sobreescritura por entorno.

export const TABLES = {
  PERMISO:    process.env.AIRTABLE_TABLE_NOVEDADES_PERMISOS   ?? "Solicitud_Permiso",
  VACACIONES: process.env.AIRTABLE_TABLE_NOVEDADES_VACACIONES ?? "Solicitud_Vacaciones",
  NOVEDADES:  process.env.AIRTABLE_TABLE_NOVEDADES_REPORTES   ?? "Reportes Novedades Nomina",
} as const;

// FK canónica del empleado en todas las tablas de solicitudes.
// Valor: "SIRIUS-PER-XXXX" (idCore del payload de sesión).
export const FK_ID_CORE = "ID Personal Core";

export const FIELDS = {
  PERMISO: {
    NOMBRE:          "Nombre",
    CEDULA:          "Cedula",
    CARGO:           "Cargo",
    FECHA_SOLICITUD: "Fecha de solicitud",
    TIPO:            "Tipo_Permiso",
    FECHA_INICIO:    "Fecha de permiso",
    FECHA_FIN:       "Fecha fin de permiso",
    HORAS:           "Horas Permiso",
    MOTIVO:          "Motivo_Permiso",
    REMUNERADO:      "Remunerado",
    COMPENSADO:      "Compensado",
    FECHA_COMP:      "Fecha de compensatorio",
    ESTADO:          "Estado_Permiso",
  },
  VACACIONES: {
    NOMBRE:             "Nombre",
    CEDULA:             "Cedula",
    CARGO:              "Cargo",
    FECHA_PRESENTACION: "Fecha de Presentacion",
    FECHA_INICIO:       "Fecha Inicio",
    FECHA_FIN:          "Fecha Fin",
    FECHA_REINTEGRO:    "Fecha Reintegro",
    DIAS:               "Dias Vacaciones",
    MOTIVO:             "Motivo",
    ESTADO:             "Estado Solicitud",
  },
  NOVEDADES: {
    TIPO:           "Tipo de Novedad",
    DESCRIPCION:    "Descripción de la Novedad",
    HORAS_EXTRA:    "Número Horas Extras",
    ESTADO:         "Estado del Registro",
    FECHA_CREACION: "Fecha Creación",
  },
} as const;

export const ESTADO_PENDIENTE = "Pendiente";
