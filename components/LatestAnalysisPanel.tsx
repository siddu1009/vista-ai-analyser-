import React from 'react';
import { AnalysisMode } from '../types';
import EyeIcon from './icons/EyeIcon';

interface LatestAnalysisPanelProps {
    currentMode: AnalysisMode;
    latestAnalysis: string | null;
    isAnalyzing: boolean;
}

const LatestAnalysisPanel: React.FC<LatestAnalysisPanelProps> = ({ currentMode, latestAnalysis, isAnalyzing }) => {
    return (
        <div className="w-full bg-vista-gray p-4 rounded-lg shadow-lg flex flex-col">
            <div className="flex items-center space-x-3 text-vista-accent border-b-2 border-vista-light-gray pb-2 mb-2">
                <EyeIcon className="w-6 h-6" />
                <div>
                    <h2 className="text-xl font-bold">Latest Analysis</h2>
                    <p className="text-xs text-vista-text-muted">Current Mode: {currentMode}</p>
                </div>
            </div>
            <div className="flex-grow text-sm text-vista-text min-h-[60px]">
                {isAnalyzing && (
                    <div className="flex items-center space-x-2 text-vista-text-muted">
                         <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-vista-accent"></div>
                         <span>Analyzing scene...</span>
                    </div>
                )}
                {!isAnalyzing && (
                    <p>{latestAnalysis || "Start the camera to begin analysis."}</p>
                )}
            </div>
        </div>
    );
};

export default LatestAnalysisPanel;
