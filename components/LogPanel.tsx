
import React from 'react';
import { LogEntry, LogType } from '../types';

interface LogPanelProps {
  logs: LogEntry[];
}

const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const getLogColor = (type: LogType) => {
    switch (type) {
      case LogType.Success: return 'text-green-400';
      case LogType.Error: return 'text-red-400';
      case LogType.Warning: return 'text-yellow-400';
      case LogType.Command: return 'text-cyan-400';
      case LogType.Response: return 'text-fuchsia-400';
      case LogType.Audio: return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="h-96 overflow-y-auto bg-vista-dark p-2 rounded-md font-mono text-xs">
      {logs.map(log => (
        <div key={log.id} className="flex">
          <span className="text-gray-500 mr-2">{log.timestamp}</span>
          <span className={`${getLogColor(log.type)} font-bold mr-2`}>[{log.type}]</span>
          <span className="flex-1 text-gray-300">{log.message}</span>
        </div>
      ))}
    </div>
  );
};

export default LogPanel;
