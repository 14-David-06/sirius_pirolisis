/**
 * @jest-environment node
 */

/**
 * Identidad de quien recibe: la cédula se busca SOLO en el alcance del cliente
 * de la remisión, con prioridad Receptor > Transportista > Personal Cliente y el
 * mejor correo de todas las coincidencias. Clients Core es solo lectura: el espía
 * de `fetch` verifica que nunca reciba nada distinto de un GET.
 *
 * Datos inventados.
 */

import { AirtableFalso } from '@/test-utils/airtable-falso';
import type { CandidatoReceptor, FuentesIdentidad } from '@/lib/recepcion/identidad';
import type { RemisionCruda } from '@/lib/remision-pirolisis.constants';
import type { PersonaRemision } from '@/lib/remisiones-core';

const B_REM = 'baseRemFalsa';
const B_CLI = 'baseCliFalsa';
const T = {
  remisiones: 'tblRemisiones',
  productos: 'tblProductos',
  personas: 'tblPersonas',
  clientes: 'tblClientes',
  personal: 'tblPersonal',
};

type Modulo = typeof import('@/lib/recepcion/identidad');
let id: Modulo;

beforeAll(async () => {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B_REM,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_TABLE_PRODUCTOS_REMITIDOS: T.productos,
    AIRTABLE_TABLE_PERSONAS_REMISION: T.personas,
    AIRTABLE_CLIENTES_BASE_ID: B_CLI,
    AIRTABLE_CLIENTES_TABLE_ID: T.clientes,
    AIRTABLE_CLIENTES_PERSONAL_TABLE_ID: T.personal,
    AIRTABLE_CLIENTES_TOKEN: 'token-falso',
  });
  id = await import('@/lib/recepcion/identidad');
});

afterEach(() => jest.restoreAllMocks());

function cand(p: Partial<CandidatoReceptor>): CandidatoReceptor {
  return {
    cedula: '99000001',
    nombre: 'Persona Ficticia',
    correo: null,
    telefono: null,
    fuente: 'receptor',
    codigoOrigen: 'PER-REM-0001',
    ...p,
  };
}

function cruda(p: Partial<RemisionCruda> = {}): RemisionCruda {
  return {
    recordId: 'recREMFALSA000001',
    codigo: 'SIRIUS-REM-9100',
    numeracion: 9002,
    estado: 'En Tránsito',
    areaOrigen: 'Producción',
    idPedido: 'SIRIUS-PED-9001',
    idCliente: 'CL-9001',
    idAreaCliente: '',
    notas: '[bache:S-09001=100.00] Biochar',
    kgRollup: 100,
    fechaDespacho: '2026-10-21',
    fechaRecibido: '',
    personasIds: [],
    documentos: [],
    ...p,
  };
}

describe('fusionarCandidatos', () => {
  it('prefiere Receptor, luego Transportista, luego Personal Cliente', () => {
    const cs = [
      cand({ fuente: 'personal-cliente', codigoOrigen: 'CL-9001-PER-0009', personaId: undefined }),
      cand({ fuente: 'transportista', codigoOrigen: 'PER-REM-0005', personaId: 'recPERSONAFALSA05' }),
      cand({ fuente: 'receptor', codigoOrigen: 'PER-REM-0002', personaId: 'recPERSONAFALSA02' }),
    ];
    expect(id.fusionarCandidatos(cs, '99000001')?.fuente).toBe('receptor');
    expect(id.fusionarCandidatos(cs.slice(0, 2), '99000001')?.fuente).toBe('transportista');
  });

  it('dentro de una fuente gana el código mayor', () => {
    const cs = [
      cand({ codigoOrigen: 'PER-REM-0009', personaId: 'recPERSONAFALSA09' }),
      cand({ codigoOrigen: 'PER-REM-0010', personaId: 'recPERSONAFALSA10' }),
    ];
    expect(id.fusionarCandidatos(cs, '99000001')?.personaId).toBe('recPERSONAFALSA10');
  });

  it('toma el mejor correo de todas las coincidencias', () => {
    const cs = [
      cand({ fuente: 'receptor', correo: null, personaId: 'recPERSONAFALSA02' }),
      cand({ fuente: 'transportista', correo: 'transp@example.com', personaId: 'recPERSONAFALSA05' }),
      cand({ fuente: 'personal-cliente', correo: 'cliente@example.com' }),
    ];
    const r = id.fusionarCandidatos(cs, '99000001');
    expect(r?.fuente).toBe('receptor');
    expect(r?.correo).toBe('cliente@example.com');
  });

  it('null si la cédula no está', () => {
    expect(id.fusionarCandidatos([cand({})], '99999999')).toBeNull();
  });
});

describe('candidatosReceptor (fuentes inyectadas)', () => {
  const personas: PersonaRemision[] = [
    { recordId: 'recPERSONAFALSA01', codigo: 'PER-REM-0001', nombre: 'Pedro Ficticio', tipo: 'Transportista', cedula: '99.000.001', email: '', telefono: '3000000001' },
    { recordId: 'recPERSONAFALSA02', codigo: 'PER-REM-0002', nombre: 'Ana Ficticia', tipo: 'Receptor', cedula: '99000002 ', email: 'ANA@example.com', telefono: '' },
    { recordId: 'recPERSONAFALSA03', codigo: 'PER-REM-0003', nombre: 'Otro Cliente', tipo: 'Receptor', cedula: '99000009', email: '', telefono: '' },
  ];

  function fuentes(): FuentesIdentidad & { llamadas: string[] } {
    const llamadas: string[] = [];
    return {
      llamadas,
      leerPersonas: jest.fn(async (ids: string[]) => {
        llamadas.push('personas');
        return personas.filter((p) => ids.includes(p.recordId));
      }),
      remisionesDelCliente: jest.fn(async () => {
        llamadas.push('remisiones');
        return [
          cruda({ recordId: 'recREMFALSA000002', personasIds: ['recPERSONAFALSA02'] }),
          // Una de otro cliente que se coló en la lectura: no entra al alcance.
          cruda({ recordId: 'recREMFALSA000003', idCliente: 'CL-9999', personasIds: ['recPERSONAFALSA03'] }),
        ];
      }),
      personalCliente: jest.fn(async () => {
        llamadas.push('personal');
        return [
          { recordId: 'recPERSONALFALSO1', codigo: 'PER-0001', nombre: 'Carla Ficticia', cedula: '99-000-003', cargo: '', email: 'carla@example.com', emailNotificacion: 'avisos@example.com', telefono: '' },
        ];
      }),
    };
  }

  it('reúne las tres fuentes con la cédula normalizada y solo dentro del cliente', async () => {
    id.invalidarCandidatos('recREMFALSA000001');
    const f = fuentes();
    const cs = await id.candidatosReceptor(cruda({ personasIds: ['recPERSONAFALSA01'] }), f, 1_000);
    expect(cs.map((c) => [c.cedula, c.fuente]).sort()).toEqual([
      ['99000001', 'transportista'],
      ['99000002', 'receptor'],
      ['99000003', 'personal-cliente'],
    ]);
    expect(cs.find((c) => c.cedula === '99000002')?.correo).toBe('ana@example.com');
    // `Email Notificacion` manda sobre `Email`.
    const carla = cs.find((c) => c.cedula === '99000003');
    expect(carla?.correo).toBe('avisos@example.com');
    expect(carla?.codigoOrigen).toBe('CL-9001-PER-0001');
    expect(cs.some((c) => c.cedula === '99000009')).toBe(false);
  });

  it('usa la caché por 5 minutos y se invalida', async () => {
    id.invalidarCandidatos('recREMFALSA000001');
    const f = fuentes();
    await id.candidatosReceptor(cruda(), f, 10_000);
    await id.candidatosReceptor(cruda(), f, 10_000 + 4 * 60 * 1000);
    expect(f.remisionesDelCliente).toHaveBeenCalledTimes(1);
    await id.candidatosReceptor(cruda(), f, 10_000 + 6 * 60 * 1000);
    expect(f.remisionesDelCliente).toHaveBeenCalledTimes(2);
    id.invalidarCandidatos('recREMFALSA000001');
    await id.candidatosReceptor(cruda(), f, 10_000 + 6 * 60 * 1000);
    expect(f.remisionesDelCliente).toHaveBeenCalledTimes(3);
  });

  it('una lectura caída lanza y no queda en caché', async () => {
    id.invalidarCandidatos('recREMFALSA000001');
    const f = fuentes();
    f.personalCliente = jest.fn(async () => {
      throw new Error('Clients Core caído');
    });
    await expect(id.candidatosReceptor(cruda(), f, 1)).rejects.toThrow('caído');
    const bien = fuentes();
    await expect(id.candidatosReceptor(cruda(), bien, 2)).resolves.toHaveLength(2);
  });
});

describe('candidatosReceptor contra el Core (fetch espiado)', () => {
  it('solo LEE Clients Core y Remisiones Core', async () => {
    const falso = new AirtableFalso({
      computados: {
        [`${B_REM}/${T.personas}`]: (rec) => ({ 'Codigo Persona Remision': `PER-REM-${rec.id.slice(-4)}` }),
      },
    });
    const p1 = falso.sembrar(B_REM, T.personas, { 'Nombre Completo': 'Pedro Ficticio', Cedula: '99000001', 'Tipo de Usuario': 'Transportista' });
    const p2 = falso.sembrar(B_REM, T.personas, { 'Nombre Completo': 'Ana Ficticia', Cedula: '99000002', 'Tipo de Usuario': 'Receptor' });
    falso.sembrar(B_REM, T.remisiones, { ID: 'SIRIUS-REM-9101', 'ID Cliente': 'CL-9001', Personas: [p2] });
    const pc = falso.sembrar(B_CLI, T.personal, { 'Nombre Completo': 'Carla Ficticia', Cedula: '99000003', 'Codigo Persona Cliente': 'CL-9001-PER-0003' });
    falso.sembrar(B_CLI, T.clientes, { ID: 'CL-9001', Cliente: 'FINCA DE PRUEBA', 'Personal Clientes': [pc] });
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);

    id.invalidarCandidatos('recREMFALSA000001');
    const cs = await id.candidatosReceptor(cruda({ personasIds: [p1] }));
    expect(cs.map((c) => c.cedula).sort()).toEqual(['99000001', '99000002', '99000003']);
    expect(cs.find((c) => c.cedula === '99000003')?.codigoOrigen).toBe('CL-9001-PER-0003');

    expect(falso.escrituras()).toEqual([]);
    expect(falso.llamadas.filter((l) => l.base === B_CLI).every((l) => l.metodo === 'GET')).toBe(true);
    // Nunca se busca la cédula en la tabla completa de Personas.
    const formulasPersonas = falso.llamadas
      .filter((l) => l.tabla === T.personas)
      .map((l) => l.params.get('filterByFormula') ?? '');
    expect(formulasPersonas.every((f) => f.startsWith('OR(RECORD_ID()'))).toBe(true);
  });
});
