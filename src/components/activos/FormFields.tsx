/**
 * Primitivas de formulario del módulo de Activos Fijos.
 *
 * Los formularios de activos (crear, editar, asignar, devolver, dar de baja)
 * repiten la misma estructura campo/label/error. Centralizarla evita que cada
 * uno derive con sus propias clases —que era lo que pasaba— y garantiza que
 * TODOS los controles queden asociados a su `<label>` por `htmlFor`.
 */

'use client';

import { useId } from 'react';

const CLASES_CONTROL =
  'w-full rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white ' +
  'placeholder-white/40 transition-colors duration-200 hover:bg-white/15 ' +
  'focus:outline-none focus:ring-2 focus:ring-sky-400/70 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

const CLASES_ERROR = 'ring-rose-400/60 focus:ring-rose-400/70';

interface CampoProps {
  label: string;
  /** Se usa como `htmlFor`; si se omite se genera uno estable. */
  id?: string;
  requerido?: boolean;
  error?: string;
  ayuda?: string;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode;
}

/** Envoltorio label + control + ayuda + error. */
export function Campo({
  label,
  id,
  requerido,
  error,
  ayuda,
  className = '',
  children,
}: CampoProps) {
  const generado = useId();
  const controlId = id || generado;
  const ayudaId = ayuda ? `${controlId}-ayuda` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, ayudaId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={controlId} className="block text-xs font-medium text-white/60 mb-1">
        {label}
        {requerido && (
          <span className="text-rose-300" aria-hidden="true">
            {' '}
            *
          </span>
        )}
        {requerido && <span className="sr-only"> (requerido)</span>}
      </label>

      {children({
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}

      {error && (
        <p id={errorId} className="mt-1 text-xs text-rose-300">
          {error}
        </p>
      )}
      {ayuda && !error && (
        <p id={ayudaId} className="mt-1 text-xs text-white/45">
          {ayuda}
        </p>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean };

export function Input({ invalido, className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`${CLASES_CONTROL} ${invalido ? CLASES_ERROR : ''} ${className}`}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean };

export function Select({ invalido, className = '', children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`${CLASES_CONTROL} cursor-pointer ${invalido ? CLASES_ERROR : ''} ${className}`}
    >
      {children}
    </select>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalido?: boolean };

export function Textarea({ invalido, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={`${CLASES_CONTROL} ${invalido ? CLASES_ERROR : ''} ${className}`}
    />
  );
}

/** Bloque temático dentro de un formulario largo. */
export function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-white/50">
        {titulo}
      </legend>
      {descripcion && <p className="mb-3 text-xs text-white/45">{descripcion}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Aviso de error de una operación completa (no de un campo). */
export function ErrorOperacion({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg bg-rose-500/10 ring-1 ring-rose-400/25 px-4 py-3 text-sm text-rose-100"
    >
      {mensaje}
    </div>
  );
}

/** Botonera estándar: cancelar + acción principal. */
export function AccionesFormulario({
  onCancel,
  enviando,
  etiqueta,
  etiquetaEnviando,
  icono,
  tono = 'sky',
  deshabilitado,
}: {
  onCancel: () => void;
  enviando: boolean;
  etiqueta: string;
  etiquetaEnviando: string;
  icono?: React.ReactNode;
  tono?: 'sky' | 'emerald' | 'rose';
  deshabilitado?: boolean;
}) {
  const tonos = {
    sky: 'bg-sky-600 hover:bg-sky-500 focus-visible:ring-sky-300',
    emerald: 'bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-300',
    rose: 'bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-300',
  } as const;

  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={enviando}
        className="rounded-lg bg-white/10 ring-1 ring-white/15 px-4 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={enviando || deshabilitado}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${tonos[tono]}`}
      >
        {enviando ? etiquetaEnviando : icono}
        {enviando ? null : etiqueta}
      </button>
    </div>
  );
}
