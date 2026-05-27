import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';


const EMPAQUE_VALUES = ['Big Bag', 'Lona', 'Bulto', 'Otro'] as const;
type Empaque = typeof EMPAQUE_VALUES[number];

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function tableUrl() {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendPedidosTableId}`;
}

function guardConfig(): NextResponse | null {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta', details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID' },
      { status: 500 }
    );
  }
  return null;
}

// GET /api/pirolisis/blend/pedidos
// Lista pedidos de Biochar Blend desde Sirius Pedidos Core (fuente única de verdad).
// Filtra por Detalle Pedido con ID Producto Core = SIRIUS-PRODUCT-0016 y enriquece
// con datos de Sirius Clients Core para obtener Cliente / NIT.
// Query params opcionales: ?estado=X&cliente=Y
export async function GET(request: NextRequest) {
  const pedidosCoreBaseId = config.airtable.pedidosCoreBaseId;
  const pedidosTable = config.airtable.pedidosCorePedidosTable;
  const detallesTable = config.airtable.pedidosCoreDetallesTable;
  const pedidosCoreToken = config.airtable.pedidosCoreToken;
  const biocharBlendCode = config.airtable.inventarioProdCoreBiocharBlendProductId;

  if (!pedidosCoreToken || !pedidosCoreBaseId || !biocharBlendCode) {
    const missing = [
      !pedidosCoreToken && 'AIRTABLE_PEDIDOS_CORE_TOKEN',
      !pedidosCoreBaseId && 'AIRTABLE_PEDIDOS_CORE_BASE_ID',
      !biocharBlendCode && 'AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID',
    ].filter(Boolean).join(', ');
    return NextResponse.json(
      { error: 'Configuración de Sirius Pedidos Core incompleta', details: `Faltan: ${missing}` },
      { status: 500 }
    );
  }

  const coreHeaders = {
    'Authorization': `Bearer ${pedidosCoreToken}`,
    'Content-Type': 'application/json',
  };

  try {
    const { searchParams } = new URL(request.url);
    const estadoFilter = searchParams.get('estado');
    const clienteFilter = searchParams.get('cliente');

    // ── 1. Listar Detalle Pedido filtrando por Biochar Blend ──────────────
    const detalleFormula = `{ID Producto Core}='${biocharBlendCode.replace(/'/g, "\\'")}'`;
    type DetalleRecord = {
      id: string;
      fields: Record<string, unknown>;
    };
    const allDetalles: DetalleRecord[] = [];
    let dOffset: string | undefined;
    do {
      const dParams = new URLSearchParams();
      dParams.set('filterByFormula', detalleFormula);
      dParams.set('pageSize', '100');
      if (dOffset) dParams.set('offset', dOffset);
      const dRes = await fetch(
        `https://api.airtable.com/v0/${pedidosCoreBaseId}/${detallesTable}?${dParams.toString()}`,
        { headers: coreHeaders }
      );
      const dData = await dRes.json();
      if (!dRes.ok) {
        console.error('❌ Error Airtable GET Detalle Pedido Core:', dData);
        return NextResponse.json(
          { error: dData?.error || 'Airtable error', details: dData },
          { status: dRes.status }
        );
      }
      allDetalles.push(...(dData.records || []));
      dOffset = dData.offset;
    } while (dOffset);

    // Indexar detalles por pedido recordId (campo Pedido = array de linked recordIds)
    const detallesByPedidoId: Record<string, DetalleRecord> = {};
    for (const d of allDetalles) {
      const pedidoLinks = (d.fields?.['Pedido'] as string[] | undefined) || [];
      for (const pid of pedidoLinks) {
        // Si hay varios detalles del mismo producto en un pedido, sumamos cantidades
        if (detallesByPedidoId[pid]) {
          const acc = Number(detallesByPedidoId[pid].fields['Cantidad Pedido'] ?? 0);
          const cur = Number(d.fields['Cantidad Pedido'] ?? 0);
          detallesByPedidoId[pid] = {
            ...detallesByPedidoId[pid],
            fields: { ...detallesByPedidoId[pid].fields, 'Cantidad Pedido': acc + cur },
          };
        } else {
          detallesByPedidoId[pid] = d;
        }
      }
    }

    const pedidoIds = Object.keys(detallesByPedidoId);
    if (pedidoIds.length === 0) {
      return NextResponse.json({ records: [], source: 'pedidos-core' }, { status: 200 });
    }

    // ── 2. Listar Pedidos en Core (paginado por lotes de 100 IDs) ─────────
    type PedidoCoreRecord = { id: string; fields: Record<string, unknown> };
    const allPedidos: PedidoCoreRecord[] = [];
    const chunkSize = 80;
    for (let i = 0; i < pedidoIds.length; i += chunkSize) {
      const chunk = pedidoIds.slice(i, i + chunkSize);
      const orParts = chunk.map((id) => `RECORD_ID()='${id}'`).join(',');
      const formula = `OR(${orParts})`;
      const pParams = new URLSearchParams();
      pParams.set('filterByFormula', formula);
      pParams.set('pageSize', '100');
      const pRes = await fetch(
        `https://api.airtable.com/v0/${pedidosCoreBaseId}/${pedidosTable}?${pParams.toString()}`,
        { headers: coreHeaders }
      );
      const pData = await pRes.json();
      if (!pRes.ok) {
        console.error('❌ Error Airtable GET Pedido Core:', pData);
        return NextResponse.json(
          { error: pData?.error || 'Airtable error', details: pData },
          { status: pRes.status }
        );
      }
      allPedidos.push(...(pData.records || []));
    }

    // ── 3. Enriquecer con Clientes (Sirius Clients Core) ──────────────────
    type ClienteMap = Record<string, { nombre: string; nit: string; ciudad: string }>;
    const clientesById: ClienteMap = {};
    const clientesBaseId = process.env.AIRTABLE_CLIENTES_BASE_ID;
    const clientesTableId = process.env.AIRTABLE_CLIENTES_TABLE_ID;
    const clientesToken = process.env.AIRTABLE_CLIENTES_TOKEN || config.airtable.token;
    if (clientesBaseId && clientesTableId && clientesToken) {
      try {
        let cOffset: string | undefined;
        do {
          const cParams = new URLSearchParams({ pageSize: '100' });
          cParams.append('fields[]', 'Cliente');
          cParams.append('fields[]', 'Nit');
          cParams.append('fields[]', 'Ciudad');
          cParams.append('fields[]', 'ID');
          if (cOffset) cParams.set('offset', cOffset);
          const cRes = await fetch(
            `https://api.airtable.com/v0/${clientesBaseId}/${clientesTableId}?${cParams.toString()}`,
            { headers: { Authorization: `Bearer ${clientesToken}` } }
          );
          const cData = await cRes.json();
          if (!cRes.ok) {
            console.warn('⚠️ No se pudo cargar Clients Core para enriquecimiento:', cData);
            break;
          }
          for (const r of cData.records || []) {
            const id = String(r.fields?.['ID'] ?? '');
            if (!id) continue;
            clientesById[id] = {
              nombre: String(r.fields?.['Cliente'] ?? ''),
              nit: String(r.fields?.['Nit'] ?? ''),
              ciudad: String(r.fields?.['Ciudad'] ?? ''),
            };
          }
          cOffset = cData.offset;
        } while (cOffset);
      } catch (e) {
        console.warn('⚠️ Error enriqueciendo con Clients Core (continuando):', e);
      }
    }

    // ── 4. Mapear a forma esperada por la UI ──────────────────────────────
    const parseNotas = (notas: string): { empaque: string; observaciones: string; producto: string } => {
      const result = { empaque: '', observaciones: '', producto: '' };
      if (!notas) return result;
      const parts = notas.split('|').map((p) => p.trim());
      const obsParts: string[] = [];
      for (const p of parts) {
        const m = p.match(/^Empaque:\s*(.+)$/i);
        if (m) {
          result.empaque = m[1].trim();
          continue;
        }
        const kgEmpaque = p.match(/^KG:\s*[\d.]+\s*[—-]\s*Empaque:\s*(.+)$/i);
        if (kgEmpaque) {
          result.empaque = kgEmpaque[1].trim();
          continue;
        }
        const kgOnly = p.match(/^KG:\s*[\d.]+$/i);
        if (kgOnly) continue; // KG ya viene del detalle
        const prod = p.match(/^Producto:\s*(.+)$/i);
        if (prod) {
          result.producto = prod[1].trim();
          continue;
        }
        obsParts.push(p);
      }
      result.observaciones = obsParts.join(' | ');
      return result;
    };

    const records = allPedidos.map((p) => {
      const idClienteCore = String(p.fields?.['ID Cliente Core'] ?? '');
      const cli = clientesById[idClienteCore];
      const notas = String(p.fields?.['Notas'] ?? '');
      const parsed = parseNotas(notas);
      const detalle = detallesByPedidoId[p.id];
      const kgTotal = Number(detalle?.fields?.['Cantidad Pedido'] ?? 0);

      // Mapear estados de Sirius Pedidos Core → estados internos de la app
      // Core: Recibido | Procesando | Enviado | Completado | Cancelado | Enviado Parcial
      const CORE_TO_APP: Record<string, string> = {
        'Recibido':       'Recibido',
        'Procesando':     'En Producci\u00f3n',
        'Enviado Parcial':'Listo Despacho',
        'Enviado':        'Despachado',
        'Completado':     'Despachado',
        'Cancelado':      'Cancelado',
      };
      const coreEstado = String(p.fields?.['Estado'] ?? 'Recibido');
      const appEstado = CORE_TO_APP[coreEstado] ?? coreEstado;

      const mappedFields: Record<string, unknown> = {
        // Campos canónicos esperados por la UI
        'Cliente': cli?.nombre || idClienteCore || '—',
        'NIT Cliente': cli?.nit || '',
        'Estado': appEstado,
        'Fecha Pedido': p.fields?.['Fecha de Pedido'] ?? '',
        'Fecha Requerida': p.fields?.['Fecha de Pedido'] ?? '',
        'KG Total Pedido': kgTotal,
        'KG Solicitados': kgTotal,
        'Empaque': parsed.empaque || '',
        'Observaciones': parsed.observaciones,
        'Producto': parsed.producto || 'Biochar Blend',
        'ID Pedido Core': p.fields?.['ID Pedido Core'] ?? '',
        'ID Cliente Core': idClienteCore,
        'Origen del Pedido': p.fields?.['Origen del Pedido'] ?? '',
        // Metadatos internos para edición / acciones
        '_detalleRecordId': detalle?.id ?? '',
        '_pedidoCoreRecordId': p.id,
      };
      return { id: p.id, fields: mappedFields };
    });

    // ── 5. Filtros opcionales en memoria ──────────────────────────────────
    let filtered = records;
    if (estadoFilter) {
      filtered = filtered.filter((r) => String(r.fields['Estado']) === estadoFilter);
    }
    if (clienteFilter) {
      const q = clienteFilter.toLowerCase();
      filtered = filtered.filter((r) => String(r.fields['Cliente']).toLowerCase().includes(q));
    }

    // Ordenar por fecha desc
    filtered.sort((a, b) => {
      const da = String(a.fields['Fecha Pedido'] || '');
      const db = String(b.fields['Fecha Pedido'] || '');
      return db.localeCompare(da);
    });

    console.log(`📋 blend_pedidos (Core): ${filtered.length} pedidos blend (total core: ${records.length})`);
    return NextResponse.json({ records: filtered, source: 'pedidos-core' }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/pedidos (Core):', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/pirolisis/blend/pedidos
// Crea pedido con estado inicial "Recibido"
export async function POST(request: Request) {
  const guard = guardConfig();
  if (guard) return guard;

  try {
    const body = await request.json();
    console.log('📥 blend_pedidos POST body:', body);

    const {
      cliente,
      kg_solicitados,
      empaque,
      fecha_pedido,
      fecha_requerida,
      nit_cc_cliente,
      contacto_cliente,
      telefono,
      email,
      observaciones,
      realiza_registro,
      // Sirius Pedidos Core
      id_cliente_core,
      id_usuario_responsable,
      // Producto
      producto,
      codigo_producto,
      precio_unitario,
    } = body as {
      cliente: string;
      kg_solicitados: number;
      empaque: Empaque;
      fecha_pedido?: string;
      fecha_requerida?: string;
      nit_cc_cliente?: string;
      contacto_cliente?: string;
      telefono?: string;
      email?: string;
      observaciones?: string;
      realiza_registro?: string;
      id_cliente_core?: string;
      id_usuario_responsable?: string;
      producto?: string;
      codigo_producto?: string;
      precio_unitario?: number;
    };

    if (!cliente) {
      return NextResponse.json(
        { error: 'Campo requerido faltante', details: 'Se requiere: cliente' },
        { status: 400 }
      );
    }

    const kgNumericos = parseFloat(String(kg_solicitados));
    if (!kg_solicitados || isNaN(kgNumericos) || kgNumericos <= 0) {
      return NextResponse.json(
        { error: 'Campo requerido faltante o inválido', details: 'kg_solicitados debe ser un número positivo' },
        { status: 400 }
      );
    }

    if (!empaque || !(EMPAQUE_VALUES as readonly string[]).includes(empaque)) {
      return NextResponse.json(
        { error: 'Campo requerido faltante o inválido', details: `empaque debe ser uno de: ${EMPAQUE_VALUES.join(', ')}` },
        { status: 400 }
      );
    }

    // ── 1. Crear en tabla blend local ─────────────────────────────────────────
    const fields: Record<string, unknown> = {
      'Cliente': cliente,
      'KG Solicitados': kgNumericos,
      'Empaque': empaque,
      'Estado': 'Recibido',
    };

    if (fecha_pedido) fields['Fecha Pedido'] = fecha_pedido;
    if (fecha_requerida) fields['Fecha Requerida'] = fecha_requerida;
    if (nit_cc_cliente) fields['NIT/CC Cliente'] = nit_cc_cliente;
    if (contacto_cliente) fields['Contacto Cliente'] = contacto_cliente;
    if (telefono) fields['Telefono'] = telefono;
    if (email) fields['Email'] = email;
    if (observaciones) fields['Observaciones'] = observaciones;
    if (realiza_registro) fields['Realiza Registro'] = realiza_registro;

    console.log('📤 Creando pedido blend local:', fields);
    const res = await fetch(tableUrl(), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ records: [{ fields }] }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error('❌ Error Airtable POST blend_pedidos:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
    }

    const record = data.records?.[0];
    console.log('✅ Pedido blend local creado:', record?.id);

    // ── 2. Sincronizar a Sirius Pedidos Core ──────────────────────────────────
    const pedidosCoreToken = config.airtable.pedidosCoreToken;
    const pedidosCoreBaseId = config.airtable.pedidosCoreBaseId;
    const pedidosTable = config.airtable.pedidosCorePedidosTable;
    const detallesTable = config.airtable.pedidosCoreDetallesTable;

    if (pedidosCoreToken && pedidosCoreBaseId) {
      try {
        const pedidoCoreHeaders = {
          'Authorization': `Bearer ${pedidosCoreToken}`,
          'Content-Type': 'application/json',
        };

        // ID Cliente Core: solo usar el código CL-XXXX, nunca el NIT ni el nombre
        const pedidoCoreFields: Record<string, unknown> = {
          'Origen del Pedido': 'PiroliApp (Pirolisis)',
          'Estado': 'Recibido',
        };

        if (id_cliente_core) pedidoCoreFields['ID Cliente Core'] = id_cliente_core;
        else console.warn('⚠️ [pedidos] id_cliente_core no recibido — campo omitido en Sirius Pedidos Core');

        if (fecha_requerida) pedidoCoreFields['Fecha de Pedido'] = fecha_requerida;
        else if (fecha_pedido) pedidoCoreFields['Fecha de Pedido'] = fecha_pedido;

        if (id_usuario_responsable) pedidoCoreFields['ID Usuario Responsable'] = id_usuario_responsable;

        const notasParts: string[] = [];
        if (producto) notasParts.push(`Producto: ${producto}`);
        notasParts.push(`KG: ${kgNumericos} — Empaque: ${empaque}`);
        if (observaciones) notasParts.push(observaciones);
        pedidoCoreFields['Notas'] = notasParts.join(' | ');

        console.log('📤 Sincronizando a Sirius Pedidos Core:', pedidoCoreFields);
        const pedidoCoreRes = await fetch(
          `https://api.airtable.com/v0/${pedidosCoreBaseId}/${pedidosTable}`,
          {
            method: 'POST',
            headers: pedidoCoreHeaders,
            body: JSON.stringify({ records: [{ fields: pedidoCoreFields }] }),
          }
        );
        const pedidoCoreData = await pedidoCoreRes.json();

        if (!pedidoCoreRes.ok) {
          console.error('⚠️ Error sincronizando a Sirius Pedidos Core (no crítico):', pedidoCoreData);
        } else {
          const pedidoCoreRecord = pedidoCoreData.records?.[0];
          console.log('✅ Sirius Pedidos Core creado:', pedidoCoreRecord?.fields?.['ID Pedido Core']);

          // ── 2b. Crear Detalle del Pedido si hay producto ──────────────────
          if (codigo_producto && pedidoCoreRecord?.id) {
            const detalleFields: Record<string, unknown> = {
              'Pedido': [pedidoCoreRecord.id],
              'ID Producto Core': codigo_producto,
              'Cantidad Pedido': kgNumericos,
            };
            if (precio_unitario) detalleFields['Precio unitario en el momento del pedido'] = precio_unitario;

            const detalleRes = await fetch(
              `https://api.airtable.com/v0/${pedidosCoreBaseId}/${detallesTable}`,
              {
                method: 'POST',
                headers: pedidoCoreHeaders,
                body: JSON.stringify({ records: [{ fields: detalleFields }] }),
              }
            );
            if (!detalleRes.ok) {
              const detalleErr = await detalleRes.json();
              console.error('⚠️ Error creando detalle en Sirius Pedidos Core (no crítico):', detalleErr);
            } else {
              console.log('✅ Detalle Sirius Pedidos Core creado para producto:', codigo_producto);
            }
          }
        }
      } catch (syncErr) {
        // La sincronización es no crítica: el pedido local ya fue creado exitosamente
        console.error('⚠️ Error inesperado sincronizando a Sirius Pedidos Core (no crítico):', syncErr);
      }
    } else {
      console.warn('⚠️ AIRTABLE_PEDIDOS_CORE_TOKEN no configurado — omitiendo sincronización');
    }

    return NextResponse.json(
      { success: true, message: 'Pedido creado exitosamente', record },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/pedidos:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
