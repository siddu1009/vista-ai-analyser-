import React, { useRef, useEffect, useState } from 'react';
import { LogEntry, LogType, AnalysisMode } from '../types';
import HistoryIcon from './icons/HistoryIcon';
import TrashIcon from './icons/TrashIcon';

interface LogPanelProps {
  logs: LogEntry[];
  onSummarize: (minutes: number) => void;
  isSummarizing: boolean;
  onClearLogs: () => void;
}

const getIconForLogType = (type: LogType) => {
  switch(type) {
    case LogType.Analysis: return '👁️';
    case LogType.Audio: return '🔊';
    case LogType.System: return '⚙️';
    case LogType.Summary: return '✨';
    case LogType.Error: return '⚠️';
    case LogType.Gesture: return '👋';
    default: return '➡️';
  }
}

const getColorForLogType = (type: LogType, mode?: AnalysisMode) => {
    switch(type) {
        case LogType.Analysis:
            switch(mode) {
                case AnalysisMode.Descriptive: return 'border-l-4 border-blue-400';
                case AnalysisMode.Analytic: return 'border-l-4 border-purple-400';
                case AnalysisMode.Assistive: return 'border-l-4 border-green-400';
                case AnalysisMode.Contextual: return 'border-l-4 border-yellow-400';
                case AnalysisMode.ObjectDetection: return 'border-l-4 border-pink-400';
                case AnalysisMode.HandGesture: return 'border-l-4 border-teal-400';
                default: return 'border-l-4 border-gray-400';
            }
        case LogType.Audio: return 'border-l-4 border-orange-400';
        case LogType.Gesture: return 'border-l-4 border-teal-400';
        case LogType.System: return 'border-l-4 border-gray-500';
        case LogType.Summary: return 'border-l-4 border-vista-accent';
        case LogType.Error: return 'border-l-4 border-red-500';
        default: return 'border-l-4 border-vista-light-gray';
    }
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, onSummarize, isSummarizing, onClearLogs }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [summaryWindow, setSummaryWindow] = useState(5);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full bg-vista-gray p-4 rounded-lg shadow-lg flex flex-col">
       <div className="flex items-center space-x-3 text-vista-accent border-b-2 border-vista-light-gray pb-2 mb-2">
        <HistoryIcon className="w-6 h-6" />
        <div>
            <h2 className="text-xl font-bold">Scene Log</h2>
            <p className="text-xs text-vista-text-muted">A chronological history of analyses.</p>
        </div>
        <button onClick={onClearLogs} className="ml-auto p-2 text-vista-text-muted hover:text-white transition-colors" aria-label="Clear Log">
            <TrashIcon className="w-5 h-5"/>
        </button>
      </div>

      <div ref={logContainerRef} className="flex-grow overflow-y-auto pr-2 space-y-3 min-h-[200px]">
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
       <div className="border-t-2 border-vista-light-gray pt-3 mt-3 space-y-2">
          <div>
            <label htmlFor="summary-window" className="flex justify-between mb-1 text-sm font-medium text-vista-text">
                <span>Summary Window</span>
                <span>{summaryWindow} min</span>
            </label>
            <input
                id="summary-window"
                type="range"
                min="1"
                max="15"
                step="1"
                value={summaryWindow}
                onChange={(e) => setSummaryWindow(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-vista-light-gray rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <button
            onClick={() => onSummarize(summaryWindow)}
            disabled={isSummarizing}
            className="w-full px-4 py-2 bg-vista-accent text-white text-sm font-semibold rounded-lg hover:bg-opacity-90 disabled:bg-vista-light-gray disabled:cursor-not-allowed transition-colors"
          >
            {isSummarizing ? 'Summarizing...' : 'Generate Summary'}
          </button>
      </div>
    </div>
  );
};

export default LogPanel;
