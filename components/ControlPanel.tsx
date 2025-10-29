import React from 'react';
import { AnalysisMode } from '../types';
import CameraIcon from './icons/CameraIcon';
import MicIcon from './icons/MicIcon';
import ControlsIcon from './icons/ControlsIcon';

interface ControlPanelProps {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId: string | null;
  selectedMicId: string | null;
  onCameraChange: (deviceId: string) => void;
  onMicChange: (deviceId: string) => void;
  analysisMode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
  analysisInterval: number;
  onAnalysisIntervalChange: (value: number) => void;
  audioSensitivity: number;
  onAudioSensitivityChange: (value: number) => void;
  isNarrationEnabled: boolean;
  onNarrationToggle: () => void;
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
  analysisInterval,
  onAnalysisIntervalChange,
  audioSensitivity,
  onAudioSensitivityChange,
  isNarrationEnabled,
  onNarrationToggle
}) => {
  const analysisModes = Object.values(AnalysisMode);

  return (
    <div className="w-full bg-vista-gray p-4 rounded-lg shadow-lg flex flex-col space-y-4">
      <div className="flex items-center space-x-3 text-vista-accent border-b-2 border-vista-light-gray pb-2">
        <ControlsIcon className="w-6 h-6" />
        <h2 className="text-xl font-bold">Controls</h2>
      </div>

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
        <h3 className="text-md font-semibold text-vista-text-muted">Analysis Settings</h3>
        <div>
            <label htmlFor="analysis-mode" className="block mb-2 text-sm font-medium text-vista-text">Interpretation Mode</label>
            <select
                id="analysis-mode"
                value={analysisMode}
                onChange={(e) => onModeChange(e.target.value as AnalysisMode)}
                className="w-full bg-vista-light-gray border border-vista-dark text-vista-text text-sm rounded-lg focus:ring-vista-accent focus:border-vista-accent p-2.5"
            >
                {analysisModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
            </select>
        </div>
        <div>
            <label htmlFor="interval" className="flex justify-between mb-2 text-sm font-medium text-vista-text">
                <span>Analysis Interval</span>
                <span>{analysisInterval/1000}s</span>
            </label>
            <input
            id="interval"
            type="range"
            min="2000"
            max="10000"
            step="1000"
            value={analysisInterval}
            onChange={(e) => onAnalysisIntervalChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-vista-light-gray rounded-lg appearance-none cursor-pointer"
            />
        </div>
      </div>
      
      {/* Audio Detector */}
      <div className="space-y-3">
        <h3 className="text-md font-semibold text-vista-text-muted">Audio Detector</h3>
        <label htmlFor="sensitivity" className="flex justify-between mb-2 text-sm font-medium text-vista-text">
            <span>Sensitivity</span>
            <span>{audioSensitivity}</span>
        </label>
        <input
          id="sensitivity"
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
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={isNarrationEnabled} onChange={onNarrationToggle} className="sr-only peer" />
          <div className="w-11 h-6 bg-vista-light-gray peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-vista-accent"></div>
          <span className="ml-3 text-sm font-medium text-vista-text">Enable Voice Narration</span>
        </label>
      </div>
    </div>
  );
};

export default ControlPanel;
