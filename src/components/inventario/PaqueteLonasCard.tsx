/**
 * Componente de Paquete de Lonas Activo
 * Muestra información del paquete de lonas actualmente en uso
 */

"use client";

import { useState, useEffect } from 'react';
import type { PaqueteLonasData } from '@/types/inventario';

export default function PaqueteLonasCard() {
  const [paquete, setPaquete] = useState<PaqueteLonasData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/inventario/lonas/paquete-activo')
      .then(res => res.ok ? res.json() : null)
      .then(json => setPaquete(json?.data || null))
      .catch(() => setPaquete(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!paquete) return null;

  return (
    <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-green-500/30 bg-green-500/10 mb-6">
      <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">
        📦 Paquete de Lonas Activo
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-white drop-shadow">{paquete.dias_en_uso}</p>
          <p className="text-white/70 text-sm">Días en uso</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white drop-shadow">{paquete.cantidad_lonas}</p>
          <p className="text-white/70 text-sm">Lonas</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-white drop-shadow">{paquete.total_balances_vinculados}</p>
          <p className="text-white/70 text-sm">Balances vinculados</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white drop-shadow">{paquete.fecha_activacion}</p>
          <p className="text-white/70 text-sm">Fecha activación</p>
        </div>
      </div>
      <p className="mt-3 text-white/70 text-xs text-center italic">
        Se retirará automáticamente al registrar la próxima salida de lonas para producción.
      </p>
    </div>
  );
}
