/**
 * TipoActivoSelector - Selector multi-select para Tipos de Activo
 */

'use client';

import { useEffect, useState } from 'react';

interface TipoActivo {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  requiereVencimiento: boolean;
  requiereMantenimiento: boolean;
}

interface TipoActivoSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}

export default function TipoActivoSelector({
  selectedIds: selectedIdsProp,
  onChange,
  error: errorProp,
}: TipoActivoSelectorProps) {
  // Force unwrap React 19 optimization objects
  const selectedIds = Array.isArray(selectedIdsProp) ? [...selectedIdsProp] : [];
  const error = errorProp ? String(errorProp) : '';

  // Debug: check if we're receiving wrapper objects
  if (selectedIdsProp && typeof selectedIdsProp === 'object' && 'state' in selectedIdsProp) {
    console.error('⚠️ TipoActivoSelector received wrapper object:', selectedIdsProp);
  }

  const [tipos, setTipos] = useState<TipoActivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const loadTipos = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const response = await fetch('/api/activos/tipos-activo/list');
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Error cargando tipos de activo');
        }

        setTipos(result.data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        setLoadError(message);
        console.error('Error cargando tipos:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTipos();
  }, []);

  const handleToggleTipo = (id: string) => {
    const newSelection = selectedIds.includes(id)
      ? selectedIds.filter((tid) => tid !== id)
      : [...selectedIds, id];
    onChange(newSelection);
  };

  const handleReload = () => {
    setLoading(true);
    setLoadError(null);
    fetch('/api/activos/tipos-activo/list')
      .then(res => res.json())
      .then(result => {
        if (result.data) {
          setTipos(result.data);
        }
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'Error desconocido');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  if (loading) {
    return (
      <div className="text-white/70 text-sm py-2">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Cargando tipos de activo...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-white/90 text-sm">
        <p className="font-semibold mb-1">⚠️ Error al cargar tipos de activo</p>
        <p className="text-xs text-white/70">{loadError}</p>
        <button
          type="button"
          onClick={handleReload}
          className="mt-2 text-xs underline hover:text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (tipos.length === 0) {
    return (
      <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3 text-white/90 text-sm">
        <p className="font-semibold">⚠️ No hay tipos de activo disponibles</p>
        <p className="text-xs text-white/70 mt-1">
          Necesitas crear al menos un tipo de activo en Airtable primero.
        </p>
      </div>
    );
  }

  const selectedCount = selectedIds.length;
  const selectedNames = tipos
    .filter((t) => selectedIds.includes(t.id))
    .map((t) => t.nombre)
    .join(', ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white/10 backdrop-blur-sm border ${
          error ? 'border-red-500' : 'border-white/20'
        } rounded-lg px-4 py-3 text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-white/15 transition-colors`}
      >
        <div className="flex justify-between items-center">
          <span className={selectedCount === 0 ? 'text-white/50' : ''}>
            {selectedCount === 0
              ? 'Selecciona uno o más tipos de activo'
              : `${selectedCount} tipo(s): ${selectedNames}`}
          </span>
          <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {error && typeof error === 'string' && error.length > 0 && (
        <p className="text-red-300 text-xs mt-1">{error}</p>
      )}

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute z-20 mt-2 w-full bg-gray-800 border border-white/20 rounded-lg shadow-xl max-h-80 overflow-y-auto">
            {tipos.map((tipo) => {
              const isSelected = selectedIds.includes(tipo.id);

              return (
                <button
                  key={tipo.id}
                  type="button"
                  onClick={() => handleToggleTipo(tipo.id)}
                  className={`w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/10 transition-colors ${
                    isSelected ? 'bg-blue-600/30' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      readOnly
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-white/30 rounded pointer-events-none"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-semibold">{tipo.nombre}</span>
                      </div>
                      {tipo.categoria && (
                        <p className="text-xs text-white/60 mt-1">
                          Categoría: {tipo.categoria}
                        </p>
                      )}
                      {tipo.descripcion && (
                        <p className="text-xs text-white/70 mt-1">
                          {tipo.descripcion}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {tipo.requiereVencimiento && (
                          <span className="text-xs bg-yellow-500/20 text-yellow-200 px-2 py-0.5 rounded">
                            📅 Requiere vencimiento
                          </span>
                        )}
                        {tipo.requiereMantenimiento && (
                          <span className="text-xs bg-blue-500/20 text-blue-200 px-2 py-0.5 rounded">
                            🔧 Requiere mantenimiento
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
