import { NextResponse } from 'next/server';
import {
  buscarOCrearPersona,
  resolverRemision,
  vincularPersonas,
  TIPO_PERSONA,
} from '../../../../../../../lib/blend-remisiones-core';

// PATCH /api/pirolisis/blend/remisiones/[id]/receptor
// Body: { responsable_recibe, num_doc_recibe, telefono_recibe?, email_recibe? }
//
// Registra por adelantado a quién se le va a entregar, sin firmar todavía.
//
// ⚠️ MIGRACIÓN 2026-07-30: el receptor ya no son 4 campos de texto en la remisión.
// Es un registro en `Personas` de Sirius Remisiones Core (PER-REM-XXXX) vinculado a
// la remisión, con upsert por cédula + tipo. Así la misma persona que recibe en
// varias fincas queda una sola vez y su correo se reutiliza.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const { responsable_recibe, num_doc_recibe, telefono_recibe, email_recibe } =
      body as Record<string, unknown>;

    if (!responsable_recibe || !num_doc_recibe) {
      return NextResponse.json(
        {
          error: 'Se requieren responsable_recibe y num_doc_recibe',
          details: 'La cédula es la llave con la que se identifica a la persona en el Core',
        },
        { status: 400 }
      );
    }

    const remision = await resolverRemision(id);
    if (!remision) {
      return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
    }

    const personaId = await buscarOCrearPersona({
      nombre: String(responsable_recibe),
      cedula: String(num_doc_recibe),
      tipo: TIPO_PERSONA.receptor,
      telefono: telefono_recibe ? String(telefono_recibe) : undefined,
      email: email_recibe ? String(email_recibe) : undefined,
    });

    if (!personaId) {
      return NextResponse.json(
        { error: 'No se pudo registrar la persona receptora en Remisiones Core' },
        { status: 502 }
      );
    }

    await vincularPersonas(remision.recordId, [personaId]);

    return NextResponse.json(
      { success: true, persona_id: personaId, codigo: remision.codigo },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en PATCH blend/remisiones/[id]/receptor:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
