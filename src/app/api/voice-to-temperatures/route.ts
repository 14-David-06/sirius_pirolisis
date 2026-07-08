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
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Eres un asistente especializado en extraer datos de temperaturas de equipos de pirólisis. 
            Analiza el texto transcrito y extrae ÚNICAMENTE los valores numéricos de temperatura para cada equipo.
            
            Equipos disponibles:
            - Reactor R1, R2, R3 (requeridos)
            - Horno H1, H2, H3, H4 (opcionales)
            - Ducto G9 (opcional)
            
            Responde ÚNICAMENTE con un objeto JSON válido con los valores encontrados. 
            Si no encuentras un valor para un equipo, no lo incluyas en la respuesta.
            Los valores deben ser números (sin texto adicional).
            
            Ejemplo de respuesta:
            {
              "temperaturaR1": 399.5,
              "temperaturaR2": 412.0,
              "temperaturaR3": 413.2,
              "temperaturaH1": 321.0,
              "temperaturaH2": 820.5
            }`
          },
          {
            role: 'user',
            content: `Extrae las temperaturas del siguiente texto: "${transcript}"`
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
      const temperaturas = JSON.parse(gptResponse);
      
      console.log('✅ Temperaturas extraídas:', temperaturas);

      return NextResponse.json({ 
        success: true, 
        transcript,
        temperaturas,
        message: 'Audio procesado exitosamente'
      });

    } catch (parseError) {
      console.error('❌ Error parseando JSON de GPT:', parseError);
      return NextResponse.json({ 
        success: false, 
        error: 'Error al interpretar las temperaturas del audio',
        transcript,
        rawResponse: gptResponse
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
