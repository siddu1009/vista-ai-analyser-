import { useEffect, useRef, useCallback } from 'react';

// Declare global variables from included scripts
declare const tf: any;
// The 'yamnet' global is loaded via a script tag.

const REQUIRED_SAMPLE_RATE = 16000;
const PREDICTION_INTERVAL_MS = 1000;
const BUFFER_SIZE = 4096;
const YAMNET_LOAD_TIMEOUT = 10000; // 10 seconds

export interface AudioPrediction {
    className: string;
    score: number;
}

interface AudioClassifierProps {
    isActive: boolean;
    micId: string | null;
    confidenceThreshold: number;
    onPrediction: (prediction: AudioPrediction | null) => void;
    onError: (message: string) => void;
}

const AudioClassifier: React.FC<AudioClassifierProps> = ({ isActive, micId, confidenceThreshold, onPrediction, onError }) => {
    const modelRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const audioBufferRef = useRef<Float32Array[]>([]);
    const classificationIntervalRef = useRef<number | null>(null);
    const isClassifyingRef = useRef<boolean>(false);
    const loadModelAttempted = useRef(false);

    // Effect to load the model, polling until the YAMNet script is available.
    useEffect(() => {
        if (modelRef.current || loadModelAttempted.current) {
            return;
        }
        loadModelAttempted.current = true;

        let intervalId: number;
        let timeoutId: number;

        const tryLoadModel = async () => {
            const yamnet = (window as any).yamnet;
            if (yamnet) {
                // If the library is loaded, clear timers and load the model
                clearInterval(intervalId);
                clearTimeout(timeoutId);
                try {
                    const loadedModel = await yamnet.load();
                    modelRef.current = loadedModel;
                } catch (error) {
                    console.error("Failed to load YAMNet model:", error);
                    onError("Audio classification model failed to load. Check your network connection.");
                }
            }
        };

        // Poll every 100ms to check if the yamnet library is available
        intervalId = window.setInterval(tryLoadModel, 100);

        // Set a timeout to stop polling after a certain duration
        timeoutId = window.setTimeout(() => {
            clearInterval(intervalId);
            if (!modelRef.current) {
                console.error("YAMNet library failed to load within the timeout period.");
                onError("Audio classification library timed out. Please check your network connection or try refreshing the page.");
            }
        }, YAMNET_LOAD_TIMEOUT);

        // Cleanup function to clear timers when the component unmounts
        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
    }, [onError]);


    const classifyAudio = useCallback(async () => {
        if (isClassifyingRef.current || !modelRef.current || audioBufferRef.current.length === 0) {
            return;
        }

        isClassifyingRef.current = true;

        // Create a single flat buffer from all the chunks
        const totalLength = audioBufferRef.current.reduce((acc, val) => acc + val.length, 0);
        const concatenatedBuffer = new Float32Array(totalLength);
        let offset = 0;
        for (const buffer of audioBufferRef.current) {
            concatenatedBuffer.set(buffer, offset);
            offset += buffer.length;
        }
        audioBufferRef.current = []; // Clear the buffer

        try {
            const waveform = tf.tensor(concatenatedBuffer);
            const predictions = await modelRef.current.classify(waveform);
            waveform.dispose();
            
            const topPrediction = predictions
                .map((p: any) => ({ className: p.className, score: p.score }))
                .filter((p: AudioPrediction) => p.score > confidenceThreshold)[0];

            if (topPrediction) {
                onPrediction(topPrediction);
            } else {
                onPrediction(null);
            }

        } catch (error) {
            console.error("Error during audio classification:", error);
        } finally {
            isClassifyingRef.current = false;
        }

    }, [confidenceThreshold, onPrediction]);

    useEffect(() => {
        const cleanup = () => {
            if (classificationIntervalRef.current) {
                clearInterval(classificationIntervalRef.current);
                classificationIntervalRef.current = null;
            }
            if (processorRef.current) {
                processorRef.current.disconnect();
                processorRef.current = null;
            }
            if (streamSourceRef.current) {
                streamSourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
                streamSourceRef.current.disconnect();
                streamSourceRef.current = null;
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.warn);
                audioContextRef.current = null;
            }
            audioBufferRef.current = [];
            isClassifyingRef.current = false;
        };

        const setupAudio = async () => {
            if (!isActive || !micId || !modelRef.current) {
                cleanup();
                return;
            }

            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                    sampleRate: REQUIRED_SAMPLE_RATE,
                });

                if (audioContextRef.current.sampleRate !== REQUIRED_SAMPLE_RATE) {
                    throw new Error(`Browser does not support required sample rate of ${REQUIRED_SAMPLE_RATE}Hz.`);
                }
                
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: micId } }
                });

                streamSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
                processorRef.current = audioContextRef.current.createScriptProcessor(BUFFER_SIZE, 1, 1);
                
                processorRef.current.onaudioprocess = (event) => {
                    const inputData = event.inputBuffer.getChannelData(0);
                    // Create a copy to store, as the underlying buffer is reused
                    audioBufferRef.current.push(new Float32Array(inputData));
                };
                
                streamSourceRef.current.connect(processorRef.current);
                processorRef.current.connect(audioContextRef.current.destination);

                classificationIntervalRef.current = window.setInterval(classifyAudio, PREDICTION_INTERVAL_MS);

            } catch (error) {
                console.error("Failed to setup audio for classification:", error);
                let message = "Could not initialize audio classifier. Microphone access may have been denied."
                if (error instanceof Error) {
                    message = `Could not initialize audio classifier: ${error.message}`;
                }
                onError(message);
                cleanup();
            }
        };

        setupAudio();

        return cleanup;
    }, [isActive, micId, classifyAudio, onError]);


    return null; // This component does not render anything
};

export default AudioClassifier;