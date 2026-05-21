"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import React, { useState, useEffect, useCallback } from 'react';

export default function PedidosBlend() {
  return (
    <TurnoProtection requiresTurno={false}>
      <PedidosBlendContent />
    </TurnoProtection>
  );
}

interface Pedido {
  id: string;
  fields: Record<string, unknown>;
}

const EMPAQUE_OPTIONS = ['Big Bag', 'Lona', 'Bulto', 'Otro'];

function PedidosBlendContent() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNuevoPedidoForm, setShowNuevoPedidoForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    cliente: '',
    kg_solicitados: '',
    empaque: 'Big Bag',
    fecha_requerida: '',
    nit_cc_cliente: '',
    contacto_cliente: '',
    telefono: '',
    email: '',
    observaciones: '',
  });

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (estadoFilter !== 'Todos') params.set('estado', estadoFilter);
      if (searchTerm) params.set('cliente', searchTerm);

      const res = await fetch(`/api/pirolisis/blend/pedidos?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setPedidos(data.records || []);
      } else {
        console.error('Error fetching pedidos:', data);
      }
    } catch (err) {
      console.error('Error fetching pedidos:', err);
    } finally {
      setLoading(false);
    }
  }, [estadoFilter, searchTerm]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const body = {
        cliente: formData.cliente,
        kg_solicitados: parseFloat(formData.kg_solicitados),
        empaque: formData.empaque,
        fecha_pedido: new Date().toISOString().split('T')[0],
        fecha_requerida: formData.fecha_requerida || undefined,
        nit_cc_cliente: formData.nit_cc_cliente || undefined,
        contacto_cliente: formData.contacto_cliente || undefined,
        telefono: formData.telefono || undefined,
        email: formData.email || undefined,
        observaciones: formData.observaciones || undefined,
      };

      const res = await fetch('/api/pirolisis/blend/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitSuccess(true);
        setShowNuevoPedidoForm(false);
        setFormData({
          cliente: '',
          kg_solicitados: '',
          empaque: 'Big Bag',
          fecha_requerida: '',
          nit_cc_cliente: '',
          contacto_cliente: '',
          telefono: '',
          email: '',
          observaciones: '',
        });
        fetchPedidos();
      } else {
        setSubmitError(data.error || 'Error al crear pedido');
      }
    } catch (err) {
      setSubmitError('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAprobar = async (id: string) => {
    if (!confirm('¿Aprobar este pedido? Se verificará el stock disponible.')) return;
    setApprovingId(id);
    try {
      const res = await fetch(`/api/pirolisis/blend/pedidos/${id}/aprobar`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.aprobado) {
        alert('✅ Pedido aprobado y producción creada exitosamente');
      } else if (data.aprobado === false) {
        alert(`⚠️ Stock insuficiente. Pedido marcado como "Pendiente Stock".`);
      } else if (!res.ok) {
        alert(`❌ Error: ${data.error || 'No se pudo aprobar'}`);
      }
      fetchPedidos();
    } catch (err) {
      alert('❌ Error de conexión al aprobar pedido');
    } finally {
      setApprovingId(null);
    }
  };

  const handleCancelar = async (id: string) => {
    if (!confirm('¿Cancelar este pedido? Esta acción no se puede deshacer.')) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/pirolisis/blend/pedidos/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        alert('✅ Pedido cancelado exitosamente');
        fetchPedidos();
      } else {
        alert(`❌ Error: ${data.error || 'No se pudo cancelar'}`);
      }
    } catch (err) {
      alert('❌ Error de conexión al cancelar pedido');
    } finally {
      setCancellingId(null);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'Recibido': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Aprobado': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'Pendiente Stock': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'Cancelado': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'Completado': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const estadoOptions = ['Todos', 'Recibido', 'Aprobado', 'Pendiente Stock', 'Completado', 'Cancelado'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-20 lg:pt-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Pedidos Blend</h1>
            <p className="text-gray-400 mt-1">Gestión y aprobación de pedidos de biochar blend</p>
          </div>
          <button
            onClick={() => setShowNuevoPedidoForm(true)}
            className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white px-6 py-3 rounded-xl font-semibold hover:from-[#4a6429] hover:to-[#3d5422] transition-all duration-200 shadow-lg"
          >
            + Nuevo Pedido
          </button>
        </div>

        {/* Success message */}
        {submitSuccess && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-300">
            ✅ Pedido creado exitosamente
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-[#5A7836]"
          />
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#5A7836]"
          >
            {estadoOptions.map(opt => (
              <option key={opt} value={opt} className="bg-gray-800">{opt}</option>
            ))}
          </select>
        </div>

        {/* Pedidos list */}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#5A7836] mx-auto"></div>
            <p className="text-gray-400 mt-4">Cargando pedidos...</p>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-gray-400 text-lg">No se encontraron pedidos</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pedidos.map((pedido) => {
              const fields = pedido.fields;
              const estado = (fields['Estado'] as string) || 'Sin estado';
              const cliente = (fields['Cliente'] as string) || 'No especificado';
              const kg = fields['KG Solicitados'] as number || 0;
              const empaque = (fields['Empaque'] as string) || '';
              const fechaPedido = (fields['Fecha Pedido'] as string) || '';
              const fechaRequerida = (fields['Fecha Requerida'] as string) || '';
              const observaciones = (fields['Observaciones'] as string) || '';

              return (
                <div key={pedido.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-200">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">{cliente}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getEstadoColor(estado)}`}>
                          {estado}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-gray-400">KG Solicitados:</span>
                          <div className="text-white font-medium">{kg.toLocaleString()} kg</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Empaque:</span>
                          <div className="text-white font-medium">{empaque}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Fecha Pedido:</span>
                          <div className="text-white font-medium">{fechaPedido || 'N/A'}</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Fecha Requerida:</span>
                          <div className="text-white font-medium">{fechaRequerida || 'N/A'}</div>
                        </div>
                      </div>
                      {observaciones && (
                        <p className="text-gray-400 text-sm mt-2">📝 {observaciones}</p>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {(estado === 'Recibido' || estado === 'Pendiente Stock') && (
                        <button
                          onClick={() => handleAprobar(pedido.id)}
                          disabled={approvingId === pedido.id}
                          className="bg-green-600/80 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {approvingId === pedido.id ? 'Aprobando...' : '✓ Aprobar'}
                        </button>
                      )}
                      {estado === 'Recibido' && (
                        <button
                          onClick={() => handleCancelar(pedido.id)}
                          disabled={cancellingId === pedido.id}
                          className="bg-red-600/80 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancellingId === pedido.id ? 'Cancelando...' : '✕ Cancelar'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* New Pedido Form Modal */}
        {showNuevoPedidoForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-white/10 rounded-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Nuevo Pedido Blend</h2>
                <button
                  onClick={() => setShowNuevoPedidoForm(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >×</button>
              </div>

              {submitError && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                  ❌ {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-gray-300 text-sm font-medium">Cliente *</label>
                  <input
                    type="text"
                    required
                    value={formData.cliente}
                    onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                    className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-300 text-sm font-medium">KG Solicitados *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.1"
                      value={formData.kg_solicitados}
                      onChange={(e) => setFormData({ ...formData, kg_solicitados: e.target.value })}
                      className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                    />
                  </div>
                  <div>
                    <label className="text-gray-300 text-sm font-medium">Empaque *</label>
                    <select
                      required
                      value={formData.empaque}
                      onChange={(e) => setFormData({ ...formData, empaque: e.target.value })}
                      className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                    >
                      {EMPAQUE_OPTIONS.map(opt => (
                        <option key={opt} value={opt} className="bg-gray-800">{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-gray-300 text-sm font-medium">Fecha Requerida</label>
                  <input
                    type="date"
                    value={formData.fecha_requerida}
                    onChange={(e) => setFormData({ ...formData, fecha_requerida: e.target.value })}
                    className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-300 text-sm font-medium">NIT/CC Cliente</label>
                    <input
                      type="text"
                      value={formData.nit_cc_cliente}
                      onChange={(e) => setFormData({ ...formData, nit_cc_cliente: e.target.value })}
                      className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                    />
                  </div>
                  <div>
                    <label className="text-gray-300 text-sm font-medium">Contacto</label>
                    <input
                      type="text"
                      value={formData.contacto_cliente}
                      onChange={(e) => setFormData({ ...formData, contacto_cliente: e.target.value })}
                      className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-300 text-sm font-medium">Teléfono</label>
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                    />
                  </div>
                  <div>
                    <label className="text-gray-300 text-sm font-medium">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-gray-300 text-sm font-medium">Observaciones</label>
                  <textarea
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    rows={3}
                    className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#5A7836]"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white py-3 rounded-xl font-semibold hover:from-[#4a6429] hover:to-[#3d5422] transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creando...' : 'Crear Pedido'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNuevoPedidoForm(false)}
                    className="px-6 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
