/**
 * Página principal del inventario de Activos Fijos (multi-área).
 * Orquesta los componentes del módulo; la lógica de datos vive en useActivos.
 *
 * Mismo patrón que /inventario-pirolisis: envoltorio con fondo y navegación,
 * skeleton de carga, estado de error con reintento, indicadores, alertas,
 * listado agrupado y un único modal que conmuta entre formularios.
 */

'use client';

import { useState } from 'react';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  ActivoForm,
  ActivosTable,
  AlertasActivos,
  AsignarActivoForm,
  BajaActivoForm,
  DetalleActivoModal,
  DevolverActivoForm,
  EstadisticasActivos,
} from '@/components/activos';
import {
  IconAlert,
  IconBuilding,
  IconPackage,
  IconPlus,
  IconUndo,
  IconUserPlus,
  IconX,
} from '@/components/activos/Icons';
import { useActivos } from '@/lib/useActivos';
import { DIAS_ALERTA_MANTENIMIENTO, DIAS_ALERTA_VENCIMIENTO } from '@/lib/activos.constants';
import type {
  AccionActivo,
  ActivoFijoRecord,
  EstadoOperativo,
  FiltroAsignacion,
} from '@/types/activos';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

type ModalMode = 'crear' | 'editar' | 'asignar' | 'devolver' | 'baja' | 'detalle';

const MODAL_COPY: Record<Exclude<ModalMode, 'detalle'>, { titulo: string; descripcion: string }> = {
  crear: {
    titulo: 'Registrar nuevo activo',
    descripcion: 'Da de alta una herramienta, equipo, vehículo o instalación en Sirius Activos Core.',
  },
  editar: {
    titulo: 'Editar activo',
    descripcion: 'Actualiza la ficha del activo. Solo se guardan los campos que cambies.',
  },
  asignar: {
    titulo: 'Asignar activo',
    descripcion: 'Entrega el activo a un responsable y deja registro de la condición de entrega.',
  },
  devolver: {
    titulo: 'Registrar devolución',
    descripcion: 'Cierra la asignación abierta y devuelve el activo al parque disponible.',
  },
  baja: {
    titulo: 'Dar de baja',
    descripcion: 'Retira el activo del parque conservando su historial.',
  },
};

/** Nombre del usuario en sesión, para firmar asignaciones y bajas. */
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

export default function ActivosFijos() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <ActivosFijosContent />
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

function ActivosFijosContent() {
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoOperativo | ''>('');
  const [filtroUbicacion, setFiltroUbicacion] = useState('');
  const [filtroAsignacion, setFiltroAsignacion] = useState<FiltroAsignacion>('');
  const [busqueda, setBusqueda] = useState('');

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [activoActivo, setActivoActivo] = useState<ActivoFijoRecord | null>(null);

  const activos = useActivos({
    categoria: filtroCategoria || undefined,
    estado: filtroEstado || undefined,
    ubicacion: filtroUbicacion || undefined,
    asignacion: filtroAsignacion || undefined,
    busqueda: busqueda || undefined,
  });

  const {
    data,
    loading,
    error,
    refreshActivos,
    registros,
    categoriasDisponibles,
    ubicacionesDisponibles,
    getTotalActivos,
    getActivosByCategoria,
    getActivosAsignados,
    getActivosDisponibles,
    getActivosEnReparacion,
    getActivosByEstado,
    getActivosDadosDeBaja,
    getActivosIncompletos,
    getActivosProximosAVencer,
    getActivosVencidos,
    getMantenimientosProximos,
    getValorTotalActivos,
    getActivoNombre,
    getActivoCodigo,
    getActivoCategorias,
    getActivoTipos,
    getActivoEstado,
    getActivoUbicacion,
    getActivoArea,
    getActivoResponsable,
    getActivoEstaAsignado,
    getActivoValor,
    getActivoDiasVencimiento,
    getActivoProximoMantenimiento,
    getActivoEstaCompleto,
  } = activos;

  const getters = {
    getActivoNombre,
    getActivoCodigo,
    getActivoCategorias,
    getActivoTipos,
    getActivoEstado,
    getActivoUbicacion,
    getActivoArea,
    getActivoResponsable,
    getActivoEstaAsignado,
    getActivoValor,
    getActivoDiasVencimiento,
    getActivoEstaCompleto,
  };

  const cerrarModal = () => {
    setModalMode(null);
    setActivoActivo(null);
  };

  const handleAccion = (activo: ActivoFijoRecord, accion: AccionActivo) => {
    setActivoActivo(activo);
    // "Reactivar" reutiliza el formulario de edición: es el mismo cambio de
    // estado, pero con toda la ficha a mano para completar lo que falte.
    setModalMode(accion === 'detalle' ? 'detalle' : accion);
  };

  const handleExito = async (mensaje: string) => {
    cerrarModal();
    await refreshActivos();
    alert(mensaje);
  };

  if (loading) {
    return (
      <PageShell>
        <div aria-busy="true" aria-label="Cargando activos" className="space-y-6">
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
    const sinConfigurar = error.includes('no configurado');

    return (
      <PageShell>
        <div className="mx-auto max-w-lg rounded-xl bg-rose-500/10 ring-1 ring-rose-400/25 p-6 text-center">
          <IconAlert className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="mt-3 text-lg font-semibold text-white">
            {sinConfigurar
              ? 'Módulo de activos sin configurar'
              : 'No se pudo cargar el inventario de activos'}
          </h1>
          <p className="mt-2 text-sm text-white/70">{error}</p>
          {sinConfigurar && (
            <p className="mt-3 text-left text-xs text-white/50">
              Configura en <code className="text-white/70">.env.local</code> las variables de Sirius
              Activos Core (base, tablas y field IDs). La lista completa está en{' '}
              <code className="text-white/70">.env.example</code>.
            </p>
          )}
          <button
            type="button"
            onClick={refreshActivos}
            className="mt-5 rounded-lg bg-white/10 ring-1 ring-white/20 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </PageShell>
    );
  }

  const totalActivos = getTotalActivos();
  const asignados = getActivosAsignados();
  const disponibles = getActivosDisponibles();
  const enReparacion = getActivosEnReparacion();
  const fueraDeServicio = getActivosByEstado('Fuera de Servicio');
  const dadosDeBaja = getActivosDadosDeBaja();
  const incompletos = getActivosIncompletos();
  const vencidos = getActivosVencidos();
  const porVencer = getActivosProximosAVencer(DIAS_ALERTA_VENCIMIENTO);
  const mantenimientos = getMantenimientosProximos(DIAS_ALERTA_MANTENIMIENTO);
  const noOperables = [...enReparacion, ...fueraDeServicio];
  const categorias = getActivosByCategoria();
  const valorTotal = getValorTotalActivos();
  const isTableEmpty = data?.records?.length === 0;

  // Un activo puede estar roto y vencido a la vez: se cuenta una sola vez.
  const requierenAtencion = new Set(
    [...vencidos, ...porVencer, ...noOperables].map((activo) => activo.id)
  ).size;

  const acciones = [
    {
      mode: 'crear' as const,
      label: 'Nuevo activo',
      icono: <IconPlus className="w-4 h-4" />,
      clases: 'bg-sky-600 hover:bg-sky-500 focus-visible:ring-sky-300',
    },
    {
      mode: 'asignar' as const,
      label: 'Asignar activo',
      icono: <IconUserPlus className="w-4 h-4" />,
      clases: 'bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-300',
    },
    {
      mode: 'devolver' as const,
      label: 'Registrar devolución',
      icono: <IconUndo className="w-4 h-4" />,
      clases: 'bg-white/10 ring-1 ring-white/15 hover:bg-white/20 focus-visible:ring-sky-300',
    },
  ];

  return (
    <PageShell>
      {/* Encabezado */}
      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              <IconBuilding className="w-4 h-4" />
              Sirius · todas las áreas
            </p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Inventario de activos fijos
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/60">
              Herramientas, equipos, vehículos e instalaciones: bienes que se asignan y se devuelven,
              no se consumen.
            </p>
          </div>

          <a
            href="/inventario-pirolisis"
            className="inline-flex items-center gap-2 rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            <IconPackage className="w-4 h-4" />
            Insumos consumibles
          </a>
        </div>

        {/* Acciones */}
        <div className="mt-5 flex flex-wrap gap-2">
          {acciones.map(({ mode, label, icono, clases }) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setActivoActivo(null);
                setModalMode(mode);
              }}
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
          <h2 className="text-lg font-semibold text-white">Sin activos registrados</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
            Sirius Activos Core no tiene activos todavía. Registra el primero para empezar a
            controlar herramientas, equipos y vehículos.
          </p>
          <button
            type="button"
            onClick={() => setModalMode('crear')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 cursor-pointer"
          >
            <IconPlus className="w-4 h-4" />
            Registrar activo
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <EstadisticasActivos
            totalActivos={totalActivos}
            asignados={asignados.length}
            disponibles={disponibles.length}
            requierenAtencion={requierenAtencion}
            valorTotal={valorTotal}
            incompletos={incompletos.length}
            dadosDeBaja={dadosDeBaja.length}
          />

          <AlertasActivos
            vencidos={vencidos}
            porVencer={porVencer}
            noOperables={noOperables}
            mantenimientosProximos={mantenimientos}
            diasAlerta={DIAS_ALERTA_VENCIMIENTO}
            getActivoNombre={getActivoNombre}
            getActivoCodigo={getActivoCodigo}
            getActivoEstado={getActivoEstado}
            getActivoDiasVencimiento={getActivoDiasVencimiento}
            getActivoProximoMantenimiento={getActivoProximoMantenimiento}
            onVerDetalle={(activo) => handleAccion(activo, 'detalle')}
          />

          {incompletos.length > 0 && (
            <section className="rounded-xl bg-orange-500/10 ring-1 ring-orange-400/25 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-white">
                {incompletos.length} activo{incompletos.length === 1 ? '' : 's'} sin clasificar
              </h2>
              <p className="mt-1 text-sm text-orange-100/80">
                Les falta tipo o ubicación, así que no aparecen en las categorías ni heredan vida
                útil ni vencimiento. Edítalos para completarlos.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFiltroCategoria('');
                  setFiltroEstado('');
                  setFiltroUbicacion('');
                  setFiltroAsignacion('');
                  setBusqueda('');
                  handleAccion(incompletos[0], 'editar');
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white transition-colors duration-200 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
              >
                Completar el primero
              </button>
            </section>
          )}

          <ActivosTable
            categorias={categorias}
            categoriasDisponibles={categoriasDisponibles}
            ubicacionesDisponibles={ubicacionesDisponibles}
            filtroCategoria={filtroCategoria}
            filtroEstado={filtroEstado}
            filtroUbicacion={filtroUbicacion}
            filtroAsignacion={filtroAsignacion}
            busqueda={busqueda}
            onFiltroCategoriaChange={setFiltroCategoria}
            onFiltroEstadoChange={setFiltroEstado}
            onFiltroUbicacionChange={setFiltroUbicacion}
            onFiltroAsignacionChange={setFiltroAsignacion}
            onBusquedaChange={setBusqueda}
            totalSinFiltrar={totalActivos}
            onAccion={handleAccion}
            {...getters}
          />
        </div>
      )}

      {/* Detalle */}
      {modalMode === 'detalle' && activoActivo && (
        <DetalleActivoModal
          activo={activoActivo}
          onClose={cerrarModal}
          onRefresh={refreshActivos}
          onAccion={handleAccion}
          onMensaje={(mensaje) => alert(mensaje)}
        />
      )}

      {/* Formularios */}
      {modalMode && modalMode !== 'detalle' && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-activos-titulo"
        >
          <div className="my-auto w-full max-w-2xl overflow-hidden rounded-xl bg-slate-900/95 ring-1 ring-white/15 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <h2 id="modal-activos-titulo" className="text-lg font-semibold text-white">
                  {MODAL_COPY[modalMode].titulo}
                </h2>
                <p className="mt-1 text-sm text-white/60">{MODAL_COPY[modalMode].descripcion}</p>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                aria-label="Cerrar"
                className="shrink-0 rounded-lg p-1.5 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto">
              {(modalMode === 'crear' || modalMode === 'editar') && (
                <ActivoForm
                  activo={modalMode === 'editar' ? activoActivo : null}
                  onSuccess={handleExito}
                  onCancel={cerrarModal}
                />
              )}

              {modalMode === 'asignar' && (
                <AsignarActivoForm
                  activos={registros}
                  activoInicial={activoActivo}
                  onSuccess={handleExito}
                  onCancel={cerrarModal}
                  getCurrentUserName={getCurrentUserName}
                />
              )}

              {modalMode === 'devolver' && (
                <DevolverActivoForm
                  activos={registros}
                  activoInicial={activoActivo}
                  onSuccess={handleExito}
                  onCancel={cerrarModal}
                  getCurrentUserName={getCurrentUserName}
                />
              )}

              {modalMode === 'baja' && activoActivo && (
                <BajaActivoForm
                  activo={activoActivo}
                  onSuccess={handleExito}
                  onCancel={cerrarModal}
                  getCurrentUserName={getCurrentUserName}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
