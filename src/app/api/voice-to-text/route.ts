import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    console.log('🎤 Iniciando transcripción de audio...');

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
      prompt: "Este es un dictado para describir un mantenimiento en una planta de pirólisis. El usuario describirá qué mantenimiento se necesita realizar."
    });

    const transcriptText = transcription.text;
    console.log('📝 Transcripción obtenida:', transcriptText);

    return NextResponse.json({
      success: true,
      transcript: transcriptText
    });

  } catch (error) {
    console.error('❌ Error en la transcripción:', error);
    return NextResponse.json({
      success: false,
      error: 'Error al procesar el audio'
    }, { status: 500 });
  }
}