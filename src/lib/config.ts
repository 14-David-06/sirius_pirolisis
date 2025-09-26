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
    inventarioTableId: process.env.AIRTABLE_INVENTARIO_TABLE_ID,
    entradasTableId: process.env.AIRTABLE_ENTRADAS_TABLE_ID,
    salidasTableId: process.env.AIRTABLE_SALIDAS_TABLE_ID,
    laboratoriosTableId: process.env.AIRTABLE_LABORATORIOS_TABLE_ID,
    equiposTableId: process.env.AIRTABLE_EQUIPOS_TABLE_ID,
    turnosTableId: process.env.AIRTABLE_TURNOS_TABLE_ID,
    laboratoriosFieldId: process.env.AIRTABLE_LABORATORIOS_FIELD_ID,
    laboratoriosNombreFieldId: process.env.AIRTABLE_LABORATORIOS_NOMBRE_FIELD_ID,
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
      turnoPirolisis: process.env.AIRTABLE_SALIDAS_TURNO_PIROLISIS_FIELD_ID
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
    'AIRTABLE_INVENTARIO_TABLE_ID',
    'AIRTABLE_LABORATORIOS_TABLE_ID',
    'AIRTABLE_LABORATORIOS_FIELD_ID',
    'AIRTABLE_LABORATORIOS_NOMBRE_FIELD_ID',
    'AIRTABLE_EQUIPOS_TABLE_ID',
    // Field IDs del inventario (requeridos para campos existentes)
    'AIRTABLE_INVENTARIO_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_CATEGORIA_FIELD_ID',
    'AIRTABLE_INVENTARIO_REALIZA_REGISTRO_FIELD_ID'
  ];

  // Variables opcionales (no causan error si faltan, pero se recomienda configurarlas)
  const optionalVars = [
    'AIRTABLE_INVENTARIO_PRESENTACION_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_CANTIDAD_PRESENTACION_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_FICHA_SEGURIDAD_FIELD_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(
      `❌ Variables de entorno faltantes: ${missingVars.join(', ')}\n` +
      `💡 Asegúrate de tener un archivo .env.local con todas las variables necesarias.\n` +
      `📝 Consulta .env.example para ver el formato correcto.`
    );
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
