import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoFeed from './components/VideoFeed';
import ControlPanel from './components/ControlPanel';
import LogPanel from './components/LogPanel';
import LatestAnalysisPanel from './components/LatestAnalysisPanel';
import AudioEventDetectorPanel from './components/AudioEventDetectorPanel';
import { AnalysisMode, LogEntry, LogType } from './types';
import { analyzeScene, summarizeLog } from './services/geminiService';
import PlayIcon from './components/icons/PlayIcon';
import PauseIcon from './components/icons/PauseIcon';

const App: React.FC = () => {
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
    const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
    const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(AnalysisMode.Descriptive);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [isNarrationEnabled, setIsNarrationEnabled] = useState<boolean>(false);
    const [isSystemActive, setIsSystemActive] = useState<boolean>(false);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
    const [audioSensitivity, setAudioSensitivity] = useState(20);
    const [analysisInterval, setAnalysisInterval] = useState(5000);
    const [latestAnalysis, setLatestAnalysis] = useState<string | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioProcessorRef = useRef<number | null>(null);
    
    const addLogEntry = useCallback((type: LogType, message: string, mode?: AnalysisMode) => {
        setLog(prevLog => [...prevLog, { id: Date.now(), timestamp: new Date(), type, message, mode }]);
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
            } catch (error)
 {
                console.error("Error enumerating devices:", error);
                addLogEntry(LogType.Error, "Could not access media devices. Please grant camera and microphone permissions.");
            }
        };
        getDevices();
    }, [addLogEntry, selectedCameraId, selectedMicId]);

    const handleFrameCaptured = useCallback(async (base64Image: string) => {
        const isRealtimeMode = analysisMode === AnalysisMode.ObjectDetection || analysisMode === AnalysisMode.HandGesture;
        if (isAnalyzing || !isSystemActive || isRealtimeMode) return;
        
        setIsAnalyzing(true);
        setLatestAnalysis(null);
        try {
            const description = await analyzeScene(base64Image, analysisMode);
            addLogEntry(LogType.Analysis, description, analysisMode);
            setLatestAnalysis(description);
            if (isNarrationEnabled) {
                const utterance = new SpeechSynthesisUtterance(description);
                window.speechSynthesis.speak(utterance);
            }
        } catch (error) {
            console.error(error);
            addLogEntry(LogType.Error, "Failed to analyze scene.");
            setLatestAnalysis("Error: Could not analyze scene.");
        } finally {
            setIsAnalyzing(false);
        }
    }, [isAnalyzing, isSystemActive, analysisMode, addLogEntry, isNarrationEnabled]);

    const handleClientDetection = useCallback((type: LogType, message: string) => {
        addLogEntry(type, message, analysisMode);
    }, [addLogEntry, analysisMode]);

    const handleSummarize = async (minutes: number) => {
        setIsSummarizing(true);
        const sinceDate = new Date(Date.now() - minutes * 60 * 1000);
        const recentLogs = log.filter(l => l.timestamp > sinceDate && (l.type === LogType.Analysis || l.type === LogType.Audio || l.type === LogType.Gesture));
        
        if (recentLogs.length === 0) {
            addLogEntry(LogType.System, `No events in the last ${minutes} minute(s) to summarize.`);
            setIsSummarizing(false);
            return;
        }

        const logText = recentLogs.map(l => `${l.timestamp.toLocaleTimeString()} [${l.type}] ${l.message}`).join('\n');
        
        try {
            const summary = await summarizeLog(logText);
            addLogEntry(LogType.Summary, summary);
        } catch (error) {
            console.error(error);
            addLogEntry(LogType.Error, "Failed to generate summary.");
        } finally {
            setIsSummarizing(false);
        }
    };
    
    useEffect(() => {
        const setupAudioProcessing = async () => {
            if (isSystemActive && selectedMicId) {
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
            }
        };

        setupAudioProcessing();

        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
            if (audioProcessorRef.current) {
                window.clearInterval(audioProcessorRef.current);
            }
            if (audioStreamSourceRef.current) {
                audioStreamSourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [isSystemActive, selectedMicId, audioSensitivity, addLogEntry]);

    const handleStreamError = useCallback((message: string) => {
        addLogEntry(LogType.Error, message);
        setIsSystemActive(false);
    }, [addLogEntry]);

    const toggleSystemActive = useCallback(() => {
        if (!selectedCameraId || !selectedMicId) {
            addLogEntry(LogType.Error, "Please select both a camera and a microphone before starting.");
            return;
        }
        setIsSystemActive(current => {
            if (!current) {
                addLogEntry(LogType.System, "VISTA system activated.");
            } else {
                addLogEntry(LogType.System, "VISTA system paused.");
                window.speechSynthesis.cancel();
            }
            return !current;
        });
    }, [selectedCameraId, selectedMicId, addLogEntry]);
    
    const handleSwitchAnalysisMode = useCallback(() => {
        const modes = Object.values(AnalysisMode);
        setAnalysisMode(currentMode => {
            const currentIndex = modes.indexOf(currentMode);
            const nextIndex = (currentIndex + 1) % modes.length;
            const nextMode = modes[nextIndex];
            addLogEntry(LogType.System, `Analysis mode switched to: ${nextMode}`);
            return nextMode;
        });
    }, [addLogEntry]);

    const latestAudioLog = [...log].reverse().find(l => l.type === LogType.Audio);

    return (
        <div className="min-h-screen bg-vista-dark flex flex-col p-4 gap-4 font-sans">
            <header className="flex justify-between items-center text-vista-text pb-2 border-b-2 border-vista-light-gray flex-shrink-0">
                <h1 className="text-3xl font-bold">VISTA <span className="text-vista-accent font-light hidden md:inline">| Vision Intelligence Scene Translator & Analyzer</span></h1>
                 <button 
                    onClick={toggleSystemActive}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-300 ${isSystemActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white shadow-lg`}
                >
                    {isSystemActive ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                    <span>{isSystemActive ? 'PAUSE' : 'START'}</span>
                </button>
            </header>
            <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
                <div className="lg:col-span-2 min-h-0">
                     <VideoFeed 
                        selectedCameraId={selectedCameraId}
                        onFrameCaptured={handleFrameCaptured}
                        analysisInterval={analysisInterval}
                        isSystemActive={isSystemActive}
                        onStreamError={handleStreamError}
                        analysisMode={analysisMode}
                        onClientDetection={handleClientDetection}
                        onToggleSystemActive={toggleSystemActive}
                        onSwitchAnalysisMode={handleSwitchAnalysisMode}
                    />
                </div>
                <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto min-h-0 pr-2">
                    <ControlPanel
                        cameras={cameras}
                        microphones={microphones}
                        selectedCameraId={selectedCameraId}
                        selectedMicId={selectedMicId}
                        onCameraChange={setSelectedCameraId}
                        onMicChange={setSelectedMicId}
                        analysisMode={analysisMode}
                        onModeChange={setAnalysisMode}
                        analysisInterval={analysisInterval}
                        onAnalysisIntervalChange={setAnalysisInterval}
                        audioSensitivity={audioSensitivity}
                        onAudioSensitivityChange={setAudioSensitivity}
                        isNarrationEnabled={isNarrationEnabled}
                        onNarrationToggle={() => setIsNarrationEnabled(!isNarrationEnabled)}
                    />
                    <LatestAnalysisPanel 
                        currentMode={analysisMode}
                        latestAnalysis={latestAnalysis}
                        isAnalyzing={isAnalyzing}
                    />
                    <AudioEventDetectorPanel
                        isAudioActive={isSystemActive && !!selectedMicId}
                        latestAudioEvent={latestAudioLog}
                    />
                    <LogPanel 
                        logs={log} 
                        onSummarize={handleSummarize} 
                        isSummarizing={isSummarizing}
                        onClearLogs={() => {
                            setLog([]);
                            addLogEntry(LogType.System, "Log cleared.");
                        }}
                    />
                </div>
            </main>
        </div>
    );
}

export default App;