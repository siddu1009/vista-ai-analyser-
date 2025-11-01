import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
    const [voiceActivationMode, setVoiceActivationMode] = useState<VoiceActivationMode>(VoiceActivationMode.WakeWord);
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
    const awakeTimeoutRef = useRef<number | null>(null);

    const addLog = useCallback((type: LogType, message: string, mode?: AnalysisMode) => {
        const newLogEntry: LogEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date(),
            type,
            message,
            mode,
        };
        setLog(prevLog => [...prevLog, newLogEntry]);

        if (narrationMode === NarrationMode.Full || (narrationMode === NarrationMode.AlertsOnly && (type === LogType.Error || type === LogType.Interruption))) {
            const utterance = new SpeechSynthesisUtterance(message);
            speechSynthesis.speak(utterance);
        }
    }, [narrationMode]);

    // Get media devices
    useEffect(() => {
        const getDevices = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); // Request permission upfront
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(d => d.kind === 'videoinput');
                const audioDevices = devices.filter(d => d.kind === 'audioinput');
                setCameras(videoDevices);
                setMicrophones(audioDevices);
                if (videoDevices.length > 0 && !selectedCameraId) {
                    setSelectedCameraId(videoDevices[0].deviceId);
                }
                if (audioDevices.length > 0 && !selectedMicId) {
                    setSelectedMicId(audioDevices[0].deviceId);
                }
            } catch (error) {
                console.error("Error enumerating devices:", error);
                addLog(LogType.Error, "Could not access media devices. Please check browser permissions.");
            }
        };
        getDevices();
    }, [addLog, selectedCameraId, selectedMicId]);
    
    const handleSendMessage = useCallback(async (message: string, source: 'chat' | 'voice' = 'chat') => {
        setIsChatting(true);
        if (source === 'chat') {
            setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: message }] }]);
        }
        addLog(LogType.System, `User prompt: "${message}"`);

        const vistaContext = {
            scene_description: 'Not available',
            visible_text: [],
            entities_in_view: detectedObjects
                .map(obj => objectToEntityMap[obj])
                .filter(Boolean),
            audio_context: latestAudioEvent?.className || 'Quiet',
            is_focused: null // In a real app, this could come from eye tracking or center of screen
        };

        try {
            const frame = await videoFeedRef.current?.captureFrame();
            if (frame) {
                const visionAnalysis = await getCloudVisionAnalysis(frame);
                vistaContext.scene_description = visionAnalysis.scene_description;
                vistaContext.visible_text = visionAnalysis.visible_text;
            }
        } catch (error) {
            console.warn("Could not capture frame for context:", error);
        }
        
        const response = await askJarvis(message, vistaContext);
        
        if (response.answer_user) {
            const spokenResponse = response.answer_user.spoken_response;
            setLatestInsight(spokenResponse);
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: spokenResponse }] }]);
            addLog(LogType.System, `Jarvis response: "${spokenResponse}"`);
            const utterance = new SpeechSynthesisUtterance(spokenResponse);
            speechSynthesis.speak(utterance);
        } else if (response.call_home_assistant) {
            const { entity_id, service, confirmation_message } = response.call_home_assistant;
            setSmartHomeState(prev => ({
                ...prev,
                [entity_id]: { state: service === 'turn_on' ? 'on' : 'off' }
            }));
            setLatestInsight(confirmation_message);
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: confirmation_message }] }]);
            addLog(LogType.System, `Jarvis action: ${service} on ${entity_id}.`);
            const utterance = new SpeechSynthesisUtterance(confirmation_message);
            speechSynthesis.speak(utterance);
        } else if (response.recognize_song) {
            const song = "I'm sorry, my song recognition circuits are offline for maintenance.";
            setLatestInsight(song);
            setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: song }] }]);
            addLog(LogType.System, `Jarvis action: Recognize song.`);
            const utterance = new SpeechSynthesisUtterance(song);
            speechSynthesis.speak(utterance);
        }
        
        setIsChatting(false);
         if (voiceStatus === 'processing') {
             if (voiceActivationMode === VoiceActivationMode.WakeWord) {
                setVoiceStatus('listening');
            } else {
                setVoiceStatus('ready');
            }
        }
    }, [addLog, detectedObjects, latestAudioEvent, voiceStatus, voiceActivationMode]);

    const processUserCommand = useCallback(async (command: string) => {
        if (!command) return;
        setIsAwake(false);
        if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
        
        setVoiceStatus('processing');
        await handleSendMessage(command, 'voice');

    }, [handleSendMessage]);

    // Speech Recognition Lifecycle
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            // Only log error if user tries to use a voice feature.
            if(voiceActivationMode !== VoiceActivationMode.Off || (isSystemActive && voiceActivationMode === VoiceActivationMode.Off)) {
                addLog(LogType.Error, "Speech recognition is not supported in this browser.");
            }
            return;
        }

        // The recognition engine should be running whenever the system is active, to allow for manual listening.
        if (!isSystemActive) {
             if (speechRecognitionRef.current) {
                speechRecognitionRef.current.stop();
                speechRecognitionRef.current = null;
            }
            setVoiceStatus('off');
            return;
        }

        if (speechRecognitionRef.current) return; // Already running

        const recognition = new SpeechRecognition();
        speechRecognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => {
            if (voiceActivationMode === VoiceActivationMode.WakeWord) {
                setVoiceStatus(isAwake ? 'waiting_command' : 'listening');
            } else { // Mode is 'Off', so we are ready for manual activation
                setVoiceStatus(isAwake ? 'waiting_command' : 'ready');
            }
            setReconnectDelay(null);
            hadRecognitionErrorRef.current = false;
        };

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            const transcript = (finalTranscript || interimTranscript).toLowerCase().trim();
            const WAKE_WORD_REGEX = /\bjarvis\b/;
            
            if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);

            const isWakeWordMode = voiceActivationMode === VoiceActivationMode.WakeWord;

            if (isWakeWordMode && !isAwake && WAKE_WORD_REGEX.test(transcript)) {
                setIsAwake(true);
                setVoiceStatus('waiting_command');
                const command = transcript.split(WAKE_WORD_REGEX)[1]?.trim();
                if (command) {
                    processUserCommand(command);
                } else {
                   awakeTimeoutRef.current = window.setTimeout(() => {
                        setIsAwake(false);
                        setVoiceStatus('listening');
                   }, 5000); // 5-second window to give a command
                }
            } else if (isAwake && finalTranscript) {
                processUserCommand(finalTranscript);
            }
        };

        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            if (event.error !== 'no-speech' && event.error !== 'aborted' && event.error !== 'network') {
               addLog(LogType.Error, `Speech recognition error: ${event.error}`);
            }
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                hadRecognitionErrorRef.current = true;
            }
        };

        recognition.onend = () => {
            // Only restart if the service should be active.
            if (isSystemActive) {
                if(recognitionRestartTimeoutRef.current) clearTimeout(recognitionRestartTimeoutRef.current);
                recognitionRestartTimeoutRef.current = window.setTimeout(() => {
                     try {
                        speechRecognitionRef.current?.start();
                    } catch(e) {
                        // This can happen if start() is called while it's already starting. Ignore.
                    }
                }, 250);
            } else {
                setVoiceStatus('off');
            }
        };

        try {
            recognition.start();
        } catch(e) {
            // Already started, ignore
        }


        return () => {
            if (recognition) {
                recognition.onstart = null;
                recognition.onresult = null;
                recognition.onerror = null;
                recognition.onend = null;
                recognition.stop();
                speechRecognitionRef.current = null;
            }
            if(recognitionRestartTimeoutRef.current) clearTimeout(recognitionRestartTimeoutRef.current);
            if(awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
        };
    }, [voiceActivationMode, isSystemActive, addLog, isAwake, processUserCommand]);

    // Cloud Vision Interval
    useEffect(() => {
        if (cloudVisionIntervalRef.current) clearInterval(cloudVisionIntervalRef.current);
        if (isSystemActive && analysisMode === AnalysisMode.CloudVision) {
            cloudVisionIntervalRef.current = window.setInterval(async () => {
                if (isCloudVisionRunningRef.current) return;
                isCloudVisionRunningRef.current = true;
                try {
                    const frame = await videoFeedRef.current?.captureFrame();
                    if (frame) {
                        const { scene_description } = await getCloudVisionAnalysis(frame);
                        addLog(LogType.Analysis, scene_description, AnalysisMode.CloudVision);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error";
                    if (!errorMessage.includes("frame is black")) {
                        addLog(LogType.Error, `Cloud Vision analysis failed: ${errorMessage}`);
                    }
                } finally {
                    isCloudVisionRunningRef.current = false;
                }
            }, 10000);
        }
        return () => {
            if (cloudVisionIntervalRef.current) clearInterval(cloudVisionIntervalRef.current);
        };
    }, [isSystemActive, analysisMode, addLog]);
    
    // Jarvis Interruption Interval
    useEffect(() => {
        if (interruptionIntervalRef.current) clearInterval(interruptionIntervalRef.current);
        if (isSystemActive && interruptionMode !== InterruptionMode.Off) {
             interruptionIntervalRef.current = window.setInterval(async () => {
                const vistaContext = {
                    scene_description: 'Not available',
                    entities_in_view: detectedObjects.map(obj => objectToEntityMap[obj]).filter(Boolean),
                    audio_context: latestAudioEvent?.className || 'Quiet',
                };
                const interruption = await getJarvisInterruption(vistaContext, interruptionMode);
                if (interruption && !interruption.includes("[NO_EVENT]")) {
                    addLog(LogType.Interruption, interruption);
                }
             }, 15000);
        }
        return () => {
             if (interruptionIntervalRef.current) clearInterval(interruptionIntervalRef.current);
        };
    }, [isSystemActive, interruptionMode, addLog, detectedObjects, latestAudioEvent]);
    
    const handleManualListen = useCallback(() => {
        if (isSystemActive && !isAwake && voiceActivationMode === VoiceActivationMode.Off) {
            addLog(LogType.System, "Manual voice activation triggered.");
            setIsAwake(true);
            setVoiceStatus('waiting_command');
            
            if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
            awakeTimeoutRef.current = window.setTimeout(() => {
                setIsAwake(false);
                setVoiceStatus(currentStatus => {
                    // Only reset if we are still waiting, not if we're already processing
                    if (currentStatus === 'waiting_command') {
                        return 'ready';
                    }
                    return currentStatus;
                });
            }, 7000); // 7-second window for manual command
        }
    }, [isSystemActive, isAwake, voiceActivationMode, addLog]);

    const handleAudioPrediction = useCallback((prediction: AudioPrediction | null) => {
        if (!prediction) return;
        setLatestAudioEvent(prediction);
        const now = Date.now();
        if (prediction.className !== lastReportedSoundRef.current.class || now - lastReportedSoundRef.current.time > 5000) {
            addLog(LogType.Audio, `Sound detected: ${prediction.className} (${Math.round(prediction.score * 100)}% confidence)`);
            lastReportedSoundRef.current = { class: prediction.className, time: now };
        }
    }, [addLog]);

    const handleToggleSystemActive = useCallback(() => {
        setIsSystemActive(prev => {
            addLog(LogType.System, `System ${!prev ? 'resumed' : 'paused'}.`);
            return !prev;
        });
    }, [addLog]);

    const handleSwitchAnalysisMode = useCallback(() => {
        const modes = Object.values(AnalysisMode);
        const currentIndex = modes.indexOf(analysisMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        const newMode = modes[nextIndex];
        setAnalysisMode(newMode);
        addLog(LogType.System, `Switched to ${newMode} mode.`);
    }, [analysisMode, addLog]);
    
    const latestAudioLog = useMemo(() => log.slice().reverse().find(l => l.type === LogType.Audio), [log]);

    return (
        <div className="bg-vista-dark min-h-screen font-sans">
            <header className="bg-vista-gray/80 backdrop-blur-sm p-3 shadow-lg flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center space-x-3">
                    <img src="/vite.svg" alt="VISTA Logo" className="w-8 h-8" />
                    <h1 className="text-xl font-bold text-vista-text hidden sm:block">VISTA</h1>
                </div>
                 <div className="absolute left-1/2 -translate-x-1/2">
                    <VoiceStatusIndicator status={voiceStatus} reconnectDelay={reconnectDelay} />
                </div>
                <div className="flex items-center space-x-4">
                    <button onClick={() => setLog([])} className="text-vista-text-muted hover:text-vista-accent transition-colors" aria-label="Clear logs">
                        <TrashIcon className="w-6 h-6" />
                    </button>
                    <button onClick={handleToggleSystemActive} className="w-24 text-center px-4 py-2 bg-vista-light-gray rounded-lg flex items-center justify-center space-x-2 hover:bg-opacity-80 transition-colors">
                        {isSystemActive ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                        <span>{isSystemActive ? 'Pause' : 'Start'}</span>
                    </button>
                </div>
            </header>

            <main className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Main Content Column */}
                    <div className="lg:col-span-2 flex flex-col space-y-4">
                        <div className="aspect-video">
                           <VideoFeed
                                ref={videoFeedRef}
                                selectedCameraId={selectedCameraId}
                                isSystemActive={isSystemActive}
                                onStreamError={(msg) => addLog(LogType.Error, msg)}
                                analysisMode={analysisMode}
                                onClientDetection={(type, msg) => addLog(type, msg, analysisMode)}
                                onToggleSystemActive={handleToggleSystemActive}
                                onSwitchAnalysisMode={handleSwitchAnalysisMode}
                                onObjectsDetected={setDetectedObjects}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <LatestInsightPanel latestInsight={latestInsight} isResponding={isChatting} />
                           <AudioEventDetectorPanel isAudioActive={isSystemActive} latestAudioEvent={latestAudioLog} />
                        </div>
                    </div>

                    {/* Sidebar Column */}
                    <div className="lg:col-span-1 flex flex-col space-y-4">
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
                       <AccordionPanel title="Chat with Jarvis" icon={<ChatIcon className="w-6 h-6" />} defaultOpen={true}>
                           <ChatPanel
                                onSendMessage={handleSendMessage}
                                isSending={isChatting}
                                history={chatHistory}
                                analysisMode={analysisMode}
                                voiceActivationMode={voiceActivationMode}
                                onManualListen={handleManualListen}
                           />
                       </AccordionPanel>
                       <AccordionPanel title="Event Log" icon={<HistoryIcon className="w-6 h-6" />}>
                           <LogPanel logs={log} />
                       </AccordionPanel>
                    </div>
                </div>
            </main>
            
            <AudioClassifier 
                isActive={isSystemActive}
                micId={selectedMicId}
                confidenceThreshold={audioConfidence / 100}
                onPrediction={handleAudioPrediction}
                onError={(msg) => addLog(LogType.Error, msg)}
            />
        </div>
    );
};

export default App;