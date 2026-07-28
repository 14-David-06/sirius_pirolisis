/**
 * Baja de un activo.
 *
 * Es una baja lógica: el activo pasa a "Dado de Baja" y conserva su historial de
 * asignaciones y eventos, porque es un bien contable y su rastro tiene que
 * sobrevivir al retiro. Se pide el motivo, que queda fechado en las notas.
 */

'use client';

import { useState } from 'react';
import { darDeBajaActivo } from '@/lib/activos.client';
import { MENSAJES } from '@/lib/activos.constants';
import { formatMoneda } from '@/lib/activos.format';
import type { ActivoFijoRecord } from '@/types/activos';
import { AccionesFormulario, Campo, ErrorOperacion, Textarea } from './FormFields';
import { IconAlert, IconArchive } from './Icons';

interface BajaActivoFormProps {
  activo: ActivoFijoRecord;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
}

export default function BajaActivoForm({
  activo,
  onSuccess,
  onCancel,
  getCurrentUserName,
}: BajaActivoFormProps) {
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const f = activo.fields;
  const asignado = Boolean(f.asignado);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!motivo.trim()) {
      setErrorMotivo('Explica por qué se da de baja el activo');
      return;
    }

    setEnviando(true);
    try {
      await darDeBajaActivo(activo.id, {
        motivoBaja: motivo.trim(),
        usuario: getCurrentUserName(),
      });
      onSuccess(MENSAJES.EXITO.ACTIVO_DADO_DE_BAJA);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al dar de baja el activo:', mensaje);
      setError(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
      {error && <ErrorOperacion mensaje={error} />}

      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
        <p className="font-medium text-white">{String(f.nombre || 'Sin nombre')}</p>
        <p className="mt-0.5 text-xs text-white/50 tabular-nums">
          {String(f.codigo || 'Sin código')}
          {f.valorAdquisicion ? ` · ${formatMoneda(Number(f.valorAdquisicion))}` : ''}
        </p>
      </div>

      {asignado ? (
        <div
          role="alert"
          className="flex gap-3 rounded-xl bg-rose-500/10 ring-1 ring-rose-400/25 p-4"
        >
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <div className="text-sm text-rose-100">
            <p className="font-medium">Este activo está asignado a {String(f.responsable)}</p>
            <p className="mt-1 text-rose-100/80">
              Registra primero la devolución: no se puede dar de baja un activo que está en manos de
              alguien.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 rounded-xl bg-amber-500/10 ring-1 ring-amber-400/25 p-4">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p className="text-sm text-amber-100">
            El activo dejará de contar como parte del parque y no podrá asignarse. El registro y su
            historial se conservan, y la baja se puede revertir reactivándolo.
          </p>
        </div>
      )}

      <Campo label="Motivo de la baja" requerido error={errorMotivo}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            value={motivo}
            onChange={(event) => {
              setMotivo(event.target.value);
              setErrorMotivo(undefined);
            }}
            placeholder="ej: Carcasa rota sin repuesto disponible, se reemplaza por ACT-0042"
            invalido={Boolean(errorMotivo)}
            disabled={asignado}
          />
        )}
      </Campo>

      <AccionesFormulario
        onCancel={onCancel}
        enviando={enviando}
        etiqueta="Dar de baja"
        etiquetaEnviando="Procesando…"
        icono={<IconArchive className="w-4 h-4" />}
        tono="rose"
        deshabilitado={asignado}
      />
    </form>
  );
}
