/**
 * Selector de ubicación (catálogo `Ubicaciones`).
 *
 * Es un `<select>` nativo a propósito: la lista es corta y cerrada, y así hereda
 * el teclado, el foco y el comportamiento móvil sin reimplementarlos.
 */

'use client';

import { useEffect, useState } from 'react';
import { listarUbicaciones } from '@/lib/activos.client';
import type { UbicacionOpcion } from '@/types/activos';
import { Select } from './FormFields';

interface UbicacionSelectorProps {
  selectedId: string;
  onChange: (id: string) => void;
  error?: string;
  id?: string;
  'aria-describedby'?: string;
  /** Etiqueta de la opción vacía. */
  placeholder?: string;
}

export default function UbicacionSelector({
  selectedId,
  onChange,
  error,
  id,
  'aria-describedby': describedBy,
  placeholder = 'Selecciona una ubicación',
}: UbicacionSelectorProps) {
  const [ubicaciones, setUbicaciones] = useState<UbicacionOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    listarUbicaciones()
      .then((datos) => {
        if (vigente) setUbicaciones(datos);
      })
      .catch((err: unknown) => {
        if (vigente) setFallo(err instanceof Error ? err.message : 'No se pudo cargar el catálogo');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, []);

  if (cargando) {
    return (
      <div
        className="h-[42px] rounded-lg bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
        aria-busy="true"
        aria-label="Cargando ubicaciones"
      />
    );
  }

  if (fallo) {
    return (
      <p className="rounded-lg bg-rose-500/10 ring-1 ring-rose-400/25 px-3 py-2 text-xs text-rose-100">
        {fallo}
      </p>
    );
  }

  return (
    <Select
      id={id}
      value={selectedId}
      onChange={(event) => onChange(event.target.value)}
      invalido={Boolean(error)}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    >
      <option value="" className="bg-slate-800">
        {placeholder}
      </option>
      {ubicaciones.map((ubicacion) => (
        <option key={ubicacion.id} value={ubicacion.id} className="bg-slate-800">
          {ubicacion.nombre}
          {ubicacion.tipo ? ` — ${ubicacion.tipo}` : ''}
        </option>
      ))}
    </Select>
  );
}
