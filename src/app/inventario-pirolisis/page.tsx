/**
 * Página principal del Sistema de Inventario de Pirolisis.
 * Orquesta los componentes del módulo; la lógica de datos vive en useInventario.
 */

"use client";

import { useState } from 'react';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SalidaInsumoForm from '@/components/SalidaInsumoForm';
import {
  EstadisticasGenerales,
  AlertasInventario,
  VencimientosProximos,
  MetricasSection,
  PaqueteLonasCard,
  InventarioTable,
  RegistrarInsumoForm,
  IngresoInsumoForm,
} from '@/components/inventario';
import {
  IconAlert,
  IconArrowDownToBox,
  IconArrowUpFromBox,
  IconFactory,
  IconPlus,
  IconWrench,
  IconX,
} from '@/components/inventario/Icons';
import { useInventario } from '@/lib/useInventario';
import { DIAS_ALERTA_VENCIMIENTO } from '@/lib/inventario.constants';
import type { EstadoInsumo } from '@/types/inventario';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

type ModalMode = 'ingresar' | 'salida' | 'registrar';

const MODAL_COPY: Record<ModalMode, { titulo: string; descripcion: string }> = {
  ingresar: {
    titulo: 'Ingresar cantidades',
    descripcion: 'Selecciona un insumo existente y registra la cantidad que entra al inventario.',
  },
  salida: {
    titulo: 'Salida de insumos',
    descripcion: 'Registra la salida con su tipo de uso y la vinculación productiva.',
  },
  registrar: {
    titulo: 'Registrar nuevo insumo',
    descripcion: 'Crea un insumo en el catálogo de Sirius Insumos Core.',
  },
};

// Función helper para obtener el nombre del usuario actual
const getCurrentUserName = (): string => {
  try {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      const sessionData = JSON.parse(userSession);
      return sessionData.user?.Nombre || sessionData.user?.name || 'Usuario Desconocido';
    }
  } catch (error) {
    console.error('Error obteniendo nombre de usuario:', error);
  }
  return 'Usuario Desconocido';
};

// Función helper para obtener el código SIRIUS-PER del usuario actual
const getCurrentUserIdCore = (): string => {
  try {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      const sessionData = JSON.parse(userSession);
      // El login guarda el campo "ID Empleado" de Nomina Core como "idPersonalCore"
      return sessionData.user?.idPersonalCore ||
             sessionData.user?.['ID Empleado'] ||
             'SIRIUS-PER-0000';
    }
  } catch (error) {
    console.error('Error obteniendo ID Core de usuario:', error);
  }
  return 'SIRIUS-PER-0000';
};

export default function InventarioPirolisis() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <InventarioPirolisisContent />
    </TurnoProtection>
  );
}

/** Envoltorio de página: fondo, navbar y footer compartidos por todos los estados. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative"
      style={{ backgroundImage: FONDO }}
    >
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

function InventarioPirolisisContent() {
  const [filtroEstado, setFiltroEstado] = useState<EstadoInsumo | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);

  const inventario = useInventario({
    estado: filtroEstado || undefined,
    busqueda: busqueda || undefined,
  });

  const {
    data,
    loading,
    error,
    refreshInventario,
    getTotalItems,
    getItemsOrdenados,
    getLowStockItems,
    getSinStockItems,
    getVencimientosProximos,
    getItemName,
    getItemCodigo,
    getItemStockTotal,
    getMinStock,
    getItemUnit,
    getItemEstado,
    getItemMovimientos,
    getItemFechaVencimiento,
  } = inventario;

  const handleModalSuccess = async (successMessage: string) => {
    setModalMode(null);
    await refreshInventario();
    alert(successMessage);
  };

  if (loading) {
    return (
      <PageShell>
        <div aria-busy="true" aria-label="Cargando inventario" className="space-y-6">
          <div className="h-8 w-72 rounded bg-white/10 animate-pulse motion-reduce:animate-none" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[104px] rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
          <div className="h-96 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none" />
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg rounded-xl bg-rose-500/10 ring-1 ring-rose-400/25 p-6 text-center">
          <IconAlert className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="mt-3 text-lg font-semibold text-white">No se pudo cargar el inventario</h1>
          <p className="mt-2 text-sm text-white/70">{error}</p>
          <button
            type="button"
            onClick={refreshInventario}
            className="mt-5 rounded-lg bg-white/10 ring-1 ring-white/20 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </PageShell>
    );
  }

  const totalItems = getTotalItems();
  const lowStockItems = getLowStockItems();
  const sinStockItems = getSinStockItems();
  const itemsDisponibles = Math.max(0, totalItems - lowStockItems.length - sinStockItems.length);
  const itemsOrdenados = getItemsOrdenados();
  const vencimientosProximos = getVencimientosProximos(DIAS_ALERTA_VENCIMIENTO);
  const isTableEmpty = data?.records?.length === 0;

  const acciones = [
    {
      mode: 'ingresar' as const,
      label: 'Ingresar cantidades',
      icono: <IconArrowDownToBox className="w-4 h-4" />,
      clases: 'bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-300',
    },
    {
      mode: 'salida' as const,
      label: 'Salida de insumos',
      icono: <IconArrowUpFromBox className="w-4 h-4" />,
      clases: 'bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-300',
    },
    {
      mode: 'registrar' as const,
      label: 'Nuevo insumo',
      icono: <IconPlus className="w-4 h-4" />,
      clases: 'bg-sky-600 hover:bg-sky-500 focus-visible:ring-sky-300',
    },
  ];

  return (
    <PageShell>
      {/* Encabezado */}
      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              <IconFactory className="w-4 h-4" />
              Pirólisis
            </p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Inventario de insumos
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/60">
              Insumos consumibles del área, sincronizados con Sirius Insumos Core.
            </p>
          </div>

          <a
            href="/activos-fijos"
            className="inline-flex items-center gap-2 rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            <IconWrench className="w-4 h-4" />
            Herramientas y equipos
          </a>
        </div>

        {/* Acciones */}
        <div className="mt-5 flex flex-wrap gap-2">
          {acciones.map(({ mode, label, icono, clases }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setModalMode(mode)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer ${clases}`}
            >
              {icono}
              {label}
            </button>
          ))}
        </div>
      </header>

      {isTableEmpty ? (
        <div className="mt-8 rounded-xl bg-white/5 ring-1 ring-white/10 p-10 text-center">
          <h2 className="text-lg font-semibold text-white">Sin insumos registrados</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
            Sirius Insumos Core no tiene insumos asignados al área de Pirólisis. Registra el
            primero para empezar a controlar el stock.
          </p>
          <button
            type="button"
            onClick={() => setModalMode('registrar')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 cursor-pointer"
          >
            <IconPlus className="w-4 h-4" />
            Registrar insumo
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <EstadisticasGenerales
            totalItems={totalItems}
            itemsDisponibles={itemsDisponibles}
            itemsStockBajo={lowStockItems.length}
            itemsSinStock={sinStockItems.length}
          />

          <AlertasInventario
            itemsStockBajo={lowStockItems}
            itemsSinStock={sinStockItems}
            getItemName={getItemName}
            getItemCodigo={getItemCodigo}
            getItemStockTotal={getItemStockTotal}
            getMinStock={getMinStock}
            getItemUnit={getItemUnit}
          />

          <VencimientosProximos
            items={vencimientosProximos}
            diasAlerta={DIAS_ALERTA_VENCIMIENTO}
            getItemName={getItemName}
            getItemCodigo={getItemCodigo}
            getItemFechaVencimiento={getItemFechaVencimiento}
          />

          <PaqueteLonasCard />
          <MetricasSection />

          <InventarioTable
            items={itemsOrdenados}
            filtroEstado={filtroEstado}
            busqueda={busqueda}
            onFiltroEstadoChange={setFiltroEstado}
            onBusquedaChange={setBusqueda}
            totalSinFiltrar={totalItems}
            getItemName={getItemName}
            getItemCodigo={getItemCodigo}
            getItemStockTotal={getItemStockTotal}
            getMinStock={getMinStock}
            getItemUnit={getItemUnit}
            getItemEstado={getItemEstado}
            getItemMovimientos={getItemMovimientos}
          />
        </div>
      )}

      {/* Modal de formularios */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-inventario-titulo"
        >
          <div className="my-auto w-full max-w-2xl overflow-hidden rounded-xl bg-slate-900/95 ring-1 ring-white/15 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <h2 id="modal-inventario-titulo" className="text-lg font-semibold text-white">
                  {MODAL_COPY[modalMode].titulo}
                </h2>
                <p className="mt-1 text-sm text-white/60">{MODAL_COPY[modalMode].descripcion}</p>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                aria-label="Cerrar"
                className="shrink-0 rounded-lg p-1.5 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            {modalMode === 'salida' ? (
              <SalidaInsumoForm
                records={data?.records || []}
                getItemName={getItemName}
                getItemUnit={getItemUnit}
                getItemStockTotal={getItemStockTotal}
                getMinStock={getMinStock}
                getCurrentUserName={getCurrentUserName}
                getCurrentUserIdCore={getCurrentUserIdCore}
                onSuccess={() => handleModalSuccess('Salida de insumo registrada exitosamente')}
                onCancel={() => setModalMode(null)}
                onInsumoActualizado={refreshInventario}
              />
            ) : modalMode === 'ingresar' ? (
              <IngresoInsumoForm
                records={data?.records || []}
                onSuccess={() => handleModalSuccess('Cantidad agregada exitosamente')}
                onCancel={() => setModalMode(null)}
                getCurrentUserName={getCurrentUserName}
                getCurrentUserIdCore={getCurrentUserIdCore}
                getItemName={getItemName}
                getItemStockTotal={getItemStockTotal}
                getMinStock={getMinStock}
                getItemUnit={getItemUnit}
                onInsumoActualizado={refreshInventario}
              />
            ) : (
              <RegistrarInsumoForm
                onSuccess={() => handleModalSuccess('Insumo registrado exitosamente')}
                onCancel={() => setModalMode(null)}
                getCurrentUserName={getCurrentUserName}
              />
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
