/**
 * Contenedor de tarjeta con realce por hover (color, borde y sombra).
 *
 * Tuvo un giro 3D que seguía al mouse. Se quitó el 2026-09-18: en las rejillas
 * densas —los 66 baches de `Completos Bodega`— la tarjeta se movía bajo el
 * puntero mientras se intentaba pulsar un botón, y el objetivo se escapaba.
 * El nombre se conserva para no tocar los llamantes; si vuelve el efecto, que
 * sea opt-in y nunca en listas con acciones adentro.
 */

'use client';

export default function Tarjeta3D({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`transition-[background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none ${className}`}
    >
      {children}
    </div>
  );
}
