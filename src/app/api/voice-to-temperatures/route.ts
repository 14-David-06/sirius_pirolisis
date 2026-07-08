import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ 
        success: false, 
        error: 'Configuración de OpenAI API faltante' 
      }, { status: 500 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({
        success: false,
        error: 'No se proporcionó archivo de audio'
      }, { status: 400 });
    }

    console.log('🎤 Procesando archivo de audio:', {
      name: audioFile.name,
      size: audioFile.size,
      type: audioFile.type,
      timestamp: new Date().toISOString()
    });

    // Transcribir el audio usando Whisper de OpenAI
    const transcriptionFormData = new FormData();
    transcriptionFormData.append('file', audioFile);
    transcriptionFormData.append('model', 'whisper-1');
    transcriptionFormData.append('language', 'es');
    transcriptionFormData.append('prompt', 'Temperaturas de reactores R1, R2, R3 y hornos H1, H2, H3, H4, ducto G9 en grados celsius');

    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: transcriptionFormData,
    });

    if (!transcriptionResponse.ok) {
      const errorData = await transcriptionResponse.text();
      console.error('❌ Error en transcripción:', transcriptionResponse.status, errorData);
      return NextResponse.json({ 
        success: false, 
        error: 'Error al transcribir el audio' 
      }, { status: 500 });
    }

    const transcriptionResult = await transcriptionResponse.json();
    const transcript = transcriptionResult.text;
    
    console.log('📝 Transcripción:', transcript);

    // Procesar la transcripción para extraer temperaturas usando GPT
    const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Eres un asistente especializado en extraer temperaturas de equipos de pirólisis.
Tu respuesta DEBE ser un objeto JSON válido. NO incluyas explicaciones, solo el JSON.

Extrae las temperaturas para estos equipos (usa solo si se mencionan):
- Reactor R1, R2, R3 → claves: temperaturaR1, temperaturaR2, temperaturaR3
- Horno H1, H2, H3, H4 → claves: temperaturaH1, temperaturaH2, temperaturaH3, temperaturaH4
- Ducto G9 → clave: temperaturaG9

Si un equipo no se menciona, NO lo incluyas en el JSON.
Los valores deben ser números decimales.

Formato de salida esperado:
{
  "temperaturaR1": 399.5,
  "temperaturaR2": 412.0,
  "temperaturaR3": 413.2,
  "temperaturaH1": 321.0
}`
          },
          {
            role: 'user',
            content: `Texto transcrito: "${transcript}"\n\nExtrae las temperaturas en formato JSON.`
          }
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!completionResponse.ok) {
      const errorData = await completionResponse.text();
      console.error('❌ Error en GPT:', completionResponse.status, errorData);
      return NextResponse.json({ 
        success: false, 
        error: 'Error al procesar la transcripción' 
      }, { status: 500 });
    }

    const completionResult = await completionResponse.json();
    const gptResponse = completionResult.choices[0].message.content;

    console.log('🤖 Respuesta de GPT:', gptResponse);

    try {
      // Intentar parsear la respuesta JSON
      let temperaturas;

      // Limpiar respuesta si GPT agregó markdown o texto extra
      const cleanedResponse = gptResponse.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      try {
        temperaturas = JSON.parse(cleanedResponse);
      } catch (firstParseError) {
        // Intentar extraer JSON del texto si está mezclado
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          temperaturas = JSON.parse(jsonMatch[0]);
        } else {
          throw firstParseError;
        }
      }

      // Validar que se extrajo al menos una temperatura
      if (!temperaturas || typeof temperaturas !== 'object' || Object.keys(temperaturas).length === 0) {
        throw new Error('No se pudo extraer ninguna temperatura válida');
      }

      console.log('✅ Temperaturas extraídas:', temperaturas);

      return NextResponse.json({
        success: true,
        transcript,
        temperaturas,
        message: 'Audio procesado exitosamente'
      });

    } catch (parseError) {
      console.error('❌ Error parseando JSON de GPT:', parseError);
      console.error('📄 Respuesta completa:', gptResponse);

      return NextResponse.json({
        success: false,
        error: 'No se pudo extraer temperaturas del audio. Por favor, dicte de nuevo más claramente.',
        transcript,
        rawResponse: gptResponse.substring(0, 200), // Solo primeros 200 chars para debugging
        hint: 'Intente decir: "Reactor R1: 399 grados, Reactor R2: 412 grados"'
      }, { status: 422 });
    }

  } catch (error) {
    console.error('❌ Error en /api/voice-to-temperatures:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno del servidor' 
    }, { status: 500 });
  }
}
