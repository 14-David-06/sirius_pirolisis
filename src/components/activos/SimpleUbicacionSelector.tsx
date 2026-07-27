/**
 * SimpleUbicacionSelector - Versión ultra simplificada sin optimizaciones React 19
 */

'use client';

import { useEffect, useState } from 'react';

interface SimpleUbicacionSelectorProps {
  selectedId: string;
  onChange: (id: string) => void;
  error?: string;
}

interface Ubicacion {
  id: string;
  nombre: string;
  tipo: string;
}

export default function SimpleUbicacionSelector(props: SimpleUbicacionSelectorProps) {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Extract primitive values immediately
  const selectedId = props.selectedId || '';
  const errorMsg = props.error || '';

  useEffect(() => {
    fetch('/api/activos/ubicaciones/list')
      .then(res => res.json())
      .then(result => {
        if (result.data) {
          setUbicaciones(result.data);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleSelect = (id: string) => {
    props.onChange(id);
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="text-white/70 text-sm py-2">
        Cargando...
      </div>
    );
  }

  const selected = ubicaciones.find(u => u.id === selectedId);
  const name = selected ? selected.nombre : '';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white text-left"
      >
        <span>{!selectedId ? 'Selecciona ubicación' : name}</span>
      </button>

      {errorMsg !== '' && (
        <p className="text-red-300 text-xs mt-1">{String(errorMsg)}</p>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 mt-2 w-full bg-gray-800 border border-white/20 rounded-lg max-h-80 overflow-y-auto">
            {ubicaciones.map(ubicacion => (
              <button
                key={ubicacion.id}
                type="button"
                onClick={() => handleSelect(ubicacion.id)}
                className="w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/10 text-white"
              >
                {ubicacion.nombre}
                {ubicacion.tipo && <span className="text-xs text-white/60 ml-2">({ubicacion.tipo})</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
