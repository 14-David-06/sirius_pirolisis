/**
 * Formulario de alta y edición de un activo.
 *
 * Un solo componente para las dos operaciones: los campos, las validaciones y el
 * orden son idénticos, y mantener dos formularios garantizaba que se separaran.
 * En modo edición se envían únicamente los campos modificados, así un formulario
 * parcial no borra datos que no tocó.
 */

'use client';

import { useMemo, useState } from 'react';
import { actualizarActivo, crearActivo } from '@/lib/activos.client';
import {
  AREAS_EMPRESA,
  ESTADOS_OPERATIVO,
  ESTADOS_OPERATIVO_AYUDA,
  ESTADOS_REGISTRO_ACTIVO,
  MENSAJES,
} from '@/lib/activos.constants';
import { estiloEstado } from '@/lib/activos.format';
import type { ActivoFijoRecord, ActivoFormPayload, EstadoOperativo } from '@/types/activos';
import {
  AccionesFormulario,
  Campo,
  ErrorOperacion,
  Input,
  Seccion,
  Select,
  Textarea,
} from './FormFields';
import { IconCheck, IconPlus } from './Icons';
import TipoActivoSelector from './TipoActivoSelector';
import UbicacionSelector from './UbicacionSelector';

interface ActivoFormProps {
  /** Presente ⇒ modo edición. */
  activo?: ActivoFijoRecord | null;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
  getCurrentUserName?: () => string;
}

interface EstadoFormulario {
  nombre: string;
  descripcion: string;
  tipoIds: string[];
  estado: EstadoOperativo;
  ubicacionId: string;
  area: string;
  numeroSerie: string;
  marca: string;
  modelo: string;
  proveedor: string;
  fechaAdquisicion: string;
  valorAdquisicion: string;
  fechaVencimiento: string;
  proximoMantenimiento: string;
  notas: string;
}

/** Solo la parte de fecha: Airtable devuelve `YYYY-MM-DD` pero a veces con hora. */
function soloFecha(valor: unknown): string {
  return typeof valor === 'string' ? valor.slice(0, 10) : '';
}

function estadoInicial(activo?: ActivoFijoRecord | null): EstadoFormulario {
  const f = activo?.fields;

  return {
    nombre: (f?.nombre as string) || '',
    descripcion: (f?.descripcion as string) || '',
    tipoIds: (f?.tipoIds as string[]) || [],
    estado: (f?.estado as EstadoOperativo) || 'Operativo',
    ubicacionId: (f?.ubicacionId as string) || '',
    area: (f?.area as string) || '',
    numeroSerie: (f?.numeroSerie as string) || '',
    marca: (f?.marca as string) || '',
    modelo: (f?.modelo as string) || '',
    proveedor: (f?.proveedor as string) || '',
    fechaAdquisicion: soloFecha(f?.fechaAdquisicion),
    valorAdquisicion:
      typeof f?.valorAdquisicion === 'number' && f.valorAdquisicion > 0
        ? String(f.valorAdquisicion)
        : '',
    fechaVencimiento: soloFecha(f?.fechaVencimiento),
    proximoMantenimiento: soloFecha(f?.proximoMantenimiento),
    notas: (f?.notas as string) || '',
  };
}

export default function ActivoForm({ activo, onSuccess, onCancel }: ActivoFormProps) {
  const edicion = Boolean(activo);
  const inicial = useMemo(() => estadoInicial(activo), [activo]);

  const [valores, setValores] = useState<EstadoFormulario>(inicial);
  const [errores, setErrores] = useState<Partial<Record<keyof EstadoFormulario, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const actualizar = <K extends keyof EstadoFormulario>(campo: K, valor: EstadoFormulario[K]) => {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    if (errores[campo]) setErrores((previos) => ({ ...previos, [campo]: undefined }));
  };

  // En alta se ofrecen solo los estados que tienen sentido al registrar; en
  // edición hacen falta todos (incluidos "En Reparación" y "Dado de Baja").
  const estadosDisponibles = edicion ? ESTADOS_OPERATIVO : ESTADOS_REGISTRO_ACTIVO;

  const validar = (): boolean => {
    const nuevos: Partial<Record<keyof EstadoFormulario, string>> = {};

    if (!valores.nombre.trim()) nuevos.nombre = MENSAJES.ERROR.NOMBRE_REQUERIDO;

    // En edición se permite guardar un activo heredado que aún no tiene tipo o
    // ubicación: el objetivo es poder completarlo por partes.
    if (!edicion && valores.tipoIds.length === 0) {
      nuevos.tipoIds = MENSAJES.ERROR.SELECCIONAR_TIPO;
    }
    if (!edicion && !valores.ubicacionId) {
      nuevos.ubicacionId = MENSAJES.ERROR.SELECCIONAR_UBICACION;
    }

    if (valores.valorAdquisicion) {
      const valor = Number(valores.valorAdquisicion);
      if (!Number.isFinite(valor)) nuevos.valorAdquisicion = 'Debe ser un número';
      else if (valor < 0) nuevos.valorAdquisicion = MENSAJES.ERROR.VALOR_NEGATIVO;
    }

    if (valores.fechaAdquisicion && valores.fechaAdquisicion > new Date().toISOString().slice(0, 10)) {
      nuevos.fechaAdquisicion = MENSAJES.ERROR.FECHA_ADQUISICION_FUTURA;
    }

    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  };

  /** Payload completo (alta) o solo lo que cambió (edición). */
  const construirPayload = (): ActivoFormPayload => {
    const completo: ActivoFormPayload = {
      'Nombre del Activo': valores.nombre.trim(),
      'Descripción': valores.descripcion.trim(),
      'Tipo de Activo': valores.tipoIds,
      'Estado Operativo': valores.estado,
      'Ubicación Actual': valores.ubicacionId ? [valores.ubicacionId] : [],
      'Área Responsable': valores.area.trim(),
      'Número de Serie': valores.numeroSerie.trim(),
      'Marca': valores.marca.trim(),
      'Modelo': valores.modelo.trim(),
      'Proveedor': valores.proveedor.trim(),
      'Fecha de Adquisición': valores.fechaAdquisicion,
      'Valor de Adquisición': valores.valorAdquisicion ? Number(valores.valorAdquisicion) : null,
      'Fecha de Vencimiento': valores.fechaVencimiento,
      'Próximo Mantenimiento': valores.proximoMantenimiento,
      'Notas': valores.notas.trim(),
    };

    if (!edicion) {
      // Al crear no se mandan las claves vacías: dejar que Airtable use su
      // propio vacío es más limpio que escribir `null` en todo el registro.
      return Object.fromEntries(
        Object.entries(completo).filter(([, valor]) => {
          if (valor === null || valor === '') return false;
          if (Array.isArray(valor) && valor.length === 0) return false;
          return true;
        })
      ) as ActivoFormPayload;
    }

    const cambios: ActivoFormPayload = {};
    const mapa: Array<[keyof ActivoFormPayload, keyof EstadoFormulario]> = [
      ['Nombre del Activo', 'nombre'],
      ['Descripción', 'descripcion'],
      ['Estado Operativo', 'estado'],
      ['Área Responsable', 'area'],
      ['Número de Serie', 'numeroSerie'],
      ['Marca', 'marca'],
      ['Modelo', 'modelo'],
      ['Proveedor', 'proveedor'],
      ['Fecha de Adquisición', 'fechaAdquisicion'],
      ['Fecha de Vencimiento', 'fechaVencimiento'],
      ['Próximo Mantenimiento', 'proximoMantenimiento'],
      ['Notas', 'notas'],
    ];

    for (const [clave, campo] of mapa) {
      if (String(valores[campo]).trim() !== String(inicial[campo]).trim()) {
        (cambios[clave] as unknown) = completo[clave];
      }
    }

    if (valores.tipoIds.join(',') !== inicial.tipoIds.join(',')) {
      cambios['Tipo de Activo'] = valores.tipoIds;
    }
    if (valores.ubicacionId !== inicial.ubicacionId && valores.ubicacionId) {
      cambios['Ubicación Actual'] = [valores.ubicacionId];
    }
    if (valores.valorAdquisicion !== inicial.valorAdquisicion) {
      cambios['Valor de Adquisición'] = completo['Valor de Adquisición'];
    }

    return cambios;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validar()) {
      setError(MENSAJES.ERROR.CAMPOS_REQUERIDOS);
      return;
    }

    const payload = construirPayload();

    if (edicion && Object.keys(payload).length === 0) {
      setError(MENSAJES.ERROR.SIN_CAMBIOS);
      return;
    }

    setEnviando(true);
    try {
      if (edicion && activo) {
        await actualizarActivo(activo.id, payload);
        onSuccess(MENSAJES.EXITO.ACTIVO_ACTUALIZADO);
      } else {
        await crearActivo(payload);
        onSuccess(MENSAJES.EXITO.ACTIVO_CREADO);
      }
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al guardar activo:', mensaje);
      setError(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
      {error && <ErrorOperacion mensaje={error} />}

      <Seccion titulo="Identificación">
        <Campo
          label="Nombre del activo"
          requerido
          error={errores.nombre}
          className="sm:col-span-2"
        >
          {(props) => (
            <Input
              {...props}
              type="text"
              value={valores.nombre}
              onChange={(event) => actualizar('nombre', event.target.value)}
              placeholder="ej: Taladro percutor Bosch GSB 550"
              invalido={Boolean(errores.nombre)}
              autoFocus
            />
          )}
        </Campo>

        <Campo
          label="Tipo de activo"
          requerido={!edicion}
          error={errores.tipoIds}
          ayuda="Define la categoría, la vida útil y si requiere vencimiento o mantenimiento"
          className="sm:col-span-2"
        >
          {(props) => (
            <TipoActivoSelector
              id={props.id}
              aria-describedby={props['aria-describedby']}
              selectedIds={valores.tipoIds}
              onChange={(ids) => actualizar('tipoIds', ids)}
              error={errores.tipoIds}
            />
          )}
        </Campo>

        <Campo label="Descripción" className="sm:col-span-2">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={valores.descripcion}
              onChange={(event) => actualizar('descripcion', event.target.value)}
              placeholder="Detalles que ayuden a identificarlo físicamente"
            />
          )}
        </Campo>

        <Campo label="Número de serie" ayuda="El código ACT-XXXX lo genera Airtable">
          {(props) => (
            <Input
              {...props}
              type="text"
              value={valores.numeroSerie}
              onChange={(event) => actualizar('numeroSerie', event.target.value)}
              placeholder="Serie del fabricante"
            />
          )}
        </Campo>

        <Campo label="Marca">
          {(props) => (
            <Input
              {...props}
              type="text"
              value={valores.marca}
              onChange={(event) => actualizar('marca', event.target.value)}
              placeholder="ej: Bosch"
            />
          )}
        </Campo>

        <Campo label="Modelo">
          {(props) => (
            <Input
              {...props}
              type="text"
              value={valores.modelo}
              onChange={(event) => actualizar('modelo', event.target.value)}
              placeholder="ej: GSB 550"
            />
          )}
        </Campo>
      </Seccion>

      <Seccion titulo="Estado y ubicación">
        <Campo label="Estado operativo" requerido ayuda={ESTADOS_OPERATIVO_AYUDA[valores.estado]}>
          {(props) => (
            <Select
              {...props}
              value={valores.estado}
              onChange={(event) => actualizar('estado', event.target.value as EstadoOperativo)}
            >
              {estadosDisponibles.map((estado) => (
                <option key={estado} value={estado} className="bg-slate-800">
                  {estiloEstado(estado).label}
                </option>
              ))}
            </Select>
          )}
        </Campo>

        <Campo label="Ubicación actual" requerido={!edicion} error={errores.ubicacionId}>
          {(props) => (
            <UbicacionSelector
              id={props.id}
              aria-describedby={props['aria-describedby']}
              selectedId={valores.ubicacionId}
              onChange={(id) => actualizar('ubicacionId', id)}
              error={errores.ubicacionId}
            />
          )}
        </Campo>

        <Campo
          label="Área responsable"
          ayuda="Área dueña del activo, no la persona que lo usa"
          className="sm:col-span-2"
        >
          {(props) => (
            <>
              <Input
                {...props}
                type="text"
                list="areas-empresa"
                value={valores.area}
                onChange={(event) => actualizar('area', event.target.value)}
                placeholder="ej: Pirólisis, Mantenimiento…"
              />
              <datalist id="areas-empresa">
                {AREAS_EMPRESA.map((area) => (
                  <option key={area} value={area} />
                ))}
              </datalist>
            </>
          )}
        </Campo>
      </Seccion>

      <Seccion titulo="Adquisición">
        <Campo label="Fecha de adquisición" error={errores.fechaAdquisicion}>
          {(props) => (
            <Input
              {...props}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={valores.fechaAdquisicion}
              onChange={(event) => actualizar('fechaAdquisicion', event.target.value)}
              invalido={Boolean(errores.fechaAdquisicion)}
            />
          )}
        </Campo>

        <Campo label="Valor de adquisición (COP)" error={errores.valorAdquisicion}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              value={valores.valorAdquisicion}
              onChange={(event) => actualizar('valorAdquisicion', event.target.value)}
              placeholder="0"
              invalido={Boolean(errores.valorAdquisicion)}
            />
          )}
        </Campo>

        <Campo label="Proveedor" className="sm:col-span-2">
          {(props) => (
            <Input
              {...props}
              type="text"
              value={valores.proveedor}
              onChange={(event) => actualizar('proveedor', event.target.value)}
              placeholder="A quién se le compró"
            />
          )}
        </Campo>
      </Seccion>

      <Seccion titulo="Control" descripcion="Solo si el activo lo requiere (extintores, calibraciones, equipos con mantenimiento programado).">
        <Campo label="Fecha de vencimiento">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={valores.fechaVencimiento}
              onChange={(event) => actualizar('fechaVencimiento', event.target.value)}
            />
          )}
        </Campo>

        <Campo label="Próximo mantenimiento">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={valores.proximoMantenimiento}
              onChange={(event) => actualizar('proximoMantenimiento', event.target.value)}
            />
          )}
        </Campo>

        <Campo label="Notas" className="sm:col-span-2">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={valores.notas}
              onChange={(event) => actualizar('notas', event.target.value)}
              placeholder="Observaciones, instrucciones especiales…"
            />
          )}
        </Campo>
      </Seccion>

      <AccionesFormulario
        onCancel={onCancel}
        enviando={enviando}
        etiqueta={edicion ? 'Guardar cambios' : 'Registrar activo'}
        etiquetaEnviando={edicion ? 'Guardando…' : 'Registrando…'}
        icono={
          edicion ? <IconCheck className="w-4 h-4" /> : <IconPlus className="w-4 h-4" />
        }
      />
    </form>
  );
}
