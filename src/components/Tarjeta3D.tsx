/**
 * Tarjeta que se inclina siguiendo el mouse (efecto 3D de parallax).
 *
 * El transform se escribe en el estilo del nodo por `ref`, no por estado de
 * React: un `mousemove` dispara decenas de eventos por segundo y un `setState`
 * por cada uno vuelve a renderizar toda la tarjeta —con sus botones e hijos—
 * y el efecto se siente pegajoso.
 *
 * El giro se apaga con `prefers-reduced-motion` y en pantallas táctiles (donde
 * no hay puntero fino y el `mousemove` sintético del tap dejaría la tarjeta
 * torcida sin un `mouseleave` que la enderece).
 */

'use client';

import { useCallback, useRef } from 'react';

/** Divisor de los grados: más alto, giro más sutil. */
const SUAVIDAD = 18;

export default function Tarjeta3D({
  children,
  className = '',
  escala = 1.03,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  escala?: number;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const inclinar = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const nodo = ref.current;
      if (!nodo) return;
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const r = nodo.getBoundingClientRect();
      const rotateY = (e.clientX - r.left - r.width / 2) / SUAVIDAD;
      const rotateX = -(e.clientY - r.top - r.height / 2) / SUAVIDAD;
      nodo.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${escala})`;
    },
    [escala],
  );

  const enderezar = useCallback(() => {
    const nodo = ref.current;
    if (nodo) nodo.style.transform = '';
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={inclinar}
      onMouseLeave={enderezar}
      onClick={onClick}
      /* `transition` corta: el giro debe ir pegado al mouse, no arrastrarse.
         `[transform-style:preserve-3d]` deja que el contenido con translateZ
         tenga profundidad real en vez de aplanarse. */
      className={`transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out will-change-transform [transform-style:preserve-3d] motion-reduce:transition-none ${className}`}
    >
      {children}
    </div>
  );
}
