#!/usr/bin/env node

/**
 * Script de verificación pre-deploy para Sirius Pirólisis
 * Verifica que todas las variables de entorno necesarias estén configuradas
 */

const fs = require('fs');
const path = require('path');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  
  if (!fs.existsSync(envPath)) {
    log('❌ No se encontró el archivo .env.local', 'red');
    log('💡 Copia el archivo .env.example a .env.local y configura tus variables', 'yellow');
    return false;
  }
  
  log('✅ Archivo .env.local encontrado', 'green');
  return true;
}

function loadEnvVars() {
  require('dotenv').config({ path: '.env.local' });
}

function checkVariables() {
  const requiredVars = [
    // Variables críticas de Airtable
    'AIRTABLE_TOKEN',
    'AIRTABLE_BASE_ID',
    'AIRTABLE_TABLE_NAME',
    'AIRTABLE_USUARIOS_TABLE_ID',
    'AIRTABLE_TURNOS_TABLE_ID',
    'AIRTABLE_BACHES_TABLE_ID',
    'AIRTABLE_INVENTARIO_TABLE_ID',
    'AIRTABLE_LABORATORIOS_TABLE_ID',
    'AIRTABLE_EQUIPOS_TABLE_ID',
    'AIRTABLE_VIAJES_BIOMASA_TABLE_ID',
    'AIRTABLE_MONITOREO_VIAJES_BIOMASA_TABLE_ID',
    
    // Field IDs de Laboratorios
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
    
    // Field IDs de Inventario
    'AIRTABLE_INVENTARIO_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_CATEGORIA_FIELD_ID',
    'AIRTABLE_INVENTARIO_REALIZA_REGISTRO_FIELD_ID',
    
    // Otras variables importantes
    'OPENAI_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'BCRYPT_SALT_ROUNDS'
  ];

  const optionalVars = [
    'AIRTABLE_INVENTARIO_PRESENTACION_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_CANTIDAD_PRESENTACION_INSUMO_FIELD_ID',
    'AIRTABLE_INVENTARIO_FICHA_SEGURIDAD_FIELD_ID',
    'NEXT_PUBLIC_APP_URL'
  ];

  log('\n🔍 Verificando variables de entorno requeridas...', 'cyan');
  
  const missing = [];
  const configured = [];
  
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      configured.push(varName);
      log(`  ✅ ${varName}`, 'green');
    } else {
      missing.push(varName);
      log(`  ❌ ${varName}`, 'red');
    }
  });

  log('\n🔍 Verificando variables opcionales...', 'cyan');
  
  const missingOptional = [];
  optionalVars.forEach(varName => {
    if (process.env[varName]) {
      log(`  ✅ ${varName}`, 'green');
    } else {
      missingOptional.push(varName);
      log(`  ⚠️  ${varName}`, 'yellow');
    }
  });

  // Resumen
  log('\n📊 RESUMEN:', 'bright');
  log(`✅ Variables configuradas: ${configured.length}/${requiredVars.length}`, configured.length === requiredVars.length ? 'green' : 'yellow');
  
  if (missing.length > 0) {
    log(`❌ Variables faltantes: ${missing.length}`, 'red');
    log('\n🚨 Variables requeridas faltantes:', 'red');
    missing.forEach(varName => log(`  - ${varName}`, 'red'));
  }
  
  if (missingOptional.length > 0) {
    log(`⚠️  Variables opcionales faltantes: ${missingOptional.length}`, 'yellow');
  }

  return missing.length === 0;
}

function generateEnvTemplate(missingVars) {
  log('\n📝 Generando plantilla de variables faltantes...', 'cyan');
  
  const template = missingVars.map(varName => {
    return `${varName}=tu_valor_aqui`;
  }).join('\n');

  const templatePath = path.join(process.cwd(), 'missing-env-vars.txt');
  fs.writeFileSync(templatePath, template);
  
  log(`✅ Plantilla guardada en: ${templatePath}`, 'green');
  log('💡 Copia estas variables y configúralas en tu plataforma de hosting', 'yellow');
}

function main() {
  log('🚀 Verificador Pre-Deploy - Sirius Pirólisis', 'bright');
  log('================================================', 'cyan');
  
  // Verificar si existe .env.local
  if (!checkEnvFile()) {
    process.exit(1);
  }
  
  // Cargar variables de entorno
  try {
    loadEnvVars();
    log('✅ Variables de entorno cargadas', 'green');
  } catch (error) {
    log('❌ Error cargando variables de entorno', 'red');
    console.error(error);
    process.exit(1);
  }
  
  // Verificar variables
  const allConfigured = checkVariables();
  
  if (allConfigured) {
    log('\n🎉 ¡Todas las variables requeridas están configuradas!', 'green');
    log('✅ Tu aplicación está lista para deploy', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Hay variables faltantes. El deploy puede fallar.', 'yellow');
    log('📋 Consulta DEPLOYMENT_GUIDE.md para instrucciones detalladas', 'cyan');
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { checkVariables, checkEnvFile };