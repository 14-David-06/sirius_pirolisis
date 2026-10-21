// src/test-utils/airtable-falso.ts
//
// Un Airtable de mentira, en memoria, para los tests de contrato de los módulos
// que hablan con los Core (remisiones, pedidos, inventario).
//
// POR QUÉ un doble con estado y no respuestas en fila: `crearRemision()` y sus
// vecinos releen lo que acaban de escribir (el código SIRIUS-REM sale de una
// fórmula, el rollup suma los productos vinculados, el PATCH de un link relee
// antes de unir). Con respuestas enlatadas en orden, cualquier refactor que
// agregue o reordene una LECTURA rompería el test aunque las ESCRITURAS —que es
// lo que se protege— sean idénticas. Aquí se registra cada llamada y el test
// compara solo las que escriben.
//
// Evalúa el subconjunto de fórmulas que usa la app: `{Campo} = 'x'`, AND, OR,
// NOT, FIND, SEARCH, RECORD_ID, UPPER, LOWER, TRIM, SUBSTITUTE, LEN y `&`. Una
// función desconocida es un 422, como haría Airtable con una fórmula inválida:
// es mejor que el test falle a que una fórmula nueva pase sin evaluarse.
//
// Solo datos inventados. No vive en `__tests__/` porque Jest trataría el archivo
// como una suite más.

export interface RegistroFalso {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

export interface LlamadaAirtable {
  metodo: string;
  url: string;
  host: string;
  base: string;
  tabla: string;
  recordId?: string;
  params: URLSearchParams;
  body?: unknown;
  headers: Record<string, string>;
}

export interface OpcionesAirtableFalso {
  /** Prefijo de 5 letras de los record IDs (`recXXXXX000000001`). */
  prefijo?: string;
  /** Devuelve un error para esa llamada, o null para atenderla normalmente. */
  fallar?: (ll: LlamadaAirtable) => { status: number; body?: unknown } | null;
  /** Campos que Airtable calcula (fórmulas, rollups), por `base/tabla`. */
  computados?: Record<
    string,
    (rec: RegistroFalso, falso: AirtableFalso) => Record<string, unknown>
  >;
  /** Campos que fija Airtable al crear (autonumber), por `base/tabla`. */
  alCrear?: Record<string, (fields: Record<string, unknown>, n: number) => Record<string, unknown>>;
  /** Respuesta para URLs que no son de la API (p. ej. la URL de un adjunto). */
  externo?: (url: string) => { status: number; bytes: Uint8Array } | null;
}

type Valor = string | number | boolean | unknown[] | null;

// ─────────────────────────────────────────────────────────────────────────────
// Fórmulas
// ─────────────────────────────────────────────────────────────────────────────

type Token =
  | { t: 'campo'; v: string }
  | { t: 'texto'; v: string }
  | { t: 'numero'; v: number }
  | { t: 'func'; v: string }
  | { t: 'op'; v: string };

function tokenizar(formula: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const c = formula[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{') {
      const fin = formula.indexOf('}', i);
      if (fin === -1) throw new Error('Llave sin cerrar');
      out.push({ t: 'campo', v: formula.slice(i + 1, fin) });
      i = fin + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let v = '';
      i++;
      while (i < formula.length && formula[i] !== c) {
        if (formula[i] === '\\') { v += formula[i + 1]; i += 2; continue; }
        v += formula[i++];
      }
      if (formula[i] !== c) throw new Error('Texto sin cerrar');
      i++;
      out.push({ t: 'texto', v });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(formula.slice(i))!;
      out.push({ t: 'numero', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(formula.slice(i))!;
      out.push({ t: 'func', v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    const dos = formula.slice(i, i + 2);
    if (dos === '!=' || dos === '>=' || dos === '<=') { out.push({ t: 'op', v: dos }); i += 2; continue; }
    if ('=<>&,()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Carácter inesperado en la fórmula: ${c}`);
  }
  return out;
}

function comoTexto(v: Valor): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => comoTexto(x as Valor)).join(', ');
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}

function verdadero(v: Valor): boolean {
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'boolean') return v;
  return comoTexto(v) !== '';
}

function evaluarFormula(formula: string, rec: RegistroFalso): boolean {
  const tokens = tokenizar(formula);
  let p = 0;
  const ver = () => tokens[p];
  const esperar = (v: string) => {
    const t = tokens[p++];
    if (!t || t.t !== 'op' || t.v !== v) throw new Error(`Se esperaba "${v}"`);
  };

  function primario(): Valor {
    const t = tokens[p++];
    if (!t) throw new Error('Fórmula incompleta');
    if (t.t === 'campo') return (rec.fields[t.v] as Valor) ?? null;
    if (t.t === 'texto') return t.v;
    if (t.t === 'numero') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = comparacion();
      esperar(')');
      return v;
    }
    if (t.t === 'func') {
      esperar('(');
      const args: Valor[] = [];
      if (!(ver()?.t === 'op' && ver()?.v === ')')) {
        args.push(comparacion());
        while (ver()?.t === 'op' && ver()?.v === ',') { p++; args.push(comparacion()); }
      }
      esperar(')');
      return llamar(t.v, args);
    }
    throw new Error(`Token inesperado: ${JSON.stringify(t)}`);
  }

  function concatenacion(): Valor {
    let v = primario();
    while (ver()?.t === 'op' && ver()?.v === '&') { p++; v = comoTexto(v) + comoTexto(primario()); }
    return v;
  }

  function comparacion(): Valor {
    const a = concatenacion();
    const t = ver();
    if (t?.t === 'op' && ['=', '!=', '>', '<', '>=', '<='].includes(t.v)) {
      p++;
      const b = concatenacion();
      const numericos = typeof a === 'number' && typeof b === 'number';
      const x = numericos ? (a as number) : comoTexto(a);
      const y = numericos ? (b as number) : comoTexto(b);
      switch (t.v) {
        case '=': return x === y;
        case '!=': return x !== y;
        case '>': return x > y;
        case '<': return x < y;
        case '>=': return x >= y;
        default: return x <= y;
      }
    }
    return a;
  }

  function llamar(f: string, a: Valor[]): Valor {
    switch (f) {
      case 'AND': return a.every(verdadero);
      case 'OR': return a.some(verdadero);
      case 'NOT': return !verdadero(a[0]);
      case 'FIND': return comoTexto(a[1]).indexOf(comoTexto(a[0])) + 1;
      case 'SEARCH': return comoTexto(a[1]).toLowerCase().indexOf(comoTexto(a[0]).toLowerCase()) + 1;
      case 'RECORD_ID': return rec.id;
      case 'UPPER': return comoTexto(a[0]).toUpperCase();
      case 'LOWER': return comoTexto(a[0]).toLowerCase();
      case 'TRIM': return comoTexto(a[0]).trim();
      case 'LEN': return comoTexto(a[0]).length;
      case 'SUBSTITUTE': return comoTexto(a[0]).split(comoTexto(a[1])).join(comoTexto(a[2]));
      default: throw new Error(`Función no soportada por el doble: ${f}`);
    }
  }

  const v = comparacion();
  if (p !== tokens.length) throw new Error('Sobran tokens en la fórmula');
  return verdadero(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// El doble
// ─────────────────────────────────────────────────────────────────────────────

export class AirtableFalso {
  readonly llamadas: LlamadaAirtable[] = [];
  private readonly tablas = new Map<string, Map<string, RegistroFalso>>();
  private contador = 0;
  private autonumeros = new Map<string, number>();

  constructor(private readonly o: OpcionesAirtableFalso = {}) {}

  private nuevoId(tipo = 'rec'): string {
    this.contador++;
    return `${tipo}${(this.o.prefijo ?? 'FALSO').slice(0, 5).padEnd(5, 'X')}${String(this.contador).padStart(9, '0')}`;
  }

  private tabla(base: string, tabla: string): Map<string, RegistroFalso> {
    const k = `${base}/${tabla}`;
    if (!this.tablas.has(k)) this.tablas.set(k, new Map());
    return this.tablas.get(k)!;
  }

  /** Inserta un registro sin pasar por la API (no queda en `llamadas`). */
  sembrar(base: string, tabla: string, fields: Record<string, unknown>, id?: string): string {
    const recId = id ?? this.nuevoId();
    const extra = this.o.alCrear?.[`${base}/${tabla}`]?.(fields, this.siguienteAutonumero(base, tabla)) ?? {};
    this.tabla(base, tabla).set(recId, {
      id: recId,
      createdTime: '2026-10-21T15:00:00.000Z',
      fields: { ...fields, ...extra },
    });
    return recId;
  }

  private siguienteAutonumero(base: string, tabla: string): number {
    const k = `${base}/${tabla}`;
    const n = (this.autonumeros.get(k) ?? 0) + 1;
    this.autonumeros.set(k, n);
    return n;
  }

  /** Fija desde dónde cuenta el autonumber de una tabla. */
  autonumeroDesde(base: string, tabla: string, ultimo: number): void {
    this.autonumeros.set(`${base}/${tabla}`, ultimo);
  }

  registros(base: string, tabla: string): RegistroFalso[] {
    return [...this.tabla(base, tabla).values()].map((r) => this.conComputados(base, tabla, r));
  }

  registro(base: string, tabla: string, id: string): RegistroFalso | null {
    const r = this.tabla(base, tabla).get(id);
    return r ? this.conComputados(base, tabla, r) : null;
  }

  private conComputados(base: string, tabla: string, r: RegistroFalso): RegistroFalso {
    const extra = this.o.computados?.[`${base}/${tabla}`]?.(r, this) ?? {};
    return { ...r, fields: { ...r.fields, ...extra } };
  }

  /** Solo las llamadas que escriben, en orden. */
  escrituras(): LlamadaAirtable[] {
    return this.llamadas.filter((l) => l.metodo !== 'GET');
  }

  /** Para `jest.spyOn(global, 'fetch').mockImplementation(falso.fetch)`. */
  fetch = async (entrada: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const metodo = (init.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
    }

    if (url.host !== 'api.airtable.com' && url.host !== 'content.airtable.com') {
      const r = this.o.externo?.(url.href);
      this.llamadas.push({ metodo, url: url.href, host: url.host, base: '', tabla: '', params: url.searchParams, headers });
      if (!r) return new Response('no encontrado', { status: 404 });
      return new Response(Buffer.from(r.bytes), { status: r.status });
    }

    const partes = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;

    // content.airtable.com/v0/{base}/{rec}/{campo}/uploadAttachment
    if (url.host === 'content.airtable.com') {
      const [, base, recId, campo] = partes;
      const ll: LlamadaAirtable = { metodo, url: url.href, host: url.host, base, tabla: campo, recordId: recId, params: url.searchParams, body, headers };
      this.llamadas.push(ll);
      const fallo = this.o.fallar?.(ll);
      if (fallo) return json(fallo.body ?? { error: 'FALLO' }, fallo.status);
      for (const [k, t] of this.tablas) {
        if (!k.startsWith(`${base}/`) || !t.has(recId)) continue;
        const rec = t.get(recId)!;
        const previos = (rec.fields[campo] as unknown[] | undefined) ?? [];
        const nuevo = {
          id: this.nuevoId('att'),
          filename: body?.filename,
          type: body?.contentType,
          url: `https://adjuntos.falso.test/${recId}/${encodeURIComponent(body?.filename ?? '')}`,
          size: Buffer.from(body?.file ?? '', 'base64').byteLength,
        };
        rec.fields[campo] = [...previos, nuevo];
        // Como Airtable: la respuesta indexa por field ID, no por nombre.
        return json({ id: recId, createdTime: rec.createdTime, fields: { fldDocumento: rec.fields[campo] } }, 200);
      }
      return json({ error: { type: 'NOT_FOUND' } }, 404);
    }

    const [, base, tabla, recId] = partes;
    const ll: LlamadaAirtable = { metodo, url: url.href, host: url.host, base, tabla, recordId: recId, params: url.searchParams, body, headers };
    this.llamadas.push(ll);
    const fallo = this.o.fallar?.(ll);
    if (fallo) return json(fallo.body ?? { error: 'FALLO' }, fallo.status);

    const t = this.tabla(base, tabla);

    if (metodo === 'GET') {
      if (recId) {
        const r = this.registro(base, tabla, recId);
        return r ? json(r, 200) : json({ error: { type: 'NOT_FOUND' } }, 404);
      }
      const formula = url.searchParams.get('filterByFormula');
      let lista = this.registros(base, tabla);
      if (formula) {
        try {
          lista = lista.filter((r) => evaluarFormula(formula, r));
        } catch (err) {
          return json({ error: { type: 'INVALID_FILTER_BY_FORMULA', message: String(err) } }, 422);
        }
      }
      const max = Number(url.searchParams.get('maxRecords') ?? '0');
      if (max > 0) lista = lista.slice(0, max);
      return json({ records: lista }, 200);
    }

    if (metodo === 'POST') {
      const creados = ((body?.records ?? []) as Array<{ fields: Record<string, unknown> }>).map((r) => {
        const id = this.sembrar(base, tabla, r.fields);
        return this.registro(base, tabla, id)!;
      });
      return json({ records: creados }, 200);
    }

    if (metodo === 'PATCH') {
      const cambios: Array<{ id: string; fields: Record<string, unknown> }> = recId
        ? [{ id: recId, fields: body?.fields ?? {} }]
        : body?.records ?? [];
      const out: RegistroFalso[] = [];
      for (const c of cambios) {
        const r = t.get(c.id);
        if (!r) return json({ error: { type: 'NOT_FOUND' } }, 404);
        for (const [campo, valor] of Object.entries(c.fields)) {
          // Un adjunto se conserva mandando solo su `{ id }`: Airtable mantiene el
          // archivo, no lo reemplaza por un objeto vacío.
          const previos = r.fields[campo];
          if (Array.isArray(valor) && Array.isArray(previos) && valor.every((v) => v && typeof v === 'object' && 'id' in v)) {
            r.fields[campo] = valor.map(
              (v: { id: string }) => (previos as Array<{ id?: string }>).find((p) => p?.id === v.id) ?? v
            );
          } else {
            r.fields[campo] = valor;
          }
        }
        out.push(this.registro(base, tabla, c.id)!);
      }
      return json(recId ? out[0] : { records: out }, 200);
    }

    if (metodo === 'DELETE') {
      const ids = recId ? [recId] : url.searchParams.getAll('records[]');
      for (const id of ids) {
        if (!t.has(id)) return json({ error: { type: 'NOT_FOUND' } }, 404);
        t.delete(id);
      }
      return json(recId ? { id: recId, deleted: true } : { records: ids.map((id) => ({ id, deleted: true })) }, 200);
    }

    return json({ error: 'METODO' }, 405);
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Lo que el test compara de una escritura: método, tabla, registro y cuerpo. */
export function resumenEscritura(l: LlamadaAirtable) {
  return {
    metodo: l.metodo,
    tabla: l.tabla,
    ...(l.recordId ? { recordId: l.recordId } : {}),
    ...(l.metodo === 'DELETE' && !l.recordId ? { records: l.params.getAll('records[]') } : {}),
    ...(l.body !== undefined ? { body: l.body } : {}),
  };
}
