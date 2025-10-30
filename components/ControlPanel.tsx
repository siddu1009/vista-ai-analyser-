import React from 'react';
import { AnalysisMode, NarrationMode, InterruptionMode } from '../types';
import CameraIcon from './icons/CameraIcon';
import MicIcon from './icons/MicIcon';

interface ControlPanelProps {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId: string | null;
  selectedMicId: string | null;
  onCameraChange: (deviceId: string) => void;
  onMicChange: (deviceId: string) => void;
  analysisMode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
  audioSensitivity: number;
  onAudioSensitivityChange: (value: number) => void;
  narrationMode: NarrationMode;
  onNarrationModeChange: (mode: NarrationMode) => void;
  interruptionMode: InterruptionMode;
  onInterruptionModeChange: (mode: InterruptionMode) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  cameras,
  microphones,
  selectedCameraId,
  selectedMicId,
  onCameraChange,
  onMicChange,
  analysisMode,
  onModeChange,
  audioSensitivity,
  onAudioSensitivityChange,
  narrationMode,
  onNarrationModeChange,
  interruptionMode,
  onInterruptionModeChange
}) => {
  const analysisModes = Object.values(AnalysisMode);
  const narrationModes = Object.values(NarrationMode);
  const interruptionModes = Object.values(InterruptionMode);

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* Device Selection */}
      <div className="space-y-3">
        <h3 className="text-md font-semibold text-vista-text-muted">Devices</h3>
        <div className="flex items-center space-x-2">
          <CameraIcon className="w-5 h-5 text-vista-accent flex-shrink-0" />
          <select
            value={selectedCameraId || ''}
            onChange={(e) => onCameraChange(e.target.value)}
            className="w-full bg-vista-light-gray border border-vista-dark text-vista-text text-sm rounded-lg focus:ring-vista-accent focus:border-vista-accent p-2.5"
            aria-label="Select Camera Source"
          >
            <option value="">Select Camera</option>
            {cameras.map(cam => <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>)}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <MicIcon className="w-5 h-5 text-vista-accent flex-shrink-0" />
          <select
            value={selectedMicId || ''}
            onChange={(e) => onMicChange(e.target.value)}
            className="w-full bg-vista-light-gray border border-vista-dark text-vista-text text-sm rounded-lg focus:ring-vista-accent focus:border-vista-accent p-2.5"
            aria-label="Select Microphone Source"
          >
            <option value="">Select Microphone</option>
            {microphones.map(mic => <option key={mic.deviceId} value={mic.deviceId}>{mic.label}</option>)}
          </select>
        </div>
      </div>

      {/* Analysis Settings */}
      <div className="space-y-3">
        <h3 className="text-md font-semibold text-vista-text-muted">VISTA Perception Mode</h3>
        <div>
            <label htmlFor="analysis-mode" className="block mb-2 text-sm font-medium text-vista-text">On-Device Model</label>
            <select
                id="analysis-mode"
                value={analysisMode}
                onChange={(e) => onModeChange(e.target.value as AnalysisMode)}
                className="w-full bg-vista-light-gray border border-vista-dark text-vista-text text-sm rounded-lg focus:ring-vista-accent focus:border-vista-accent p-2.5"
            >
                {analysisModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
            </select>
        </div>
      </div>
      
       {/* Jarvis Proactivity */}
      <div className="space-y-3">
        <h3 className="text-md font-semibold text-vista-text-muted">Jarvis Proactivity</h3>
         <div>
            <label htmlFor="interruption-mode" className="block mb-2 text-sm font-medium text-vista-text">Interruption Mode</label>
            <select
                id="interruption-mode"
                value={interruptionMode}
                onChange={(e) => onInterruptionModeChange(e.target.value as InterruptionMode)}
                className="w-full bg-vista-light-gray border border-vista-dark text-vista-text text-sm rounded-lg focus:ring-vista-accent focus:border-vista-accent p-2.5"
            >
                {interruptionModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
            </select>
        </div>
      </div>

      {/* Audio Detector */}
      <div className="space-y-3">
        <h3 className="text-md font-semibold text-vista-text-muted">Audio Detector</h3>
        <label htmlFor="audio-sensitivity" className="flex justify-between mb-2 text-sm font-medium text-vista-text">
            <span>Sensitivity</span>
            <span>{audioSensitivity}</span>
        </label>
        <input
          id="audio-sensitivity"
          type="range"
          min="1"
          max="100"
          value={audioSensitivity}
          onChange={(e) => onAudioSensitivityChange(parseInt(e.target.value, 10))}
          className="w-full h-2 bg-vista-light-gray rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Accessibility */}
      <div className="space-y-3">
        <h3 className="text-md font-semibold text-vista-text-muted">Accessibility</h3>
         <div>
            <label htmlFor="narration-mode" className="block mb-2 text-sm font-medium text-vista-text">Voice Narration</label>
            <select
                id="narration-mode"
                value={narrationMode}
                onChange={(e) => onNarrationModeChange(e.target.value as NarrationMode)}
                className="w-full bg-vista-light-gray border border-vista-dark text-vista-text text-sm rounded-lg focus:ring-vista-accent focus:border-vista-accent p-2.5"
            >
                {narrationModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
            </select>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;