import { generarActaEntregaPdf, type ActaEntregaPdfData } from '@/lib/acta-entrega-pdf';
import { esParteFirmante } from '@/lib/acta-entrega-firma';

/**
 * El PDF ES el acta: si el generador se cae, la entrega queda sin documento que la
 * acredite ante una auditoría de la metodología. Estas pruebas cubren las dos formas
 * en que se caía sin avisar.
 */
const ACTA: ActaEntregaPdfData = {
  codigo: 'ACTA-BC-0009',
  estado: 'Generada',
  fechaEntrega: '2026-08-25',
  elaboradoPor: 'Santiago Amaya',
  cargoElaboradoPor: 'Líder de planta',
  tipoBiochar: 'Biochar Puro',
  loteEntregado: 'S-00211',
  detallePorBache: 'S-00211: 154,00 kg',
  kgSeca: 154,
  humedadPct: 12.5,
  co2SecuestradoKg: 462,
  receptorNombre: 'Colegio Francisco Walter',
  receptorTipo: 'Otro',
  receptorDocumento: '900123456-7',
  receptorContacto: 'Rectoría',
  receptorMunicipio: 'Villavicencio',
  actuaComoIntermediario: true,
  nombreProyecto: 'Huerta escolar',
  categoriaUso: 'Otro',
  categoriaUsoOtro: 'Uso pedagógico en huerta escolar',
  ubicacionAplicacion: 'Sede principal',
  observaciones: 'Entrega sin contraprestación.',
  firmaSirius: {},
  firmaReceptor: {},
};

const esPdf = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString() === '%PDF-';

describe('generarActaEntregaPdf', () => {
  it('emite el acta aunque no haya ninguna firma todavía', async () => {
    // Un acta recién generada se imprime con las casillas en «Pendiente de firma»:
    // el documento tiene que poder mostrarse ANTES de que alguien firme, o no habría
    // nada que leerle al receptor.
    const bytes = await generarActaEntregaPdf(ACTA);
    expect(esPdf(bytes)).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('no se cae con caracteres que WinAnsi no puede codificar', async () => {
    // `page.drawText('CO₂')` LANZA con las fuentes estándar de pdf-lib, y eso tumba
    // el documento completo. Los textos del acta vienen de campos libres (proyecto,
    // observaciones), así que el subíndice llega solo.
    const bytes = await generarActaEntregaPdf({
      ...ACTA,
      nombreProyecto: 'Ensayo ✓ CO₂ → suelo',
      observaciones: 'Humedad ≤ 15% • lote 2026',
      firmaSirius: {
        nombre: 'Santiago Amaya',
        cargo: 'Líder de planta',
        timestamp: '2026-08-25T15:00:00.000Z',
        ip: '10.0.0.1',
      },
      firmaReceptor: { nombre: 'Ana Ríos', documento: '1122334455' },
    });
    expect(esPdf(bytes)).toBe(true);
  });

  it('sigue emitiendo cuando la imagen de una firma no se puede descargar', async () => {
    // `descargarFirma` devuelve null ante un error de red: el trazo ya está guardado
    // en S3 y en Airtable, y no poder traerlo no puede impedir emitir el acta.
    const bytes = await generarActaEntregaPdf({
      ...ACTA,
      firmaSirius: { nombre: 'Santiago Amaya', imagenUrl: 'https://ejemplo.invalido/no-existe.png' },
    });
    expect(esPdf(bytes)).toBe(true);
  });
});

describe('esParteFirmante', () => {
  it('acepta solo las dos partes del acta', () => {
    expect(esParteFirmante('sirius')).toBe(true);
    expect(esParteFirmante('receptor')).toBe(true);
    // La parte decide QUÉ campos se escriben: un valor fuera de las dos no puede
    // caer en una rama por defecto y firmar por quien no es.
    for (const valor of ['Sirius', 'ambos', '', null, undefined, 0]) {
      expect(esParteFirmante(valor)).toBe(false);
    }
  });
});
