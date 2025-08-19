"use client";

import { useState, useRef } from 'react';

interface BitacoraVoiceRecorderProps {
  onEventExtracted: (eventData: { evento: string; descripcion: string }) => void;
  isLoading?: boolean;
}

export default function BitacoraVoiceRecorder({ onEventExtracted, isLoading }: BitacoraVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        
        // Detener todas las pistas del stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setMensaje('🎤 Grabando... Describe el evento completo con fechas, horas y detalles');
      setTranscript('');
    } catch (error) {
      console.error('Error al acceder al micrófono:', error);
      setMensaje('❌ Error al acceder al micrófono');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setMensaje('🔄 Procesando audio...');
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      console.log('📤 Enviando audio para procesamiento de bitácora...');

      const response = await fetch('/api/voice-to-bitacora', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setTranscript(result.transcript);
        setMensaje(`✅ Audio procesado correctamente`);
        
        // Llamar al callback con los datos extraídos
        if (result.eventData) {
          onEventExtracted(result.eventData);
        }
      } else {
        setMensaje(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error al procesar audio:', error);
      setMensaje('❌ Error al procesar el audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const limpiarTranscripcion = () => {
    setTranscript('');
    setMensaje('');
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
        🎤 Dictado de Evento
      </h2>
      
      <div className="space-y-4">
        <div className="text-center">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || isProcessing}
            className={`px-8 py-4 rounded-lg font-semibold backdrop-blur-sm drop-shadow-lg transition-all duration-200 flex items-center justify-center gap-3 mx-auto ${
              isRecording
                ? 'bg-red-500/80 hover:bg-red-600/80 text-white border-2 border-red-400/60 animate-pulse'
                : 'bg-blue-500/80 hover:bg-blue-600/80 text-white border-2 border-blue-400/60'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isRecording ? (
              <>
                <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
                🛑 Detener Grabación
              </>
            ) : isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Procesando...
              </>
            ) : (
              <>
                🎤 Iniciar Dictado
              </>
            )}
          </button>
        </div>

        {mensaje && (
          <div className={`p-4 rounded-lg text-center font-semibold backdrop-blur-sm border ${
            mensaje.includes('✅') 
              ? 'bg-green-500/20 text-white border-green-400/50' 
              : mensaje.includes('❌')
              ? 'bg-red-500/20 text-white border-red-400/50'
              : 'bg-blue-500/20 text-white border-blue-400/50'
          }`}>
            {mensaje}
          </div>
        )}

        {transcript && (
          <div className="bg-white/20 border border-white/30 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-white drop-shadow">📝 Transcripción:</h3>
              <button
                type="button"
                onClick={limpiarTranscripcion}
                className="text-xs text-white/80 hover:text-white underline"
              >
                Limpiar
              </button>
            </div>
            <p className="text-white/90 text-sm leading-relaxed break-words">
              {transcript}
            </p>
          </div>
        )}

        <div className="bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-2 drop-shadow">💡 Instrucciones:</h3>
          <ul className="text-white/90 text-sm space-y-1">
            <li>• Menciona la fecha y hora del evento</li>
            <li>• Describe qué está pasando o qué se está haciendo</li>
            <li>• Incluye ubicación y equipos involucrados</li>
            <li>• Detalla causas, efectos y acciones tomadas</li>
            <li>• Habla claro y pausado para mejor transcripción</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
