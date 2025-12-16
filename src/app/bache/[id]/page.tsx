"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface BacheData {
  id: string;
  fields: {
    [key: string]: any;
  };
  createdTime: string;
}

export default function BachePage() {
  const params = useParams();
  const [bache, setBache] = useState<BacheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBache = async () => {
      if (!params.id) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/baches/get/${params.id}`);
        
        if (!response.ok) {
          throw new Error('Bache no encontrado');
        }
        
        const data = await response.json();
        setBache(data);
      } catch (err: any) {
        setError(err.message || 'Error al cargar el bache');
      } finally {
        setLoading(false);
      }
    };

    fetchBache();
  }, [params.id]);

  const getBacheId = (bache: BacheData) => {
    return bache.fields['Codigo Bache'] || bache.fields['ID Bache'] || bache.fields['ID'] || `Bache ${bache.id}`;
  };

  const getBacheStatus = (bache: BacheData) => {
    return bache.fields['Estado Bache'] || bache.fields['Estado'] || 'Estado no disponible';
  };

  const getTotalBiochar = (bache: BacheData) => {
    return bache.fields['Total Biochar Bache (WM)(KG)'] || 
           bache.fields['Total Biochar Humedo Bache (KG)'] || 
           bache.fields['Total KG'] || 0;
  };

  const getBiocharVendido = (bache: BacheData) => {
    return bache.fields['Cantidad Biochar Vendido'] || 0;
  };

  const getRecuentoLonas = (bache: BacheData) => {
    return bache.fields['Recuento Lonas'] || bache.fields['Lonas Usadas'] || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
        <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-lg">Cargando información del bache...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !bache) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-pink-900 flex items-center justify-center">
        <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30 max-w-md w-full mx-4">
          <div className="text-white text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold mb-4">Error</h1>
            <p className="text-lg mb-6">{error || 'Bache no encontrado'}</p>
            <Link href="/sistema-baches">
              <button className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 border border-white/30">
                🔙 Volver al Sistema de Baches
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-emerald-800 to-teal-900">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-md border-b border-white/20 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white flex items-center">
              📱 <span className="ml-2">Información del Bache</span>
            </h1>
            <Link href="/sistema-baches">
              <button className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 border border-white/30">
                🔙 Volver
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Main Info Card */}
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30 mb-6">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
                {getBacheId(bache)}
              </h2>
              <span className={`inline-block px-4 py-2 rounded-full text-lg font-semibold ${
                getBacheStatus(bache) === 'Bache Completo Planta' ? 'bg-green-500/20 text-green-200 border border-green-400/50' :
                getBacheStatus(bache) === 'Bache Completo Bodega' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50' :
                getBacheStatus(bache) === 'Bache en proceso' ? 'bg-blue-500/20 text-blue-200 border border-blue-400/50' :
                getBacheStatus(bache) === 'Bache Agotado' ? 'bg-red-500/20 text-red-200 border border-red-400/50' :
                'bg-yellow-500/20 text-yellow-200 border border-yellow-400/50'
              }`}>
                {getBacheStatus(bache)}
              </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white/10 rounded-lg p-4 border border-white/20 text-center">
                <div className="text-3xl mb-2">📦</div>
                <div className="text-white/80 text-sm mb-1">Lonas Usadas</div>
                <div className="text-white font-bold text-xl">{getRecuentoLonas(bache)} / 20</div>
              </div>

              <div className="bg-white/10 rounded-lg p-4 border border-white/20 text-center">
                <div className="text-3xl mb-2">⚖️</div>
                <div className="text-white/80 text-sm mb-1">Biochar Total</div>
                <div className="text-white font-bold text-xl">{getTotalBiochar(bache)} kg</div>
              </div>

              <div className="bg-white/10 rounded-lg p-4 border border-white/20 text-center">
                <div className="text-3xl mb-2">💰</div>
                <div className="text-white/80 text-sm mb-1">Biochar Vendido</div>
                <div className="text-white font-bold text-xl">{getBiocharVendido(bache)} kg</div>
              </div>

              <div className="bg-white/10 rounded-lg p-4 border border-white/20 text-center">
                <div className="text-3xl mb-2">📅</div>
                <div className="text-white/80 text-sm mb-1">Fecha Creación</div>
                <div className="text-white font-bold text-sm">
                  {new Date(bache.fields['Fecha Creacion'] || bache.createdTime).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-white/80 text-sm mb-2">
                <span>Progreso del Bache</span>
                <span>{((getRecuentoLonas(bache) / 20) * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-4">
                <div 
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((getRecuentoLonas(bache) / 20) * 100, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Last Updated */}
            <div className="text-center text-white/60 text-sm">
              Información actualizada en tiempo real
              <br />
              <span className="text-xs">
                Último acceso: {new Date().toLocaleString('es-ES')}
              </span>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">Información Detallada</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-white">
              {Object.entries(bache.fields).map(([key, value]) => {
                if (!value || key.includes('Monitoreo') || key.includes('Balances')) return null;
                
                return (
                  <div key={key} className="bg-white/5 rounded p-3 border border-white/10">
                    <div className="text-white/70 text-sm font-medium">{key}</div>
                    <div className="text-white font-semibold">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-8 text-center">
            <div className="bg-blue-500/20 border border-blue-400/50 rounded-lg p-4 mb-4">
              <p className="text-blue-200 text-sm">
                💡 <strong>Tip:</strong> Esta información se actualiza automáticamente. 
                Guarda esta página en favoritos para acceso rápido.
              </p>
            </div>
            
            <Link href="/sistema-baches">
              <button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-3 rounded-lg font-bold transition-all duration-200 transform hover:scale-105 shadow-lg">
                📊 Ver Todos los Baches
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}