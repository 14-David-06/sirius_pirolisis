/**
 * Entrega de un activo a un responsable.
 *
 * Recibe los activos ya cargados por la página en vez de consultarlos otra vez:
 * la versión anterior llamaba a `/api/activos/disponibles` y leía `result.data`
 * de una respuesta que devolvía `records`, así que la lista SIEMPRE salía vacía
 * ("no hay activos disponibles") aunque hubiera decenas.
 *
 * El cuerpo que se envía coincide con el contrato de `/api/activos/asignar`
 * (`fechaAsignacion` y `condicionAlAsignar` son obligatorios en la API; antes no
 * se mandaban y la petición fallaba con 400 siempre).
 */

'use client';

import { useMemo, useState } from 'react';
import { asignarActivo } from '@/lib/activos.client';
import {
  AREAS_EMPRESA,
  CONDICIONES_ACTIVO,
  CONDICIONES_ACTIVO_AYUDA,
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
import { IconInbox, IconUserPlus } from './Icons';

interface AsignarActivoFormProps {
  /** Todos los activos; el formulario se queda con los asignables. */
  activos: ActivoFijoRecord[];
  /** Activo preseleccionado (cuando se entra desde la fila o el detalle). */
  activoInicial?: ActivoFijoRecord | null;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
}

export default function AsignarActivoForm({
  activos,
  activoInicial,
  onSuccess,
  onCancel,
  getCurrentUserName,
}: AsignarActivoFormProps) {
  const disponibles = useMemo(
    () =>
      activos
        .filter((activo) => {
          const f = activo.fields;
          if (f.asignado) return false;
          return f.estado === 'Operativo' || f.estado === 'Disponible en Almacén';
        })
        .sort((a, b) =>
          String(a.fields.nombre || '').localeCompare(String(b.fields.nombre || ''), 'es')
        ),
    [activos]
  );

  const [activoId, setActivoId] = useState(activoInicial?.id || '');
  const [responsable, setResponsable] = useState('');
  const [area, setArea] = useState(
    (activoInicial?.fields.area as string) || ''
  );
  const [proposito, setProposito] = useState('');
  const [condicion, setCondicion] = useState<CondicionActivo>('Buena');
  const [fecha, setFecha] = useState(hoyISO());
  const [observaciones, setObservaciones] = useState('');

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const seleccionado = useMemo(
    () => disponibles.find((activo) => activo.id === activoId) || activoInicial || null,
    [disponibles, activoId, activoInicial]
  );

  if (disponibles.length === 0 && !activoInicial) {
    return (
      <div className="p-8 text-center">
        <IconInbox className="mx-auto h-10 w-10 text-white/30" />
        <p className="mt-3 font-medium text-white">{MENSAJES.INFO.SIN_DISPONIBLES}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-white/60">
          Todos los activos están asignados o su estado no permite entregarlos.
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

  const validar = (): boolean => {
    const nuevos: Record<string, string> = {};
    if (!activoId) nuevos.activoId = MENSAJES.ERROR.SELECCIONAR_ACTIVO;
    if (!responsable.trim()) nuevos.responsable = MENSAJES.ERROR.ESPECIFICAR_RESPONSABLE;
    if (!fecha) nuevos.fecha = 'Indica la fecha de entrega';
    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validar()) {
      setError(MENSAJES.ERROR.CAMPOS_REQUERIDOS);
      return;
    }

    setEnviando(true);
    try {
      await asignarActivo({
        activoId,
        responsable: responsable.trim(),
        areaResponsable: area.trim() || undefined,
        // La API espera un dateTime; se envía el inicio del día elegido.
        fechaAsignacion: new Date(`${fecha}T00:00:00`).toISOString(),
        propositoUso: proposito.trim() || undefined,
        condicionAlAsignar: condicion,
        observacionesAsignacion: observaciones.trim() || undefined,
        usuarioQueAsigna: getCurrentUserName(),
      });

      onSuccess(MENSAJES.EXITO.ASIGNACION_CREADA);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al asignar activo:', mensaje);
      setError(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
      {error && <ErrorOperacion mensaje={error} />}

      <Campo label="Activo a entregar" requerido error={errores.activoId}>
        {(props) => (
          <Select
            {...props}
            value={activoId}
            onChange={(event) => {
              setActivoId(event.target.value);
              setErrores((previos) => ({ ...previos, activoId: '' }));
            }}
            invalido={Boolean(errores.activoId)}
          >
            <option value="" className="bg-slate-800">
              Selecciona un activo
            </option>
            {activoInicial && !disponibles.some((activo) => activo.id === activoInicial.id) && (
              <option value={activoInicial.id} className="bg-slate-800">
                {activoInicial.fields.codigo} — {activoInicial.fields.nombre}
              </option>
            )}
            {disponibles.map((activo) => (
              <option key={activo.id} value={activo.id} className="bg-slate-800">
                {activo.fields.codigo} — {activo.fields.nombre}
              </option>
            ))}
          </Select>
        )}
      </Campo>

      {seleccionado && (
        <p className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2 text-xs text-white/60">
          {[
            seleccionado.fields.ubicacion
              ? `Ubicación actual: ${seleccionado.fields.ubicacion}`
              : 'Sin ubicación registrada',
            (seleccionado.fields.tipos as string[])?.join(' · ') || 'Sin tipo',
          ].join(' · ')}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Responsable" requerido error={errores.responsable}>
          {(props) => (
            <Input
              {...props}
              type="text"
              value={responsable}
              onChange={(event) => {
                setResponsable(event.target.value);
                setErrores((previos) => ({ ...previos, responsable: '' }));
              }}
              placeholder="Nombre de quien recibe"
              invalido={Boolean(errores.responsable)}
            />
          )}
        </Campo>

        <Campo label="Área del responsable">
          {(props) => (
            <>
              <Input
                {...props}
                type="text"
                list="areas-empresa-asignar"
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="ej: Pirólisis"
              />
              <datalist id="areas-empresa-asignar">
                {AREAS_EMPRESA.map((opcion) => (
                  <option key={opcion} value={opcion} />
                ))}
              </datalist>
            </>
          )}
        </Campo>

        <Campo label="Fecha de entrega" requerido error={errores.fecha}>
          {(props) => (
            <Input
              {...props}
              type="date"
              max={hoyISO()}
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              invalido={Boolean(errores.fecha)}
            />
          )}
        </Campo>

        <Campo
          label="Condición al entregar"
          requerido
          ayuda={CONDICIONES_ACTIVO_AYUDA[condicion]}
        >
          {(props) => (
            <Select
              {...props}
              value={condicion}
              onChange={(event) => setCondicion(event.target.value as CondicionActivo)}
            >
              {CONDICIONES_ACTIVO.map((opcion) => (
                <option key={opcion} value={opcion} className="bg-slate-800">
                  {opcion}
                </option>
              ))}
            </Select>
          )}
        </Campo>

        <Campo label="Propósito de uso" className="sm:col-span-2">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={proposito}
              onChange={(event) => setProposito(event.target.value)}
              placeholder="¿Para qué se va a usar?"
            />
          )}
        </Campo>

        <Campo label="Observaciones" className="sm:col-span-2">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={observaciones}
              onChange={(event) => setObservaciones(event.target.value)}
              placeholder="Notas de la entrega"
            />
          )}
        </Campo>
      </div>

      <AccionesFormulario
        onCancel={onCancel}
        enviando={enviando}
        etiqueta="Asignar activo"
        etiquetaEnviando="Asignando…"
        icono={<IconUserPlus className="w-4 h-4" />}
        tono="emerald"
      />
    </form>
  );
}
