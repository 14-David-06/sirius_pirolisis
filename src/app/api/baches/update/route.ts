import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import {
  ESTADO_BACHE_BODEGA,
  registrarEntradaBiocharBodega,
} from '../../../../lib/biochar-bodega';

// Usar el ID de la tabla de Baches Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.bachesTableId;

/**
 * PATCH /api/baches/update
 *
 * Actualiza un bache. Además, cuando el bache PASA a `Bache Completo Bodega`,
 * registra su biochar seco como Entrada en Sirius Insumos Core: el biochar en
 * planta no es inventario, solo el que está en bodega (ver src/lib/biochar-bodega.ts).
 *
 * El enganche va aquí y no en la UI porque los dos caminos que mueven un bache a
 * bodega —el modal individual y el proceso de transporte por lotes de
 * /sistema-baches— pasan ambos por este endpoint. Ponerlo en la UI obligaría a
 * duplicarlo y dejaría fuera a cualquier caller futuro.
 */
export async function PATCH(request: NextRequest) {
  if (!TABLE_ID) {
    return NextResponse.json({
      error: 'ID de tabla de Baches Pirolisis no configurado'
    }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID del bache es requerido' }, { status: 400 });
    }

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
    }

    const fields = updateData.fields || updateData;
    const baseUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`;
    const headers = {
      'Authorization': `Bearer ${config.airtable.token}`,
      'Content-Type': 'application/json',
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // ¿Este PATCH mueve el bache a bodega?
    //
    // Se lee el estado ANTES de escribir para distinguir una TRANSICIÓN de un
    // simple re-guardado: un bache que ya está en bodega y se vuelve a guardar no
    // debe generar una segunda entrada de biochar. (La entrada además es
    // idempotente por código de bache, pero comparar estados evita el trabajo.)
    //
    // También se lee de ahí el biochar seco: es un campo fórmula, así que su valor
    // no viene en el body del PATCH.
    // ═══════════════════════════════════════════════════════════════════════════
    const pideBodega = String(fields?.['Estado Bache'] ?? '') === ESTADO_BACHE_BODEGA;
    let estadoAnterior = '';
    let codigoBache = '';
    let kgBiocharSeco = 0;

    if (pideBodega) {
      const previoRes = await fetch(`${baseUrl}/${id}`, { headers });
      if (previoRes.ok) {
        const previo = await previoRes.json();
        estadoAnterior = String(previo.fields?.['Estado Bache'] ?? '');
        codigoBache = String(previo.fields?.['Codigo Bache'] ?? '');
        kgBiocharSeco = Number(previo.fields?.['Total Cantidad Actual Biochar Seco'] ?? 0);
      } else {
        console.warn(
          `⚠️ No se pudo leer el bache ${id} antes de actualizarlo; se omite el registro de biochar en bodega`
        );
      }
    }

    const esTransicionABodega =
      pideBodega && Boolean(codigoBache) && estadoAnterior !== ESTADO_BACHE_BODEGA;

    // Preparar los datos para actualizar
    const recordData = {
      records: [{
        id: id,
        fields,
      }]
    };

    console.log('📤 Enviando datos a Airtable:', JSON.stringify(recordData, null, 2));

    const response = await fetch(baseUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(recordData),
    });

    console.log('📥 Status de respuesta Airtable:', response.status);

    // Verificar si la respuesta es JSON válido
    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      console.error('❌ Respuesta no es JSON:', responseText);
      return NextResponse.json({
        error: 'Respuesta inválida de Airtable',
        details: `Content-Type: ${contentType}, Respuesta: ${responseText.substring(0, 500)}...`
      }, { status: 502 });
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      const responseText = await response.text();
      console.error('❌ Error parseando JSON de Airtable:', parseError);
      return NextResponse.json({
        error: 'Error parseando respuesta de Airtable',
        details: `Parse error: ${parseError}, Response: ${responseText.substring(0, 500)}...`
      }, { status: 502 });
    }

    if (!response.ok) {
      console.error('❌ Error actualizando bache en Airtable:', data);
      return NextResponse.json({ error: data?.error || 'Error actualizando bache', details: data }, { status: response.status });
    }

    console.log('✅ Bache actualizado exitosamente:', data.records[0].id);

    // ═══════════════════════════════════════════════════════════════════════════
    // Entrada del biochar a bodega (best-effort).
    //
    // Va DESPUÉS del PATCH: si el cambio de estado falla, no hay nada que ingresar.
    // Y su fallo NO revierte el PATCH ni devuelve error: el bache sí se movió a
    // bodega, y bloquear esa operación por un problema de inventario le impediría
    // al operario seguir trabajando. El resultado viaja en la respuesta
    // (`biochar_bodega`) para que el problema quede visible y no silencioso.
    // ═══════════════════════════════════════════════════════════════════════════
    const respuesta: Record<string, unknown> = { ...data.records[0] };

    if (esTransicionABodega) {
      const entrada = await registrarEntradaBiocharBodega({
        codigoBache,
        kg: kgBiocharSeco,
        realizaRegistro: String(fields?.['Realiza Registro'] ?? '') || undefined,
      });

      respuesta.biochar_bodega = entrada;

      if (!entrada.ok) {
        console.error(
          `⚠️ Bache ${codigoBache} movido a bodega, pero su biochar NO entró al inventario:`,
          entrada.error
        );
      }
    }

    return NextResponse.json(respuesta, { status: 200 });
  } catch (err: any) {
    console.error('❌ Error en API actualizar bache:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
