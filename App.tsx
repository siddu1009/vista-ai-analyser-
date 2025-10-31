import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoFeed, { VideoFeedHandle } from './components/VideoFeed';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';
import LatestInsightPanel from './components/LatestAnalysisPanel';
import AudioEventDetectorPanel from './components/AudioEventDetectorPanel';
import ChatPanel from './components/ChatPanel';
import AccordionPanel from './components/AccordionPanel';
import { AnalysisMode, LogEntry, LogType, NarrationMode, InterruptionMode, VoiceActivationMode, VoiceStatus } from './types';
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
        const visionAnalysis = frame 
            ? await getCloudVisionAnalysis(frame) 
            : { scene_description: "Could not capture scene.", visible_text: [] };

        const entities_in_view = detectedObjects
            .map(obj => objectToEntityMap[obj])
            .filter(Boolean)
            .map((deviceInfo, index) => ({
                ...deviceInfo,
                state: smartHomeState[deviceInfo.entity_id]?.state || 'unknown',
                is_focused: index === 0, // Mark the first detected entity as "focused"
            }));

        return {
            scene_description: visionAnalysis.scene_description,
            visible_text: visionAnalysis.visible_text,
            entities_in_view
        };
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
    
    // Effect for Audio Event Detection
    useEffect(() => {
        const cleanup = () => {
            if (audioProcessorRef.current) {
                clearInterval(audioProcessorRef.current);
                audioProcessor