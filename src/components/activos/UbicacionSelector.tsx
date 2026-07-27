/**
 * UbicacionSelector - Selector single-select para Ubicaciones
 */

'use client';

import { useEffect, useState } from 'react';

interface Ubicacion {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string;
  area: string;
  direccion: string;
}

interface UbicacionSelectorProps {
  selectedId: string;
  onChange: (id: string) => void;
  error?: string;
}

export default function UbicacionSelector({
  selectedId: selectedIdProp,
  onChange,
  error: errorProp,
}: UbicacionSelectorProps) {
  // Force unwrap React 19 optimization objects
  const selectedId = selectedIdProp ? String(selectedIdProp) : '';
  const error = errorProp ? String(errorProp) : '';

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadUbicaciones = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const response = await fetch('/api/activos/ubicaciones/list');
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Error cargando ubicaciones');
        }

        setUbicaciones(result.data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        setLoadError(message);
        console.error('Error cargando ubicaciones:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUbicaciones();
  }, []);

  const handleReload = () => {
    setLoading(true);
    setLoadError(null);
    fetch('/api/activos/ubicaciones/list')
      .then(res => res.json())
      .then(result => {
        if (result.data) {
          setUbicaciones(result.data);
        }
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'Error desconocido');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm('');
  };

  if (loading) {
    return (
      <div className="text-white/70 text-sm py-2">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Cargando ubicaciones...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-white/90 text-sm">
        <p className="font-semibold mb-1">⚠️ Error al cargar ubicaciones</p>
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

  if (ubicaciones.length === 0) {
    return (
      <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3 text-white/90 text-sm">
        <p className="font-semibold">⚠️ No hay ubicaciones disponibles</p>
        <p className="text-xs text-white/70 mt-1">
          Necesitas crear al menos una ubicación en Airtable primero.
        </p>
      </div>
    );
  }

  const selectedUbicacion = ubicaciones.find((u) => u.id === selectedId);
  const selectedName = selectedUbicacion ? selectedUbicacion.nombre : '';

  const filteredUbicaciones = ubicaciones.filter((u) =>
    u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.tipo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <span className={!selectedId ? 'text-white/50' : ''}>
            {!selectedId ? 'Selecciona una ubicación' : selectedName}
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

          <div className="absolute z-20 mt-2 w-full bg-gray-800 border border-white/20 rounded-lg shadow-xl max-h-80 overflow-hidden">
            <div className="p-3 border-b border-white/10">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar ubicación..."
                className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="overflow-y-auto max-h-64">
              {filteredUbicaciones.length === 0 ? (
                <div className="px-4 py-3 text-white/60 text-sm text-center">
                  No se encontraron ubicaciones
                </div>
              ) : (
                filteredUbicaciones.map((ubicacion) => {
                  const isSelected = selectedId === ubicacion.id;

                  return (
                    <button
                      key={ubicacion.id}
                      type="button"
                      onClick={() => handleSelect(ubicacion.id)}
                      className={`w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/10 transition-colors ${
                        isSelected ? 'bg-blue-600/30' : ''
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-semibold">{ubicacion.nombre}</span>
                            {isSelected && <span className="text-blue-300 text-sm">✓</span>}
                          </div>
                          {ubicacion.tipo && (
                            <p className="text-xs text-white/60 mt-1">
                              Tipo: {ubicacion.tipo}
                            </p>
                          )}
                          {ubicacion.area && (
                            <p className="text-xs text-white/70 mt-1">
                              Área: {ubicacion.area}
                            </p>
                          )}
                          {ubicacion.descripcion && (
                            <p className="text-xs text-white/60 mt-1">
                              {ubicacion.descripcion}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
