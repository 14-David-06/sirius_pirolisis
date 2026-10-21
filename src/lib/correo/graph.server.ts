// src/lib/correo/graph.server.ts
//
// El lado servidor del correo: decide el modo, lee las credenciales y deja un
// log sin datos personales. El transporte vive en `graph.ts`.
//
// ═══ POR QUÉ SE LEE EL ENTORNO AL ENVIAR ═════════════════════════════════════════
// Leerlo al importar haría que un despliegue sin las variables de Azure tumbara
// cualquier ruta que importe este módulo, aunque nunca mande un correo. Así,
// leyéndolo en cada envío, la recepción sigue funcionando y solo el paso del
// correo falla, con un 207 que dice qué variable falta. Es el defecto del
// laboratorio, que arma su cliente MSAL al cargar el módulo.
//
// ═══ QUÉ QUEDA EN EL LOG ══════════════════════════════════════════════════════════
// `{etiqueta, modo, destinatarios, status, requestId, intentos}` y, si falla,
// `tipo` y `codigo`. Nunca direcciones, asunto, cuerpo ni token: el receptor es
// alguien de afuera, y los logs de Vercel no son un lugar para sus datos.

import 'server-only';

import {
  crearClienteGraph,
  destinatariosEnmascarados,
  ErrorCorreo,
  prepararMensaje,
  resolverModoCorreo,
  type ClienteGraph,
  type ConfigGraph,
  type CorreoSaliente,
  type ModoCorreo,
  type ResultadoEnvio,
} from './graph';

export { ErrorCorreo } from './graph';
export type { AdjuntoCorreo, CorreoSaliente, ModoCorreo, ResultadoEnvio, TipoErrorCorreo } from './graph';

const VARIABLES_GRAPH = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'OUTLOOK_SENDER_EMAIL'] as const;

function variable(nombre: string): string {
  return (process.env[nombre] ?? '').trim();
}

function leerConfigGraph(): { ok: true; cfg: ConfigGraph } | { ok: false; falta: string[] } {
  const falta = VARIABLES_GRAPH.filter((n) => !variable(n));
  if (falta.length) return { ok: false, falta };
  return {
    ok: true,
    cfg: {
      tenantId: variable('AZURE_TENANT_ID'),
      clientId: variable('AZURE_CLIENT_ID'),
      clientSecret: variable('AZURE_CLIENT_SECRET'),
      remitente: variable('OUTLOOK_SENDER_EMAIL'),
    },
  };
}

/**
 * ¿Puede `enviarCorreo` funcionar con el entorno de ahora? En `simular` no hace
 * falta nada; en `enviar` y `redirigir`, las cuatro variables de Graph. Solo
 * nombres de variable, nunca valores.
 */
export function correoConfigurado(): { ok: true } | { ok: false; falta: string[] } {
  if (resolverModoCorreo(process.env).modo === 'simular') return { ok: true };
  const config = leerConfigGraph();
  return config.ok ? { ok: true } : { ok: false, falta: config.falta };
}

// El cliente guarda el token en memoria: se reutiliza mientras la instancia viva
// y la configuración no cambie (una rotación del secreto crea uno nuevo).
let actual: { cfg: ConfigGraph; cliente: ClienteGraph } | null = null;

function clienteGraph(cfg: ConfigGraph): ClienteGraph {
  const previo = actual;
  if (
    previo &&
    previo.cfg.tenantId === cfg.tenantId &&
    previo.cfg.clientId === cfg.clientId &&
    previo.cfg.clientSecret === cfg.clientSecret &&
    previo.cfg.remitente === cfg.remitente
  ) {
    return previo.cliente;
  }
  const cliente = crearClienteGraph(cfg, {
    // A través de globalThis en cada llamada, no la referencia de este momento.
    fetch: ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)) as typeof fetch,
    ahora: () => Date.now(),
  });
  actual = { cfg, cliente };
  return cliente;
}

/** Solo lo que identifica el envío: sin `@`, sin espacios y corto. */
function etiquetaSegura(etiqueta: unknown): string {
  return (typeof etiqueta === 'string' ? etiqueta : '').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 60) || 'correo';
}

interface DatosLog {
  etiqueta: string;
  modo: ModoCorreo;
  destinatarios: number;
  status?: number;
  requestId?: string;
  intentos?: number;
  tipo?: string;
  codigo?: string;
  guardado?: boolean;
}

function registrar(nivel: 'info' | 'error', datos: DatosLog): void {
  console[nivel]('[correo]', JSON.stringify(datos));
}

function registrarFallo(base: Omit<DatosLog, 'tipo'>, e: unknown): void {
  if (e instanceof ErrorCorreo) {
    registrar('error', { ...base, tipo: e.tipo, status: e.status, codigo: e.codigo, intentos: e.intentos });
  } else {
    registrar('error', { ...base, tipo: 'inesperado' });
  }
}

// Un aviso por modo y motivo en la vida del proceso: si cada correo lo repitiera,
// el log de un entorno de prueba sería solo eso.
const modosAvisados = new Set<string>();

function avisarModo(modo: ModoCorreo, motivo: string): void {
  if (modo === 'enviar') return;
  const clave = `${modo}|${motivo}`;
  if (modosAvisados.has(clave)) return;
  modosAvisados.add(clave);
  console.warn(`[correo] modo ${modo}: ${motivo}`);
}

/**
 * Deja el correo simulado en `CORREO_GUARDAR_EN` para revisarlo: `.html`, el PDF
 * y un `.json` con los destinatarios enmascarados. `null` si no aplica.
 *
 * Nunca en producción (ni en Preview, que corre con NODE_ENV=production): el
 * sistema de archivos de Vercel es de solo lectura y el HTML lleva datos del
 * receptor. Un fallo al guardar no tumba el envío simulado.
 */
async function guardarSimulado(c: CorreoSaliente, etiqueta: string): Promise<boolean | null> {
  const carpeta = variable('CORREO_GUARDAR_EN');
  if (!carpeta || process.env.NODE_ENV === 'production' || variable('VERCEL_ENV') === 'production') return null;
  try {
    // Import perezoso: el módulo no arrastra `fs` a quien solo lo importa.
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(carpeta, { recursive: true });
    const instante = new Date().toISOString();
    // La etiqueta trae «:» (recepcion:SIRIUS-REM-…): en Windows eso abre un flujo
    // alternativo de NTFS y los archivos quedan invisibles dentro de uno vacío.
    const nombreSeguro = etiqueta.replace(/[^A-Za-z0-9_-]/g, '_');
    const base = join(carpeta, `${instante.replace(/[:.]/g, '-')}-${nombreSeguro}`);
    const adjuntos = c.adjuntos ?? [];
    await writeFile(`${base}.html`, c.html, 'utf8');
    for (let i = 0; i < adjuntos.length; i++) {
      await writeFile(`${base}${i ? `-${i + 1}` : ''}.pdf`, adjuntos[i].bytes);
    }
    const resumen = {
      etiqueta,
      modo: 'simular',
      instante,
      asunto: c.asunto,
      ...destinatariosEnmascarados(c),
      adjuntos: adjuntos.map((a) => ({ nombre: a.nombre, bytes: a.bytes.byteLength })),
    };
    await writeFile(`${base}.json`, JSON.stringify(resumen, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Envía `c` según el modo del entorno (`resolverModoCorreo`):
 *
 * - `simular`: no sale a la red. `enviado: false`.
 * - `redirigir`: sale, pero solo a `CORREO_REDIRIGIR_A`, con `[PRUEBA]` y la
 *   franja de los destinatarios originales. `enviado: true`.
 * - `enviar`: sale a los destinatarios. `enviado: true`.
 *
 * Lanza `ErrorCorreo` si el correo no cumple los límites, si falta configuración
 * (`tipo: 'configuracion'`, con los nombres de las variables) o si Graph no lo
 * aceptó. El mensaje del error es apto para un `StepResult`.
 */
export async function enviarCorreo(c: CorreoSaliente): Promise<ResultadoEnvio> {
  const etiqueta = etiquetaSegura(c?.etiqueta);
  const { modo, redirigirA, motivo } = resolverModoCorreo(process.env);
  avisarModo(modo, motivo);

  let mensaje: CorreoSaliente;
  try {
    mensaje = prepararMensaje(c, { modo, redirigirA });
  } catch (e) {
    registrarFallo({ etiqueta, modo, destinatarios: 0 }, e);
    throw e;
  }
  const destinatarios = mensaje.para.length + (mensaje.cc?.length ?? 0);

  if (modo === 'simular') {
    const guardado = await guardarSimulado(mensaje, etiqueta);
    registrar('info', { etiqueta, modo, destinatarios, ...(guardado === null ? {} : { guardado }) });
    return { modo, enviado: false, destinatarios, intentos: 0 };
  }

  try {
    const config = leerConfigGraph();
    if (!config.ok) {
      throw new ErrorCorreo(`Correo sin configurar: falta ${config.falta.join(', ')}`, 'configuracion');
    }
    const r = await clienteGraph(config.cfg).enviar(mensaje);
    registrar('info', { etiqueta, modo, destinatarios, status: 202, requestId: r.requestId, intentos: r.intentos });
    return { modo, enviado: true, destinatarios, requestId: r.requestId, intentos: r.intentos };
  } catch (e) {
    registrarFallo({ etiqueta, modo, destinatarios }, e);
    throw e;
  }
}
