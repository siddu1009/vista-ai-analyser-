import React, { useState, useEffect } from 'react';
import MicIcon from './icons/MicIcon';
import { VoiceStatus } from '../types';

interface VoiceStatusIndicatorProps {
    status: VoiceStatus;
    reconnectDelay?: number | null; // Delay in seconds
}

const VoiceStatusIndicator: React.FC<VoiceStatusIndicatorProps> = ({ status, reconnectDelay }) => {
    const [countdown, setCountdown] = useState(reconnectDelay);

    useEffect(() => {
        setCountdown(reconnectDelay);
        if (reconnectDelay === null || reconnectDelay <= 0) return;

        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev && prev > 1) {
                    return prev - 1;
                }
                clearInterval(interval);
                return null;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [reconnectDelay]);

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
                    iconClass: "text-vista-accent"
                };
             case 'waiting_command':
                return {
                    text: "Listening...",
                    iconClass: "text-green-400 animate-pulse"
                };
            case 'processing':
                return {
                    text: "Processing...",
                    iconClass: "text-yellow-400"
                };
            case 'reconnecting':
                return {
                    text: `Reconnecting${countdown ? ` in ${Math.round(countdown)}s` : '...'}`,
                    iconClass: "text-yellow-500"
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
