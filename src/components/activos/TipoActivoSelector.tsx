/**
 * Selector múltiple de tipos de activo (catálogo `Tipos de Activo`).
 *
 * El tipo define la categoría, la vida útil y si el activo requiere vencimiento
 * o mantenimiento, así que se muestra esa herencia al elegirlo.
 *
 * Nota histórica: había cuatro versiones de este componente (`Simple*`, `Safe*`,
 * `SelectorWrapper`) que clonaban props con `JSON.parse(JSON.stringify(...))`
 * para "romper objetos de optimización de React 19". El objeto
 * `{state, value, isStale}` que las motivó no venía de React: es cómo Airtable
 * serializa los campos `aiText`. Ahora la API lo aplana y basta un componente.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { listarTiposActivo } from '@/lib/activos.client';
import type { TipoActivoOpcion } from '@/types/activos';
import { IconCheck, IconChevron, IconSearch } from './Icons';

interface TipoActivoSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  id?: string;
  'aria-describedby'?: string;
}

export default function TipoActivoSelector({
  selectedIds,
  onChange,
  error,
  id,
  'aria-describedby': describedBy,
}: TipoActivoSelectorProps) {
  const [tipos, setTipos] = useState<TipoActivoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let vigente = true;

    listarTiposActivo()
      .then((datos) => {
        if (vigente) setTipos(datos);
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

  const seleccionados = useMemo(
    () => tipos.filter((tipo) => selectedIds.includes(tipo.id)),
    [tipos, selectedIds]
  );

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return tipos;
    return tipos.filter(
      (tipo) =>
        tipo.nombre.toLowerCase().includes(texto) || tipo.categoria.toLowerCase().includes(texto)
    );
  }, [tipos, busqueda]);

  const alternar = (tipoId: string) => {
    onChange(
      selectedIds.includes(tipoId)
        ? selectedIds.filter((actual) => actual !== tipoId)
        : [...selectedIds, tipoId]
    );
  };

  if (cargando) {
    return (
      <div
        className="h-[42px] rounded-lg bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
        aria-busy="true"
        aria-label="Cargando tipos de activo"
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

  const resumen =
    seleccionados.length === 0
      ? 'Selecciona el tipo de activo'
      : seleccionados.map((tipo) => tipo.nombre).join(', ');

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        // `aria-invalid` no aplica al rol button; el error se anuncia por
        // `aria-describedby`, que apunta al mensaje que pinta `Campo`.
        aria-describedby={describedBy}
        className={`flex w-full items-center justify-between gap-2 rounded-lg bg-white/10 ring-1 px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-sky-400/70 cursor-pointer ${
          error ? 'ring-rose-400/60' : 'ring-white/15'
        } ${seleccionados.length === 0 ? 'text-white/40' : 'text-white'}`}
      >
        <span className="truncate">{resumen}</span>
        <IconChevron
          className={`w-4 h-4 shrink-0 text-white/50 transition-transform duration-200 motion-reduce:transition-none ${
            abierto ? 'rotate-90' : ''
          }`}
        />
      </button>

      {abierto && (
        <>
          {/* Capa para cerrar al hacer clic fuera. */}
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={() => setAbierto(false)} />

          <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-lg bg-slate-900 ring-1 ring-white/15 shadow-2xl">
            <div className="border-b border-white/10 p-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40">
                  <IconSearch className="w-4 h-4" />
                </span>
                <input
                  type="search"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar tipo…"
                  aria-label="Buscar tipo de activo"
                  className="w-full rounded-md bg-white/10 ring-1 ring-white/15 pl-8 pr-2 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400/70"
                />
              </div>
            </div>

            {/* Casillas reales en lugar de un listbox simulado: se hereda el
                teclado y los lectores de pantalla anuncian el estado sin ARIA. */}
            <fieldset className="max-h-64 overflow-y-auto py-1">
              <legend className="sr-only">Tipos de activo</legend>

              {visibles.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-white/50">Sin resultados</p>
              )}

              {visibles.map((tipo) => {
                const activo = selectedIds.includes(tipo.id);
                const herencia = [
                  tipo.categoria,
                  tipo.vidaUtil ? `${tipo.vidaUtil} años` : null,
                  tipo.requiereVencimiento ? 'con vencimiento' : null,
                  tipo.requiereMantenimiento ? 'con mantenimiento' : null,
                ]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <label
                    key={tipo.id}
                    className="flex cursor-pointer items-start gap-2 px-3 py-2 transition-colors duration-200 hover:bg-white/10 has-[:focus-visible]:bg-white/10"
                  >
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => alternar(tipo.id)}
                      className="sr-only"
                    />
                    <span
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded ring-1 ${
                        activo
                          ? 'bg-sky-500/80 ring-sky-300/60 text-white'
                          : 'bg-white/5 ring-white/20 text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      <IconCheck className="w-3 h-3" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-white">{tipo.nombre}</span>
                      {herencia && <span className="block text-xs text-white/45">{herencia}</span>}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
              <span className="text-xs text-white/50 tabular-nums">
                {seleccionados.length} seleccionado{seleccionados.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-white/80 transition-colors duration-200 hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
