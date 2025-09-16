import { NextRequest, NextResponse } from 'next/server';

// Verificar y obtener variables de entorno requeridas
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// IDs de campos en Airtable (deben coincidir con las variables de entorno)
const FIELD_IDS = {
  APROVECHABLES: process.env.FIELD_ID_APROVECHABLES as string,
  PELIGROSOS: process.env.FIELD_ID_PELIGROSOS as string,
  NO_APROVECHABLES: process.env.FIELD_ID_NO_APROVECHABLES as string,
  ORGANICOS: process.env.FIELD_ID_ORGANICOS as string,
  ENTREGADO_A: process.env.FIELD_ID_ENTREGADO_A as string,
  OBSERVACIONES: process.env.FIELD_ID_OBSERVACIONES as string,
};

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ 
        success: false, 
        error: 'Configuración de OpenAI API faltante' 
      }, { status: 500 });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as Blob;

    if (!audioFile) {
      return NextResponse.json({ 
        success: false, 
        error: 'No se encontró el archivo de audio' 
      }, { status: 400 });
    }

    console.log('🎤 Procesando archivo de audio:', audioFile.size, 'bytes');

    // Transcribir el audio usando Whisper de OpenAI
    const transcriptionFormData = new FormData();
    transcriptionFormData.append('file', audioFile);
    transcriptionFormData.append('model', 'whisper-1');
    transcriptionFormData.append('language', 'es');
    transcriptionFormData.append('prompt', 'Reporte de manejo de residuos incluyendo cantidades en kilos de residuos aprovechables, peligrosos, no aprovechables y orgánicos, información de entrega y observaciones');

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

    // Procesar la transcripción para extraer información usando GPT
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
            content: `Eres un asistente especializado en extraer información sobre manejo de residuos.
            Analiza el texto transcrito y extrae la siguiente información:
            
            Campos requeridos (todos los valores numéricos deben ser números, no texto):
            - subtiposAprovechables: array de objetos con subtipo y cantidad para residuos aprovechables
            - subtiposOrganicos: array de objetos con subtipo y cantidad para residuos orgánicos
            - subtiposPeligrosos: array de objetos con subtipo y cantidad para residuos peligrosos
            - subtiposNoAprovechables: array de objetos con subtipo y cantidad para residuos no aprovechables
            
            Campos opcionales:
            - entregadoA: nombre de la empresa o entidad a la que se entregaron los residuos
            - observaciones: cualquier observación o comentario adicional
            
            Responde ÚNICAMENTE con un objeto JSON válido con los valores encontrados.
            Si no encuentras un valor para un campo opcional, no lo incluyas en la respuesta.
            
            Ejemplo de respuesta:
            {
              "subtiposAprovechables": [
                {"subtipo": "Papel", "cantidad": 2},
                {"subtipo": "Cartón", "cantidad": 3}
              ],
              "subtiposOrganicos": [
                {"subtipo": "Restos de comida", "cantidad": 4}
              ],
              "entregadoA": "Empresa XYZ",
              "observaciones": "residuos separados correctamente"
            }`
          },
          {
            role: 'user',
            content: `Extrae la información de manejo de residuos del siguiente texto: "${transcript}"`
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
    const extractedData = JSON.parse(completionResult.choices[0].message.content);

    // Verificar que todos los field IDs requeridos estén presentes
    if (!Object.values(FIELD_IDS).every(id => id)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Faltan IDs de campos en la configuración' 
      }, { status: 500 });
    }

    // Devolver los datos en el formato que espera el formulario
    const formattedData = {
      subtiposAprovechables: extractedData.subtiposAprovechables || [],
      subtiposOrganicos: extractedData.subtiposOrganicos || [],
      subtiposPeligrosos: extractedData.subtiposPeligrosos || [],
      subtiposNoAprovechables: extractedData.subtiposNoAprovechables || [],
      entregadoA: extractedData.entregadoA || '',
      observaciones: extractedData.observaciones || ''
    };

    console.log('📝 Datos extraídos:', formattedData);

    return NextResponse.json({
      success: true,
      transcript,
      data: formattedData
    });

  } catch (error: any) {
    console.error('Error procesando audio:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Error procesando el audio'
    }, { status: 500 });
  }
}

// Typing auxiliar para TypeScript

