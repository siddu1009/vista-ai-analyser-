import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoFeed, { VideoFeedHandle } from './components/VideoFeed';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';
import LatestInsightPanel from './components/LatestAnalysisPanel';
import AudioEventDetectorPanel from './components/AudioEventDetectorPanel';
import ChatPanel from './components/ChatPanel';
import AccordionPanel from './components/AccordionPanel';
import { AnalysisMode, LogEntry, LogType, NarrationMode, InterruptionMode, VoiceActivationMode } from './types';
import { askJarvis, getCloudVisionAnalysis, getJarvisInterruption } from './services/geminiService';
import { Content } from "@google/genai";
import PlayIcon from './components/icons/PlayIcon';
import PauseIcon from './components/icons/PauseIcon';
import ControlsIcon from './components/icons/ControlsIcon';
import EyeIcon from './components/icons/EyeIcon';
import WaveformIcon from './components/icons/WaveformIcon';
import ChatIcon from './components/icons/ChatIcon';
import HistoryIcon from './components/icons/HistoryIcon';
import TrashIcon from './components/icons/TrashIcon';
import VoiceStatusIndicator, { VoiceStatus } from './components/VoiceStatusIndicator';

// Mock smart home device registry
const objectToEntityMap: { [key: string]: { entity_id: string; label: string; } } = {
    'tv': { entity_id: 'media_player.living_room_tv', label: 'TV' },
    'laptop': { entity_id: 'switch.office_laptop', label: 'Laptop' },
    'potted plant': { entity_id: 'light.living_room_lamp', label: 'Floor Lamp' }, // Using plant as a proxy for a lamp
    'remote': { entity_id: 'remote.living_room', label: 'Remote' },
};


const App: React.FC = () => {
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
    const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
    const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(AnalysisMode.ObjectDetection);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [chatHistory, setChatHistory] = useState<Content[]>([]);
    const [narrationMode, setNarrationMode] = useState<NarrationMode>(NarrationMode.AlertsOnly);
    const [interruptionMode, setInterruptionMode] = useState<InterruptionMode>(InterruptionMode.Off);
    const [voiceActivationMode, setVoiceActivationMode] = useState<VoiceActivationMode>(VoiceActivationMode.Off);
    const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('off');
    const [isSystemActive, setIsSystemActive] = useState<boolean>(false);
    const [isChatting, setIsChatting] = useState<boolean>(false);
    const [audioSensitivity, setAudioSensitivity] = useState(20);
    const [latestInsight, setLatestInsight] = useState<string | null>(null);
    const [detectedObjects, setDetectedObjects] = useState<string[]>([]);
    const [smartHomeState, setSmartHomeState] = useState<{ [entity_id: string]: { state: string } }>({
        'media_player.living_room_tv': { state: 'standby' },
        'switch.office_laptop': { state: 'on' },
        'light.living_room_lamp': { state: 'off' },
        'remote.living_room': { state: 'on_table' },
    });

    const videoFeedRef = useRef<VideoFeedHandle>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioProcessorRef = useRef<number | null>(null);
    const isCloudVisionRunningRef = useRef(false);
    const cloudVisionIntervalRef = useRef<number | null>(null);
    const interruptionIntervalRef = useRef<number | null>(null);
    const speechRecognitionRef = useRef<any>(null);
    
    const narrate = useCallback((message: string, level: 'Alert' | 'Full') => {
        if (narrationMode === NarrationMode.Off) return;
        if (!message) return;

        if (narrationMode === NarrationMode.Full) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message);
            window.speechSynthesis.speak(utterance);
        } else if (narrationMode === NarrationMode.AlertsOnly && level === 'Alert') {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message);
            window.speechSynthesis.speak(utterance);
        }
    }, [narrationMode]);

    const addLogEntry = useCallback((type: LogType, message: string, mode?: AnalysisMode) => {
        setLog(prevLog => [...prevLog, { id: Date.now(), timestamp: new Date(), type, message, mode }]);

        switch (type) {
            case LogType.Error:
            case LogType.System:
                narrate(message, 'Alert');
                break;
            case LogType.Analysis:
            case LogType.Audio:
            case LogType.Gesture:
            case LogType.Interruption:
                narrate(message, 'Full');
                break;
            default:
                break;
        }
    }, [narrate]);

    useEffect(() => {
        addLogEntry(LogType.System, "Jarvis is online. The VISTA sensory engine is ready to be activated.");
        setChatHistory([{
            role: 'model',
            parts: [{ text: "Hello. I am Jarvis, the reasoning layer for the VISTA system. How can I assist you?" }]
        }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const getDevices = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                const audioInputs = devices.filter(d => d.kind === 'audioinput');
                setCameras(videoInputs);
                setMicrophones(audioInputs);
                if (videoInputs.length > 0 && !selectedCameraId) setSelectedCameraId(videoInputs[0].deviceId);
                if (audioInputs.length > 0 && !selectedMicId) setSelectedMicId(audioInputs[0].deviceId);
            } catch (error) {
                console.error("Error enumerating devices:", error);
                addLogEntry(LogType.Error, "Could not access media devices. Please grant camera and microphone permissions.");
            }
        };
        getDevices();
    }, [addLogEntry, selectedCameraId, selectedMicId]);
    
    const toggleSystemActive = useCallback(() => {
        if (!selectedCameraId || !selectedMicId) {
            addLogEntry(LogType.Error, "Please select both a camera and a microphone before starting.");
            return;
        }
        
        setIsSystemActive(current => {
            const newState = !current;
            const statusMessage = `VISTA system has been ${newState ? 'activated' : 'paused'}.`;
            addLogEntry(LogType.System, statusMessage);
            if (!newState) {
                window.speechSynthesis.cancel();
            }
            return newState;
        });
    }, [selectedCameraId, selectedMicId, addLogEntry]);
    
    const handleSwitchAnalysisMode = useCallback(() => {
        const modes = Object.values(AnalysisMode);
        setAnalysisMode(currentMode => {
            const currentIndex = modes.indexOf(currentMode);
            const nextIndex = (currentIndex + 1) % modes.length;
            const nextMode = modes[nextIndex];
            addLogEntry(LogType.System, `VISTA perception mode switched to: ${nextMode}`);
            return nextMode;
        });
    }, [addLogEntry]);

    const buildVistaContext = useCallback(async () => {
        const frame = await videoFeedRef.current?.captureFrame();
        const scene_description = frame ? await getCloudVisionAnalysis(frame) : "Could not capture scene.";

        const entities_in_view = detectedObjects
            .map(obj => objectToEntityMap[obj])
            .filter(Boolean)
            .map((deviceInfo, index) => ({
                ...deviceInfo,
                state: smartHomeState[deviceInfo.entity_id]?.state || 'unknown',
                is_focused: index === 0, // Mark the first detected entity as "focused"
            }));

        return { scene_description, entities_in_view };
    }, [detectedObjects, smartHomeState]);
    
    const handleAskJarvis = useCallback(async (message: string) => {
        setIsChatting(true);
        setLatestInsight(null);

        const newUserMessage: Content = { role: 'user', parts: [{ text: message }] };
        setChatHistory(prev => [...prev, newUserMessage]);

        try {
            addLogEntry(LogType.System, "Building VISTA context...");
            const vistaContext = await buildVistaContext();
            addLogEntry(LogType.System, "Context built. Querying Jarvis...");
            
            const result = await askJarvis(message, vistaContext);

            if (result.call_home_assistant) {
                const { entity_id, service, confirmation_message } = result.call_home_assistant;
                addLogEntry(LogType.System, `Jarvis action: Control ${entity_id}, Service: ${service}`);
                
                // Simulate state change
                setSmartHomeState(prev => ({
                    ...prev,
                    [entity_id]: { ...prev[entity_id], state: service.includes('on') ? 'on' : 'off' }
                }));

                setLatestInsight(confirmation_message);
                narrate(confirmation_message, 'Alert');
                const modelResponse: Content = { role: 'model', parts: [{ text: confirmation_message }] };
                setChatHistory(prev => [...prev, modelResponse]);

            } else if (result.answer_user) {
                const { spoken_response } = result.answer_user;
                setLatestInsight(spoken_response);
                narrate(spoken_response, 'Full');
                const modelResponse: Content = { role: 'model', parts: [{ text: spoken_response }] };
                setChatHistory(prev => [...prev, modelResponse]);
            } else {
                 throw new Error("Invalid response from Jarvis.");
            }

        } catch (error) {
            console.error(error);
            const errorMessage = "Failed to get a response from Jarvis.";
            const errorResponse: Content = { role: 'model', parts: [{ text: `Error: ${errorMessage}`}]};
            setChatHistory(prev => [...prev, errorResponse]);
            setLatestInsight(`Error: ${errorMessage}`);
            narrate(`Error: ${errorMessage}`, 'Alert');
        } finally {
            setIsChatting(false);
        }
    }, [addLogEntry, buildVistaContext, narrate]);

    // Effect for Cloud Vision Analysis
    useEffect(() => {
        const runCloudVision = async () => {
            if (isCloudVisionRunningRef.current) return;
            
            try {
                isCloudVisionRunningRef.current = true;
                addLogEntry(LogType.System, "Capturing frame for cloud analysis...", AnalysisMode.CloudVision);

                const frame = await videoFeedRef.current?.captureFrame();
                if (frame) {
                    const description = await getCloudVisionAnalysis(frame);
                    addLogEntry(LogType.Analysis, description, AnalysisMode.CloudVision);
                } else {
                    addLogEntry(LogType.Error, "Failed to capture frame for analysis.", AnalysisMode.CloudVision);
                }
            } catch (error) {
                console.error("Cloud vision analysis failed:", error);
                addLogEntry(LogType.Error, "An error occurred during cloud analysis.", AnalysisMode.CloudVision);
            } finally {
                isCloudVisionRunningRef.current = false;
            }
        };

        if (isSystemActive && analysisMode === AnalysisMode.CloudVision) {
            runCloudVision(); 
            cloudVisionIntervalRef.current = window.setInterval(runCloudVision, 10000);
        }

        return () => {
            if (cloudVisionIntervalRef.current) {
                clearInterval(cloudVisionIntervalRef.current);
                cloudVisionIntervalRef.current = null;
            }
        };
    }, [isSystemActive, analysisMode, addLogEntry]);

    // Effect for Proactive Jarvis Interruptions
    useEffect(() => {
        const runInterruption = async () => {
            if (isChatting || interruptionMode === InterruptionMode.Off) {
                return;
            }
            const vistaContext = await buildVistaContext();
            const insight = await getJarvisInterruption(vistaContext, interruptionMode);
            if (insight && !insight.includes('[NO_EVENT]')) {
                addLogEntry(LogType.Interruption, insight);
            }
        };

        if (isSystemActive && interruptionMode !== InterruptionMode.Off) {
            interruptionIntervalRef.current = window.setInterval(runInterruption, 15000);
        }

        return () => {
            if (interruptionIntervalRef.current) {
                clearInterval(interruptionIntervalRef.current);
                interruptionIntervalRef.current = null;
            }
        };
    }, [isSystemActive, interruptionMode, addLogEntry, isChatting, buildVistaContext]);
    
    // Effect for Audio Event Detection
    useEffect(() => {
        const cleanup = () => {
            if (audioProcessorRef.current) {
                clearInterval(audioProcessorRef.current);
                audioProcessorRef.current = null;
            }
            if(audioStreamSourceRef.current?.mediaStream){
                audioStreamSourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
                audioStreamSourceRef.current = null;
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
                audioContextRef.current = null;
            }
        };

        if (!isSystemActive || !selectedMicId) {
            cleanup();
            return;
        }

        const setupVolumeDetection = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedMicId } } });
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                analyserRef.current = analyser;
                const source = audioContext.createMediaStreamSource(stream);
                audioStreamSourceRef.current = source;
                source.connect(analyser);

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                let silenceCounter = 0;
                let soundCounter = 0;

                audioProcessorRef.current = window.setInterval(() => {
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
                    
                    const silenceThreshold = 5;
                    const sustainedNoiseThreshold = (audioSensitivity / 100) * 50; 
                    const impulseThreshold = (audioSensitivity / 100) * 100 + 30;

                    if (average > impulseThreshold) {
                         addLogEntry(LogType.Audio, `Sudden impulse sound detected (level: ${average.toFixed(2)}).`);
                         silenceCounter = 0;
                         soundCounter = 0;
                    } else if (average > sustainedNoiseThreshold) {
                         soundCounter++;
                         silenceCounter = 0;
                         if(soundCounter === 10) { // Approx 2 seconds
                            addLogEntry(LogType.Audio, `Sustained background noise detected (level: ${average.toFixed(2)}).`);
                         }
                    } else if (average < silenceThreshold) {
                        silenceCounter++;
                        if(soundCounter > 10) {
                            addLogEntry(LogType.Audio, "Sustained background noise ended.");
                        }
                        soundCounter = 0;
                        if (silenceCounter === 25) { // Approx 5 seconds
                            addLogEntry(LogType.Audio, "Period of silence detected.");
                        }
                    } else {
                        if(silenceCounter > 25) {
                             addLogEntry(LogType.Audio, "Silence ended.");
                        }
                        if(soundCounter > 10) {
                            addLogEntry(LogType.Audio, "Sustained background noise ended.");
                        }
                        silenceCounter = 0;
                        soundCounter = 0;
                    }
                }, 200);

            } catch (err) {
                console.error('Error setting up audio:', err);
                addLogEntry(LogType.Error, "Could not access selected microphone.");
            }
        };
        setupVolumeDetection();
        
        return cleanup;
    }, [isSystemActive, selectedMicId, audioSensitivity, addLogEntry]);

    // Effect for Voice Commands (Speech Recognition)
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            if (voiceActivationMode === VoiceActivationMode.WakeWord) {
                addLogEntry(LogType.Error, "Speech recognition is not supported by this browser.");
            }
            return;
        }

        const cleanup = () => {
            if (speechRecognitionRef.current) {
                speechRecognitionRef.current.onresult = null;
                speechRecognitionRef.current.onend = null;
                speechRecognitionRef.current.onerror = null;
                speechRecognitionRef.current.onstart = null;
                speechRecognitionRef.current.stop();
                speechRecognitionRef.current = null;
            }
            setVoiceStatus('off');
        };

        if (isSystemActive && voiceActivationMode === VoiceActivationMode.WakeWord) {
            if (!speechRecognitionRef.current) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = false;
                speechRecognitionRef.current = recognition;

                recognition.onstart = () => setVoiceStatus('listening');
                
                recognition.onresult = (event: any) => {
                    const last = event.results.length - 1;
                    const transcript = event.results[last][0].transcript.trim().toLowerCase();
                    const wakeWord = 'jarvis';

                    if (transcript.startsWith(wakeWord)) {
                        const command = transcript.substring(wakeWord.length).trim();
                        if (command) {
                            addLogEntry(LogType.System, `Voice command received: "${command}"`);
                            handleAskJarvis(command);
                        }
                    }
                };

                recognition.onend = () => {
                    if (isSystemActive && voiceActivationMode === VoiceActivationMode.WakeWord) {
                        try { recognition.start(); } catch (e) { /* Already started */ }
                    } else {
                        setVoiceStatus('ready');
                    }
                };

                recognition.onerror = (event: any) => {
                    if (event.error !== 'no-speech') {
                         console.error('Speech recognition error:', event.error);
                         addLogEntry(LogType.Error, `Speech recognition error: ${event.error}`);
                    }
                };
                
                try { recognition.start(); } catch (e) {
                    console.error("Could not start speech recognition:", e);
                    addLogEntry(LogType.Error, "Could not start speech recognition.");
                }
            }
        } else {
            cleanup();
            if (voiceActivationMode !== VoiceActivationMode.Off) {
                setVoiceStatus('ready');
            }
        }

        return cleanup;
    }, [isSystemActive, voiceActivationMode, addLogEntry, handleAskJarvis]);


    const handleStreamError = useCallback((message: string) => {
        addLogEntry(LogType.Error, message);
        setIsSystemActive(false);
    }, [addLogEntry]);

    const latestAudioLog = [...log].reverse().find(l => l.type === LogType.Audio);
    const derivedVoiceStatus: VoiceStatus = isChatting ? 'processing' : voiceStatus;

    return (
        <div className="min-h-screen bg-vista-dark flex flex-col p-4 gap-4 font-sans">
            <header className="flex justify-between items-center text-vista-text pb-2 border-b-2 border-vista-light-gray flex-shrink-0">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold">VISTA <span className="text-vista-accent font-light hidden md:inline">| Vision Intelligence Scene Translator & Analyzer</span></h1>
                    <VoiceStatusIndicator status={derivedVoiceStatus} />
                </div>
                 <button 
                    onClick={() => toggleSystemActive()}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-300 ${isSystemActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white shadow-lg`}
                >
                    {isSystemActive ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                    <span>{isSystemActive ? 'PAUSE' : 'START'}</span>
                </button>
            </header>
            <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
                <div className="lg:col-span-2 min-h-0">
                     <VideoFeed
                        ref={videoFeedRef}
                        selectedCameraId={selectedCameraId}
                        isSystemActive={isSystemActive}
                        onStreamError={handleStreamError}
                        analysisMode={analysisMode}
                        onClientDetection={(type, msg) => addLogEntry(type, msg, analysisMode)}
                        onToggleSystemActive={toggleSystemActive}
                        onSwitchAnalysisMode={handleSwitchAnalysisMode}
                        onObjectsDetected={setDetectedObjects}
                    />
                </div>
                <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto min-h-0 pr-2">
                    <AccordionPanel title="Controls" icon={<ControlsIcon className="w-6 h-6" />} defaultOpen={true}>
                        <ControlPanel
                            cameras={cameras}
                            microphones={microphones}
                            selectedCameraId={selectedCameraId}
                            selectedMicId={selectedMicId}
                            onCameraChange={setSelectedCameraId}
                            onMicChange={setSelectedMicId}
                            analysisMode={analysisMode}
                            onModeChange={setAnalysisMode}
                            audioSensitivity={audioSensitivity}
                            onAudioSensitivityChange={setAudioSensitivity}
                            narrationMode={narrationMode}
                            onNarrationModeChange={setNarrationMode}
                            interruptionMode={interruptionMode}
                            onInterruptionModeChange={setInterruptionMode}
                            voiceActivationMode={voiceActivationMode}
                            onVoiceActivationModeChange={setVoiceActivationMode}
                        />
                    </AccordionPanel>
                    <AccordionPanel title="Jarvis Console" icon={<ChatIcon className="w-6 h-6" />} defaultOpen={true}>
                        <ChatPanel 
                            onSendMessage={handleAskJarvis} 
                            isSending={isChatting}
                            history={chatHistory}
                            analysisMode={analysisMode}
                        />
                    </AccordionPanel>
                     <AccordionPanel title="Jarvis's Response" icon={<EyeIcon className="w-6 h-6" />}>
                        <LatestInsightPanel 
                            latestInsight={latestInsight}
                            isResponding={isChatting}
                        />
                    </AccordionPanel>
                     <AccordionPanel title="Audio Events" icon={<WaveformIcon className="w-6 h-6" />}>
                        <AudioEventDetectorPanel
                            isAudioActive={isSystemActive && !!selectedMicId}
                            latestAudioEvent={latestAudioLog}
                        />
                    </AccordionPanel>
                    <AccordionPanel title="VISTA Scene Log" icon={<HistoryIcon className="w-6 h-6" />}>
                        <div className="flex justify-between items-center mb-2">
                             <p className="text-xs text-vista-text-muted">A real-time log from the VISTA sensory engine.</p>
                            <button 
                                onClick={() => {
                                    setLog([]);
                                    addLogEntry(LogType.System, "Log cleared.");
                                }} 
                                className="p-2 text-vista-text-muted hover:text-white transition-colors" 
                                aria-label="Clear Log"
                            >
                                <TrashIcon className="w-5 h-5"/>
                            </button>
                        </div>
                        <LogPanel 
                            logs={log}
                        />
                    </AccordionPanel>
                </div>
            </main>
        </div>
    );
}

export default App;