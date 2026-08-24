import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars } from '@/lib/config';
import {
  ESTADO_BACHE_BODEGA,
  registrarEntradaBiocharBodega,
  type EntradaBiocharResult,
} from '@/lib/biochar-bodega';

// Validar variables de entorno al cargar el módulo
validateEnvVars();

interface RegistroMonitoreo {
  id: string;
  fields?: Record<string, unknown>;
}

/** Record IDs de un campo link, que Airtable devuelve como strings u objetos. */
function linkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((e) => (typeof e === 'string' ? e : (e as { id?: string })?.id))
    .filter((id): id is string => typeof id === 'string');
}

/**
 * Ingresa al libro mayor el biochar de los baches que se acaban de monitorear.
 *
 * ═══ POR QUÉ ESTÁ ESTO AQUÍ ══════════════════════════════════════════════════
 * El disparador normal de la Entrada es el paso a `Bache Completo Bodega`
 * (`/api/baches/update` → `biochar-bodega.ts`), pero solo puede ingresar lo que
 * tenga cuantificado: un bache `No Monitoreado` vale 0 en la fórmula de masa seca y
 * su Entrada se OMITE, correctamente, porque el número todavía no existe.
 *
 * Cuando el monitoreo llega DESPUÉS —el bache ya está en bodega—, nada volvía a
 * intentarlo y ese biochar se quedaba fuera del inventario del ecosistema para
 * siempre. Así se quedaron S-00251…S-00260 el 2026-08-21. Registrar el monitoreo es
 * el momento exacto en que ya se sabe cuánto hay, así que es el segundo disparador
 * legítimo de la Entrada.
 *
 * Es best-effort: el monitoreo NO falla por un problema de inventario. Y es
 * idempotente por `BODEGA-<bache>`, así que un bache que ya tenía su Entrada (el
 * caso normal: monitoreado antes de ir a bodega) no la duplica.
 */
async function ingresarBachesYaEnBodega(
  registros: RegistroMonitoreo[]
): Promise<Array<{ bache: string; entrada: EntradaBiocharResult }>> {
  const { token, baseId, bachesTableId } = config.airtable;
  if (!token || !baseId || !bachesTableId) return [];

  const resultados: Array<{ bache: string; entrada: EntradaBiocharResult }> = [];

  for (const registro of registros) {
    const fields = registro.fields ?? {};
    const bacheId = linkIds(fields['Bache'])[0];
    const masaSeca = Number(fields['Masa Seca (DM kg)'] ?? 0);
    if (!bacheId || !Number.isFinite(masaSeca) || masaSeca <= 0) continue;

    try {
      const res = await fetch(`https://api.airtable.com/v0/${baseId}/${bachesTableId}/${bacheId}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) continue;

      const bache = await res.json();
      const estado = String(bache.fields?.['Estado Bache'] ?? '');
      const codigo = String(bache.fields?.['Codigo Bache'] ?? '');

      // Solo `Bache Completo Bodega`: un bache Incompleto o Agotado ya despachó, y
      // reconstruir su historia (entrada + salidas) es trabajo de
      // `scripts/reparar-biochar-bodega.mjs`, no de este endpoint.
      if (!codigo || estado !== ESTADO_BACHE_BODEGA) continue;

      // Se ingresa la masa seca del monitoreo, no el saldo del bache: la Entrada
      // documenta lo que ENTRÓ a bodega, y el saldo ya viene neto de salidas.
      const entrada = await registrarEntradaBiocharBodega({
        codigoBache: codigo,
        kg: masaSeca,
        realizaRegistro: String(fields['Realiza Registro'] ?? '') || undefined,
      });

      resultados.push({ bache: codigo, entrada });

      if (!entrada.ok) {
        console.error(
          `⚠️ [monitoreo-baches] ${codigo} monitoreado, pero su biochar NO entró al inventario:`,
          entrada.error
        );
      }
    } catch (err) {
      console.error(`💥 [monitoreo-baches] Error ingresando el bache ${bacheId} a bodega:`, err);
    }
  }

  return resultados;
}

export async function POST(request: NextRequest) {
  console.log('📊 [monitoreo-baches] Iniciando creación de registro de monitoreo');

  try {
    console.log('📥 [monitoreo-baches] Parseando request body...');
    const { records } = await request.json();
    console.log(`📊 [monitoreo-baches] Registros a crear:`, JSON.stringify(records, null, 2));

    if (!records || !Array.isArray(records) || records.length === 0) {
      console.log('❌ [monitoreo-baches] Error: No se proporcionaron registros válidos');
      return NextResponse.json(
        { message: 'Se requieren registros válidos para crear' },
        { status: 400 }
      );
    }

    // Crear registros en Airtable
    const tableName = config.airtable.monitoreoBachesTableId; // ID de la tabla Monitoreo Baches desde configuración
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}`;
    console.log(`🌐 [monitoreo-baches] URL de Airtable: ${airtableUrl}`);

    console.log('🚀 [monitoreo-baches] Enviando datos a Airtable...');
    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records })
    });

    console.log(`📡 [monitoreo-baches] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [monitoreo-baches] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [monitoreo-baches] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al crear registro de monitoreo en la base de datos' },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`✅ [monitoreo-baches] Registro creado exitosamente:`, JSON.stringify(result, null, 2));

    // Va DESPUÉS de crear el monitoreo y no revierte nada si falla: el monitoreo es
    // el dato del laboratorio y vale por sí solo. El resultado viaja en la respuesta
    // para que el operador vea si el biochar quedó o no en el inventario.
    const biocharBodega = await ingresarBachesYaEnBodega(result.records ?? []);

    return NextResponse.json({
      success: true,
      message: 'Registro de monitoreo creado exitosamente',
      data: result,
      biochar_bodega: biocharBodega,
    });

  } catch (error) {
    console.error('💥 [monitoreo-baches] Error interno del servidor:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
