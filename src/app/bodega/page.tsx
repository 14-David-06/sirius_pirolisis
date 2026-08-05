/**
 * Bodega — inventario de las materias primas del Biochar Blend.
 *
 * Controla las tres materias primas de la fórmula (bioabono, biochar y
 * biológicos) y la capacidad de producción que permiten. La orquestación vive
 * aquí; los datos, en useBodega.
 */

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  MateriaPrimaCard,
  CapacidadProduccionCard,
  EntradaMateriaPrimaForm,
  MovimientosTable,
  BachesBiocharTable,
  SalidaBacheForm,
} from '@/components/bodega';
import { IconWarehouse } from '@/components/bodega/Icons';
import {
  IconAlert,
  IconArrowDownToBox,
  IconPackage,
  IconX,
} from '@/components/inventario/Icons';
import { useBodega } from '@/lib/useBodega';
import type { BacheBiochar } from '@/types/bodega';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

/**
 * La bodega registra ENTRADAS de materia prima y las SALIDAS DE BACHE que no son
 * producción.
 *
 * El consumo productivo no se digita: lo descuenta la auto-deducción al confirmar
 * una producción de Blend, y ofrecer botones para eso invitaba a registrar dos
 * veces el mismo movimiento. Pero el biochar sí sale por otras puertas —un bigbag
 * al laboratorio, una muestra, un derrame—, y esas salidas antes se registraban
 * como remisiones de baches, que movían la fórmula del bache sin tocar el libro
 * mayor del Core ni el `Estado Bache`. Ver `src/lib/salida-bache.ts`.
 */
const MODAL_COPY = {
  entrada: {
    titulo: 'Entrada a bodega',
    descripcion: 'Registra la materia prima que llega y entra al stock del área.',
  },
  salida: {
    titulo: 'Salida de bache',
    descripcion:
      'Para el biochar que sale sin pasar por producción: laboratorio, muestra, merma o traslado.',
  },
} as const;

/** Nombre del usuario en sesión (mismo criterio que el resto de los módulos). */
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

/** SIRIUS-PER del usuario en sesión: es la FK simbólica del responsable en Core. */
const getCurrentUserIdCore = (): string => {
  try {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      const sessionData = JSON.parse(userSession);
      return (
        sessionData.user?.idPersonalCore ||
        sessionData.user?.['ID Empleado'] ||
        'SIRIUS-PER-0000'
      );
    }
  } catch (error) {
    console.error('Error obteniendo ID Core de usuario:', error);
  }
  return 'SIRIUS-PER-0000';
};

export default function Bodega() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <BodegaContent />
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

/** Diálogo compartido por la entrada de materia prima y la salida de bache. */
function Modal({
  copy,
  onClose,
  children,
}: {
  copy: { titulo: string; descripcion: string };
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-bodega-titulo"
    >
      <div className="my-auto w-full max-w-2xl overflow-hidden rounded-xl bg-slate-900/95 ring-1 ring-white/15 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 id="modal-bodega-titulo" className="text-lg font-semibold text-white">
              {copy.titulo}
            </h2>
            <p className="mt-1 text-sm text-white/60">{copy.descripcion}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1.5 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function BodegaContent() {
  const [entradaAbierta, setEntradaAbierta] = useState(false);
  /** Bache cuya salida se está registrando; null = modal cerrado. */
  const [bacheSalida, setBacheSalida] = useState<BacheBiochar | null>(null);

  const {
    materiales,
    movimientos,
    baches,
    capacidad,
    formula,
    advertencias,
    loading,
    error,
    errorMovimientos,
    refresh,
    materialesGestionables,
  } = useBodega();

  const handleModalSuccess = async (mensaje: string) => {
    setEntradaAbierta(false);
    await refresh();
    alert(mensaje);
  };

  const handleSalidaSuccess = async (mensaje: string) => {
    setBacheSalida(null);
    await refresh();
    alert(mensaje);
  };

  if (loading) {
    return (
      <PageShell>
        <div aria-busy="true" aria-label="Cargando bodega" className="space-y-6">
          <div className="h-8 w-72 rounded bg-white/10 animate-pulse motion-reduce:animate-none" />
          <div className="h-32 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-64 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg rounded-xl bg-rose-500/10 ring-1 ring-rose-400/25 p-6 text-center">
          <IconAlert className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="mt-3 text-lg font-semibold text-white">No se pudo cargar la bodega</h1>
          <p className="mt-2 text-sm text-white/70">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-5 rounded-lg bg-white/10 ring-1 ring-white/20 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </PageShell>
    );
  }

  const puedeRegistrarMovimientos = materialesGestionables.length > 0;

  return (
    <PageShell>
      {/* Encabezado */}
      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              <IconWarehouse className="w-4 h-4" />
              Recursos
            </p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Bodega de materias primas
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/60">
              Bioabono, biochar y biológicos: los tres insumos que entran a la producción de Biochar
              Blend.
            </p>
          </div>

          <Link
            href="/inventario-pirolisis"
            className="inline-flex items-center gap-2 rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            <IconPackage className="w-4 h-4" />
            Insumos consumibles
          </Link>
        </div>

        {/* Acciones */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEntradaAbierta(true)}
            disabled={!puedeRegistrarMovimientos}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <IconArrowDownToBox className="w-4 h-4" />
            Registrar entrada
          </button>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        {advertencias.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-400/25 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <IconAlert className="w-4 h-4" />
              La bodega se muestra incompleta
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
              {advertencias.map((advertencia) => (
                <li key={advertencia}>{advertencia}</li>
              ))}
            </ul>
          </div>
        )}

        {capacidad && formula && (
          <CapacidadProduccionCard
            capacidad={capacidad}
            materiales={materiales}
            formula={formula}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materiales.map((material) => (
            <MateriaPrimaCard
              key={material.key}
              material={material}
              esLimitante={capacidad?.limitante === material.key}
            />
          ))}
        </div>

        <BachesBiocharTable baches={baches} onSalida={setBacheSalida} />

        <MovimientosTable movimientos={movimientos} error={errorMovimientos} />
      </div>

      {entradaAbierta && (
        <Modal copy={MODAL_COPY.entrada} onClose={() => setEntradaAbierta(false)}>
          <EntradaMateriaPrimaForm
            materiales={materialesGestionables}
            getCurrentUserName={getCurrentUserName}
            getCurrentUserIdCore={getCurrentUserIdCore}
            onSuccess={handleModalSuccess}
            onCancel={() => setEntradaAbierta(false)}
          />
        </Modal>
      )}

      {bacheSalida && (
        <Modal copy={MODAL_COPY.salida} onClose={() => setBacheSalida(null)}>
          <SalidaBacheForm
            bache={bacheSalida}
            getCurrentUserName={getCurrentUserName}
            getCurrentUserIdCore={getCurrentUserIdCore}
            onSuccess={handleSalidaSuccess}
            onCancel={() => setBacheSalida(null)}
          />
        </Modal>
      )}
    </PageShell>
  );
}
