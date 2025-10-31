import React from 'react';
import MicIcon from './icons/MicIcon';

export type VoiceStatus = 'off' | 'ready' | 'listening' | 'processing';

interface VoiceStatusIndicatorProps {
    status: VoiceStatus;
}

const VoiceStatusIndicator: React.FC<VoiceStatusIndicatorProps> = ({ status }) => {
    if (status === 'off') {
        return null;
    }

    const getStatusContent = () => {
        switch (status) {
            case 'ready':
                return {
                    text: "Voice Ready",
                    iconClass: "text-vista-text-muted"
                };
            case 'listening':
                return {
                    text: "Say 'Jarvis'...",
                    iconClass: "text-vista-accent animate-pulse"
                };
            case 'processing':
                return {
                    text: "Processing...",
                    iconClass: "text-yellow-400"
                };
            default:
                 return { text: "", iconClass: ""};
        }
    };

    const { text, iconClass } = getStatusContent();

    return (
        <div className="flex items-center space-x-2 bg-vista-gray px-3 py-1 rounded-full text-sm">
            <MicIcon className={`w-4 h-4 transition-colors ${iconClass}`} />
            <span className="text-vista-text-muted">{text}</span>
        </div>
    );
};

export default VoiceStatusIndicator;