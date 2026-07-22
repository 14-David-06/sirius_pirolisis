/**
 * Componente de Métricas de Eficiencia
 * Muestra estadísticas de uso productivo vs operativo de insumos
 */

"use client";

import { useState, useEffect } from 'react';
import type { MetricasInventario } from '@/types/inventario';

export default function MetricasSection() {
  const [metricas, setMetricas] = useState<MetricasInventario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/inventario/metricas')
      .then(r => r.json())
      .then(d => { if (d.success) setMetricas(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-white/60 text-center py-4">
        Cargando métricas...
      </div>
    );
  }

  if (!metricas) return null;

  return (
    <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
      <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">
        📊 Métricas de Eficiencia
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/10 rounded-lg p-4 text-center border border-white/20">
          <div className="text-2xl font-bold text-white">{metricas.total_salidas}</div>
          <div className="text-xs text-white/70">Total Salidas</div>
        </div>
        <div className="bg-green-500/20 rounded-lg p-4 text-center border border-green-500/20">
          <div className="text-2xl font-bold text-green-300">{metricas.total_productivas}</div>
          <div className="text-xs text-green-200">Productivas</div>
        </div>
        <div className="bg-orange-500/20 rounded-lg p-4 text-center border border-orange-500/20">
          <div className="text-2xl font-bold text-orange-300">{metricas.total_operativas}</div>
          <div className="text-xs text-orange-200">Operativas</div>
        </div>
        <div className="bg-blue-500/20 rounded-lg p-4 text-center border border-blue-500/20">
          <div className="text-2xl font-bold text-blue-300">{metricas.eficiencia_pct}%</div>
          <div className="text-xs text-blue-200">Eficiencia</div>
        </div>
      </div>
      {metricas.desglose_por_tipo && Object.keys(metricas.desglose_por_tipo).length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(metricas.desglose_por_tipo).map(([tipo, count]) => (
            <div key={tipo} className="bg-white/5 rounded p-2 text-sm text-white/80 border border-white/10">
              <span className="font-medium">{tipo}:</span> {count}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
