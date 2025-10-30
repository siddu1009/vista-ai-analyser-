import React, { useRef, useEffect } from 'react';
import { LogEntry, LogType, AnalysisMode } from '../types';

interface LogPanelProps {
  logs: LogEntry[];
}

const getIconForLogType = (type: LogType) => {
  switch(type) {
    case LogType.Analysis: return '👁️';
    case LogType.Audio: return '🔊';
    case LogType.System: return '⚙️';
    case LogType.Error: return '⚠️';
    case LogType.Gesture: return '👋';
    default: return '➡️';
  }
}

const getColorForLogType = (type: LogType, mode?: AnalysisMode) => {
    switch(type) {
        case LogType.Analysis:
            switch(mode) {
                case AnalysisMode.ObjectDetection: return 'border-l-4 border-pink-400';
                case AnalysisMode.HandGesture: return 'border-l-4 border-teal-400';
                default: return 'border-l-4 border-gray-400';
            }
        case LogType.Audio: return 'border-l-4 border-orange-400';
        case LogType.Gesture: return 'border-l-4 border-teal-400';
        case LogType.System: return 'border-l-4 border-gray-500';
        case LogType.Error: return 'border-l-4 border-red-500';
        default: return 'border-l-4 border-vista-light-gray';
    }
}

const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full flex flex-col">
      <div ref={logContainerRef} className="flex-grow overflow-y-auto pr-2 space-y-3 min-h-[200px] max-h-[400px]">
        {logs.length === 0 && (
            <div className="flex items-center justify-center h-full text-vista-text-muted">
                <p>Log is empty. Start the system to begin analysis.</p>
            </div>
        )}
        {logs.map(log => (
          <div key={log.id} className={`p-3 bg-vista-dark rounded-md shadow ${getColorForLogType(log.type, log.mode)}`}>
            <div className="flex items-center justify-between text-xs text-vista-text-muted mb-1">
              <span className="font-mono">{getIconForLogType(log.type)} [{log.type.toUpperCase()}] {log.mode ? `(${log.mode})` : ''}</span>
              <span className="font-mono">{log.timestamp.toLocaleTimeString()}</span>
            </div>
            <p className="text-sm text-vista-text">{log.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogPanel;
