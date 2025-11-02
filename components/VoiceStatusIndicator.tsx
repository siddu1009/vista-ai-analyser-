
import React from 'react';
import { VoiceStatus } from '../types';

interface VoiceStatusIndicatorProps {
  status: VoiceStatus;
}

const VoiceStatusIndicator: React.FC<VoiceStatusIndicatorProps> = ({ status }) => {
  const getStatusStyles = () => {
    switch (status) {
      case VoiceStatus.ListeningWakeWord:
        return { text: "Listening", color: "bg-blue-500", animation: "animate-pulse" };
      case VoiceStatus.WaitingForCommand:
        return { text: "Yes, Sir?", color: "bg-green-500", animation: "animate-pulse" };
      case VoiceStatus.Processing:
        return { text: "Processing...", color: "bg-yellow-500", animation: "animate-spin" };
      case VoiceStatus.Speaking:
        return { text: "Speaking", color: "bg-vista-accent", animation: "" };
      default:
        return { text: "Offline", color: "bg-gray-500", animation: "" };
    }
  };

  const { text, color, animation } = getStatusStyles();

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-6 flex items-center justify-center">
        <div className={`absolute w-full h-1 ${color} rounded-full transition-colors`}></div>
        {status === VoiceStatus.Speaking && (
          <div className="absolute w-full h-1.5 bg-white rounded-full animate-ping-slow"></div>
        )}
         {status === VoiceStatus.Processing && (
          <div className="absolute w-12 h-1 bg-white rounded-full animate-pulse-fast"></div>
        )}
      </div>
      <span className="text-xs mt-1 font-display uppercase tracking-wider">{text}</span>
      <style>{`
        @keyframes ping-slow {
            75%, 100% {
                transform: scale(1.5);
                opacity: 0;
            }
        }
        .animate-ping-slow {
            animation: ping-slow 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes pulse-fast {
            50% {
                opacity: .2;
            }
        }
        .animate-pulse-fast {
            animation: pulse-fast 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default VoiceStatusIndicator;
