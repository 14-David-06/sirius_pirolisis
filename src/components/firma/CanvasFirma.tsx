'use client';

// src/components/firma/CanvasFirma.tsx
//
// Lienzo para firmar con el dedo. Se usa en el acta de entrega de biochar, donde las
// dos partes firman en vivo sobre el mismo dispositivo.
//
// Detalles que no son cosméticos:
//  - `touch-none` en el canvas: sin eso el navegador interpreta el trazo como
//    scroll y la firma sale cortada o no sale.
//  - Las coordenadas se escalan de los píxeles CSS a los del bitmap: el canvas se
//    muestra al ancho del contenedor pero dibuja en su resolución propia, y sin la
//    conversión el trazo aparece desplazado del dedo.
//  - `onTouchMove` con `preventDefault()`: en un celular es lo que impide que la
//    página se mueva mientras alguien firma.
//
// La firma de remisiones de Blend (`/pirolisis/blend/firmar/[remisionId]`) tiene su
// propia copia de esta lógica. No se unificó aquí a propósito: esa página es pública
// y está en producción firmando documentos de clientes, y no era parte de este
// trabajo tocarla.

import { useRef, useState } from 'react';

export interface CanvasFirmaProps {
  /** Se llama con el PNG (`data:image/png;base64,…`) o con null al limpiar. */
  onCambio: (dataUrl: string | null) => void;
  deshabilitado?: boolean;
  etiqueta?: string;
}

export default function CanvasFirma({ onCambio, deshabilitado, etiqueta }: CanvasFirmaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultima = useRef<{ x: number; y: number } | null>(null);
  const [hayTrazo, setHayTrazo] = useState(false);

  type EventoLienzo = React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>;

  function posicion(e: EventoLienzo, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const escalaX = canvas.width / rect.width;
    const escalaY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * escalaX, y: (t.clientY - rect.top) * escalaY };
    }
    return { x: (e.clientX - rect.left) * escalaX, y: (e.clientY - rect.top) * escalaY };
  }

  function iniciar(e: EventoLienzo) {
    if (deshabilitado) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    dibujando.current = true;
    ultima.current = posicion(e, canvas);
  }

  function trazar(e: EventoLienzo) {
    if (!dibujando.current || deshabilitado) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx || !ultima.current) return;

    const pos = posicion(e, canvas);
    ctx.beginPath();
    ctx.moveTo(ultima.current.x, ultima.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ultima.current = pos;

    if (!hayTrazo) setHayTrazo(true);
    onCambio(canvas.toDataURL('image/png'));
  }

  function terminar() {
    dibujando.current = false;
    ultima.current = null;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHayTrazo(false);
    onCambio(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/60">{etiqueta ?? 'Firma con el dedo'}</span>
        <button
          type="button"
          onClick={limpiar}
          disabled={deshabilitado || !hayTrazo}
          className="text-xs text-white/60 underline disabled:opacity-40"
        >
          Limpiar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={220}
        onMouseDown={iniciar}
        onMouseMove={trazar}
        onMouseUp={terminar}
        onMouseLeave={terminar}
        onTouchStart={iniciar}
        onTouchMove={trazar}
        onTouchEnd={terminar}
        className={`mt-1.5 block w-full touch-none rounded-lg bg-white ring-1 ring-white/20 ${
          deshabilitado ? 'opacity-50' : ''
        }`}
      />
    </div>
  );
}
