/**
 * Formulario del Acta de Entrega de Biochar.
 *
 * Sigue las secciones del acta física para que quien la llena reconozca el
 * documento: lote → receptor → proyecto y uso previsto → evidencia. Lo que el
 * sistema ya sabe no se re-teclea (códigos, humedad, CO₂, consecutivo, fecha).
 *
 * Dos cosas que este formulario hace y que no son obvias:
 *
 *  - Todos los KG son MASA SECA, sin opción de base. Dar a elegir entre húmeda y
 *    seca invitaba a digitar el peso de la balanza contra un inventario que se lleva
 *    en seco, y eso deja el bache con biochar que no existe. El formulario lo rotula
 *    en cada campo para que no haya duda de qué número se pide.
 *  - Captura las fotos de la entrega ANTES de firmar. Son evidencia de la entrega,
 *    distinta de la evidencia georreferenciada de la aplicación en campo que el
 *    receptor debe enviar después (Atestación de Uso).
 */

"use client";

import { useEffect, useMemo, useState } from 'react';
import { formatStock } from '@/lib/inventario.format';
import { CATEGORIAS_USO, TIPO_BIOCHAR, TIPOS_RECEPTOR } from '@/lib/actas-biochar.constants';
import type { TipoBiochar } from '@/lib/actas-biochar.constants';

interface BacheDisponible {
  codigo: string;
  kg: number;
}

interface ReceptorLista {
  id: string;
  nombre: string;
  tipo: string;
  personaContacto: string;
  documento: string;
  direccion: string;
  municipio: string;
  departamento: string;
  telefono: string;
  correo: string;
  esIntermediario: boolean;
}

const INPUT =
  'mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70';
const LABEL = 'block text-sm font-medium text-white';

interface ActaEntregaFormProps {
  getCurrentUserName: () => string;
  getCurrentUserIdCore: () => string;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
}

export default function ActaEntregaForm({
  getCurrentUserName,
  getCurrentUserIdCore,
  onSuccess,
  onCancel,
}: ActaEntregaFormProps) {
  // Sección 2 — lote entregado
  const [tipoBiochar, setTipoBiochar] = useState<TipoBiochar>(TIPO_BIOCHAR.puro);
  const [bachesDisponibles, setBachesDisponibles] = useState<BacheDisponible[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [lote, setLote] = useState('');
  const [kgBlend, setKgBlend] = useState('');

  // Sección 3 — receptor
  const [receptores, setReceptores] = useState<ReceptorLista[]>([]);
  const [receptorId, setReceptorId] = useState('');
  const [nuevoReceptor, setNuevoReceptor] = useState({
    nombre: '',
    tipo: TIPOS_RECEPTOR[0] as string,
    personaContacto: '',
    documento: '',
    direccion: '',
    municipio: '',
    departamento: '',
    telefono: '',
    correo: '',
    esIntermediario: false,
  });

  // Sección 4 — proyecto y uso previsto
  const [proyecto, setProyecto] = useState({
    nombre: '',
    ubicacion: '',
    gps: '',
    categoria: CATEGORIAS_USO[0] as string,
    categoriaOtro: '',
    fechaAplicacion: '',
    duracion: '',
  });

  // Sección 1 y evidencia
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().split('T')[0]);
  const [cargo, setCargo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fotos, setFotos] = useState<Array<{ nombre: string; url: string }>>([]);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [bodega, recs] = await Promise.all([
          fetch('/api/bodega/materias-primas').then((r) => r.json()),
          fetch('/api/actas-biochar/receptores').then((r) => r.json()),
        ]);
        if (!vivo) return;
        setBachesDisponibles(bodega?.baches ?? []);
        setReceptores(recs?.receptores ?? []);
      } catch {
        if (vivo) setError('No se pudo cargar la lista de baches o de receptores.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const bachesElegidos = useMemo(
    () =>
      Object.entries(seleccion)
        .map(([codigo, kg]) => ({ codigo, kg: parseFloat(kg) }))
        .filter((b) => Number.isFinite(b.kg) && b.kg > 0),
    [seleccion]
  );

  /** Masa SECA: es la única base que maneja la planta. */
  const kgTotal =
    tipoBiochar === TIPO_BIOCHAR.puro
      ? bachesElegidos.reduce((s, b) => s + b.kg, 0)
      : parseFloat(kgBlend) || 0;

  const receptorSeleccionado = receptores.find((r) => r.id === receptorId);

  const subirFoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSubiendoFoto(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('etiqueta', 'entrega');
      const res = await fetch('/api/actas-biochar/fotos', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Error al subir la foto');
      setFotos((prev) => [...prev, { nombre: file.name, url: data.fileUrl }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubiendoFoto(false);
    }
  };

  const enviar = async (dryRun: boolean) => {
    setError(null);
    setAvisos([]);

    if (tipoBiochar === TIPO_BIOCHAR.puro && !bachesElegidos.length) {
      setError('Indica de qué baches sale el biochar y cuántos KG de cada uno.');
      return;
    }
    if (tipoBiochar === TIPO_BIOCHAR.blend && (!lote.trim() || kgTotal <= 0)) {
      setError('Indica el lote de Blend (BLEND-…) y los KG entregados.');
      return;
    }
    if (!receptorId && !nuevoReceptor.nombre.trim()) {
      setError('Selecciona un receptor existente o escribe el nombre del nuevo.');
      return;
    }
    if (!proyecto.nombre.trim() || !proyecto.ubicacion.trim()) {
      setError('El acta exige el nombre del proyecto y la ubicación de la aplicación.');
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch('/api/actas-biochar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoBiochar,
          baches: bachesElegidos.map((b) => ({ bache: b.codigo, kg: b.kg })),
          lote: lote.trim() || undefined,
          kg: tipoBiochar === TIPO_BIOCHAR.blend ? kgTotal : undefined,
          receptor: receptorId ? { id: receptorId } : nuevoReceptor,
          nombreProyecto: proyecto.nombre.trim(),
          ubicacionAplicacion: proyecto.ubicacion.trim(),
          coordenadasGps: proyecto.gps.trim() || undefined,
          categoriaUso: proyecto.categoria,
          categoriaUsoOtro: proyecto.categoriaOtro.trim() || undefined,
          fechaEstimadaAplicacion: proyecto.fechaAplicacion || undefined,
          duracionEnsayo: proyecto.duracion.trim() || undefined,
          fechaEntrega,
          elaboradoPor: getCurrentUserName(),
          cargoElaboradoPor: cargo.trim() || undefined,
          idResponsableCore: getCurrentUserIdCore(),
          observaciones: observaciones.trim() || undefined,
          fotos: fotos.map((f) => f.url),
          dryRun,
        }),
      });
      const data = await res.json();

      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || 'Error al registrar el acta');
      }
      if (dryRun) {
        setAvisos([data.message]);
        return;
      }
      if (res.status === 207) {
        setAvisos(
          (data.steps ?? [])
            .filter((p: { ok: boolean }) => !p.ok)
            .map((p: { step: string; error?: string }) => `${p.step}: ${p.error ?? 'falló'}`)
        );
        return;
      }
      onSuccess(data.message ?? 'Acta registrada');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(false);
      }}
      className="max-h-[75vh] overflow-y-auto p-6"
    >
      <div className="space-y-8">
        {/* ── Lote entregado ── */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Lote de biochar entregado
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="acta-tipo" className={LABEL}>
                Tipo de biochar *
              </label>
              <select
                id="acta-tipo"
                value={tipoBiochar}
                onChange={(e) => setTipoBiochar(e.target.value as TipoBiochar)}
                className={INPUT}
              >
                <option value={TIPO_BIOCHAR.puro} className="bg-slate-800">
                  {TIPO_BIOCHAR.puro} — sale de baches
                </option>
                <option value={TIPO_BIOCHAR.blend} className="bg-slate-800">
                  {TIPO_BIOCHAR.blend} — sale de un lote producido
                </option>
              </select>
              <p className="mt-1.5 text-xs text-white/50">
                {tipoBiochar === TIPO_BIOCHAR.puro
                  ? 'Se descuenta de los baches y del libro mayor de Insumos Core.'
                  : 'Se descuenta del inventario de producto terminado.'}
              </p>
            </div>

            <div>
              <label htmlFor="acta-fecha" className={LABEL}>
                Fecha de entrega *
              </label>
              <input
                id="acta-fecha"
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                required
                className={INPUT}
              />
            </div>
          </div>

          {tipoBiochar === TIPO_BIOCHAR.puro ? (
            <div>
              <span className={LABEL}>Baches y KG de masa seca que salen de cada uno *</span>
              <div className="mt-2 max-h-52 overflow-y-auto rounded-lg ring-1 ring-white/10">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-white/5">
                    {bachesDisponibles.map((bache) => (
                      <tr key={bache.codigo}>
                        <td className="px-3 py-2 font-medium text-white/90">{bache.codigo}</td>
                        <td className="px-3 py-2 text-right text-white/50">
                          {formatStock(bache.kg, 'kg')} disp.
                        </td>
                        <td className="px-3 py-2 w-32">
                          <input
                            type="number"
                            min="0"
                            max={bache.kg}
                            step="0.01"
                            inputMode="decimal"
                            value={seleccion[bache.codigo] ?? ''}
                            onChange={(e) =>
                              setSeleccion((prev) => ({ ...prev, [bache.codigo]: e.target.value }))
                            }
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="0"
                            aria-label={`KG del bache ${bache.codigo}`}
                            className="w-full rounded-md bg-white/10 ring-1 ring-white/20 px-2 py-1.5 text-right text-sm text-white placeholder-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                          />
                        </td>
                      </tr>
                    ))}
                    {!bachesDisponibles.length && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-sm text-white/50">
                          No hay baches con biochar disponible.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="acta-lote" className={LABEL}>
                  Lote de Blend *
                </label>
                <input
                  id="acta-lote"
                  type="text"
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                  placeholder="BLEND-2026-06-24"
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="acta-kg-blend" className={LABEL}>
                  KG entregados (masa seca) *
                </label>
                <input
                  id="acta-kg-blend"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={kgBlend}
                  onChange={(e) => setKgBlend(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={INPUT}
                />
              </div>
            </div>
          )}

          {/* La humedad NO se digita: ya la tiene el bache en su monitoreo, y el
              servidor la trae al generar el acta. Pedirla otra vez era invitar a que
              el documento firmado dijera un número distinto al del registro. */}
          {kgTotal > 0 && (
            <p className="rounded-lg bg-sky-500/10 ring-1 ring-sky-400/25 px-4 py-3 text-xs text-sky-100">
              Se descontarán <strong>{formatStock(kgTotal, 'kg')} de masa seca</strong> de{' '}
              {tipoBiochar === TIPO_BIOCHAR.puro
                ? `${bachesElegidos.length} ${bachesElegidos.length === 1 ? 'bache' : 'baches'}`
                : 'el lote'}
              . La humedad del lote la toma el acta del monitoreo del bache.
            </p>
          )}
        </section>

        {/* ── Receptor ── */}
        <section className="space-y-4 border-t border-white/10 pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Receptor
          </h3>

          <div>
            <label htmlFor="acta-receptor" className={LABEL}>
              Receptor registrado
            </label>
            <select
              id="acta-receptor"
              value={receptorId}
              onChange={(e) => setReceptorId(e.target.value)}
              className={INPUT}
            >
              <option value="" className="bg-slate-800">
                — Registrar un receptor nuevo —
              </option>
              {receptores.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-800">
                  {r.nombre}
                  {r.tipo ? ` · ${r.tipo}` : ''}
                </option>
              ))}
            </select>
            {receptorSeleccionado && (
              <p className="mt-1.5 text-xs text-white/50">
                {receptorSeleccionado.personaContacto || 'sin contacto'} ·{' '}
                {receptorSeleccionado.documento || 'sin documento'} ·{' '}
                {[receptorSeleccionado.municipio, receptorSeleccionado.departamento]
                  .filter(Boolean)
                  .join(', ') || 'sin ubicación'}
              </p>
            )}
          </div>

          {!receptorId && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="rec-nombre" className={LABEL}>
                  Institución, proyecto o persona receptora *
                </label>
                <input
                  id="rec-nombre"
                  type="text"
                  value={nuevoReceptor.nombre}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, nombre: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="rec-tipo" className={LABEL}>
                  Tipo de receptor
                </label>
                <select
                  id="rec-tipo"
                  value={nuevoReceptor.tipo}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, tipo: e.target.value }))}
                  className={INPUT}
                >
                  {TIPOS_RECEPTOR.map((t) => (
                    <option key={t} value={t} className="bg-slate-800">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rec-contacto" className={LABEL}>
                  Persona de contacto
                </label>
                <input
                  id="rec-contacto"
                  type="text"
                  value={nuevoReceptor.personaContacto}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, personaContacto: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="rec-doc" className={LABEL}>
                  Documento / NIT
                </label>
                <input
                  id="rec-doc"
                  type="text"
                  value={nuevoReceptor.documento}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, documento: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="rec-tel" className={LABEL}>
                  Teléfono
                </label>
                <input
                  id="rec-tel"
                  type="tel"
                  value={nuevoReceptor.telefono}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, telefono: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="rec-correo" className={LABEL}>
                  Correo
                </label>
                <input
                  id="rec-correo"
                  type="email"
                  value={nuevoReceptor.correo}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, correo: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="rec-dir" className={LABEL}>
                  Dirección
                </label>
                <input
                  id="rec-dir"
                  type="text"
                  value={nuevoReceptor.direccion}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, direccion: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="rec-mun" className={LABEL}>
                  Municipio
                </label>
                <input
                  id="rec-mun"
                  type="text"
                  value={nuevoReceptor.municipio}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, municipio: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="rec-dep" className={LABEL}>
                  Departamento
                </label>
                <input
                  id="rec-dep"
                  type="text"
                  value={nuevoReceptor.departamento}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, departamento: e.target.value }))}
                  className={INPUT}
                />
              </div>
              <label className="flex items-start gap-2.5 text-sm text-white/80 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={nuevoReceptor.esIntermediario}
                  onChange={(e) => setNuevoReceptor((p) => ({ ...p, esIntermediario: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-white/25 bg-white/10 text-emerald-500 focus:ring-2 focus:ring-sky-400/70"
                />
                <span>
                  Actúa como intermediario y redistribuye el biochar entre usuarios finales.
                  <span className="block text-xs text-white/50">
                    Lo obliga a mantener trazabilidad por porción y compartirla con Sirius
                    (sección 6 del acta).
                  </span>
                </span>
              </label>
            </div>
          )}
        </section>

        {/* ── Proyecto y uso previsto ── */}
        <section className="space-y-4 border-t border-white/10 pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Proyecto y uso previsto
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="pro-nombre" className={LABEL}>
                Nombre del proyecto, ensayo o investigación *
              </label>
              <input
                id="pro-nombre"
                type="text"
                value={proyecto.nombre}
                onChange={(e) => setProyecto((p) => ({ ...p, nombre: e.target.value }))}
                required
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="pro-ubic" className={LABEL}>
                Ubicación de la aplicación *
              </label>
              <input
                id="pro-ubic"
                type="text"
                value={proyecto.ubicacion}
                onChange={(e) => setProyecto((p) => ({ ...p, ubicacion: e.target.value }))}
                required
                placeholder="Finca, municipio, departamento"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="pro-gps" className={LABEL}>
                Coordenadas GPS
              </label>
              <input
                id="pro-gps"
                type="text"
                value={proyecto.gps}
                onChange={(e) => setProyecto((p) => ({ ...p, gps: e.target.value }))}
                placeholder="4.5709, -74.2973"
                className={INPUT}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pro-cat" className={LABEL}>
                Categoría de uso previsto *
              </label>
              <select
                id="pro-cat"
                value={proyecto.categoria}
                onChange={(e) => setProyecto((p) => ({ ...p, categoria: e.target.value }))}
                className={INPUT}
              >
                {CATEGORIAS_USO.map((c) => (
                  <option key={c} value={c} className="bg-slate-800">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {proyecto.categoria === 'Otro' && (
              <div className="sm:col-span-2">
                <label htmlFor="pro-cat-otro" className={LABEL}>
                  Especifica el uso
                </label>
                <input
                  id="pro-cat-otro"
                  type="text"
                  value={proyecto.categoriaOtro}
                  onChange={(e) => setProyecto((p) => ({ ...p, categoriaOtro: e.target.value }))}
                  className={INPUT}
                />
              </div>
            )}
            <div>
              <label htmlFor="pro-fecha" className={LABEL}>
                Fecha estimada de aplicación
              </label>
              <input
                id="pro-fecha"
                type="date"
                value={proyecto.fechaAplicacion}
                onChange={(e) => setProyecto((p) => ({ ...p, fechaAplicacion: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="pro-dur" className={LABEL}>
                Duración estimada del ensayo
              </label>
              <input
                id="pro-dur"
                type="text"
                value={proyecto.duracion}
                onChange={(e) => setProyecto((p) => ({ ...p, duracion: e.target.value }))}
                placeholder="6 meses"
                className={INPUT}
              />
            </div>
          </div>
        </section>

        {/* ── Evidencia y cierre ── */}
        <section className="space-y-4 border-t border-white/10 pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Evidencia de la entrega
          </h3>

          <div>
            <span className={LABEL}>Registro fotográfico</span>
            <p className="mt-1 text-xs text-white/50">
              Fotos de la entrega. La evidencia georreferenciada de la aplicación en campo la
              envía el receptor después, en la Atestación de Uso.
            </p>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={subirFoto}
              disabled={subiendoFoto}
              className="mt-2 block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-white/20 disabled:opacity-50"
            />
            {subiendoFoto && <p className="mt-1.5 text-xs text-white/50">Subiendo…</p>}
            {fotos.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-white/70">
                {fotos.map((f, i) => (
                  <li key={f.url} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {i + 1}. {f.nombre}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFotos((prev) => prev.filter((x) => x.url !== f.url))}
                      className="shrink-0 text-rose-300 hover:text-rose-200 cursor-pointer"
                    >
                      quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="acta-cargo" className={LABEL}>
                Tu cargo (para la firma de Sirius)
              </label>
              <input
                id="acta-cargo"
                type="text"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                className={INPUT}
              />
            </div>
            <div className="rounded-lg bg-white/5 ring-1 ring-white/10 px-4 py-3">
              <p className="text-xs text-white/50">Elabora el acta</p>
              <p className="mt-0.5 text-sm font-medium text-white">{getCurrentUserName()}</p>
            </div>
          </div>

          <div>
            <label htmlFor="acta-obs" className={LABEL}>
              Observaciones
            </label>
            <textarea
              id="acta-obs"
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className={INPUT}
            />
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-500/10 ring-1 ring-rose-400/25 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </p>
        )}

        {avisos.length > 0 && (
          <div role="alert" className="rounded-lg bg-amber-500/10 ring-1 ring-amber-400/25 px-4 py-3">
            <ul className="space-y-1 text-xs text-amber-100/90">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white/5 ring-1 ring-white/15 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
        >
          Cancelar
        </button>
        {/* El ensayo existe porque generar el acta descuenta inventario real: deja ver
            el consecutivo, los kg secos y el CO₂ antes de comprometerlos. */}
        <button
          type="button"
          onClick={() => enviar(true)}
          disabled={enviando}
          className="rounded-lg bg-white/5 ring-1 ring-white/15 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:opacity-50 cursor-pointer"
        >
          Ver ensayo
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {enviando ? 'Registrando…' : 'Generar acta y descontar'}
        </button>
      </div>
    </form>
  );
}
