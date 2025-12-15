// src/lib/config.ts
// Configuración centralizada y segura de variables de entorno

// src/lib/config.ts
// Configuración centralizada y segura de variables de entorno

export const config = {
  airtable: {
    token: process.env.AIRTABLE_TOKEN,
    baseId: process.env.AIRTABLE_BASE_ID,
    tableName: process.env.AIRTABLE_TABLE_NAME,
    bachesTableId: process.env.AIRTABLE_BACHES_TABLE_ID,
    remisionesBachesTableId: process.env.AIRTABLE_REMISIONES_BACHES_TABLE_ID,
    detalleCantidadesRemisionTableId: process.env.AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID,
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
    // ✅ BUENA PRÁCTICA: Field IDs obtenidos de variables de entorno
    // para evitar hardcodear IDs sensibles en el código fuente
    // Los valores reales se configuran en .env.local
    inventarioFields: {
      insumo: process.env.AIRTABLE_INVENTARIO_INSUMO_FIELD_ID,
      categoria: process.env.AIRTABLE_INVENTARIO_CATEGORIA_FIELD_ID,
      presentacionInsumo: process.env.AIRTABLE_INVENTARIO_PRESENTACION_INSUMO_FIELD_ID,
      cantidadPresentacionInsumo: process.env.AIRTABLE_INVENTARIO_CANTIDAD_PRESENTACION_INSUMO_FIELD_ID,
      realizaRegistro: process.env.AIRTABLE_INVENTARIO_REALIZA_REGISTRO_FIELD_ID,
      fichaSeguridad: process.env.AIRTABLE_INVENTARIO_FICHA_SEGURIDAD_FIELD_ID,
      totalCantidadStock: process.env.AIRTABLE_INVENTARIO_TOTAL_CANTIDAD_STOCK_FIELD_ID
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
      mantenimiento: process.env.AIRTABLE_SALIDAS_MANTENIMIENTO_FIELD_ID || 'Mantenimientos'
    },
    // Field IDs para Remisiones Baches Pirolisis
    remisionesBachesFields: {
      id: process.env.AIRTABLE_REMISIONES_ID_FIELD_ID,
      idNumerico: process.env.AIRTABLE_REMISIONES_ID_NUMERICO_FIELD_ID,
      fechaEvento: process.env.AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID,
      realizaRegistro: process.env.AIRTABLE_REMISIONES_REALIZA_REGISTRO_FIELD_ID,
      observaciones: process.env.AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID,
      cliente: process.env.AIRTABLE_REMISIONES_CLIENTE_FIELD_ID,
      nitCliente: process.env.AIRTABLE_REMISIONES_NIT_CLIENTE_FIELD_ID,
      responsableEntrega: process.env.AIRTABLE_REMISIONES_RESPONSABLE_ENTREGA_FIELD_ID,
      numeroDocumentoEntrega: process.env.AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_ENTREGA_FIELD_ID,
      responsableRecibe: process.env.AIRTABLE_REMISIONES_RESPONSABLE_RECIBE_FIELD_ID,
      numeroDocumentoRecibe: process.env.AIRTABLE_REMISIONES_NUMERO_DOCUMENTO_RECIBE_FIELD_ID,
      documentoRemision: process.env.AIRTABLE_REMISIONES_DOCUMENTO_REMISION_FIELD_ID,
      qrDocumento: process.env.AIRTABLE_REMISIONES_QR_DOCUMENTO_FIELD_ID,
      firmaEntrega: process.env.AIRTABLE_REMISIONES_FIRMA_ENTREGA_FIELD_ID,
      firmaRecibe: process.env.AIRTABLE_REMISIONES_FIRMA_RECIBE_FIELD_ID,
      bachePirolisisAlterado: process.env.AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID
    },
    // Field IDs para Detalle Cantidades Remision Pirolisis
    detalleCantidadesFields: {
      cantidadEspecificada: process.env.AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID,
      remisionBachePirolisis: process.env.AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID,
      bachePirolisis: process.env.AIRTABLE_DETALLE_BACHE_PIROLISIS_FIELD_ID
    }
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
  const requiredVars = [
    'AIRTABLE_TOKEN',
    'AIRTABLE_BASE_ID',
    'AIRTABLE_TABLE_NAME',
    'AIRTABLE_BACHES_TABLE_ID',
    'AIRTABLE_REMISIONES_BACHES_TABLE_ID',
    'AIRTABLE_INVENTARIO_TABLE_ID',
    'AIRTABLE_LABORATORIOS_TABLE_ID',
    'AIRTABLE_EQUIPOS_TABLE_ID',
    'AIRTABLE_TURNOS_TABLE_ID',
    'AIRTABLE_USUARIOS_TABLE_ID',
    'AIRTABLE_VIAJES_BIOMASA_TABLE_ID',
    'AIRTABLE_MONITOREO_VIAJES_BIOMASA_TABLE_ID',
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
    // Field IDs de Remisiones Baches Pirolisis
    'AIRTABLE_REMISIONES_CLIENTE_FIELD_ID',
    'AIRTABLE_REMISIONES_NIT_CLIENTE_FIELD_ID'
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
  console.log(`📦 Tabla Inventario: ${config.airtable.inventarioTableId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`� Tabla Equipos: ${config.airtable.equiposTableId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`�🔑 Token: ${config.airtable.token ? '✅ Configurado' : '❌ Faltante'}`);
  // ❌ REMOVIDO: AWS logging - credenciales no deben loggearse por seguridad
  console.log(`🔐 Salt rounds: ${config.security.bcryptSaltRounds}`);
  console.log(`🌍 Entorno: ${config.app.env}`);
}
