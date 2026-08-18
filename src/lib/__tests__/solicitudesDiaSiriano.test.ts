/**
 * PiroliApp puede emitir el documento del día siriano.
 *
 * No prueba la maqueta —eso lo cubren los tests del paquete—, prueba el cableado
 * de esta app: que `@sirius/solicitudes/dia-siriano` se resuelva y transpile aquí,
 * y que `pdf-lib` esté disponible. Es lo que se rompe en silencio: el permiso por
 * día siriano nace autorizado, así que un fallo al emitir deja un permiso
 * concedido sin respaldo.
 *
 * La firma que se inyecta es el trazo **sintético** del paquete, no la
 * institucional. Por dos razones: la real es un instrumento de autenticación y no
 * puede entrar al repositorio ni a un test, y además Next no carga `.env.local`
 * cuando `NODE_ENV=test`, así que aquí no estaría disponible de todos modos. Que
 * la variable esté puesta en el despliegue es cosa del despliegue, no de un test.
 */

import { PDFDocument } from 'pdf-lib';
import { crearDiaSirianoInfra } from '@sirius/solicitudes/dia-siriano';
import { FIRMA_FIXTURE_BASE64 } from '@sirius/solicitudes/pdf';

process.env.FIRMA_GESTION_SER_BASE64 ??= FIRMA_FIXTURE_BASE64;

// Datos inventados: nada de cédulas, nombres ni record IDs de personas reales.
const DATOS = {
  solicitudId: 'recTEST0000000000',
  nombre: 'Colaborador De Prueba',
  cedula: '1111111111',
  cargo: 'Operario de pirólisis',
  idCore: 'SIRIUS-PER-9001',
  fechaPermiso: '2026-09-01',
  fechaSolicitud: '2026-08-14',
  motivo: 'Día siriano del periodo.',
  periodo: '2026-S2',
  saldoRestante: 0,
};

describe('documento del día siriano', () => {
  const infra = crearDiaSirianoInfra({
    // El archivado no se ejerce aquí: lo que se prueba es la emisión.
    archivarDocumento: async () => {
      throw new Error('no se usa en este test');
    },
  });

  it('emite un PDF de una sola página', async () => {
    const pdf = await infra.generarDocumento(DATOS);

    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(pdf.slice(0, 4)).toString()).toBe('%PDF');

    // Una sola página es requisito del documento: la firma y la nota legal no
    // pueden irse a una segunda hoja donde nadie las buscaría.
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
  });

  it('firma como la dependencia, no como una persona', () => {
    // La firma acredita a Gestión del Ser: no hay alguien que haya estudiado el
    // caso, porque el día siriano es un beneficio ya concedido.
    expect(infra.firmante.nombre).toContain('Gestión del Ser');
    // La cédula va vacía a propósito, y la tarjeta del PDF sabe pintar "C.C. —".
    expect(infra.firmante.cedula).toBe('');
  });
});
