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
    'AIRTABLE_INVENTARIO_TABLE_ID'
    // ❌ REMOVIDO: AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY
    // Ahora solo se requieren en server-side, no en validación global
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(
      `❌ Variables de entorno faltantes: ${missingVars.join(', ')}\n` +
      `💡 Asegúrate de tener un archivo .env.local con todas las variables necesarias.\n` +
      `📝 Consulta .env.example para ver el formato correcto.`
      // ❌ REMOVIDO: Referencia a variables AWS - ahora solo server-side
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
  console.log(`🔑 Token: ${config.airtable.token ? '✅ Configurado' : '❌ Faltante'}`);
  // ❌ REMOVIDO: AWS logging - credenciales no deben loggearse por seguridad
  console.log(`🔐 Salt rounds: ${config.security.bcryptSaltRounds}`);
  console.log(`🌍 Entorno: ${config.app.env}`);
}
