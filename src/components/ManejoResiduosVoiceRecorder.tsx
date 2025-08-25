"use client";

import { useState, useRef } from 'react';

interface ManejoResiduosData {
  cantidadAprovechables?: string;
  cantidadPeligrosos?: string;
  cantidadNoAprovechables?: string;
  cantidadOrganicos?: string;
  entregadoA?: string;
  observaciones?: string;
}

interface ManejoResiduosVoiceRecorderProps {
  onDataExtracted: (data: ManejoResiduosData) => void;
  isLoading?: boolean;
}

export default function ManejoResiduosVoiceRecorder({ onDataExtracted, isLoading }: ManejoResiduosVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const instrucciones = `
    🎙️ Instrucciones para el registro por voz:
    
    Diga claramente los siguientes campos en orden:
    1. "Aprovechables [número] kilos" para residuos aprovechables
    2. "Peligrosos [número] kilos" para residuos peligrosos
    3. "No aprovechables [número] kilos" para no aprovechables
    4. "Orgánicos [número] kilos" para residuos orgánicos
    5. "Entregado a [nombre]" para especificar el destinatario
    6. "Observaciones: [texto]" para agregar comentarios

    Ejemplo:
    "Aprovechables 12.5 kilos, peligrosos 3 kilos, no aprovechables 2 kilos, 
    orgánicos 5 kilos, entregado a Empresa XYZ, observaciones: residuos separados correctamente"
  `;

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
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setMensaje('🎤 Grabando... Por favor siga las instrucciones anteriores');
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

  const processAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/voice-to-residuos', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setMensaje('✅ Audio procesado correctamente');
        setTranscript(result.transcript);
        onDataExtracted(result.data);
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

  return (
    <div className="w-full bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
        🎙️ Registro por Voz
      </h2>

      <div className="space-y-4">
        <pre className="whitespace-pre-wrap text-sm text-white/90 bg-black/30 p-4 rounded-lg">
          {instrucciones}
        </pre>

        <div className="flex justify-center">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || isProcessing}
            className={`px-6 py-3 rounded-lg font-semibold shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white disabled:opacity-50 disabled:transform-none`}
          >
            {isRecording ? (
              <>
                <span>⏹️ Detener Grabación</span>
              </>
            ) : (
              <>
                <span>🎤 Iniciar Grabación</span>
              </>
            )}
          </button>
        </div>

        {mensaje && (
          <div className={`p-4 rounded-lg text-white text-center ${
            mensaje.includes('❌') ? 'bg-red-500/50' : 'bg-green-500/50'
          }`}>
            {mensaje}
          </div>
        )}

        {transcript && (
          <div className="bg-black/30 p-4 rounded-lg">
            <p className="text-white/90 text-sm">
              {transcript}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
