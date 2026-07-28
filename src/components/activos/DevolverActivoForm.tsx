/**
 * Devolución de un activo asignado.
 *
 * La versión anterior estaba rota de tres formas: pedía
 * `/api/activos/list?asignados=true` (el parámetro real era `soloAsignados`),
 * leía `result.data` de una respuesta que devuelve `records`, y enviaba
 * `activoId` cuando la API exigía `asignacionId`. Ninguna devolución podía
 * completarse. Además ofrecía condiciones ("Bueno", "Malo", "Dañado") que no
 * existen en el `singleSelect` de Airtable.
 *
 * Ahora trabaja con los activos ya cargados y la API resuelve la asignación
 * abierta a partir del activo.
 */

'use client';

import { useMemo, useState } from 'react';
import { devolverActivo } from '@/lib/activos.client';
import {
  CONDICIONES_ACTIVO,
  CONDICIONES_ACTIVO_AYUDA,
  CONDICIONES_REQUIEREN_MANTENIMIENTO,
  MENSAJES,
} from '@/lib/activos.constants';
import { hoyISO } from '@/lib/activos.format';
import type { ActivoFijoRecord, CondicionActivo } from '@/types/activos';
import {
  AccionesFormulario,
  Campo,
  ErrorOperacion,
  Input,
  Select,
  Textarea,
} from './FormFields';
import { IconCheck, IconUndo } from './Icons';

interface DevolverActivoFormProps {
  /** Todos los activos; el formulario se queda con los que están asignados. */
  activos: ActivoFijoRecord[];
  activoInicial?: ActivoFijoRecord | null;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
}

export default function DevolverActivoForm({
  activos,
  activoInicial,
  onSuccess,
  onCancel,
  getCurrentUserName,
}: DevolverActivoFormProps) {
  const asignados = useMemo(
    () =>
      activos
        .filter((activo) => activo.fields.asignado)
        .sort((a, b) =>
          String(a.fields.nombre || '').localeCompare(String(b.fields.nombre || ''), 'es')
        ),
    [activos]
  );

  const [activoId, setActivoId] = useState(activoInicial?.id || '');
  const [condicion, setCondicion] = useState<CondicionActivo>('Buena');
  const [fecha, setFecha] = useState(hoyISO());
  const [observaciones, setObservaciones] = useState('');
  const [mantenimientoManual, setMantenimientoManual] = useState<boolean | null>(null);

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const seleccionado = useMemo(
    () => asignados.find((activo) => activo.id === activoId) || activoInicial || null,
    [asignados, activoId, activoInicial]
  );

  // Por defecto se deduce de la condición; el usuario puede forzarlo.
  const sugiereMantenimiento = (CONDICIONES_REQUIEREN_MANTENIMIENTO as readonly string[]).includes(
    condicion
  );
  const requiereMantenimiento = mantenimientoManual ?? sugiereMantenimiento;

  if (asignados.length === 0 && !activoInicial) {
    return (
      <div className="p-8 text-center">
        <IconCheck className="mx-auto h-10 w-10 text-emerald-300" />
        <p className="mt-3 font-medium text-white">{MENSAJES.INFO.SIN_ASIGNADOS}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-white/60">
          Ningún activo está en manos de un responsable en este momento.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 rounded-lg bg-white/10 ring-1 ring-white/15 px-4 py-2 text-sm text-white transition-colors duration-200 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!activoId) {
      setErrores({ activoId: MENSAJES.ERROR.SELECCIONAR_ACTIVO });
      setError(MENSAJES.ERROR.CAMPOS_REQUERIDOS);
      return;
    }

    setEnviando(true);
    try {
      const respuesta = await devolverActivo({
        activoId,
        fechaDevolucion: new Date(`${fecha}T00:00:00`).toISOString(),
        condicionAlDevolver: condicion,
        observacionesDevolucion: observaciones.trim() || undefined,
        usuarioQueRecibe: getCurrentUserName(),
        requiereMantenimiento,
      });

      const aviso = respuesta.aviso ? ` ${respuesta.aviso}` : '';
      onSuccess(`${MENSAJES.EXITO.DEVOLUCION_REGISTRADA}.${aviso}`);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al registrar devolución:', mensaje);
      setError(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
      {error && <ErrorOperacion mensaje={error} />}

      <Campo label="Activo a devolver" requerido error={errores.activoId}>
        {(props) => (
          <Select
            {...props}
            value={activoId}
            onChange={(event) => {
              setActivoId(event.target.value);
              setErrores({});
            }}
            invalido={Boolean(errores.activoId)}
          >
            <option value="" className="bg-slate-800">
              Selecciona un activo
            </option>
            {activoInicial && !asignados.some((activo) => activo.id === activoInicial.id) && (
              <option value={activoInicial.id} className="bg-slate-800">
                {activoInicial.fields.codigo} — {activoInicial.fields.nombre}
              </option>
            )}
            {asignados.map((activo) => (
              <option key={activo.id} value={activo.id} className="bg-slate-800">
                {activo.fields.codigo} — {activo.fields.nombre} ({activo.fields.responsable})
              </option>
            ))}
          </Select>
        )}
      </Campo>

      {seleccionado?.fields.responsable && (
        <p className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs text-white/60">
          En manos de {String(seleccionado.fields.responsable)}
          {seleccionado.fields.ubicacion ? ` · ${String(seleccionado.fields.ubicacion)}` : ''}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Fecha de devolución" requerido>
          {(props) => (
            <Input
              {...props}
              type="date"
              max={hoyISO()}
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
            />
          )}
        </Campo>

        <Campo
          label="Condición al devolver"
          requerido
          ayuda={CONDICIONES_ACTIVO_AYUDA[condicion]}
        >
          {(props) => (
            <Select
              {...props}
              value={condicion}
              onChange={(event) => {
                setCondicion(event.target.value as CondicionActivo);
                // Al cambiar la condición vuelve a mandar la sugerencia.
                setMantenimientoManual(null);
              }}
            >
              {CONDICIONES_ACTIVO.map((opcion) => (
                <option key={opcion} value={opcion} className="bg-slate-800">
                  {opcion}
                </option>
              ))}
            </Select>
          )}
        </Campo>
      </div>

      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={requiereMantenimiento}
            onChange={(event) => setMantenimientoManual(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-white/10 accent-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          />
          <span>
            <span className="block text-sm font-medium text-white">
              Requiere mantenimiento antes de reasignar
            </span>
            <span className="mt-0.5 block text-xs text-white/50">
              {requiereMantenimiento
                ? 'El activo quedará "En mantenimiento" y no aparecerá como disponible.'
                : 'El activo quedará disponible para entregarse de nuevo.'}
            </span>
          </span>
        </label>
      </div>

      <Campo label="Observaciones de la devolución">
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            placeholder="Estado en que se recibe, novedades encontradas…"
          />
        )}
      </Campo>

      <AccionesFormulario
        onCancel={onCancel}
        enviando={enviando}
        etiqueta="Registrar devolución"
        etiquetaEnviando="Registrando…"
        icono={<IconUndo className="w-4 h-4" />}
      />
    </form>
  );
}
