import React from 'react';
import ChatIcon from './icons/ChatIcon';

interface LatestInsightPanelProps {
    latestInsight: string | null;
    isResponding: boolean;
}

const LatestInsightPanel: React.FC<LatestInsightPanelProps> = ({ latestInsight, isResponding }) => {
    return (
        <div className="w-full bg-vista-gray p-4 rounded-lg shadow-lg flex flex-col">
            <div className="flex items-center space-x-3 text-vista-accent border-b-2 border-vista-light-gray pb-2 mb-2">
                <ChatIcon className="w-6 h-6" />
                <div>
                    <h2 className="text-xl font-bold">Jarvis's Latest Insight</h2>
                    <p className="text-xs text-vista-text-muted">Synthesized from VISTA's Scene Log.</p>
                </div>
            </div>
            <div className="flex-grow text-sm text-vista-text min-h-[60px]">
                {isResponding && (
                    <div className="flex items-center space-x-2 text-vista-text-muted">
                         <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-vista-accent"></div>
                         <span>Jarvis is thinking...</span>
                    </div>
                )}
                {!isResponding && (
                    <p>{latestInsight || "Ask Jarvis a question to get started."}</p>
                )}
            </div>
        </div>
    );
};

export default LatestInsightPanel;