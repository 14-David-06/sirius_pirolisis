"use client";

import { useState, useRef } from 'react';

interface VoiceRecorderProps {
  onTemperaturesExtracted: (temperatures: any) => void;
  isLoading?: boolean;
}

export default function VoiceRecorder({ onTemperaturesExtracted, isLoading }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileExtensionRef = useRef<string>('webm');

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

      // Detectar formato de audio soportado (iOS Safari requiere MP4/AAC)
      let mimeType = 'audio/webm;codecs=opus';
      fileExtensionRef.current = 'webm';

      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
        fileExtensionRef.current = 'mp4';
      } else if (MediaRecorder.isTypeSupported('audio/aac')) {
        mimeType = 'audio/aac';
        fileExtensionRef.current = 'aac';
      } else if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback: dejar que el navegador elija el formato por defecto
        mimeType = '';
        fileExtensionRef.current = 'webm';
      }

      console.log('🎤 Formato de audio detectado:', mimeType || 'default');

      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        await processAudio(audioBlob, fileExtensionRef.current);

        // Detener todas las pistas del stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setMensaje('🎤 Grabando... Diga las temperaturas de los equipos');
      setTranscript('');
      
    } catch (error) {
      console.error('Error al acceder al micrófono:', error);
      setMensaje('❌ Error al acceder al micrófono. Verifique los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      setMensaje('🔄 Procesando audio...');
    }
  };

  const processAudio = async (audioBlob: Blob, extension: string) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `recording.${extension}`);

      const response = await fetch('/api/voice-to-temperatures', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setMensaje('✅ Temperaturas procesadas correctamente');
        setTranscript(result.transcript);
        onTemperaturesExtracted(result.temperaturas);
      } else {
        setMensaje(`❌ Error: ${result.error}`);
        if (result.transcript) {
          setTranscript(`Transcripción: "${result.transcript}"`);
        }
      }
    } catch (error) {
      console.error('Error procesando audio:', error);
      setMensaje('❌ Error al procesar el audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
        🎤 Dictado de Temperaturas
      </h2>
      
      <div className="space-y-4">
        <div className="text-center">
          <button
            onClick={handleClick}
            disabled={isProcessing || isLoading}
            className={`px-8 py-4 rounded-full font-semibold text-white transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isRecording ? (
              <>
                <span className="text-2xl mr-2">🛑</span>
                Detener Grabación
              </>
            ) : isProcessing ? (
              <>
                <span className="text-2xl mr-2">🔄</span>
                Procesando...
              </>
            ) : (
              <>
                <span className="text-2xl mr-2">🎤</span>
                Iniciar Dictado
              </>
            )}
          </button>
        </div>

        {mensaje && (
          <div className={`p-4 rounded-lg text-center font-medium backdrop-blur-sm ${
            mensaje.includes('✅') 
              ? 'bg-green-500/80 text-white border border-green-400/50' 
              : mensaje.includes('❌')
              ? 'bg-red-500/80 text-white border border-red-400/50'
              : 'bg-blue-500/80 text-white border border-blue-400/50'
          }`}>
            {mensaje}
          </div>
        )}

        {transcript && (
          <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600/50">
            <h4 className="text-sm font-medium text-white/90 mb-2">📝 Transcripción:</h4>
            <p className="text-white/80 text-sm italic">"{transcript}"</p>
          </div>
        )}

        <div className="bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-white mb-2">💡 Instrucciones:</h4>
          <ul className="text-white/80 text-sm space-y-1">
            <li>• Hable claro y despacio</li>
            <li>• Mencione cada equipo con su temperatura</li>
            <li>• Ejemplo: "Reactor R1: 399 grados, R2: 412 grados, Horno H1: 321 grados"</li>
            <li>• Los valores se pueden editar después si es necesario</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
