
import React from 'react';
import { AnalysisMode } from '../types';

interface ControlPanelProps {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId: string;
  selectedMicrophoneId: string;
  onCameraChange: (id: string) => void;
  onMicrophoneChange: (id: string) => void;
  analysisMode: AnalysisMode;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
  controls: {
    isNarrationEnabled: boolean;
    isProactivityEnabled: boolean;
    isVoiceActivationEnabled: boolean;
  };
  onControlsChange: (newControls: Partial<ControlPanelProps['controls']>) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  cameras, microphones, selectedCameraId, selectedMicrophoneId,
  onCameraChange, onMicrophoneChange, analysisMode, onAnalysisModeChange,
  controls, onControlsChange
}) => {

  const Select = ({ label, value, onChange, options }: { label: string, value: string, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void, options: MediaDeviceInfo[] }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full bg-vista-dark border border-gray-600 rounded-md p-2 text-vista-text focus:ring-vista-accent focus:border-vista-accent"
      >
        {options.map(option => (
          <option key={option.deviceId} value={option.deviceId}>{option.label || `Device ${option.deviceId.substring(0, 8)}`}</option>
        ))}
      </select>
    </div>
  );

  const Toggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div className="flex items-center justify-between mb-2">
      <span className="text-gray-300">{label}</span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-vista-accent"></div>
      </label>
    </div>
  );

  return (
    <div className="text-sm">
      <h4 className="font-bold text-gray-400 mb-2">DEVICES</h4>
      <Select label="Camera" value={selectedCameraId} onChange={e => onCameraChange(e.target.value)} options={cameras} />
      <Select label="Microphone" value={selectedMicrophoneId} onChange={e => onMicrophoneChange(e.target.value)} options={microphones} />

      <h4 className="font-bold text-gray-400 mt-4 mb-2">SYSTEM MODES</h4>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-1">Analysis Mode</label>
        <select
          value={analysisMode}
          onChange={e => onAnalysisModeChange(e.target.value as AnalysisMode)}
          className="w-full bg-vista-dark border border-gray-600 rounded-md p-2 text-vista-text focus:ring-vista-accent focus:border-vista-accent"
        >
          {Object.values(AnalysisMode).map(mode => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
      </div>

      <h4 className="font-bold text-gray-400 mt-4 mb-2">JARVIS BEHAVIOR</h4>
      <Toggle label="Voice Narration" checked={controls.isNarrationEnabled} onChange={e => onControlsChange({ isNarrationEnabled: e.target.checked })} />
      <Toggle label="Proactive Insights" checked={controls.isProactivityEnabled} onChange={e => onControlsChange({ isProactivityEnabled: e.target.checked })} />
      <Toggle label="Voice Activation" checked={controls.isVoiceActivationEnabled} onChange={e => onControlsChange({ isVoiceActivationEnabled: e.target.checked })} />
    </div>
  );
};

export default ControlPanel;
