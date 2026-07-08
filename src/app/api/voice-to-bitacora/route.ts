import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    console.log('🎤 Iniciando procesamiento de audio para bitácora...');

    // Obtener el archivo de audio del FormData
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ 
        success: false, 
        error: 'No se encontró archivo de audio' 
      });
    }

    console.log('📁 Archivo de audio recibido:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size
    });

    // Transcribir el audio usando Whisper
    console.log('🔄 Transcribiendo audio con Whisper...');
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "es",
      prompt: "Este es un dictado para registrar eventos de bitácora en una planta de pirólisis. El usuario mencionará fechas, horas, eventos, descripción de lo que está pasando, equipos involucrados, y detalles del proceso industrial."
    });

    const transcriptText = transcription.text;
    console.log('📝 Transcripción obtenida:', transcriptText);

    // Usar GPT-4 para extraer nombre del evento y descripción
    console.log('🤖 Procesando con GPT-4 para extraer datos del evento...');
    
    const extractionPrompt = `
Analiza la siguiente transcripción de un dictado sobre un evento en una planta de pirólisis y extrae la información en el formato JSON solicitado.

TRANSCRIPCIÓN:
"${transcriptText}"

Tu tarea es extraer:
1. NOMBRE DEL EVENTO: Un título corto y descriptivo (máximo 50 caracteres)
2. DESCRIPCIÓN DETALLADA: Una descripción completa con todos los detalles mencionados

INSTRUCCIONES:
- Para el nombre del evento, identifica la acción principal o problema central
- Para la descripción, incluye TODOS los detalles: fechas, horas, ubicación, equipos, causas, efectos, acciones
- Mantén el formato técnico y profesional
- Si se mencionan fechas/horas, inclúyelas en la descripción
- Si no hay información suficiente, usa la transcripción completa como descripción

RESPONDE SOLO CON UN JSON EN ESTE FORMATO:
{
  "evento": "Título corto del evento",
  "descripcion": "Descripción detallada completa con todos los datos mencionados"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: 'json_object' },
      messages: [
        {
          role: "system",
          content: "Eres un asistente especializado en documentación industrial. Extrae información de eventos de bitácora de plantas de pirólisis. Tu respuesta DEBE ser un objeto JSON válido, sin texto adicional."
        },
        {
          role: "user",
          content: extractionPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const gptResponse = completion.choices[0]?.message?.content;
    console.log('🤖 Respuesta de GPT-4:', gptResponse);

    if (!gptResponse) {
      throw new Error('No se obtuvo respuesta de GPT-4');
    }

    // Parsear la respuesta JSON
    let eventData;
    try {
      // Limpiar respuesta si GPT agregó markdown o texto extra
      const cleanedResponse = gptResponse.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      try {
        eventData = JSON.parse(cleanedResponse);
      } catch (firstParseError) {
        // Intentar extraer JSON del texto si está mezclado
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          eventData = JSON.parse(jsonMatch[0]);
        } else {
          throw firstParseError;
        }
      }
    } catch (parseError) {
      console.error('❌ Error parseando JSON de GPT-4:', parseError);
      console.error('📄 Respuesta completa:', gptResponse);
      // Fallback: usar transcripción completa
      eventData = {
        evento: "Evento registrado por voz",
        descripcion: transcriptText
      };
    }

    console.log('✅ Datos del evento extraídos:', eventData);

    return NextResponse.json({
      success: true,
      transcript: transcriptText,
      eventData: eventData,
      message: 'Audio procesado y datos extraídos correctamente'
    });

  } catch (error) {
    console.error('❌ Error en voice-to-bitacora:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}
