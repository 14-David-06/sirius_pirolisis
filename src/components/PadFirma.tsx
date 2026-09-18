'use client';

import { useImperativeHandle, useRef, useState, type RefObject } from 'react';

/**
 * Pad de firma manuscrita: un canvas que se dibuja con el dedo o con el mouse.
 *
 * Vive aparte porque lo usan las DOS firmas de una remisión, y en sitios muy
 * distintos: la del conductor se da en la planta, dentro del formulario de
 * despacho, y la del receptor en la finca, en la página pública que el cliente
 * abre desde el celular. Tenerlo dos veces era garantizar que un arreglo —el
 * `touch-action`, la escala del trazo— se hiciera en uno solo.
 *
 * ⚠️ El trazo se guarda en las coordenadas INTERNAS del canvas (600×200), no en
 * las de la pantalla: sin la conversión por `getBoundingClientRect()` la firma
 * aparece desplazada en cuanto el canvas se dibuja a otro ancho, que es siempre en
 * un celular.
 */

export interface PadFirmaHandle {
  /** PNG en data-URL, o `null` si no se ha dibujado nada. */
  obtenerFirma: () => string | null;
  limpiar: () => void;
}

export function PadFirma({
  titulo,
  ayuda,
  handleRef,
  onCambio,
}: {
  titulo: string;
  ayuda?: string;
  /** Para leer el trazo desde el formulario que contiene el pad. */
  handleRef: RefObject<PadFirmaHandle | null>;
  /** Se avisa en cuanto hay trazo, para habilitar el botón de enviar. */
  onCambio?: (hayFirma: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultima = useRef<{ x: number; y: number } | null>(null);
  const [hayFirma, setHayFirma] = useState(false);

  const limpiar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHayFirma(false);
    onCambio?.(false);
  };

  useImperativeHandle(handleRef, () => ({
    obtenerFirma: () => (hayFirma ? (canvasRef.current?.toDataURL('image/png') ?? null) : null),
    limpiar,
  }));

  const posicion = (
    e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const escalaX = canvas.width / rect.width;
    const escalaY = canvas.height / rect.height;
    const punto = 'touches' in e ? e.touches[0] : e;
    return {
      x: (punto.clientX - rect.left) * escalaX,
      y: (punto.clientY - rect.top) * escalaY,
    };
  };

  const iniciar = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    dibujando.current = true;
    ultima.current = posicion(e, canvas);
  };

  const trazar = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    e.preventDefault();
    const pos = posicion(e, canvas);
    ctx.beginPath();
    ctx.moveTo(ultima.current!.x, ultima.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ultima.current = pos;
    if (!hayFirma) {
      setHayFirma(true);
      onCambio?.(true);
    }
  };

  const terminar = () => {
    dibujando.current = false;
    ultima.current = null;
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-white/70">{titulo}</span>
        <button
          type="button"
          onClick={limpiar}
          className="text-xs font-medium text-white/50 hover:text-white"
        >
          Limpiar
        </button>
      </div>
      <div className="mt-1.5 overflow-hidden rounded-lg border-2 border-dashed border-white/20 bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          /* `touch-none` es lo que impide que el dedo haga scroll de la página en
             vez de firmar: sin eso el pad es inservible en un celular. */
          className="block w-full touch-none"
          style={{ cursor: 'crosshair' }}
          onMouseDown={iniciar}
          onMouseMove={trazar}
          onMouseUp={terminar}
          onMouseLeave={terminar}
          onTouchStart={iniciar}
          onTouchMove={trazar}
          onTouchEnd={terminar}
        />
      </div>
      {ayuda && <span className="mt-1 block text-xs text-white/50">{ayuda}</span>}
    </div>
  );
}
