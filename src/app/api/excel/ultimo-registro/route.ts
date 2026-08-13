import { NextRequest, NextResponse } from 'next/server';
import { crearBalanceDesdeRegistro, RegistroInvalidoError } from '@/lib/balance-desde-registro';
import { ExcelInvalidoError, leerUltimoRegistro } from '@/lib/excel-ultimo-registro';
import { checkRateLimit, createRateLimitResponse } from '@/middleware/rate-limit';

/**
 * POST /api/excel/ultimo-registro — sube el `Registro_Proceso.xlsx` del tablero,
 * toma su última fila y crea con ella un Balance de Masa.
 *
 * El archivo llega desde un script de PowerShell en el tablero que lo reenvía cada
 * pocos minutos, así que el ingreso es idempotente por `Fecha Hora`: reenviar el
 * mismo archivo devuelve el balance ya creado en vez de duplicarlo.
 *
 * Las filas de hora cerrada (8:00, 9:00, 13:00…) se descartan: son la marca horaria
 * del PLC, no una lona. Se responde 200 con `ignorado: 'hora_cerrada'`.
 *
 * multipart/form-data:
 *   file               (requerido) archivo .xlsx / .xlsm
 *   hoja               (opcional)  nombre de la hoja o su índice 1-based; por defecto la primera
 *   filaEncabezado     (opcional)  fila de encabezados, 1-indexada; por defecto 1
 *   realizaRegistro    (opcional)  queda en el balance; por defecto, el operador del turno abierto
 *   dryRun             (opcional)  "true" devuelve el plan sin escribir nada
 *   incluirHoraCerrada (opcional)  "true" ingiere la fila aunque caiga en hora cerrada
 */

function leerTexto(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo);
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

const CONFIG = {
  maxFileSize: 15 * 1024 * 1024,
  allowedExtensions: ['.xlsx', '.xlsm'],
  /**
   * El endpoint es público y cada POST aceptado cuesta ~10 llamadas a la base de
   * PiroliApp (dedup, turno, balance, bache, Big Bag, lonas, telemetría) contra un
   * límite de 5 req/s. El tablero manda una copia cada pocos minutos —12 por hora en
   * el peor caso—, así que 20 en 5 minutos le deja margen de sobra para reintentos y
   * a la vez acota lo que un envío en ráfaga puede mover del inventario.
   */
  rateLimit: { windowMs: 5 * 60 * 1000, maxRequests: 20 },
} as const;

// El parseo carga el libro completo en memoria: fuera del edge runtime.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, CONFIG.rateLimit);
  if (!rateLimit.allowed) {
    console.warn(
      `🚨 [excel/ultimo-registro] Rate limit excedido para ${request.headers.get('x-forwarded-for') ?? 'IP desconocida'}`
    );
    return createRateLimitResponse(rateLimit.resetTime);
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Cuerpo inválido', details: 'Se espera multipart/form-data con el campo "file"' },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Archivo no encontrado', details: 'Se requiere un archivo en el campo "file"' },
        { status: 400 }
      );
    }

    const nombre = file.name.toLowerCase();
    if (!CONFIG.allowedExtensions.some((ext) => nombre.endsWith(ext))) {
      // .xls (formato binario viejo) no lo lee ExcelJS: hay que decirlo, no fallar con un error de parseo.
      return NextResponse.json(
        {
          error: 'Extensión no permitida',
          details: `Permitidas: ${CONFIG.allowedExtensions.join(', ')}. Si el archivo es .xls o .csv, guárdalo como .xlsx.`,
        },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Archivo vacío', details: `"${file.name}" pesa 0 bytes` }, { status: 400 });
    }
    if (file.size > CONFIG.maxFileSize) {
      const pesa = (file.size / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          error: 'Archivo demasiado grande',
          details: `"${file.name}" pesa ${pesa}MB y el máximo es ${CONFIG.maxFileSize / (1024 * 1024)}MB.`,
        },
        { status: 400 }
      );
    }

    const hojaBruta = formData.get('hoja');
    const hoja =
      typeof hojaBruta === 'string' && hojaBruta.trim() !== ''
        ? /^\d+$/.test(hojaBruta.trim())
          ? Number(hojaBruta.trim())
          : hojaBruta.trim()
        : undefined;

    const filaBruta = formData.get('filaEncabezado');
    const filaEncabezado =
      typeof filaBruta === 'string' && filaBruta.trim() !== '' ? Number(filaBruta.trim()) : undefined;
    if (filaEncabezado !== undefined && !Number.isInteger(filaEncabezado)) {
      return NextResponse.json(
        { error: 'Parámetro inválido', details: 'filaEncabezado debe ser un número entero' },
        { status: 400 }
      );
    }

    const lectura = await leerUltimoRegistro(Buffer.from(await file.arrayBuffer()), { hoja, filaEncabezado });

    if (!lectura.ultimoRegistro) {
      return NextResponse.json(
        {
          error: 'Sin registros',
          details: `La hoja "${lectura.hoja}" no tiene filas con datos debajo del encabezado (fila ${lectura.filaEncabezado}).`,
          encabezados: lectura.encabezados,
        },
        { status: 422 }
      );
    }

    // El archivo lo manda un script del tablero: sin este log no hay forma de ver
    // qué llegó, porque la respuesta muere en la consola de la otra máquina.
    console.log(
      `📄 [excel/ultimo-registro] ${file.name} · hoja "${lectura.hoja}" · fila ${lectura.ultimoRegistro.fila} de ${lectura.totalRegistros} registros`,
      lectura.ultimoRegistro.valores
    );

    const resultado = await crearBalanceDesdeRegistro(lectura.ultimoRegistro.valores, {
      realizaRegistro: leerTexto(formData, 'realizaRegistro'),
      dryRun: leerTexto(formData, 'dryRun') === 'true',
      incluirHoraCerrada: leerTexto(formData, 'incluirHoraCerrada') === 'true',
      origin: request.nextUrl.origin,
    });

    const cuerpo = {
      success: resultado.ok,
      archivo: file.name,
      hoja: lectura.hoja,
      totalRegistros: lectura.totalRegistros,
      fila: lectura.ultimoRegistro.fila,
      registro: lectura.ultimoRegistro.valores,
      balance: {
        balanceId: resultado.balanceId,
        yaExistia: resultado.yaExistia,
        ignorado: resultado.ignorado,
        fechaHora: resultado.fechaHora,
        turnoId: resultado.turnoId,
        pesoBiochar: resultado.pesoBiochar,
        ...(resultado.warnings ? { warnings: resultado.warnings } : {}),
      },
      steps: resultado.steps,
    };

    if (resultado.ignorado === 'hora_cerrada') {
      console.log(
        `⏭️  [excel/ultimo-registro] Fila ${resultado.fechaHora} es hora cerrada (marca del PLC): ignorada.`
      );
    } else {
      console.log(
        resultado.yaExistia
          ? `↩️  [excel/ultimo-registro] Fila ${resultado.fechaHora} ya ingresada como ${resultado.balanceId}: sin cambios.`
          : `✅ [excel/ultimo-registro] Balance ${resultado.balanceId} creado desde ${resultado.fechaHora}`
      );
    }

    // 207: el balance existe pero algún paso quedó a medias (típicamente la llave de
    // deduplicación). Un 200 lo escondería y el próximo envío duplicaría el balance.
    return NextResponse.json(cuerpo, { status: resultado.ok ? 200 : 207 });
  } catch (error: unknown) {
    if (error instanceof ExcelInvalidoError || error instanceof RegistroInvalidoError) {
      return NextResponse.json({ error: 'Archivo Excel inválido', details: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ [excel/ultimo-registro] Error:', message);
    return NextResponse.json({ error: 'Error interno del servidor', details: message }, { status: 500 });
  }
}
