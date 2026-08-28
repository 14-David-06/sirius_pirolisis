"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { CAMPO, kg, type BacheBodega, type BacheNoDisponible } from './comunes';

/**
 * Selector de bache con búsqueda.
 *
 * Un `<select>` nativo no sirve acá: en bodega hay ~100 baches con códigos que solo
 * se diferencian en los últimos dígitos (S-00184 vs S-00814), y el operador llega
 * con un código concreto en la mano, no explorando la lista. Buscarlo a rueda de
 * scroll es lento y, peor, invita a soltar el clic un renglón antes — y el bache
 * equivocado aquí descuenta inventario real en dos bases.
 *
 * La búsqueda acepta el código como venga: `184`, `s-184`, `00184` o `S-00184`. El
 * operador lee "184" de la lona, no el código con el relleno de ceros.
 *
 * `noDisponibles` son baches que existen pero de los que no se puede sacar nada:
 * consumidos, todavía en planta, históricos de la app anterior, o sin el monitoreo
 * que cuantifica su masa seca. Se listan igual, en gris y con el motivo, y se pueden
 * buscar. Antes simplemente no estaban, y la pantalla respondía «ningún bache
 * coincide» —falso: el bache existe, lo que no tiene es biochar—, así que el
 * operador no podía distinguir un bug de un bache agotado.
 */
export function SelectorBache({
  baches,
  valor,
  onCambio,
  noDisponibles = [],
}: {
  baches: BacheBodega[];
  valor: string;
  onCambio: (codigo: string) => void;
  noDisponibles?: BacheNoDisponible[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [activo, setActivo] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const seleccionado = baches.find((b) => b.codigo === valor);

  /** Un mismo criterio para las dos listas: buscar no debe depender de cuál sea. */
  const coincide = useMemo(() => {
    const norma = consulta.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const digitos = norma.replace(/\D/g, '').replace(/^0+/, '');
    return (codigoBache: string) => {
      if (!norma) return true;
      const codigo = codigoBache.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (codigo.includes(norma)) return true;
      // Sin esto "184" no encuentra a S-00184: el relleno de ceros se interpone.
      return digitos !== '' && String(Number(codigo.replace(/\D/g, ''))).includes(digitos);
    };
  }, [consulta]);

  const filtrados = useMemo(() => baches.filter((b) => coincide(b.codigo)), [baches, coincide]);
  const bloqueados = useMemo(
    () => noDisponibles.filter((b) => coincide(b.codigo)),
    [noDisponibles, coincide]
  );

  // Cerrar al hacer clic afuera. Sin esto el panel se queda abierto tapando el
  // resto del formulario, que es corto y cabe entero en pantalla.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  useEffect(() => {
    setActivo(0);
  }, [consulta]);

  useEffect(() => {
    // Opcional a propósito: jsdom no implementa scrollIntoView, y traer a la vista
    // el renglón resaltado es una comodidad, no algo por lo que valga tumbar el
    // selector entero si el entorno no lo tiene.
    lista.current?.children[activo]?.scrollIntoView?.({ block: 'nearest' });
  }, [activo, abierto]);

  const elegir = (codigo: string) => {
    onCambio(codigo);
    setAbierto(false);
    setConsulta('');
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => {
        const n = filtrados.length;
        if (!n) return 0;
        return (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      });
    } else if (e.key === 'Enter') {
      // El formulario se envía con Enter: dejarlo pasar mandaría la salida con el
      // bache anterior mientras el operador todavía está eligiendo.
      e.preventDefault();
      if (filtrados[activo]) elegir(filtrados[activo].codigo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAbierto(false);
      setConsulta('');
    }
  };

  return (
    <div className="block" ref={contenedor}>
      <span className="text-white/70 text-sm">Bache</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          className={`${CAMPO} flex items-center justify-between text-left`}
        >
          <span>
            {seleccionado ? (
              <>
                {seleccionado.codigo} <span className="text-white/60">— {kg(seleccionado.kg)}</span>
              </>
            ) : (
              <span className="text-white/40">Selecciona un bache</span>
            )}
          </span>
          <span aria-hidden className="ml-2 text-white/40">
            ▾
          </span>
        </button>

        {abierto && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg bg-slate-800 shadow-xl ring-1 ring-white/20">
            <input
              autoFocus
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={teclas}
              placeholder="Buscar bache… (184, S-00184)"
              aria-label="Buscar bache"
              className="w-full bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/40 ring-1 ring-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7836]"
            />
            <ul ref={lista} role="listbox" className="max-h-60 overflow-y-auto py-1">
              {filtrados.map((b, i) => (
                <li key={b.codigo} role="option" aria-selected={b.codigo === valor}>
                  <button
                    type="button"
                    onClick={() => elegir(b.codigo)}
                    onMouseEnter={() => setActivo(i)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                      i === activo ? 'bg-[#5A7836]/40 text-white' : 'text-white/80'
                    } ${b.codigo === valor ? 'font-medium' : ''}`}
                  >
                    <span>{b.codigo}</span>
                    <span className="text-white/60">{kg(b.kg)}</span>
                  </button>
                </li>
              ))}
              {!filtrados.length && !bloqueados.length && (
                <li className="px-3 py-3 text-sm text-white/50">
                  Ningún bache en bodega coincide con «{consulta}».
                </li>
              )}

              {bloqueados.length > 0 && (
                <>
                  <li
                    aria-hidden
                    className="border-t border-white/10 px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-white/35"
                  >
                    Existen, pero sin biochar que sacar
                  </li>
                  {bloqueados.map((b) => (
                    // Sin `role="option"`: no es una opción, es una explicación. Un
                    // lector de pantalla que lo anuncie como elegible haría la misma
                    // promesa falsa que el cursor si fuera clicable.
                    <li
                      key={b.codigo}
                      className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm text-white/35"
                    >
                      <span className="line-through decoration-white/25">{b.codigo}</span>
                      <span className="text-right text-xs">{b.motivo}</span>
                    </li>
                  ))}
                </>
              )}
            </ul>
            <div className="border-t border-white/10 px-3 py-1.5 text-xs text-white/40">
              {filtrados.length} de {baches.length} baches con biochar
              {noDisponibles.length > 0 && (
                <>
                  {' · '}
                  {noDisponibles.length} sin biochar que sacar
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
