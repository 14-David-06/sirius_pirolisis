/**
 * SimpleTipoActivoSelector - Versión ultra simplificada sin optimizaciones React 19
 */

'use client';

import { useEffect, useState } from 'react';

interface SimpleTipoActivoSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}

interface TipoActivo {
  id: string;
  nombre: string;
  categoria: string;
}

export default function SimpleTipoActivoSelector(props: SimpleTipoActivoSelectorProps) {
  const [tipos, setTipos] = useState<TipoActivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Extract primitive values immediately
  const selectedIds = props.selectedIds || [];
  const errorMsg = props.error || '';

  useEffect(() => {
    fetch('/api/activos/tipos-activo/list')
      .then(res => res.json())
      .then(result => {
        if (result.data) {
          setTipos(result.data);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleToggle = (id: string) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter(tid => tid !== id)
      : [...selectedIds, id];
    props.onChange(newIds);
  };

  if (loading) {
    return (
      <div className="text-white/70 text-sm py-2">
        Cargando...
      </div>
    );
  }

  const count = selectedIds.length;
  const names = tipos
    .filter(t => selectedIds.includes(t.id))
    .map(t => t.nombre)
    .join(', ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white text-left"
      >
        <span>{count === 0 ? 'Selecciona tipos de activo' : `${count} tipo(s): ${names}`}</span>
      </button>

      {errorMsg !== '' && (
        <p className="text-red-300 text-xs mt-1">{String(errorMsg)}</p>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 mt-2 w-full bg-gray-800 border border-white/20 rounded-lg max-h-80 overflow-y-auto">
            {tipos.map(tipo => (
              <button
                key={tipo.id}
                type="button"
                onClick={() => handleToggle(tipo.id)}
                className="w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/10 text-white"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(tipo.id)}
                  readOnly
                  className="mr-2"
                />
                {tipo.nombre}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
