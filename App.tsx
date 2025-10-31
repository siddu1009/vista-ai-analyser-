import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoFeed, { VideoFeedHandle } from './components/VideoFeed';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';
import LatestInsightPanel from './components/LatestAnalysisPanel';
import AudioEventDetectorPanel from './components/AudioEventDetectorPanel';
import ChatPanel from './components/ChatPanel';
import AccordionPanel from './components/AccordionPanel';
import AudioClassifier, { AudioPrediction } from './components/AudioClassifier';
import { AnalysisMode, LogEntry, LogType, NarrationMode, InterruptionMode, VoiceActivationMode, VoiceStatus } from './types';
import { askJarvis, getCloudVisionAnalysis, getJarvisInterruption } from './services/geminiService';
import { Content } from "@google/genai";
import PlayIcon from './components/icons/PlayIcon';
import PauseIcon from './components/icons/PauseIcon';
import ControlsIcon from './components/icons/ControlsIcon';
import WaveformIcon from './components/icons/WaveformIcon';
import ChatIcon from './components/icons/ChatIcon';
import HistoryIcon from './components/icons/HistoryIcon';
import TrashIcon from './components/icons/TrashIcon';
import VoiceStatusIndicator from './components/VoiceStatusIndicator';

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
    const [isAwake, setIsAwake] = useState(false); // For wake word state
    const [audioConfidence, setAudioConfidence] = useState(60);
    const [latestInsight, setLatestInsight] = useState<string | null>(null);
    const [latestAudioEvent, setLatestAudioEvent] = useState<AudioPrediction | null>(null);
    const [detectedObjects, setDetectedObjects] = useState<string[]>([]);
    const [reconnectDelay, setReconnectDelay] = useState<number | null>(null);
    const [smartHomeState, setSmartHomeState] = useState<{ [entity_id: string]: { state: string } }>({
        'media_player.living_room_tv': { state: 'standby' },
        'switch.office_laptop': { state: 'on' },
        'light.living_room_lamp': { state: 'off' },
        'remote.living_room': { state: 'on_table' },
    });

    const videoFeedRef = useRef<VideoFeedHandle>(null);
    const isCloudVisionRunningRef = useRef(false);
    const cloudVisionIntervalRef = useRef<number | null>(null);
    const interruptionIntervalRef = useRef<number | null>(null);
    const speechRecognitionRef = useRef<any>(null);
    const lastReportedSoundRef = useRef<{ class: string | null, time: number }>({ class: null, time: 0 });
    const hadRecognitionErrorRef = useRef(false);
    const recognitionRestartTimeoutRef = useRef<number | null>(null);
    const recognitionRetryDelayRef = useRef(5000); // Start with 5s for the first retry
    const recognitionStabilityTimerRef = useRef<number | null>(null);
    const MAX_RECOGNITION_RETRY_DELAY = 30000; // Max 30 seconds

    // Refs to hold latest state for callbacks to prevent stale closures
    const isSystemActiveRef = useRef(isSystemActive);
    useEffect(() => { isSystemActiveRef.current = isSystemActive; }, [isSystemActive]);
    
    const voiceActivationModeRef = useRef(voiceActivationMode);
    useEffect(() => { voiceActivationModeRef.current = voiceActivationMode; }, [voiceActivationMode]);

    const isAwakeRef = useRef(isAwake);
    useEffect(() => { isAwakeRef.current = isAwake; }, [isAwake]);
    
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
    
    const handleAudioPrediction = useCallback((prediction: AudioPrediction | null) => {
        if (!prediction) return;
        
        setLatestAudioEvent(prediction);

        const now = Date.now();
        const lastSound = lastReportedSoundRef.current;
        const isSameSound = lastSound.class === prediction.className;
        const isWithinCooldown = (now - lastSound.time) < 10000; // 10 second cooldown

        if (isSameSound && isWithinCooldown) {
            return; // Debounce same sound
        }

        const message = `Audio event: ${prediction.className} (${Math.round(prediction.score * 100)}% confidence)`;
        addLogEntry(LogType.Audio, message);
        lastReportedSoundRef.current = { class: prediction.className, time: now };
    }, [addLogEntry]);


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
        let visionAnalysis;
        try {
            const frame = await videoFeedRef.current?.captureFrame();
            visionAnalysis = frame 
                ? await getCloudVisionAnalysis(frame) 
                : { scene_description: "Could not capture video frame.", visible_text: [] };
        } catch (error) {
            console.warn("Could not capture frame for context:", error);
            // Provide a specific, user-friendly description for Jarvis to use.
            visionAnalysis = { scene_description: "The camera appears to be initializing or is obscured, as the current view is black.", visible_text: [] };
        }

        const entities_in_view = detectedObjects
            .map(obj => objectToEntityMap[obj])
            .filter(Boolean)
            .map((deviceInfo, index) => ({
                ...deviceInfo,
                state: smartHomeState[deviceInfo.entity_id]?.state || 'unknown',
                is_focused: index === 0, // Mark the first detected entity as "focused"
            }));

        const audio_context = latestAudioEvent
            ? `The system is currently detecting the sound of '${latestAudioEvent.className}'.`
            : 'The audio environment appears to be quiet.';

        return {
            scene_description: visionAnalysis.scene_description,
            visible_text: visionAnalysis.visible_text,
            entities_in_view,
            audio_context,
        };
    }, [detectedObjects, smartHomeState, latestAudioEvent]);
    
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

            if (result.recognize_song) {
                addLogEntry(LogType.System, `Jarvis action: Attempting to recognize song...`);
                // This is a mocked response as we don't have a real song recognition service.
                const confirmation_message = "I'm listening, but my song recognition capabilities are still in development. I am unable to identify the track at this time.";
                setLatestInsight(confirmation_message);
                narrate(confirmation_message, 'Full');
                const modelResponse: Content = { role: 'model', parts: [{ text: confirmation_message }] };
                setChatHistory(prev => [...prev, modelResponse]);

            } else if (result.call_home_assistant) {
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
                    const { scene_description, visible_text } = await getCloudVisionAnalysis(frame);
                    let fullLogMessage = scene_description;
                    if (visible_text && visible_text.length > 0) {
                        const textEntries = visible_text.map(vt => `"${vt.text}" (on ${vt.location})`).join(', ');
                        fullLogMessage += `\nDetected text: ${textEntries}`;
                    }
                    addLogEntry(LogType.Analysis, fullLogMessage, AnalysisMode.CloudVision);
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
    
    // Create refs for callbacks to stabilize speech recognition effect
    const addLogEntryRef = useRef(addLogEntry);
    useEffect(() => { addLogEntryRef.current = addLogEntry; }, [addLogEntry]);
    const handleAskJarvisRef = useRef(handleAskJarvis);
    useEffect(() => { handleAskJarvisRef.current = handleAskJarvis; }, [handleAskJarvis]);
    const narrateRef = useRef(narrate);
    useEffect(() => { narrateRef.current = narrate; }, [narrate]);
    
    // Re-architected Speech Recognition for maximum stability.
    // Effect 1: Initialize the recognition engine once.
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addLogEntryRef.current(LogType.Error, "Speech recognition is not supported by your browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        speechRecognitionRef.current = recognition;

        const startListening = () => {
            if (voiceActivationModeRef.current === VoiceActivationMode.WakeWord && isSystemActiveRef.current) {
                try {
                    recognition.start();
                } catch(e) {
                    // This can happen if it's already started, which is fine.
                    console.warn("Speech recognition already started.", e);
                }
            }
        };

        recognition.onstart = () => {
            if (hadRecognitionErrorRef.current) {
                if (recognitionStabilityTimerRef.current) clearTimeout(recognitionStabilityTimerRef.current);
                recognitionStabilityTimerRef.current = window.setTimeout(() => {
                    addLogEntryRef.current(LogType.System, "Speech recognition connection is stable.");
                    hadRecognitionErrorRef.current = false;
                    recognitionRetryDelayRef.current = 5000;
                    recognitionStabilityTimerRef.current = null;
                }, 15000);
            }
            setReconnectDelay(null);
            setVoiceStatus(isAwakeRef.current ? 'waiting_command' : 'listening');
        };

        recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                 if (!hadRecognitionErrorRef.current) {
                    console.error('Speech recognition error:', event.error);
                    addLogEntryRef.current(LogType.Error, `Speech recognition error: "${event.error}". Attempting to reconnect...`);
                 }
                 setVoiceStatus('reconnecting');
                 hadRecognitionErrorRef.current = true;
            }
        };
        
        recognition.onend = () => {
            if (recognitionRestartTimeoutRef.current) clearTimeout(recognitionRestartTimeoutRef.current);
            if (recognitionStabilityTimerRef.current) {
                clearTimeout(recognitionStabilityTimerRef.current);
                recognitionStabilityTimerRef.current = null;
            }

            if (voiceActivationModeRef.current === VoiceActivationMode.WakeWord && isSystemActiveRef.current) {
                if (hadRecognitionErrorRef.current) {
                    const currentDelay = recognitionRetryDelayRef.current;
                    setReconnectDelay(Math.round(currentDelay / 1000));
                    recognitionRestartTimeoutRef.current = window.setTimeout(startListening, currentDelay);
                    recognitionRetryDelayRef.current = Math.min(currentDelay * 2, MAX_RECOGNITION_RETRY_DELAY);
                } else {
                    recognitionRestartTimeoutRef.current = window.setTimeout(startListening, 100);
                }
            } else {
                setVoiceStatus(voiceActivationModeRef.current === VoiceActivationMode.Off ? 'off' : 'ready');
                setReconnectDelay(null);
            }
        };

        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => result[0])
                .map((result) => result.transcript)
                .join('');
            
            const isFinal = event.results[event.results.length - 1].isFinal;

            if (isAwakeRef.current) {
                if (isFinal && transcript.trim()) {
                    setVoiceStatus('processing');
                    setIsAwake(false); // Reset for next time
                    handleAskJarvisRef.current(transcript.trim());
                }
            } else if (transcript.toLowerCase().includes('jarvis')) {
                 if (isFinal) {
                    setIsAwake(true);
                    narrateRef.current("Yes?", 'Alert');
                }
            }
        };
        
        // Cleanup on component unmount
        return () => {
            if (recognitionRestartTimeoutRef.current) clearTimeout(recognitionRestartTimeoutRef.current);
            if (recognitionStabilityTimerRef.current) clearTimeout(recognitionStabilityTimerRef.current);
            if (recognition) {
                recognition.onresult = null;
                recognition.onend = null;
                recognition.onstart = null;
                recognition.onerror = null;
                recognition.stop();
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Effect 2: Control the recognition engine based on state changes.
    useEffect(() => {
        const recognition = speechRecognitionRef.current;
        if (!recognition) return;

        if (isSystemActive && voiceActivationMode === VoiceActivationMode.WakeWord) {
            setVoiceStatus('ready');
            try {
                recognition.start();
            } catch(e) {
                console.warn("Could not start speech recognition, it may have been already started.");
            }
        } else {
            setVoiceStatus('off');
            setIsAwake(false);
            recognition.stop();
        }
    }, [isSystemActive, voiceActivationMode]);


    return (
        <div className="min-h-screen bg-vista-dark flex flex-col p-4 font-sans text-vista-text">
             <AudioClassifier 
                isActive={isSystemActive && !!selectedMicId}
                micId={selectedMicId}
                confidenceThreshold={audioConfidence / 100}
                onPrediction={handleAudioPrediction}
                onError={(msg) => addLogEntry(LogType.Error, msg)}
            />
            <header className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    <h1 className="text-3xl font-bold">VISTA</h1>
                    <span className="text-sm font-mono bg-vista-accent text-white px-2 py-0.5 rounded">v2.1</span>
                </div>
                <div className="flex items-center space-x-4">
                    <VoiceStatusIndicator status={voiceStatus} reconnectDelay={reconnectDelay} />
                    <button
                        onClick={toggleSystemActive}
                        className={`px-4 py-2 rounded-lg flex items-center space-x-2 font-semibold transition-colors ${isSystemActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
                        aria-label={isSystemActive ? "Pause System" : "Activate System"}
                    >
                        {isSystemActive ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                        <span>{isSystemActive ? 'Pause System' : 'Activate System'}</span>
                    </button>
                </div>
            </header>

            <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
                {/* Left Column: Main View */}
                <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
                    <div className="aspect-video flex-shrink-0">
                        <VideoFeed
                            ref={videoFeedRef}
                            selectedCameraId={selectedCameraId}
                            isSystemActive={isSystemActive}
                            onStreamError={(msg) => addLogEntry(LogType.Error, msg)}
                            analysisMode={analysisMode}
                            onClientDetection={addLogEntry}
                            onToggleSystemActive={toggleSystemActive}
                            onSwitchAnalysisMode={handleSwitchAnalysisMode}
                            onObjectsDetected={setDetectedObjects}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
                         <LatestInsightPanel latestInsight={latestInsight} isResponding={isChatting} />
                         <AudioEventDetectorPanel 
                            isAudioActive={isSystemActive && !!selectedMicId}
                            latestAudioEvent={log.filter(l => l.type === LogType.Audio).pop()}
                         />
                    </div>
                </div>

                {/* Right Column: Controls and Logs */}
                <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2">
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
                            audioConfidence={audioConfidence}
                            onAudioConfidenceChange={setAudioConfidence}
                            narrationMode={narrationMode}
                            onNarrationModeChange={setNarrationMode}
                            interruptionMode={interruptionMode}
                            onInterruptionModeChange={setInterruptionMode}
                            voiceActivationMode={voiceActivationMode}
                            onVoiceActivationModeChange={setVoiceActivationMode}
                        />
                    </AccordionPanel>
                     <AccordionPanel title="Jarvis Chat" icon={<ChatIcon className="w-6 h-6" />} defaultOpen={true}>
                        <ChatPanel 
                            onSendMessage={handleAskJarvis}
                            isSending={isChatting}
                            history={chatHistory}
                            analysisMode={analysisMode}
                        />
                    </AccordionPanel>
                    <AccordionPanel title="System Log" icon={<HistoryIcon className="w-6 h-6" />}>
                         <div className="flex flex-col space-y-3">
                             <button 
                                onClick={() => {
                                    setLog([]);
                                    addLogEntry(LogType.System, "Log cleared.");
                                }}
                                className="self-end flex items-center space-x-1 text-xs text-vista-text-muted hover:text-vista-accent"
                             >
                                 <TrashIcon className="w-3 h-3"/>
                                 <span>Clear Log</span>
                             </button>
                            <LogPanel logs={log} />
                         </div>
                    </AccordionPanel>
                </div>
            </main>
        </div>
    );
};

export default App;