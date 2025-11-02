import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnalysisMode, VoiceStatus, LogType, type LogEntry, type ChatMessage, type VistaContext, type SmartHomeEntity } from './types';
import * as geminiService from './services/geminiService';
import VideoFeed from './components/VideoFeed';
import AudioClassifier from './components/AudioClassifier';
import VoiceStatusIndicator from './components/VoiceStatusIndicator';
import AccordionPanel from './components/AccordionPanel';
import ControlPanel from './components/ControlPanel';
import ChatPanel from './components/ChatPanel';
import LogPanel from './components/LogPanel';

// FIX: Add types for Web Speech API to fix 'SpeechRecognition' and 'webkitSpeechRecognition' not found errors.
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Mock Smart Home Device Registry
const MOCK_DEVICE_REGISTRY: SmartHomeEntity[] = [
  { id: 'light.living_room_main', name: 'Living Room Light', type: 'light', aliases: ['main light', 'living room light', 'the light'], state: 'off' },
  { id: 'light.desk_lamp', name: 'Desk Lamp', type: 'light', aliases: ['desk lamp', 'desk light', 'reading light'], state: 'off' },
  { id: 'media_player.main_tv', name: 'Main TV', type: 'media_player', aliases: ['the tv', 'television', 'main screen'], state: 'off' },
];

const App: React.FC = () => {
  const [isSystemActive, setIsSystemActive] = useState<boolean>(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(AnalysisMode.ObjectDetection);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(VoiceStatus.Idle);
  // Use a ref to get the latest voice status inside the speech recognition callback, avoiding stale closures.
  const voiceStatusRef = useRef(voiceStatus);
  useEffect(() => {
    voiceStatusRef.current = voiceStatus;
  }, [voiceStatus]);
  
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('');

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<string>('System is offline.');
  const [lastAudioEvent, setLastAudioEvent] = useState<string>('None');

  const [controls, setControls] = useState({
    isNarrationEnabled: true,
    isProactivityEnabled: true,
    isVoiceActivationEnabled: true,
  });

  const [smartDevices, setSmartDevices] = useState<SmartHomeEntity[]>(MOCK_DEVICE_REGISTRY);

  const videoFeedRef = useRef<{ captureFrame: () => string | null }>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const commandTimeoutRef = useRef<number | null>(null);
  const proactiveIntervalRef = useRef<number | null>(null);
  const isJarvisSpeakingRef = useRef(false);
  const interimTranscriptRef = useRef('');

  const addLog = useCallback((type: LogType, message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ id: Date.now(), timestamp, type, message }, ...prev].slice(0, 100));
  }, []);

    // FIX: Make device enumeration more robust and handle device changes.
    const getMediaDevices = useCallback(async (isInitial = false) => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(device => device.kind === 'videoinput');
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            setCameras(videoInputs);
            setMicrophones(audioInputs);

            const currentCamStillExists = videoInputs.some(d => d.deviceId === selectedCameraId);
            const currentMicStillExists = audioInputs.some(d => d.deviceId === selectedMicrophoneId);

            if (!currentCamStillExists && videoInputs.length > 0) {
                setSelectedCameraId(videoInputs[0].deviceId);
                if (!isInitial) addLog(LogType.Warning, "Selected camera disconnected. Switched to default.");
            }

            if (!currentMicStillExists && audioInputs.length > 0) {
                setSelectedMicrophoneId(audioInputs[0].deviceId);
                if (!isInitial) addLog(LogType.Warning, "Selected microphone disconnected. Switched to default.");
            }
            
            if (isInitial) {
                if (!selectedCameraId && videoInputs.length > 0) {
                    setSelectedCameraId(videoInputs[0].deviceId);
                }
                if (!selectedMicrophoneId && audioInputs.length > 0) {
                    setSelectedMicrophoneId(audioInputs[0].deviceId);
                }
                addLog(LogType.Info, "Media devices enumerated.");
            }

        } catch (error) {
            addLog(LogType.Error, "Failed to enumerate media devices.");
            console.error(error);
        }
    }, [addLog, selectedCameraId, selectedMicrophoneId]);

    useEffect(() => {
        const setupDevices = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                addLog(LogType.Info, "Media permissions granted.");
                
                await getMediaDevices(true);

                navigator.mediaDevices.addEventListener('devicechange', getMediaDevices);
            } catch (error) {
                addLog(LogType.Error, "Failed to get media permissions. App functionality will be limited.");
                console.error("Permission error:", error);
            }
        };
        
        setupDevices();
        
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', getMediaDevices);
        };
    }, [addLog, getMediaDevices]);


  const speak = useCallback((text: string) => {
    if (!controls.isNarrationEnabled) {
        addLog(LogType.Info, `Narration disabled. Jarvis would have said: "${text}"`);
        return;
    }
    
    isJarvisSpeakingRef.current = true;
    recognitionRef.current?.stop(); // FIX: Stop listening when Jarvis starts talking

    setVoiceStatus(VoiceStatus.Speaking);
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onend = () => {
        isJarvisSpeakingRef.current = false;
        if (isSystemActive && controls.isVoiceActivationEnabled) {
            setVoiceStatus(VoiceStatus.ListeningWakeWord);
            try {
                recognitionRef.current?.start();
            } catch (e) {
                // Ignore error if it's already started by another process.
                console.warn("Recognition start failed, likely already running.", e);
            }
        } else {
            setVoiceStatus(VoiceStatus.Idle);
        }
    };
    
    speechSynthesis.speak(utterance);
    setChatHistory(prev => [...prev, { id: Date.now(), sender: 'jarvis', text }]);
    addLog(LogType.Response, `Jarvis: ${text}`);
  }, [addLog, controls.isNarrationEnabled, isSystemActive, controls.isVoiceActivationEnabled]);
  
  const processCommand = useCallback(async (command: string) => {
    addLog(LogType.Command, `User: ${command}`);
    setChatHistory(prev => [...prev, {id: Date.now(), sender: 'user', text: command}]);
    setVoiceStatus(VoiceStatus.Processing);

    const frame = videoFeedRef.current?.captureFrame();
    let visionAnalysis = { scene_description: "Could not analyze scene.", visible_text: [] };
    if (frame) {
        try {
            visionAnalysis = await geminiService.getCloudVisionAnalysis(frame);
            const sceneText = visionAnalysis.scene_description || "No description available.";
            const visibleText = visionAnalysis.visible_text && visionAnalysis.visible_text.length > 0
                ? ` Text: ${visionAnalysis.visible_text.map(t => t.text).join(', ')}`
                : '';
            setLatestAnalysis(`Scene: ${sceneText}${visibleText}`);
        } catch (error) {
            addLog(LogType.Error, "Cloud Vision API call failed.");
            console.error(error);
        }
    }

    const context: VistaContext = {
        scene_description: visionAnalysis.scene_description,
        visible_text: visionAnalysis.visible_text,
        entities_in_view: [], // This would be populated by object detection mapping
        audio_context: lastAudioEvent,
    };
    
    try {
        const response = await geminiService.askJarvis(command, context);
        if (response.functionCalls) {
            for (const fc of response.functionCalls) {
                const args = fc.args;
                switch (fc.name) {
                    case 'answer_user':
                        speak(args.spoken_response);
                        break;
                    case 'call_home_assistant':
                        const device = smartDevices.find(d => d.id === args.entity_id);
                        if (device) {
                            setSmartDevices(prev => prev.map(d => d.id === args.entity_id ? {...d, state: args.service.replace('turn_', '')} : d));
                            speak(args.confirmation_message || `Okay, turning ${args.service.split('_')[1]} the ${device.name}.`);
                            addLog(LogType.Success, `Executed ${args.service} on ${device.name}`);
                        } else {
                            speak(`I couldn't find a device with the ID ${args.entity_id}, Sir.`);
                            addLog(LogType.Error, `Device not found: ${args.entity_id}`);
                        }
                        break;
                    case 'recognize_song':
                        speak("I'm sorry, my audio recognition protocols are currently offline. It sounds pleasant, though.");
                        break;
                    default:
                        speak("I received a command I don't understand.");
                }
            }
        } else {
            speak(response.text || "I'm not sure how to respond to that, Sir.");
        }
    } catch (error) {
        speak("I seem to have encountered an internal error. My apologies.");
        addLog(LogType.Error, "Jarvis AI call failed.");
        console.error(error);
    }
  }, [addLog, lastAudioEvent, speak, smartDevices]);


  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) || !controls.isVoiceActivationEnabled || !isSystemActive) {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setVoiceStatus(VoiceStatus.Idle);
        return;
    }

    if (!recognitionRef.current) {
        // FIX: Instantiate from window object to align with declared types.
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognitionRef.current = recognition;

        recognition.onstart = () => {
            if (!isJarvisSpeakingRef.current) {
                setVoiceStatus(VoiceStatus.ListeningWakeWord);
            }
        };

        recognition.onerror = (event) => {
            // FIX: Ignore common, non-fatal "no-speech" error to reduce console noise.
            if (event.error !== 'no-speech') {
              console.error('Speech recognition error', event.error);
            }
        };
        
        recognition.onresult = (event) => {
            if (isJarvisSpeakingRef.current) return;

            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            interimTranscriptRef.current = interimTranscript;
            
            finalTranscript = finalTranscript.trim().toLowerCase();
            const currentStatus = voiceStatusRef.current; // FIX: Use ref to get current status and avoid stale closure.

            if (currentStatus === VoiceStatus.WaitingForCommand) {
                if (finalTranscript) {
                    recognition.stop();
                    processCommand(finalTranscript);
                }
            } else if (finalTranscript.includes('hey jarvis')) {
                speak('Yes, Sir?');
                setVoiceStatus(VoiceStatus.WaitingForCommand);
                if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
                commandTimeoutRef.current = window.setTimeout(() => {
                   setVoiceStatus(prev => {
                       if (prev === VoiceStatus.WaitingForCommand) {
                           return VoiceStatus.ListeningWakeWord;
                       }
                       return prev;
                   });
                }, 5000);
            }
        };

        recognition.onend = () => {
            if (isSystemActive && controls.isVoiceActivationEnabled && !isJarvisSpeakingRef.current) {
                // Small delay to prevent rapid-fire restarts on errors
                setTimeout(() => {
                    try {
                        recognitionRef.current?.start()
                    } catch(e) {
                         // Ignore if already started
                    }
                }, 250);
            }
        };
    }
    
    if (isSystemActive) {
        try {
            recognitionRef.current.start();
        } catch(e) {
            console.warn("Could not start recognition, it may have already started.", e)
        }
    } else {
        recognitionRef.current.stop();
    }
    
    return () => {
        recognitionRef.current?.stop();
        if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isSystemActive, controls.isVoiceActivationEnabled, processCommand, speak]);


  const toggleSystemActive = useCallback(() => {
    setIsSystemActive(prev => {
        const nextState = !prev;
        addLog(LogType.Info, `System ${nextState ? 'activated' : 'deactivated'}.`);
        if(nextState) {
            speak("VISTA system online. I am ready to assist.");
            setLatestAnalysis("Awaiting sensor data...");
        } else {
            speak("System paused. Standing by.");
            setLatestAnalysis("System is offline.");
        }
        return nextState;
    });
  }, [addLog, speak]);
  
  const cycleAnalysisMode = useCallback(() => {
    setAnalysisMode(prev => {
      const modes = Object.values(AnalysisMode);
      const currentIndex = modes.indexOf(prev);
      const nextIndex = (currentIndex + 1) % modes.length;
      const newMode = modes[nextIndex];
      addLog(LogType.Info, `Analysis mode changed to: ${newMode}`);
      speak(`${newMode} mode engaged.`);
      return newMode;
    });
  }, [addLog, speak]);


  const handleAudioEvent = useCallback((event: string) => {
      if(isSystemActive) {
          setLastAudioEvent(event);
          addLog(LogType.Audio, `Detected sound: ${event}`);
      }
  }, [addLog, isSystemActive]);

  const handleObjectsDetected = useCallback((objects: { class: string; score: number }[]) => {
      if(isSystemActive && objects.length > 0){
          // This is where you might update the context with entities_in_view
      }
  }, [isSystemActive]);

  return (
    <div className="flex flex-col h-screen bg-vista-dark text-vista-text font-sans">
      <header className="flex items-center justify-between p-2 bg-vista-gray shadow-md z-10">
        <h1 className="text-2xl font-display text-vista-accent">VISTA</h1>
        <VoiceStatusIndicator status={voiceStatus} />
        <div className="flex items-center gap-2">
          <button onClick={toggleSystemActive} className="px-4 py-2 bg-vista-accent text-white rounded hover:bg-blue-500 transition-colors">
            {isSystemActive ? 'Pause' : 'Start'} System
          </button>
          <button onClick={() => setLogs([])} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors">
            Clear Log
          </button>
        </div>
      </header>
      
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="flex-1 min-h-0">
             <VideoFeed 
                ref={videoFeedRef}
                isActive={isSystemActive}
                mode={analysisMode}
                deviceId={selectedCameraId}
                onToggleActive={toggleSystemActive}
                onCycleMode={cycleAnalysisMode}
                onObjectsDetected={handleObjectsDetected}
             />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-32">
            <div className="bg-vista-gray p-3 rounded-lg shadow-inner overflow-hidden flex flex-col">
                <h3 className="text-vista-accent font-bold mb-1 flex-shrink-0">Latest Scene Analysis</h3>
                <div className="text-sm text-gray-300 overflow-y-auto h-full pr-2">{latestAnalysis}</div>
            </div>
            <div className="bg-vista-gray p-3 rounded-lg shadow-inner">
                <h3 className="text-vista-accent font-bold mb-1">Ambient Audio Event</h3>
                <p className="text-2xl text-center pt-4 font-display">{lastAudioEvent}</p>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto">
          <AccordionPanel title="Controls">
            <ControlPanel 
              cameras={cameras} 
              microphones={microphones}
              selectedCameraId={selectedCameraId}
              selectedMicrophoneId={selectedMicrophoneId}
              onCameraChange={setSelectedCameraId}
              onMicrophoneChange={setSelectedMicrophoneId}
              analysisMode={analysisMode}
              onAnalysisModeChange={setAnalysisMode}
              controls={controls}
              onControlsChange={(newControls) => setControls(prev => ({...prev, ...newControls}))}
            />
          </AccordionPanel>
          <AccordionPanel title="Chat with Jarvis" isOpenDefault>
             <ChatPanel 
                messages={chatHistory} 
                onSendMessage={processCommand}
                interimTranscript={interimTranscriptRef.current}
                isListening={voiceStatus === VoiceStatus.WaitingForCommand}
             />
          </AccordionPanel>
          <AccordionPanel title="Event Log">
            <LogPanel logs={logs} />
          </AccordionPanel>
        </aside>
      </main>

      {/* Non-rendering components */}
      <AudioClassifier 
        isActive={isSystemActive} 
        deviceId={selectedMicrophoneId}
        onAudioEvent={handleAudioEvent}
      />
    </div>
  );
};

export default App;