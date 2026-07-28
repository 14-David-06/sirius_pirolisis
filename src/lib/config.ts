// src/lib/config.ts
// Configuración centralizada y segura de variables de entorno

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN GLOBAL — Consolidación de múltiples tokens en uno solo
// ═══════════════════════════════════════════════════════════════════════════
// Variable: AIRTABLE_GLOBAL_TOKEN
// Propósito: Un solo token con acceso a todas las bases de Airtable necesarias
// Ventajas:
//   ✅ Simplifica gestión (8 tokens → 1 token)
//   ✅ Rotación simple (cambiar 1 variable en 1 lugar)
//   ✅ Backward compatible (si existe token específico, lo usa primero)
//   ✅ Fallback automático (si no hay token específico, usa el global)
// ═══════════════════════════════════════════════════════════════════════════
const GLOBAL_TOKEN = process.env.AIRTABLE_GLOBAL_TOKEN;

export const config = {
  airtable: {
    // Token principal para base PiroliApp (con fallback a global)
    token: process.env.AIRTABLE_TOKEN || GLOBAL_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID,
    tableName: process.env.AIRTABLE_TABLE_NAME,
    bachesTableId: process.env.AIRTABLE_BACHES_TABLE_ID,
    remisionesBachesTableId: process.env.AIRTABLE_REMISIONES_BACHES_TABLE_ID,
    detalleCantidadesRemisionTableId: process.env.AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID,

    // ═══════════════════════════════════════════════════════════════════════════
    // SIRIUS INSUMOS CORE — Inventario Centralizado (2026-07-27)
    // ═══════════════════════════════════════════════════════════════════════════
    // Reemplaza: Inventario/Entrada/Salida Insumos Pirolisis (base local)
    insumosCoreBaseId: process.env.AIRTABLE_INSUMOS_CORE_BASE_ID,
    insumosCoreToken: GLOBAL_TOKEN,  // Usa el token global que tiene acceso a todas las bases
    insumosTableId: process.env.AIRTABLE_INSUMOS_TABLE_ID,
    movimientosInsumosTableId: process.env.AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID,
    stockInsumosTableId: process.env.AIRTABLE_STOCK_INSUMOS_TABLE_ID,
    categoriaInsumoTableId: process.env.AIRTABLE_CATEGORIA_INSUMO_TABLE_ID,
    unidadesMedidaTableId: process.env.AIRTABLE_UNIDADES_MEDIDA_TABLE_ID,
    pirolisisAreaCode: process.env.AIRTABLE_PIROLISIS_AREA_CODE,

    // DEPRECATED (2026-07-27): Mantener por si hay rollback
    inventarioTableId: process.env.AIRTABLE_INVENTARIO_TABLE_ID,
    entradasTableId: process.env.AIRTABLE_ENTRADAS_TABLE_ID,
    salidasTableId: process.env.AIRTABLE_SALIDAS_TABLE_ID,
    laboratoriosTableId: process.env.AIRTABLE_LABORATORIOS_TABLE_ID,
    equiposTableId: process.env.AIRTABLE_EQUIPOS_TABLE_ID,
    turnosTableId: process.env.AIRTABLE_TURNOS_TABLE_ID,
    mantenimientosTableId: process.env.AIRTABLE_MANTENIMIENTOS_TABLE_ID,
    monitoreoBachesTableId: process.env.AIRTABLE_MONITOREO_BACHES_TABLE_ID,
    monitoreoViajesBiomasaTableId: process.env.AIRTABLE_MONITOREO_VIAJES_BIOMASA_TABLE_ID,
    viajesBiomasaTableId: process.env.AIRTABLE_VIAJES_BIOMASA_TABLE_ID,
    usuariosTableId: process.env.AIRTABLE_USUARIOS_TABLE_ID,
    // Field IDs para Laboratorios según documentación de Airtable
    // ⚠️ NO HARDCODEAR - Solo usar variables de entorno por seguridad
    laboratoriosFields: {
      id: process.env.AIRTABLE_LABORATORIOS_ID_FIELD_ID,
      nombreLaboratorio: process.env.AIRTABLE_LABORATORIOS_NOMBRE_LABORATORIO_FIELD_ID,
      tipoLaboratorio: process.env.AIRTABLE_LABORATORIOS_TIPO_LABORATORIO_FIELD_ID,
      responsable: process.env.AIRTABLE_LABORATORIOS_RESPONSABLE_FIELD_ID,
      telefono: process.env.AIRTABLE_LABORATORIOS_TELEFONO_FIELD_ID,
      correoElectronico: process.env.AIRTABLE_LABORATORIOS_CORREO_ELECTRONICO_FIELD_ID,
      direccion: process.env.AIRTABLE_LABORATORIOS_DIRECCION_FIELD_ID,
      ciudad: process.env.AIRTABLE_LABORATORIOS_CIUDAD_FIELD_ID,
      pais: process.env.AIRTABLE_LABORATORIOS_PAIS_FIELD_ID,
      certificaciones: process.env.AIRTABLE_LABORATORIOS_CERTIFICACIONES_FIELD_ID,
      acreditaciones: process.env.AIRTABLE_LABORATORIOS_ACREDITACIONES_FIELD_ID,
      metodosAnaliticos: process.env.AIRTABLE_LABORATORIOS_METODOS_ANALITICOS_FIELD_ID,
      // fechaVigenciaCertificaciones: process.env.AIRTABLE_LABORATORIOS_FECHA_VIGENCIA_CERTIFICACIONES_FIELD_ID, // Campo no disponible
      realizaRegistro: process.env.AIRTABLE_LABORATORIOS_REALIZA_REGISTRO_FIELD_ID,
      observaciones: process.env.AIRTABLE_LABORATORIOS_OBSERVACIONES_FIELD_ID,
      monitoreoBaches: process.env.AIRTABLE_LABORATORIOS_MONITOREO_BACHES_FIELD_ID
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // Field IDs — Sirius Insumos Core (2026-07-27)
    // ═══════════════════════════════════════════════════════════════════════════
    insumoFields: {
      nombre: process.env.AIRTABLE_INSUMO_NOMBRE_FIELD_ID,
      categoria: process.env.AIRTABLE_INSUMO_CATEGORIA_FIELD_ID,
      unidadBase: process.env.AIRTABLE_INSUMO_UNIDAD_BASE_FIELD_ID,
      idAreaOrigen: process.env.AIRTABLE_INSUMO_ID_AREA_ORIGEN_FIELD_ID,
      idResponsableCore: process.env.AIRTABLE_INSUMO_ID_RESPONSABLE_CORE_FIELD_ID,
      stockMinimo: process.env.AIRTABLE_INSUMO_STOCK_MINIMO_FIELD_ID,
      estado: process.env.AIRTABLE_INSUMO_ESTADO_FIELD_ID,
      fichaTecnica: process.env.AIRTABLE_INSUMO_FICHA_TECNICA_FIELD_ID,
    },
    movimientoFields: {
      insumo: process.env.AIRTABLE_MOVIMIENTO_INSUMO_FIELD_ID,
      cantidad: process.env.AIRTABLE_MOVIMIENTO_CANTIDAD_FIELD_ID,
      tipoMovimiento: process.env.AIRTABLE_MOVIMIENTO_TIPO_FIELD_ID,
      subtipo: process.env.AIRTABLE_MOVIMIENTO_SUBTIPO_FIELD_ID,
      idAreaOrigen: process.env.AIRTABLE_MOVIMIENTO_ID_AREA_ORIGEN_FIELD_ID,
      idAreaDestino: process.env.AIRTABLE_MOVIMIENTO_ID_AREA_DESTINO_FIELD_ID,
      idResponsable: process.env.AIRTABLE_MOVIMIENTO_ID_RESPONSABLE_FIELD_ID,
      notas: process.env.AIRTABLE_MOVIMIENTO_NOTAS_FIELD_ID,
    },
    stockFields: {
      stockActual: process.env.AIRTABLE_STOCK_ACTUAL_FIELD_ID,
      insumoId: process.env.AIRTABLE_STOCK_INSUMO_ID_FIELD_ID,
      movimientoId: process.env.AIRTABLE_STOCK_MOVIMIENTO_ID_FIELD_ID,
      area: process.env.AIRTABLE_STOCK_AREA_FIELD_ID,
    },

    // DEPRECATED (2026-07-27): Field IDs de la base local
    inventarioFields: {
      insumo: process.env.AIRTABLE_INVENTARIO_INSUMO_FIELD_ID,
      categoria: process.env.AIRTABLE_INVENTARIO_CATEGORIA_FIELD_ID,
      presentacionInsumo: process.env.AIRTABLE_INVENTARIO_PRESENTACION_INSUMO_FIELD_ID,
      cantidadPresentacionInsumo: process.env.AIRTABLE_INVENTARIO_CANTIDAD_PRESENTACION_INSUMO_FIELD_ID,
      realizaRegistro: process.env.AIRTABLE_INVENTARIO_REALIZA_REGISTRO_FIELD_ID,
      fichaSeguridad: process.env.AIRTABLE_INVENTARIO_FICHA_SEGURIDAD_FIELD_ID,
      totalCantidadStock: process.env.AIRTABLE_INVENTARIO_TOTAL_CANTIDAD_STOCK_FIELD_ID,
      categoriaInsumo: process.env.AIRTABLE_FIELD_INVENTARIO_CATEGORIA,
      estado: process.env.AIRTABLE_FIELD_INVENTARIO_ESTADO,
      fechaVencimiento: process.env.AIRTABLE_FIELD_INVENTARIO_FECHA_VENCIMIENTO,
    },
    entradasFields: {
      cantidadIngresa: process.env.AIRTABLE_ENTRADAS_CANTIDAD_INGRESA_FIELD_ID,
      realizaRegistro: process.env.AIRTABLE_ENTRADAS_REALIZA_REGISTRO_FIELD_ID,
      inventarioInsumos: process.env.AIRTABLE_ENTRADAS_INVENTARIO_INSUMOS_FIELD_ID,
      turnoPirolisis: process.env.AIRTABLE_ENTRADAS_TURNO_PIROLISIS_FIELD_ID
    },
    salidasFields: {
      cantidadSale: process.env.AIRTABLE_SALIDAS_CANTIDAD_SALE_FIELD_ID,
      presentacionInsumo: process.env.AIRTABLE_SALIDAS_PRESENTACION_INSUMO_FIELD_ID,
      observaciones: process.env.AIRTABLE_SALIDAS_OBSERVACIONES_FIELD_ID,
      tipoSalida: process.env.AIRTABLE_SALIDAS_TIPO_SALIDA_FIELD_ID,
      documentoSoporte: process.env.AIRTABLE_SALIDAS_DOCUMENTO_SOPORTE_FIELD_ID,
      realizaRegistro: process.env.AIRTABLE_SALIDAS_REALIZA_REGISTRO_FIELD_ID,
      inventarioInsumos: process.env.AIRTABLE_SALIDAS_INVENTARIO_INSUMOS_FIELD_ID,
      turnoPirolisis: process.env.AIRTABLE_SALIDAS_TURNO_PIROLISIS_FIELD_ID,
      mantenimiento: process.env.AIRTABLE_SALIDAS_MANTENIMIENTO_FIELD_ID || 'Mantenimientos',
      // Campos nuevos — trazabilidad productiva
      tipoUso: process.env.AIRTABLE_FIELD_SALIDA_TIPO_USO,
      esProductivo: process.env.AIRTABLE_FIELD_SALIDA_ES_PRODUCTIVO,
      balanceMasaId: process.env.AIRTABLE_FIELD_SALIDA_BALANCE_MASA_ID,
    },
    // Aforos por Turno
    aforosTurnoTableId: process.env.AIRTABLE_TABLE_AFOROS_TURNO,
    // Paquetes de Lonas (tabla local, IDs de insumos del Core)
    paquetesLonasTableId: process.env.AIRTABLE_PAQUETES_LONAS_TABLE_ID,
    lonaInsumoId: process.env.AIRTABLE_LONA_INSUMO_ID,  // MIGRADO al Core (SIRIUS-INS-0062)
    bigBagInsumoId: process.env.AIRTABLE_BIG_BAG_INSUMO_ID,  // MIGRADO al Core (SIRIUS-INS-0063)
    paqueteLonasActivoFieldId: process.env.AIRTABLE_FIELD_PAQUETE_LONAS_ACTIVO,
    lonasVidaEstimadaDias: parseInt(process.env.LONAS_VIDA_ESTIMADA_DIAS || '90', 10),

    // ═══════════════════════════════════════════════════════════════════════════
    // SIRIUS ACTIVOS CORE — Gestión de Activos Fijos Multi-Área
    // ═══════════════════════════════════════════════════════════════════════════
    activosCoreBaseId: process.env.AIRTABLE_ACTIVOS_CORE_BASE_ID,
    activosFijosTableId: process.env.AIRTABLE_ACTIVOS_FIJOS_TABLE_ID,
    asignacionesTableId: process.env.AIRTABLE_ASIGNACIONES_TABLE_ID,
    tiposActivoTableId: process.env.AIRTABLE_TIPOS_ACTIVO_TABLE_ID,
    ubicacionesTableId: process.env.AIRTABLE_UBICACIONES_TABLE_ID,
    hojaVidaActivoTableId: process.env.AIRTABLE_HOJA_VIDA_ACTIVO_TABLE_ID,
    lonasAlertaDias: parseInt(process.env.LONAS_ALERTA_DIAS || '75', 10),
    // Blend (Pedidos, Producción, Remisiones)
    blendPedidosTableId: process.env.AIRTABLE_BLEND_PEDIDOS_TABLE_ID,
    blendProduccionTableId: process.env.AIRTABLE_BLEND_PRODUCCION_TABLE_ID,
    blendRemisionesTableId: process.env.AIRTABLE_BLEND_REMISIONES_TABLE_ID,
    blendDetalleInsumosTableId: process.env.AIRTABLE_BLEND_DETALLE_INSUMOS_TABLE_ID,
    // Sirius Product Core (catálogo de productos) — Blend
    productsBaseId: process.env.AIRTABLE_PRODUCTS_BASE_ID,
    productsTableId: process.env.AIRTABLE_PRODUCTS_TABLE_ID,
    productsToken: process.env.AIRTABLE_PRODUCTS_TOKEN || GLOBAL_TOKEN,
    // Sirius Clients Core (clientes) — Blend + eUse
    clientesBaseId: process.env.AIRTABLE_CLIENTES_BASE_ID,
    clientesTableId: process.env.AIRTABLE_CLIENTES_TABLE_ID,
    clientesToken: process.env.AIRTABLE_CLIENTES_TOKEN || GLOBAL_TOKEN,
    // Sirius Pedidos Core (pedidos centralizados) — Blend
    pedidosCoreBaseId: process.env.AIRTABLE_PEDIDOS_CORE_BASE_ID,
    pedidosCorePedidosTable: process.env.AIRTABLE_PEDIDOS_CORE_PEDIDOS_TABLE,
    pedidosCoreDetallesTable: process.env.AIRTABLE_PEDIDOS_CORE_DETALLES_TABLE,
    pedidosCoreToken: process.env.AIRTABLE_PEDIDOS_CORE_TOKEN || GLOBAL_TOKEN,
    // Sirius Remisiones Core (remisiones centralizadas) — Blend
    remisionesCoreBaseId: process.env.AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE,
    remisionesCoreToken: process.env.AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE || GLOBAL_TOKEN,
    remisionesCoreRemisionesTable: process.env.AIRTABLE_TABLE_REMISIONES,
    remisionesCoreProductosTable: process.env.AIRTABLE_TABLE_PRODUCTOS_REMITIDOS,
    // Sirius Inventario Production Core (inventario de productos finales) — Blend
    inventarioProdCoreBaseId: process.env.AIRTABLE_BASE_SIRIUS_INVENTARIO,
    inventarioProdCoreToken: process.env.AIRTABLE_API_KEY_SIRIUS_INVENTARIO || GLOBAL_TOKEN,
    inventarioProdCoreMovimientosTable: process.env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS,
    inventarioProdCoreStockTable: process.env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK,
    inventarioProdCoreBiocharBlendProductId: process.env.AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID,
    // Sirius Nomina Core (personal, áreas, sistemas) — OPCIONAL (solo login)
    nominaCoreBaseId: process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE,
    nominaCoreToken: process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE || GLOBAL_TOKEN,
    nominaCorePersonalTable: process.env.AIRTABLE_TABLE_NOMINA_PERSONAL,
    nominaCoreAreasTable: process.env.AIRTABLE_TABLE_NOMINA_AREAS,
    nominaCoreSistemasTable: process.env.AIRTABLE_TABLE_NOMINA_SISTEMAS_APLICACIONES,
    // Novedades Nomina — OPCIONAL (módulo solicitudes ROTO)
    novedadesNominaBaseId: process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA,
    novedadesNominaToken: process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA || GLOBAL_TOKEN,
    novedadesNominaReportesTable: process.env.AIRTABLE_TABLE_NOVEDADES_REPORTES,
    novedadesNominaPermisosTable: process.env.AIRTABLE_TABLE_NOVEDADES_PERMISOS,
    novedadesNominaVacacionesTable: process.env.AIRTABLE_TABLE_NOVEDADES_VACACIONES,
    novedadesNominaSiriusTable: process.env.AIRTABLE_TABLE_NOVEDADES_NOMINA_SIRIUS,
    // Insumos Blend (MIGRADOS AL CORE 2026-07-27)
    blendAbono4gRecordId: process.env.AIRTABLE_BLEND_ABONO_4G_RECORD_ID,  // SIRIUS-INS-0064
    blendBiologicosRecordId: process.env.AIRTABLE_BLEND_BIOLOGICOS_RECORD_ID,  // SIRIUS-INS-0065
    // Field IDs para Remisiones Baches Pirolisis
    remisionesBachesFields: {
      id: process.env.AIRTABLE_REMISIONES_ID_FIELD_ID,
      idNumerico: process.env.AIRTABLE_REMISIONES_ID_NUMERICO_FIELD_ID,
      fechaEvento: process.env.AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID,
      realizaRegistro: process.env.AIRTABLE_REMISIONES_REALIZA_REGISTRO_FIELD_ID,
      observaciones: process.env.AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID,
      cliente: process.env.AIRTABLE_REMISIONES_CLIENTE_FIELD_ID,
      nitCliente: process.env.AIRTABLE_REMISIONES_NIT_CLIENTE_FIELD_ID,
      // Campos de Entrega
      responsableEntrega: process.env.AIRTABLE_REMISIONES_RESPONSABLE_ENTREGA_FIELD_ID,
      numeroDocumentoEntrega: process.env.AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_ENTREGA_FIELD_ID,
      telefonoEntrega: process.env.AIRTABLE_REMISIONES_TELEFONO_ENTREGA_FIELD_ID,
      emailEntrega: process.env.AIRTABLE_REMISIONES_EMAIL_ENTREGA_FIELD_ID,
      // Campos de Recepción
      responsableRecibe: process.env.AIRTABLE_REMISIONES_RESPONSABLE_RECIBE_FIELD_ID,
      numeroDocumentoRecibe: process.env.AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_RECIBE_FIELD_ID,
      telefonoRecibe: process.env.AIRTABLE_REMISIONES_TELEFONO_RECIBE_FIELD_ID,
      emailRecibe: process.env.AIRTABLE_REMISIONES_EMAIL_RECIBE_FIELD_ID,
      observacionesRecepcion: process.env.AIRTABLE_REMISIONES_OBSERVACIONES_RECEPCION_FIELD_ID,
      // Documentos y Firmas
      documentoRemision: process.env.AIRTABLE_REMISIONES_DOCUMENTO_REMISION_FIELD_ID,
      qrDocumento: process.env.AIRTABLE_REMISIONES_QR_DOCUMENTO_FIELD_ID,
      firmaEntrega: process.env.AIRTABLE_REMISIONES_FIRMA_ENTREGA_FIELD_ID,
      firmaRecibe: process.env.AIRTABLE_REMISIONES_FIRMA_RECIBE_FIELD_ID,
      // Relaciones
      bachePirolisisAlterado: process.env.AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID,
      detalleCantidadesBachePirolisis: process.env.AIRTABLE_REMISIONES_DETALLE_CANTIDADES_FIELD_ID
    },
    // Field IDs para Detalle Cantidades Remision Pirolisis
    detalleCantidadesFields: {
      cantidadEspecificada: process.env.AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID,
      remisionBachePirolisis: process.env.AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID,
      bachePirolisis: process.env.AIRTABLE_DETALLE_BACHE_PIROLISIS_FIELD_ID
    },
    // Calculadora de Carbono — Table IDs
    carboneBiomasViajesBiomasaTableId: process.env.CARBON_eBiomas_VIAJES_BIOMASA_TABLE_ID,
    carbonEpirolisisTurnoTableId: process.env.CARBON_EPIROLISIS_TURNO_TABLE_ID,
    carbonEpirolisisBalancesMasaTableId: process.env.CARBON_EPIROLISIS_BALANCES_MASA_TABLE_ID,
    carbonEpirolisisManejoResiduosTableId: process.env.CARBON_EPIROLISIS_MANEJO_RESIDUOS_TABLE_ID,
    carbonEpirolisisResultadosTableId: process.env.CARBON_EPIROLISIS_RESULTADOS_TABLE_ID,
    // eTransporte (Etapa 3)
    carbonEtransporteResultadosTableId: process.env.CARBON_ETRANSPORTE_RESULTADOS_TABLE_ID,
  },
  // Calculadora de Carbono — Constantes
  carbon: {
    // eBiomás (Etapa 1)
    consumoDieselPorViaje: process.env.CARBON_CONSUMO_DIESEL_POR_VIAJE,
    densidadDiesel: process.env.CARBON_DENSIDAD_DIESEL,
    feProduccionDiesel: process.env.CARBON_FE_PRODUCCION_DIESEL,
    feCombustionDiesel: process.env.CARBON_FE_COMBUSTION_DIESEL,
    // ePirólisis (Etapa 2)
    feElectricidad: process.env.CARBON_FE_ELECTRICIDAD,
    feCo2Biogas: process.env.CARBON_FE_CO2_BIOGAS,
    feCh4Biogas: process.env.CARBON_FE_CH4_BIOGAS,
    feN2oBiogas: process.env.CARBON_FE_N2O_BIOGAS,
    feBigBag: process.env.CARBON_FE_BIG_BAG,
    feLona: process.env.CARBON_FE_LONA,
    // Residuos por categoría (Alcance 3)
    feResiduoLubricants: process.env.CARBON_FE_RESIDUO_LUBRICANTS,
    feResiduoUsedOil: process.env.CARBON_FE_RESIDUO_USED_OIL,
    feResiduoPaintCans: process.env.CARBON_FE_RESIDUO_PAINT_CANS,
    feResiduoPpe: process.env.CARBON_FE_RESIDUO_PPE,
    // Gases de chimenea (flue gases)
    chimeneaCoKgHr: process.env.CARBON_CHIMENEA_CO_KG_HR,
    chimeneaCo2KgHr: process.env.CARBON_CHIMENEA_CO2_KG_HR,
    chimeneaCh4KgHr: process.env.CARBON_CHIMENEA_CH4_KG_HR,
    chimeneaN2oKgHr: process.env.CARBON_CHIMENEA_N2O_KG_HR,
    gwpCh4: process.env.CARBON_GWP_CH4,
    gwpN2o: process.env.CARBON_GWP_N2O,
    // eTransporte (Etapa 3)
    transporteDistanciaKm: process.env.CARBON_TRANSPORTE_DISTANCIA_KM,
    transporteConsumoLKm: process.env.CARBON_TRANSPORTE_CONSUMO_L_KM,
    transporteDensidadDiesel: process.env.CARBON_TRANSPORTE_DENSIDAD_DIESEL,
    transporteFeCombustion: process.env.CARBON_TRANSPORTE_FE_COMBUSTION,
    transporteFeUpstream: process.env.CARBON_TRANSPORTE_FE_UPSTREAM,
    // Blend Remisiones — Factor de secuestro de CO2 por kg de Biochar Puro
    factorSecuestroCo2: parseFloat(process.env.FACTOR_SECUESTRO_CO2 || '2.5'),
  },
  // Fórmula de composición del Biochar Blend (proporciones por KG total).
  // Centralizadas para que verificación de stock y auto-deducción NUNCA diverjan.
  // ⚠️ Decisión abierta Fase 0: biológicos 0.007 (0.7%) hasta que DataLab confirme
  //    si es 0.01 (1.0%). Cambiar solo la env var BLEND_PCT_BIOLOGICOS.
  blend: {
    pctBiochar: parseFloat(process.env.BLEND_PCT_BIOCHAR || '0.20'),
    pctAbono: parseFloat(process.env.BLEND_PCT_ABONO || '0.74'),
    pctAgua: parseFloat(process.env.BLEND_PCT_AGUA || '0.05'),
    pctBiologicos: parseFloat(process.env.BLEND_PCT_BIOLOGICOS || '0.007'),
    // Peso por Big Bag de biochar (solo referencia de UI; la deducción usa KG reales).
    bigBagKg: parseFloat(process.env.BLEND_BIG_BAG_KG || '1000'),
  },
  // ❌ REMOVIDO: aws config - ahora solo en server-side por seguridad
  security: {
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'),
  },
  app: {
    env: process.env.NODE_ENV || 'development',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  }
} as const;

// Validación de variables de entorno requeridas
export function validateEnvVars() {
  // Validar que exista al menos AIRTABLE_TOKEN o AIRTABLE_GLOBAL_TOKEN
  const hasAirtableAuth = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_GLOBAL_TOKEN;
  if (!hasAirtableAuth) {
    const errorMessage =
      `❌ Se requiere al menos una de estas variables de entorno:\n` +
      `   - AIRTABLE_TOKEN (token específico para base principal)\n` +
      `   - AIRTABLE_GLOBAL_TOKEN (token único para todas las bases)\n` +
      `💡 Asegúrate de tener un archivo .env.local con al menos una de estas variables.\n` +
      `📝 Consulta .env.example o docs/90-dias/pirolisis/03-guia-deploy-token-global.md`;

    console.error(errorMessage);
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(errorMessage);
    }
    return false;
  }

  const requiredVars = [
    'AIRTABLE_BASE_ID',
    'AIRTABLE_TABLE_NAME',
    'AIRTABLE_BACHES_TABLE_ID',
    'AIRTABLE_REMISIONES_BACHES_TABLE_ID',
    'AIRTABLE_LABORATORIOS_TABLE_ID',
    'AIRTABLE_EQUIPOS_TABLE_ID',
    'AIRTABLE_TURNOS_TABLE_ID',
    'AIRTABLE_USUARIOS_TABLE_ID',
    'AIRTABLE_VIAJES_BIOMASA_TABLE_ID',
    'AIRTABLE_MONITOREO_VIAJES_BIOMASA_TABLE_ID',
    // Sirius Insumos Core — inventario centralizado (2026-07-27)
    'AIRTABLE_INSUMOS_CORE_BASE_ID',
    'AIRTABLE_INSUMOS_TABLE_ID',
    'AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID',
    'AIRTABLE_STOCK_INSUMOS_TABLE_ID',
    'AIRTABLE_CATEGORIA_INSUMO_TABLE_ID',
    'AIRTABLE_UNIDADES_MEDIDA_TABLE_ID',
    'AIRTABLE_PIROLISIS_AREA_CODE',
    // Field IDs críticas de Laboratorios (requeridas para funcionamiento)
    'AIRTABLE_LABORATORIOS_ID_FIELD_ID',
    'AIRTABLE_LABORATORIOS_NOMBRE_LABORATORIO_FIELD_ID',
    'AIRTABLE_LABORATORIOS_TIPO_LABORATORIO_FIELD_ID',
    'AIRTABLE_LABORATORIOS_RESPONSABLE_FIELD_ID',
    'AIRTABLE_LABORATORIOS_TELEFONO_FIELD_ID',
    'AIRTABLE_LABORATORIOS_CORREO_ELECTRONICO_FIELD_ID',
    'AIRTABLE_LABORATORIOS_DIRECCION_FIELD_ID',
    'AIRTABLE_LABORATORIOS_CIUDAD_FIELD_ID',
    'AIRTABLE_LABORATORIOS_PAIS_FIELD_ID',
    'AIRTABLE_LABORATORIOS_CERTIFICACIONES_FIELD_ID',
    'AIRTABLE_LABORATORIOS_ACREDITACIONES_FIELD_ID',
    'AIRTABLE_LABORATORIOS_METODOS_ANALITICOS_FIELD_ID',
    'AIRTABLE_LABORATORIOS_FECHA_VIGENCIA_CERTIFICACIONES_FIELD_ID',
    'AIRTABLE_LABORATORIOS_REALIZA_REGISTRO_FIELD_ID',
    'AIRTABLE_LABORATORIOS_OBSERVACIONES_FIELD_ID',
    'AIRTABLE_LABORATORIOS_MONITOREO_BACHES_FIELD_ID',
    // Field IDs del inventario (requeridos para campos existentes)
    'AIRTABLE_INVENTARIO_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_CATEGORIA_FIELD_ID',
    'AIRTABLE_INVENTARIO_REALIZA_REGISTRO_FIELD_ID',
    // Field IDs de Remisiones Baches Pirolisis (campos básicos)
    'AIRTABLE_REMISIONES_ID_FIELD_ID',
    'AIRTABLE_REMISIONES_ID_NUMERICO_FIELD_ID', 
    'AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID',
    'AIRTABLE_REMISIONES_REALIZA_REGISTRO_FIELD_ID',
    'AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID',
    'AIRTABLE_REMISIONES_CLIENTE_FIELD_ID',
    'AIRTABLE_REMISIONES_NIT_CLIENTE_FIELD_ID',
    // Field IDs de Entrega
    'AIRTABLE_REMISIONES_RESPONSABLE_ENTREGA_FIELD_ID',
    'AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_ENTREGA_FIELD_ID',
    'AIRTABLE_REMISIONES_TELEFONO_ENTREGA_FIELD_ID',
    'AIRTABLE_REMISIONES_EMAIL_ENTREGA_FIELD_ID',
    // Field IDs de Recepción  
    'AIRTABLE_REMISIONES_RESPONSABLE_RECIBE_FIELD_ID',
    'AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_RECIBE_FIELD_ID',
    'AIRTABLE_REMISIONES_TELEFONO_RECIBE_FIELD_ID',
    'AIRTABLE_REMISIONES_EMAIL_RECIBE_FIELD_ID',
    // Field IDs de Documentos y Firmas
    'AIRTABLE_REMISIONES_DOCUMENTO_REMISION_FIELD_ID',
    'AIRTABLE_REMISIONES_QR_DOCUMENTO_FIELD_ID',
    'AIRTABLE_REMISIONES_FIRMA_ENTREGA_FIELD_ID',
    'AIRTABLE_REMISIONES_FIRMA_RECIBE_FIELD_ID',
    // Field IDs de Relaciones
    'AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID',
    'AIRTABLE_REMISIONES_DETALLE_CANTIDADES_FIELD_ID',
    // Calculadora de Carbono — Table IDs
    'CARBON_eBiomas_VIAJES_BIOMASA_TABLE_ID',
    'CARBON_eBiomas_RESULTADOS_TABLE_ID',
    'CARBON_EPIROLISIS_TURNO_TABLE_ID',
    'CARBON_EPIROLISIS_BALANCES_MASA_TABLE_ID',
    'CARBON_EPIROLISIS_MANEJO_RESIDUOS_TABLE_ID',
    'CARBON_EPIROLISIS_RESULTADOS_TABLE_ID',
    'CARBON_ETRANSPORTE_RESULTADOS_TABLE_ID',
    // Calculadora de Carbono — Constantes
    'CARBON_CONSUMO_DIESEL_POR_VIAJE',
    'CARBON_DENSIDAD_DIESEL',
    'CARBON_FE_PRODUCCION_DIESEL',
    'CARBON_FE_COMBUSTION_DIESEL',
    'CARBON_FE_ELECTRICIDAD',
    'CARBON_FE_CO2_BIOGAS',
    'CARBON_FE_CH4_BIOGAS',
    'CARBON_FE_N2O_BIOGAS',
    'CARBON_FE_BIG_BAG',
    'CARBON_FE_LONA',
    'CARBON_FE_RESIDUO_LUBRICANTS',
    'CARBON_FE_RESIDUO_USED_OIL',
    'CARBON_FE_RESIDUO_PAINT_CANS',
    'CARBON_FE_RESIDUO_PPE',
    // Gases de chimenea
    'CARBON_CHIMENEA_CO_KG_HR',
    'CARBON_CHIMENEA_CO2_KG_HR',
    'CARBON_CHIMENEA_CH4_KG_HR',
    'CARBON_CHIMENEA_N2O_KG_HR',
    'CARBON_GWP_CH4',
    'CARBON_GWP_N2O',
    // eTransporte (Etapa 3)
    'CARBON_TRANSPORTE_DISTANCIA_KM',
    'CARBON_TRANSPORTE_CONSUMO_L_KM',
    'CARBON_TRANSPORTE_DENSIDAD_DIESEL',
    'CARBON_TRANSPORTE_FE_COMBUSTION',
    'CARBON_TRANSPORTE_FE_UPSTREAM',
  ];

  // Variables opcionales (no causan error si faltan, pero se recomienda configurarlas)
  const optionalVars = [
    'AIRTABLE_INVENTARIO_PRESENTACION_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_CANTIDAD_PRESENTACION_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_FICHA_SEGURIDAD_FIELD_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const errorMessage = 
      `❌ Variables de entorno faltantes: ${missingVars.join(', ')}\n` +
      `💡 Asegúrate de tener un archivo .env.local con todas las variables necesarias.\n` +
      `📝 Consulta .env.example para ver el formato correcto.`;
    
    console.error(errorMessage);
    
    // En producción, registrar error pero no lanzar excepción para evitar crashes
    if (process.env.NODE_ENV === 'production') {
      console.error('⚠️ [PRODUCCIÓN] Continuando con variables faltantes, pero funcionalidad limitada');
      return false; // Indicar que la validación falló
    } else {
      throw new Error(errorMessage);
    }
  }

  // Advertir sobre variables opcionales faltantes
  const missingOptionalVars = optionalVars.filter(varName => !process.env[varName]);
  if (missingOptionalVars.length > 0) {
    console.warn(
      `⚠️ Variables de entorno opcionales faltantes: ${missingOptionalVars.join(', ')}\n` +
      `💡 Estas variables mejoran la funcionalidad pero no son críticas.`
    );
  }

  console.log('✅ Todas las variables de entorno están configuradas correctamente');
  return true; // Indicar que la validación fue exitosa
}

// Función helper para validar field IDs de laboratorios
export function validateLaboratoriosFields() {
  const requiredFields = [
    'id', 'nombreLaboratorio', 'tipoLaboratorio', 'responsable',
    'telefono', 'correoElectronico', 'direccion', 'ciudad', 'pais',
    'certificaciones', 'acreditaciones', 'metodosAnaliticos',
    // 'fechaVigenciaCertificaciones', // Campo no disponible en Airtable
    'realizaRegistro', 'observaciones'
  ];

  const missingFields = requiredFields.filter(field =>
    !config.airtable.laboratoriosFields[field as keyof typeof config.airtable.laboratoriosFields]
  );

  if (missingFields.length > 0) {
    throw new Error(
      `❌ Field IDs de Laboratorios faltantes:\n${missingFields.map(f => `  - AIRTABLE_LABORATORIOS_${f.toUpperCase()}_FIELD_ID`).join('\n')}\n\n` +
      `Por favor configura estas variables en tu archivo .env.local`
    );
  }
}

// Helper para logs seguros (no muestra datos sensibles)
export function logConfigSafely() {
  console.log('🔧 Configuración del sistema:');
  console.log(`📊 Base ID: ${config.airtable.baseId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`📋 Tabla: ${config.airtable.tableName ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`🏗️ Tabla Baches: ${config.airtable.bachesTableId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`📦 Insumos Core (base): ${config.airtable.insumosCoreBaseId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`📦 Tabla Insumos: ${config.airtable.insumosTableId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`🔧 Tabla Equipos: ${config.airtable.equiposTableId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`🔑 Token: ${config.airtable.token ? '✅ Configurado' : '❌ Faltante'}`);
  // ❌ REMOVIDO: AWS logging - credenciales no deben loggearse por seguridad
  console.log(`🔐 Salt rounds: ${config.security.bcryptSaltRounds}`);
  console.log(`🌍 Entorno: ${config.app.env}`);
}
