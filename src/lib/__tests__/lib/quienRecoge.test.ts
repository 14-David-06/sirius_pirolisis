/**
 * Quién se ofrece en el despacho como «quién se lleva el pedido» además del
 * Personal Cliente: los que ya llevaron o recibieron remisiones del cliente.
 *
 * El caso que lo motivó: Claudia Fula (Guaicaramo) tiene una fila Transportista y
 * una copia Receptor con la misma cédula, y no está en Clients Core. Tiene que
 * salir UNA vez, como transportista; y si el cliente la agrega a su personal,
 * dejar de salir aquí.
 */

import { personasAnterioresUnicas } from '@/lib/quien-recoge';
import type { PersonaRemision } from '@/lib/remisiones-core';

const persona = (p: Partial<PersonaRemision>): PersonaRemision => ({
  recordId: 'rec' + Math.random().toString(36).slice(2, 10),
  codigo: '',
  nombre: '',
  tipo: 'Transportista',
  cedula: '',
  email: '',
  telefono: '',
  ...p,
});

describe('personasAnterioresUnicas', () => {
  it('una persona con fila Transportista y copia Receptor sale una vez, como transportista', () => {
    const receptor = persona({ recordId: 'recR', codigo: 'PER-REM-0026', nombre: 'Claudia Fula', tipo: 'Receptor', cedula: '1.234.567', email: 'cf@ejemplo.com' });
    const transportista = persona({ recordId: 'recT', codigo: 'PER-REM-0025', nombre: 'Claudia Fula', tipo: 'Transportista', cedula: '1234567' });

    const r = personasAnterioresUnicas([receptor, transportista], []);

    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ recordId: 'recT', codigo: 'PER-REM-0025', tipo: 'Transportista', cedula: '1234567' });
    // El contacto que solo tenía la copia no se pierde.
    expect(r[0].email).toBe('cf@ejemplo.com');
  });

  it('no repite a quien ya está en el Personal Cliente (compara la cédula normalizada)', () => {
    const r = personasAnterioresUnicas(
      [
        persona({ nombre: 'Mireya Barrios', cedula: '40.111.328' }),
        persona({ nombre: 'Claudia Fula', cedula: '1234567' }),
      ],
      ['40111328 ']
    );
    expect(r.map((p) => p.nombre)).toEqual(['Claudia Fula']);
  });

  it('omite a quien no tiene cédula válida o nombre, y los tipos que no son de remisión', () => {
    const r = personasAnterioresUnicas(
      [
        persona({ nombre: 'Sin cédula', cedula: '' }),
        persona({ nombre: '', cedula: '99887766' }),
        persona({ nombre: 'Otro papel', tipo: 'Firmante', cedula: '55667788' }),
        persona({ nombre: 'Válida', cedula: '11223344' }),
      ],
      []
    );
    expect(r.map((p) => p.nombre)).toEqual(['Válida']);
  });

  it('ordena por nombre', () => {
    const r = personasAnterioresUnicas(
      [persona({ nombre: 'Rosendo', cedula: '11111111' }), persona({ nombre: 'Ángela', cedula: '22222222' })],
      []
    );
    expect(r.map((p) => p.nombre)).toEqual(['Ángela', 'Rosendo']);
  });
});
