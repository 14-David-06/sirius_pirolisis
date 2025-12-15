#!/usr/bin/env node

/**
 * Script de diagnóstico para verificar la configuración de Airtable
 * Ejecuta: node scripts/diagnose-airtable.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config();

const config = {
  airtableToken: process.env.AIRTABLE_TOKEN,
  airtableBaseId: process.env.AIRTABLE_BASE_ID,
  bachesTableId: process.env.AIRTABLE_BACHES_TABLE_ID,
  remisionesBachesTableId: process.env.AIRTABLE_REMISIONES_BACHES_TABLE_ID,
  remisionesClienteFieldId: process.env.AIRTABLE_REMISIONES_CLIENTE_FIELD_ID,
  remisionesNitClienteFieldId: process.env.AIRTABLE_REMISIONES_NIT_CLIENTE_FIELD_ID,
};

console.log('🔍 Diagnóstico de configuración Airtable\n');

// Verificar variables de entorno
console.log('1. Verificando variables de entorno:');
console.log(`   AIRTABLE_TOKEN: ${config.airtableToken ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   AIRTABLE_BASE_ID: ${config.airtableBaseId ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   AIRTABLE_BACHES_TABLE_ID: ${config.bachesTableId ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   AIRTABLE_REMISIONES_BACHES_TABLE_ID: ${config.remisionesBachesTableId ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   AIRTABLE_REMISIONES_CLIENTE_FIELD_ID: ${config.remisionesClienteFieldId ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   AIRTABLE_REMISIONES_NIT_CLIENTE_FIELD_ID: ${config.remisionesNitClienteFieldId ? '✅ Configurado' : '❌ Faltante'}\n`);

if (!config.airtableToken || !config.airtableBaseId || !config.bachesTableId || !config.remisionesBachesTableId || !config.remisionesClienteFieldId || !config.remisionesNitClienteFieldId) {
  console.log('❌ Error: Faltan variables de entorno requeridas');
  process.exit(1);
}

// Mostrar información parcial (segura)
console.log('2. Información de configuración:');
console.log(`   Token prefix: ${config.airtableToken.substring(0, 8)}...`);
console.log(`   Base ID: ${config.airtableBaseId}`);
console.log(`   Table ID: ${config.bachesTableId}\n`);

// Probar conectividad con Airtable
console.log('3. Probando conectividad con Airtable...');

const url = `https://api.airtable.com/v0/${config.airtableBaseId}/${config.bachesTableId}?maxRecords=1`;
const options = {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${config.airtableToken}`,
    'Content-Type': 'application/json',
  },
};

const req = https.request(url, options, (res) => {
  console.log(`   Status: ${res.statusCode}`);
  console.log(`   Content-Type: ${res.headers['content-type']}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`   Response length: ${data.length} characters\n`);
    
    if (res.statusCode === 200) {
      try {
        const parsed = JSON.parse(data);
        console.log('✅ Conexión exitosa con Airtable');
        console.log(`   Registros encontrados: ${parsed.records?.length || 0}`);
        
        if (parsed.records && parsed.records.length > 0) {
          console.log('   Campos disponibles en el primer registro:');
          const fields = Object.keys(parsed.records[0].fields || {});
          fields.forEach(field => console.log(`     - ${field}`));
        }
      } catch (parseError) {
        console.log('❌ Error parseando JSON de respuesta exitosa:');
        console.log(`   Parse error: ${parseError.message}`);
        console.log(`   Response preview: ${data.substring(0, 500)}...`);
      }
    } else {
      console.log('❌ Error en la respuesta de Airtable:');
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Response preview: ${data.substring(0, 500)}...`);
      
      try {
        const parsed = JSON.parse(data);
        console.log('   Error details:', JSON.stringify(parsed, null, 2));
      } catch (parseError) {
        console.log('   Error parseando JSON de error (respuesta no es JSON válido)');
      }
    }
  });
});

req.on('error', (error) => {
  console.log('❌ Error de red:');
  console.log(`   ${error.message}`);
});

req.end();