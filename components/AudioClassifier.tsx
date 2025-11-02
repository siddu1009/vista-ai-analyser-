import React, { useEffect, useRef } from 'react';

interface AudioClassifierProps {
  isActive: boolean;
  deviceId: string;
  onAudioEvent: (event: string) => void;
}

const AudioClassifier: React.FC<AudioClassifierProps> = ({ isActive, deviceId, onAudioEvent }) => {
  const modelRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Float32Array | null>(null);
  const intervalIdRef = useRef<number | null>(null);
  const lastEventRef = useRef<{ event: string, time: number }>({ event: '', time: 0 });

  useEffect(() => {
    const loadModel = () => {
      if ((window as any).yamnet) {
        (window as any).yamnet.load()
          .then((loadedModel: any) => {
            modelRef.current = loadedModel;
          })
          .catch((error: any) => {
            console.error("Failed to load YAMNet model:", error);
          });
      } else {
        // If the model isn't loaded yet, try again shortly
        setTimeout(loadModel, 500);
      }
    };
    loadModel();
    
    // FIX: Add cleanup to dispose of the YAMNet model on unmount to prevent memory leaks.
    return () => {
      if (modelRef.current && typeof modelRef.current.dispose === 'function') {
        modelRef.current.dispose();
        modelRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const startAudioProcessing = async () => {
      if (!modelRef.current || !deviceId) return;

      try {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          await audioContextRef.current.close();
        }
        // YAMNet model expects audio at a 16kHz sample rate.
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 16000,
        });
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
        analyserRef.current = audioContextRef.current.createAnalyser();
        source.connect(analyserRef.current);
        dataArrayRef.current = new Float32Array(analyserRef.current.fftSize);

        intervalIdRef.current = window.setInterval(async () => {
          if (analyserRef.current && dataArrayRef.current && audioContextRef.current && modelRef.current && (window as any).tf) {
            analyserRef.current.getFloatTimeDomainData(dataArrayRef.current);
            
            // FIX: Manually create and dispose of audio tensor to prevent memory leaks.
            const tf = (window as any).tf;
            const audioTensor = tf.tensor(dataArrayRef.current);
            const scores = await modelRef.current.classify(audioTensor);
            audioTensor.dispose(); // IMPORTANT: Release tensor memory

            if (scores && scores.length > 0) {
              const mostLikely = scores.reduce((prev: any, current: any) => (prev.score > current.score) ? prev : current);
              
              const now = Date.now();
              // Debounce similar events for 3 seconds
              if (mostLikely.className !== lastEventRef.current.event || now - lastEventRef.current.time > 3000) {
                onAudioEvent(mostLikely.className);
                lastEventRef.current = { event: mostLikely.className, time: now };
              }
            }
          }
        }, 1000);

      } catch (error) {
        console.error("Error setting up audio processing:", error);
      }
    };

    const stopAudioProcessing = () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.error("Error closing AudioContext", e));
        audioContextRef.current = null;
      }
    };

    if (isActive && deviceId) {
      startAudioProcessing();
    } else {
      stopAudioProcessing();
    }

    return () => stopAudioProcessing();
  }, [isActive, deviceId, onAudioEvent]);

  return null; // This is a non-rendering component
};

export default AudioClassifier;