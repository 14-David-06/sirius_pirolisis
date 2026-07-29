import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';
import { STOCK_MINIMO_DEFAULT } from '../../../../../lib/inventario.constants';

/**
 * PATCH /api/inventario/update/[id]
 *
 * Edita un insumo consumible del área desde los formularios de Ingreso y Salida.
 *
 * Campos editables: nombre y stock mínimo. Nada más: la unidad base reinterpreta
 * el stock histórico, y la categoría no la usa este módulo.
 *
 * ⚠️ AISLAMIENTO POR ÁREA — la razón de ser de este endpoint.
 * Sirius Insumos Core es una base compartida: los insumos de Pirólisis, Blend,
 * Laboratorio, etc. conviven en la misma tabla. Antes de escribir se lee el
 * registro y se verifica que su `ID Area Origen` sea el del área; si no lo es,
 * responde 403 sin tocar nada. Así un ID equivocado (o manipulado en el cliente)
 * no puede renombrar el insumo de otra área.
 *
 * Body:
 * - nombre (string, opcional): nuevo nombre del insumo
 * - stockMinimo (number, opcional): umbral de reposición, ≥ 0
 */

const AT = 'https://api.airtable.com/v0';

/** Nombres de campo del Core, usados cuando no hay field ID configurado. */
const CAMPO_NOMBRE = 'Nombre';
const CAMPO_STOCK_MINIMO = 'Stock Minimo';
const CAMPO_AREA_ORIGEN = 'ID Area Origen';

/** El campo de área puede venir como texto o como array de una fórmula/lookup. */
function areaDelInsumo(fields: Record<string, unknown>): string {
  const valor = fields[CAMPO_AREA_ORIGEN];
  if (typeof valor === 'string') return valor.trim();
  if (Array.isArray(valor) && typeof valor[0] === 'string') return valor[0].trim();
  return '';
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const token = config.airtable.insumosCoreToken;
  const coreBaseId = config.airtable.insumosCoreBaseId;
  const insumosTableId = config.airtable.insumosTableId;
  const areaCode = config.airtable.pirolisisAreaCode;
  const insumoFields = config.airtable.insumoFields;

  if (!coreBaseId || !insumosTableId || !token) {
    return NextResponse.json(
      {
        success: false,
        error: 'Configuración de Sirius Insumos Core incompleta',
        details: 'Faltan AIRTABLE_INSUMOS_CORE_BASE_ID, AIRTABLE_INSUMOS_TABLE_ID o el token',
      },
      { status: 400 }
    );
  }

  if (!areaCode) {
    // Sin código de área no hay forma de verificar la pertenencia: se rechaza
    // en lugar de escribir a ciegas en una base compartida.
    return NextResponse.json(
      {
        success: false,
        error: 'Área no configurada',
        details: 'Falta AIRTABLE_PIROLISIS_AREA_CODE: no se puede validar la pertenencia del insumo',
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : undefined;
    const stockMinimoRaw = body?.stockMinimo;
    const stockMinimo =
      stockMinimoRaw === undefined || stockMinimoRaw === null || stockMinimoRaw === ''
        ? undefined
        : Number(stockMinimoRaw);

    if (nombre !== undefined && !nombre) {
      return NextResponse.json(
        { success: false, error: 'El nombre del insumo no puede quedar vacío' },
        { status: 400 }
      );
    }

    if (stockMinimo !== undefined && (!Number.isFinite(stockMinimo) || stockMinimo < 0)) {
      return NextResponse.json(
        { success: false, error: 'El stock mínimo debe ser un número mayor o igual a 0' },
        { status: 400 }
      );
    }

    if (nombre === undefined && stockMinimo === undefined) {
      return NextResponse.json(
        { success: false, error: 'Nada que actualizar', details: 'Envía nombre y/o stockMinimo' },
        { status: 400 }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Leer el insumo y validar que pertenece al área
    // ═══════════════════════════════════════════════════════════════════════════
    const getResponse = await fetch(`${AT}/${coreBaseId}/${insumosTableId}/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const actual = await getResponse.json();

    if (getResponse.status === 404) {
      return NextResponse.json(
        { success: false, error: 'El insumo no existe en Sirius Insumos Core' },
        { status: 404 }
      );
    }

    if (!getResponse.ok) {
      console.error('❌ Error leyendo el insumo del Core:', actual);
      return NextResponse.json(
        { success: false, error: 'No se pudo leer el insumo', details: actual },
        { status: getResponse.status }
      );
    }

    const areaInsumo = areaDelInsumo(actual.fields ?? {});

    if (areaInsumo !== areaCode) {
      console.warn(
        `⛔ Intento de editar el insumo ${id} del área "${areaInsumo || 'sin área'}" desde Pirólisis`
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Este insumo pertenece a otra área',
          details: `Solo se pueden editar insumos del área ${areaCode}.`,
        },
        { status: 403 }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Escribir solo los campos editables
    // ═══════════════════════════════════════════════════════════════════════════
    const fields: Record<string, unknown> = {};

    if (nombre !== undefined) {
      fields[insumoFields.nombre || CAMPO_NOMBRE] = nombre;
    }

    if (stockMinimo !== undefined) {
      fields[insumoFields.stockMinimo || CAMPO_STOCK_MINIMO] = stockMinimo;
    }

    const patchResponse = await fetch(`${AT}/${coreBaseId}/${insumosTableId}/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    const actualizado = await patchResponse.json();

    if (!patchResponse.ok) {
      console.error('❌ Error actualizando el insumo en el Core:', actualizado);
      return NextResponse.json(
        { success: false, error: 'No se pudo actualizar el insumo', details: actualizado },
        { status: patchResponse.status }
      );
    }

    console.log(`✅ Insumo ${id} actualizado (nombre: ${nombre ?? '—'}, mínimo: ${stockMinimo ?? '—'})`);

    return NextResponse.json({
      success: true,
      message: 'Insumo actualizado',
      data: {
        id: actualizado.id,
        nombre: actualizado.fields?.[CAMPO_NOMBRE] ?? nombre ?? '',
        stock_minimo: Number(actualizado.fields?.[CAMPO_STOCK_MINIMO] ?? stockMinimo ?? STOCK_MINIMO_DEFAULT),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API inventario/update:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
