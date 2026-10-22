'use client';

// La confirmación de recepción que hace quien recibe el producto, desde el QR de
// la remisión o el enlace de WhatsApp. Es la única pantalla de PiroliApp que usa
// alguien de fuera de Sirius: sin sesión, en un celular, a veces al sol y con
// mala señal. Por eso una sola columna, letra grande, botones a todo el ancho y
// un mensaje claro para cada forma de fallar.
//
// La lógica de pasos vive en `recepcion.estado.ts` (pura y probada); aquí solo
// se pinta y se habla con `/api/recibir/*` (contrato D.9 a D.11).

import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { enmascararCedula } from '@/lib/recepcion/datos-personales';
import {
  AVISO_PRIVACIDAD_CONOCIDA,
  TEXTO_AUTORIZACION_DATOS,
  textoErrorRecepcion,
} from '@/lib/recepcion/textos';
import { fechaHoraBogotaLegible, fechaLegible } from '@/lib/fecha-bogota';
import {
  clavePantalla,
  cuerpoConfirmar,
  ESTADO_INICIAL,
  falloDeRespuesta,
  leerConsulta,
  leerExito,
  MENSAJE_ENLACE_INCOMPLETO,
  reducirRecepcion,
  tituloError,
  tokenDeFragmento,
  validarCedula,
  validarConocida,
  validarRegistro,
  type Borrador,
  type CampoRecepcion,
  type ErroresCampos,
  type EstadoRecepcion,
  type PasoFormulario,
  type PasoRecepcion,
  type ResumenRemision,
} from './recepcion.estado';

/**
 * sessionStorage y no localStorage: el token sobrevive a una recarga (la URL ya
 * no lo trae, se limpió) pero muere al cerrar la pestaña, en un teléfono que
 * puede ser de la finca y pasar de mano en mano.
 */
const CLAVE_TOKEN = 'piroliapp:recibir:token';

/** A los 8 s sin respuesta se avisa que no cierre la página: el PATCH puede estar en curso. */
const AVISO_LENTO_MS = 8000;

type Respuesta = { status: number; cuerpo: unknown; retryAfter: string | null };

/**
 * POST a la API pública. Sin cookies (`credentials: 'omit'`): la página no usa
 * sesión, y si el celular es de un operador no hay por qué mandar la suya.
 */
async function llamar(ruta: string, cuerpo: Record<string, unknown>): Promise<Respuesta | null> {
  try {
    const r = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    let json: unknown = null;
    try {
      json = await r.json();
    } catch {
      // Un HTML de error del proxy: se decide por el código HTTP.
    }
    return { status: r.status, cuerpo: json, retryAfter: r.headers?.get?.('Retry-After') ?? null };
  } catch {
    return null; // Sin red.
  }
}

function leerTokenInicial(): string | null {
  if (typeof window === 'undefined') return null;
  const delFragmento = tokenDeFragmento(window.location.hash);
  if (delFragmento) {
    try {
      window.sessionStorage.setItem(CLAVE_TOKEN, delFragmento);
    } catch {
      // Navegación privada o almacenamiento bloqueado: el token sigue en memoria.
    }
    // Fuera de la barra de direcciones: no queda en el historial, ni en una
    // captura de pantalla, ni se comparte si la persona copia la URL.
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* noop */
    }
    return delFragmento;
  }
  try {
    return tokenDeFragmento(window.sessionStorage.getItem(CLAVE_TOKEN) ?? '');
  } catch {
    return null;
  }
}

function formatoKg(kg: number): string {
  return kg.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function FlujoRecepcion() {
  const [estado, despachar] = useReducer(reducirRecepcion, ESTADO_INICIAL);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const consultando = useRef<PasoRecepcion | null>(null);
  const [lento, setLento] = useState(false);

  useEffect(() => {
    despachar({ tipo: 'token', token: leerTokenInicial() });
  }, []);

  // `cargando` dispara la consulta, tanto al abrir como al reintentar. La guarda
  // por identidad del paso evita la segunda llamada del doble efecto de React en
  // desarrollo, que gastaría cupo del límite por IP.
  useEffect(() => {
    const paso = estado.paso;
    if (paso.tipo !== 'cargando' || !estado.token || consultando.current === paso) return;
    consultando.current = paso;
    const token = estado.token;
    void (async () => {
      const r = await llamar('/api/recibir/consultar', { token });
      if (!r) return despachar({ tipo: 'fallo', codigo: 'error_interno' });
      const consulta = r.status === 200 ? leerConsulta(r.cuerpo) : null;
      despachar(consulta ?? falloDeRespuesta(r.status === 200 ? 500 : r.status, r.cuerpo, r.retryAfter));
    })();
  }, [estado.paso, estado.token]);

  const clave = clavePantalla(estado.paso);
  useEffect(() => {
    h1Ref.current?.focus();
  }, [clave]);

  useEffect(() => {
    if (estado.paso.tipo !== 'enviando') return;
    setLento(false);
    const t = setTimeout(() => setLento(true), AVISO_LENTO_MS);
    return () => clearTimeout(t);
  }, [estado.paso.tipo]);

  const cambiar = useCallback(
    (campo: keyof Borrador) => (valor: string | boolean) => despachar({ tipo: 'campo', campo, valor }),
    [],
  );

  async function enviarCedula(e: FormEvent) {
    e.preventDefault();
    if (estado.paso.tipo !== 'cedula' || !estado.token) return;
    const v = validarCedula(estado.borrador);
    if (!v.ok) return despachar({ tipo: 'errores', errores: v.errores });
    despachar({ tipo: 'enviar' });
    const r = await llamar('/api/recibir/identificar', { token: estado.token, cedula: v.valor });
    if (!r) return despachar({ tipo: 'fallo', codigo: 'error_interno' });
    const c = (r.cuerpo ?? {}) as Record<string, unknown>;
    if (r.status === 200 && c.conocida === true) {
      return despachar({
        tipo: 'identificado',
        cedula: v.valor,
        conocida: true,
        nombre: typeof c.nombre === 'string' ? c.nombre : '',
        correo: typeof c.correo === 'string' && c.correo ? c.correo : null,
      });
    }
    if (r.status === 200 && c.conocida === false) {
      return despachar({ tipo: 'identificado', cedula: v.valor, conocida: false });
    }
    despachar(falloDeRespuesta(r.status === 200 ? 500 : r.status, r.cuerpo, r.retryAfter));
  }

  async function confirmar(cuerpo: Record<string, unknown>) {
    despachar({ tipo: 'enviar' });
    const r = await llamar('/api/recibir/confirmar', cuerpo);
    if (!r) return despachar({ tipo: 'fallo', codigo: 'error_interno' });
    // 207: la recepción quedó registrada y algo best-effort (el PDF, el correo)
    // falló. Para quien recibe es un éxito; el correo dice su propio estado.
    const exito = r.status === 200 || r.status === 207 ? leerExito(r.cuerpo) : null;
    if (exito) return despachar({ tipo: 'confirmado', datos: exito });
    despachar(falloDeRespuesta(r.status < 300 ? 500 : r.status, r.cuerpo, r.retryAfter));
  }

  function enviarConocida(e: FormEvent) {
    e.preventDefault();
    if (estado.paso.tipo !== 'conocida' || !estado.token || !estado.cedula) return;
    const v = validarConocida(estado.borrador);
    if (!v.ok) return despachar({ tipo: 'errores', errores: v.errores });
    void confirmar(cuerpoConfirmar(estado.token, estado.cedula, 'conocida', v.valor));
  }

  function enviarRegistro(e: FormEvent) {
    e.preventDefault();
    if (estado.paso.tipo !== 'registro' || !estado.token || !estado.cedula) return;
    const v = validarRegistro(estado.borrador);
    if (!v.ok) return despachar({ tipo: 'errores', errores: v.errores });
    void confirmar(cuerpoConfirmar(estado.token, estado.cedula, 'nueva', v.valor));
  }

  const paso = estado.paso;
  const enviando = paso.tipo === 'enviando';
  const visible: PasoRecepcion = paso.tipo === 'enviando' ? paso.desde : paso;

  let contenido: ReactNode;
  switch (visible.tipo) {
    case 'cargando':
      contenido = <PantallaCargando h1Ref={h1Ref} />;
      break;
    case 'cedula':
      contenido = (
        <PantallaCedula
          h1Ref={h1Ref}
          estado={estado}
          enviando={enviando}
          lento={lento}
          onCambio={cambiar('cedula')}
          onEnviar={enviarCedula}
        />
      );
      break;
    case 'conocida':
      contenido = (
        <PantallaConocida
          h1Ref={h1Ref}
          paso={visible}
          estado={estado}
          enviando={enviando}
          lento={lento}
          cambiar={cambiar}
          onEnviar={enviarConocida}
          onNoSoyYo={() => despachar({ tipo: 'no_soy_yo' })}
        />
      );
      break;
    case 'registro':
      contenido = (
        <PantallaRegistro
          h1Ref={h1Ref}
          paso={visible}
          estado={estado}
          enviando={enviando}
          lento={lento}
          cambiar={cambiar}
          onEnviar={enviarRegistro}
          onCambiarCedula={() => despachar({ tipo: 'cambiar_cedula' })}
        />
      );
      break;
    case 'exito':
      contenido = <PantallaExito h1Ref={h1Ref} paso={visible} />;
      break;
    case 'error':
      contenido = (
        <PantallaError
          h1Ref={h1Ref}
          paso={visible}
          estado={estado}
          onReintentar={() => despachar({ tipo: 'reintentar' })}
        />
      );
      break;
  }

  return (
    <div className="min-h-dvh bg-[#F6F7F9] text-base leading-relaxed text-[#222222] [color-scheme:light]">
      <header className="border-b-[3px] border-[#2EBD6B] bg-[#111111]">
        <div className="mx-auto max-w-[28rem] px-4 py-4">
          <p className="text-base font-bold tracking-wide text-white">SIRIUS REGENERATIVE SOLUTIONS</p>
          <p className="text-base text-[#BFC7D1]">Recepción de remisión</p>
        </div>
      </header>
      <main className="mx-auto max-w-[28rem] px-4 py-6">{contenido}</main>
      {/* Sin direcciones de correo en la página (decisión de David, 2026-10-22). El
          canal para ejercer los derechos sobre los datos sigue en el texto legal
          versionado, porque la Ley 1581 lo exige. */}
      <footer className="mx-auto max-w-[28rem] px-4 pb-8 text-base text-[#5B616B]">
        ¿Tiene dudas? Comuníquese con la persona de Sirius que le despachó el producto.
      </footer>
    </div>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const ANILLO_FOCO =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176633]';

const BOTON_PRIMARIO =
  `flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#176633] px-4 py-3 text-base font-semibold text-white ` +
  `hover:bg-[#12522A] disabled:cursor-not-allowed disabled:opacity-70 ${ANILLO_FOCO}`;

const BOTON_SECUNDARIO =
  `flex min-h-12 w-full items-center justify-center rounded-lg border-2 border-[#176633] bg-white px-4 py-3 text-base font-semibold text-[#176633] ` +
  `hover:bg-[#ECFAF1] disabled:cursor-not-allowed disabled:opacity-70 ${ANILLO_FOCO}`;

const ENTRADA =
  `block min-h-12 w-full rounded-lg border-2 border-[#8F949C] bg-white px-3 py-2 text-base text-[#222222] ` +
  `aria-[invalid=true]:border-[#B42318] disabled:bg-[#F0F1F3] ${ANILLO_FOCO}`;

type H1Ref = React.RefObject<HTMLHeadingElement | null>;

function Titulo({ h1Ref, children }: { h1Ref: H1Ref; children: ReactNode }) {
  return (
    <h1 ref={h1Ref} tabIndex={-1} className="mb-4 text-2xl font-bold leading-tight text-[#111111] outline-none">
      {children}
    </h1>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-5 w-5 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
    />
  );
}

function ResumenTarjeta({ resumen }: { resumen: ResumenRemision | null }) {
  if (!resumen) return null;
  return (
    <section aria-label="Datos de la remisión" className="mb-5 rounded-xl border border-[#DADDE2] bg-white p-4">
      <p className="text-lg font-bold text-[#111111]">Remisión {resumen.codigo}</p>
      <p>
        De Sirius Regenerative Solutions para {resumen.cliente || 'el cliente'}
        {resumen.area ? ` · Área ${resumen.area}` : ''}
      </p>
      <p className="font-semibold">
        {resumen.producto} · {formatoKg(resumen.kg)} kg
      </p>
      {resumen.fechaDespacho && <p>Despachada el {fechaLegible(resumen.fechaDespacho)}</p>}
    </section>
  );
}

/** Resumen de errores: se anuncia al enviar, y cada uno lleva al campo. */
function ResumenErrores({ errores }: { errores: ErroresCampos }) {
  const lista = Object.entries(errores).filter(([, msg]) => Boolean(msg)) as [CampoRecepcion, string][];
  if (!lista.length) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border-2 border-[#B42318] bg-[#FEF3F2] p-3 text-[#B42318]">
      <p className="font-semibold">Revise lo siguiente:</p>
      <ul className="ml-5 list-disc">
        {lista.map(([campo, msg]) => (
          <li key={campo}>{msg}</li>
        ))}
      </ul>
    </div>
  );
}

function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="mt-1 font-medium text-[#B42318]">
      {mensaje}
    </p>
  );
}

function CampoTexto(props: {
  id: string;
  etiqueta: string;
  valor: string;
  error?: string;
  ayuda?: string;
  onCambio: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  autoCapitalize?: string;
  maxLength?: number;
}) {
  const describe = [props.ayuda ? `${props.id}-ayuda` : '', props.error ? `${props.id}-error` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mb-4">
      <label htmlFor={props.id} className="mb-1 block font-semibold text-[#111111]">
        {props.etiqueta}
      </label>
      {props.ayuda && (
        <p id={`${props.id}-ayuda`} className="mb-1 text-[#5B616B]">
          {props.ayuda}
        </p>
      )}
      <input
        id={props.id}
        name={props.id}
        className={ENTRADA}
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete ?? 'off'}
        autoCapitalize={props.autoCapitalize}
        spellCheck={false}
        maxLength={props.maxLength ?? 120}
        value={props.valor}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describe || undefined}
        onChange={(e) => props.onCambio(e.target.value)}
      />
      <ErrorCampo id={`${props.id}-error`} mensaje={props.error} />
    </div>
  );
}

function CasillaAutorizacion(props: {
  id: string;
  marcada: boolean;
  error?: string;
  onCambio: (v: boolean) => void;
}) {
  return (
    <div className="mb-4">
      <div
        className={`flex gap-3 rounded-lg border-2 bg-white p-3 ${props.error ? 'border-[#B42318]' : 'border-[#DADDE2]'}`}
      >
        <input
          id={props.id}
          name={props.id}
          type="checkbox"
          className={`mt-1 h-6 w-6 shrink-0 accent-[#176633] ${ANILLO_FOCO}`}
          checked={props.marcada}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${props.id}-error` : undefined}
          onChange={(e) => props.onCambio(e.target.checked)}
        />
        <label htmlFor={props.id} className="text-base">
          <span className="font-semibold">(Obligatorio)</span> {TEXTO_AUTORIZACION_DATOS.texto}
        </label>
      </div>
      <ErrorCampo id={`${props.id}-error`} mensaje={props.error} />
    </div>
  );
}

function AvisoLento({ visible }: { visible: boolean }) {
  return (
    <p role="status" className="mt-3 min-h-6 text-center font-medium text-[#7A5E0F]">
      {visible ? 'Sigue en proceso; no cierre esta página.' : ''}
    </p>
  );
}

function Declaracion({ resumen }: { resumen: ResumenRemision | null }) {
  if (!resumen) return null;
  return (
    <p className="mb-4 rounded-lg bg-[#ECFAF1] p-3 text-[#176633]">
      Al confirmar declara que recibió {formatoKg(resumen.kg)} kg de {resumen.producto} de la remisión{' '}
      {resumen.codigo}.
    </p>
  );
}

// ── Pantallas ────────────────────────────────────────────────────────────────

function PantallaCargando({ h1Ref }: { h1Ref: H1Ref }) {
  return (
    <>
      <Titulo h1Ref={h1Ref}>Confirmar recepción</Titulo>
      <div aria-busy="true" className="rounded-xl border border-[#DADDE2] bg-white p-4">
        <span className="sr-only">Cargando la remisión</span>
        <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
          <div className="h-5 w-2/3 rounded bg-[#E4E7EB]" />
          <div className="h-4 w-full rounded bg-[#E4E7EB]" />
          <div className="h-4 w-1/2 rounded bg-[#E4E7EB]" />
        </div>
      </div>
    </>
  );
}

function PantallaCedula(props: {
  h1Ref: H1Ref;
  estado: EstadoRecepcion;
  enviando: boolean;
  lento: boolean;
  onCambio: (v: string) => void;
  onEnviar: (e: FormEvent) => void;
}) {
  const { estado } = props;
  // El teclado numérico es lo cómodo para una cédula, pero en iOS no deja
  // escribir letras: quien tiene pasaporte lo cambia aquí.
  const [conLetras, setConLetras] = useState(false);
  return (
    <>
      <Titulo h1Ref={props.h1Ref}>Confirmar recepción</Titulo>
      <p className="mb-3 font-medium text-[#5B616B]">Paso 1 de 2</p>
      <ResumenTarjeta resumen={estado.resumen} />
      <form noValidate onSubmit={props.onEnviar}>
        <ResumenErrores errores={estado.errores} />
        <fieldset disabled={props.enviando}>
          <CampoTexto
            id="cedula"
            etiqueta="Número de cédula de quien recibe (obligatorio)"
            ayuda="Solo números; puede escribirlos con o sin puntos."
            valor={estado.borrador.cedula}
            error={estado.errores.cedula}
            onCambio={props.onCambio}
            inputMode={conLetras ? 'text' : 'numeric'}
            autoCapitalize="characters"
            maxLength={20}
          />
          {!conLetras && (
            <button
              type="button"
              className={`mb-4 min-h-12 text-base font-medium text-[#176633] underline ${ANILLO_FOCO}`}
              onClick={() => setConLetras(true)}
            >
              Mi documento tiene letras (pasaporte)
            </button>
          )}
          <button type="submit" className={BOTON_PRIMARIO} disabled={props.enviando}>
            {props.enviando ? (
              <>
                <Spinner /> Verificando…
              </>
            ) : (
              'Continuar'
            )}
          </button>
        </fieldset>
        {props.enviando && <AvisoLento visible={props.lento} />}
      </form>
      {estado.venceEl && (
        <p className="mt-5 text-[#5B616B]">
          Este enlace es personal. Vence el {fechaLegible(estado.venceEl)}.
        </p>
      )}
    </>
  );
}

function PantallaConocida(props: {
  h1Ref: H1Ref;
  paso: Extract<PasoFormulario, { tipo: 'conocida' }>;
  estado: EstadoRecepcion;
  enviando: boolean;
  lento: boolean;
  cambiar: (campo: keyof Borrador) => (v: string | boolean) => void;
  onEnviar: (e: FormEvent) => void;
  onNoSoyYo: () => void;
}) {
  const { estado, paso } = props;
  const escribioCorreo = estado.borrador.correoConocida.trim().length > 0;
  return (
    <>
      <Titulo h1Ref={props.h1Ref}>¿Es usted {paso.nombre || 'la persona registrada'}?</Titulo>
      <p className="mb-3 font-medium text-[#5B616B]">Paso 2 de 2</p>
      <p className="mb-2">Documento terminado en {enmascararCedula(estado.cedula ?? '').replace('•••• ', '')}.</p>
      <p className="mb-4">
        {paso.correo
          ? 'Le enviaremos la remisión al correo que tenemos registrado.'
          : 'No tenemos un correo suyo registrado. Si quiere recibir la remisión, escríbalo abajo.'}
      </p>
      <p className="mb-4 rounded-lg border border-[#E8C44F] bg-[#FEF8E1] p-3 text-[#7A5E0F]">
        {AVISO_PRIVACIDAD_CONOCIDA}
      </p>
      <form noValidate onSubmit={props.onEnviar}>
        <ResumenErrores errores={estado.errores} />
        <fieldset disabled={props.enviando}>
          <CampoTexto
            id="correo-conocida"
            etiqueta={
              paso.correo
                ? 'Otro correo para recibir la remisión (opcional)'
                : 'Correo para recibir la remisión (opcional)'
            }
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            valor={estado.borrador.correoConocida}
            error={estado.errores.correoConocida}
            onCambio={props.cambiar('correoConocida') as (v: string) => void}
          />
          {escribioCorreo && (
            <CasillaAutorizacion
              id="autoriza-conocida"
              marcada={estado.borrador.autorizaConocida}
              error={estado.errores.autorizaConocida}
              onCambio={props.cambiar('autorizaConocida') as (v: boolean) => void}
            />
          )}
          <Declaracion resumen={estado.resumen} />
          <div className="space-y-3">
            <button type="submit" className={BOTON_PRIMARIO} disabled={props.enviando}>
              {props.enviando ? (
                <>
                  <Spinner /> Confirmando…
                </>
              ) : (
                'Confirmar recepción'
              )}
            </button>
            <button type="button" className={BOTON_SECUNDARIO} disabled={props.enviando} onClick={props.onNoSoyYo}>
              No soy yo
            </button>
          </div>
        </fieldset>
        {props.enviando && <AvisoLento visible={props.lento} />}
      </form>
    </>
  );
}

function PantallaRegistro(props: {
  h1Ref: H1Ref;
  paso: Extract<PasoFormulario, { tipo: 'registro' }>;
  estado: EstadoRecepcion;
  enviando: boolean;
  lento: boolean;
  cambiar: (campo: keyof Borrador) => (v: string | boolean) => void;
  onEnviar: (e: FormEvent) => void;
  onCambiarCedula: () => void;
}) {
  const { estado, paso } = props;
  const cedula = enmascararCedula(estado.cedula ?? '');
  const texto = (campo: keyof Borrador) => props.cambiar(campo) as (v: string) => void;
  return (
    <>
      <Titulo h1Ref={props.h1Ref}>Complete sus datos</Titulo>
      <p className="mb-3 font-medium text-[#5B616B]">Paso 2 de 2</p>
      <p className="mb-4 rounded-lg border border-[#E8C44F] bg-[#FEF8E1] p-3 text-[#7A5E0F]">
        {paso.motivo === 'no_encontrada'
          ? `No encontramos el documento ${cedula} entre las personas registradas de este cliente. Complete sus datos para confirmar la recepción.`
          : 'Registre sus datos para confirmar la recepción a su nombre.'}
      </p>
      <form noValidate onSubmit={props.onEnviar}>
        <ResumenErrores errores={estado.errores} />
        <fieldset disabled={props.enviando}>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#DADDE2] bg-white p-3">
            <p>
              <span className="block font-semibold text-[#111111]">Documento</span>
              {cedula}
            </p>
            <button
              type="button"
              className={`min-h-12 px-2 font-medium text-[#176633] underline ${ANILLO_FOCO}`}
              onClick={props.onCambiarCedula}
            >
              Cambiar
            </button>
          </div>
          <CampoTexto
            id="nombre"
            etiqueta="Nombre completo (obligatorio)"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={80}
            valor={estado.borrador.nombre}
            error={estado.errores.nombre}
            onCambio={texto('nombre')}
          />
          <CampoTexto
            id="celular"
            etiqueta="Celular (obligatorio)"
            ayuda="10 dígitos, por ejemplo 300 123 4567."
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            valor={estado.borrador.celular}
            error={estado.errores.celular}
            onCambio={texto('celular')}
          />
          <CampoTexto
            id="correo"
            etiqueta="Correo electrónico (obligatorio)"
            ayuda="Ahí le enviaremos la remisión."
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            valor={estado.borrador.correo}
            error={estado.errores.correo}
            onCambio={texto('correo')}
          />
          <CasillaAutorizacion
            id="autoriza"
            marcada={estado.borrador.autoriza}
            error={estado.errores.autoriza}
            onCambio={props.cambiar('autoriza') as (v: boolean) => void}
          />
          <Declaracion resumen={estado.resumen} />
          <button type="submit" className={BOTON_PRIMARIO} disabled={props.enviando}>
            {props.enviando ? (
              <>
                <Spinner /> Confirmando…
              </>
            ) : (
              'Confirmar recepción'
            )}
          </button>
        </fieldset>
        {props.enviando && <AvisoLento visible={props.lento} />}
      </form>
    </>
  );
}

function PantallaExito({ h1Ref, paso }: { h1Ref: H1Ref; paso: Extract<PasoRecepcion, { tipo: 'exito' }> }) {
  const d = paso.datos;
  const cuando = fechaHoraBogotaLegible(d.recibidaEn || d.fechaRecibido);
  let correo: string;
  if (d.yaRecibida) correo = 'Usted ya había confirmado esta recepción. No hace falta hacer nada más.';
  else if ((d.correo.estado === 'enviado' || d.correo.estado === 'simulado') && d.correo.a)
    correo = 'Le enviamos la remisión a su correo. Revise también el correo no deseado.';
  else if (d.correo.estado === 'sin_correo')
    correo = 'Su confirmación quedó registrada. Como no tenemos un correo suyo, Sirius le hará llegar la remisión.';
  else correo = 'Su confirmación quedó registrada. El correo no salió en este momento; Sirius se lo hará llegar.';
  return (
    <div className="rounded-xl border border-[#DADDE2] bg-white p-5 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        className="mx-auto mb-3 h-16 w-16"
        fill="none"
        stroke="#176633"
        strokeWidth="4"
      >
        <circle cx="24" cy="24" r="21" fill="#ECFAF1" />
        <path d="M14 25l7 7 13-15" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Titulo h1Ref={h1Ref}>Recepción confirmada</Titulo>
      <p className="mb-3 font-semibold">
        {d.codigo}
        {cuando ? ` · ${cuando}` : ''}
      </p>
      <p>{correo}</p>
    </div>
  );
}

function PantallaError(props: {
  h1Ref: H1Ref;
  paso: Extract<PasoRecepcion, { tipo: 'error' }>;
  estado: EstadoRecepcion;
  onReintentar: () => void;
}) {
  const { paso, estado } = props;
  const texto =
    paso.codigo === 'enlace_incompleto'
      ? MENSAJE_ENLACE_INCOMPLETO.texto
      : textoErrorRecepcion(paso.codigo, {
          ...paso.detalle,
          venceEl: paso.detalle.venceEl ?? estado.venceEl ?? undefined,
        });
  return (
    <div role="alert" className="rounded-xl border-2 border-[#B42318] bg-white p-5">
      <svg aria-hidden="true" viewBox="0 0 48 48" className="mb-3 h-12 w-12" fill="none" stroke="#B42318" strokeWidth="4">
        <circle cx="24" cy="24" r="21" fill="#FEF3F2" />
        <path d="M24 13v14M24 34v1" strokeLinecap="round" />
      </svg>
      <Titulo h1Ref={props.h1Ref}>{tituloError(paso.codigo)}</Titulo>
      {estado.resumen && <p className="mb-2 font-semibold">Remisión {estado.resumen.codigo}</p>}
      <p className="mb-5">{texto}</p>
      {paso.volverA && (
        <button type="button" className={BOTON_PRIMARIO} onClick={props.onReintentar}>
          Reintentar
        </button>
      )}
      {paso.codigo === 'texto_desactualizado' && (
        <button type="button" className={BOTON_PRIMARIO} onClick={() => window.location.reload()}>
          Recargar la página
        </button>
      )}
    </div>
  );
}
