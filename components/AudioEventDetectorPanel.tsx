import React from 'react';
import { LogEntry } from '../types';
import WaveformIcon from './icons/WaveformIcon';

interface AudioEventDetectorPanelProps {
    isAudioActive: boolean;
    latestAudioEvent: LogEntry | undefined;
}

const AudioEventDetectorPanel: React.FC<AudioEventDetectorPanelProps> = ({ isAudioActive, latestAudioEvent }) => {
    return (
        <div className="w-full bg-vista-gray p-4 rounded-lg shadow-lg flex flex-col">
            <div className="flex items-center space-x-3 text-vista-accent border-b-2 border-vista-light-gray pb-2 mb-2">
                <WaveformIcon className="w-6 h-6" />
                <div>
                    <h2 className="text-xl font-bold">Audio Event Detector</h2>
                    <p className="text-xs text-vista-text-muted">Detects changes in sound levels.</p>
                </div>
            </div>
            <div className="flex-grow text-sm text-vista-text min-h-[60px]">
                <div className="flex items-center space-x-2 mb-2">
                     <span className={`w-3 h-3 rounded-full ${isAudioActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                     <span>{isAudioActive ? 'Audio is active and listening.' : 'Audio is off. Start system to detect events.'}</span>
                </div>
                {isAudioActive && (
                    <div className="p-2 bg-vista-dark rounded">
                        {latestAudioEvent && (
                            <>
                                <p className="font-semibold">Last Event:</p>
                                <p className="text-vista-text-muted">{latestAudioEvent.message}</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AudioEventDetectorPanel;
