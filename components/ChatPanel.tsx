import React, { useState, useEffect, useRef } from 'react';
import SendIcon from './icons/SendIcon';
import MicIcon from './icons/MicIcon';
import { Content } from '@google/genai';
import { AnalysisMode, VoiceActivationMode } from '../types';

interface ChatPanelProps {
    onSendMessage: (message: string) => void;
    isSending: boolean;
    history: Content[];
    analysisMode: AnalysisMode;
    voiceActivationMode: VoiceActivationMode;
    onManualListen: () => void;
}

const MessageContent: React.FC<{ text: string }> = ({ text }) => {
    const regex = /(\[.*?\]\(.*?\))|(\*\*.*?\*\*)/g;
    const parts = text.split(regex).filter(p => p); // filter out undefined/empty strings

    return (
        <p className="text-sm whitespace-pre-wrap break-words">
            {parts.map((part, index) => {
                const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
                if (linkMatch) {
                    const [, title, url] = linkMatch;
                    return (
                        <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="text-vista-accent hover:underline">
                            {title}
                        </a>
                    );
                }
                
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={index}>{part.slice(2, -2)}</strong>;
                }

                return part;
            })}
        </p>
    );
};


const ChatPanel: React.FC<ChatPanelProps> = ({ onSendMessage, isSending, history, analysisMode, voiceActivationMode, onManualListen }) => {
    const [message, setMessage] = useState('');
    const historyContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (historyContainerRef.current) {
          historyContainerRef.current.scrollTop = historyContainerRef.current.scrollHeight;
        }
      }, [history]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !isSending) {
            onSendMessage(message.trim());
            setMessage('');
        }
    };

    const placeholderText = isSending 
        ? "Waiting for response..." 
        : analysisMode === AnalysisMode.ContextualQnA 
        ? "Ask about what you see..."
        : "Ask Jarvis a question...";

    return (
        <div className="flex flex-col space-y-3">
             <div ref={historyContainerRef} className="flex-grow space-y-4 max-h-64 overflow-y-auto pr-2">
                {history.map((entry, index) => {
                    const textPart = entry.parts.find(p => p.text);
                    if (!textPart || !textPart.text) return null; // Don't render tool calls/responses

                    if (entry.role === 'user') {
                        return (
                            <div key={index} className="flex justify-end">
                                <div className="bg-vista-accent text-white p-3 rounded-lg max-w-xs md:max-w-md">
                                    <MessageContent text={textPart.text} />
                                </div>
                            </div>
                        )
                    }
                    if (entry.role === 'model') {
                        return (
                            <div key={index} className="flex justify-start">
                                 <div className="bg-vista-light-gray text-vista-text p-3 rounded-lg max-w-xs md:max-w-md">
                                    <MessageContent text={textPart.text} />
                                </div>
                            </div>
                        )
                    }
                    return null;
                })}
             </div>
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 flex-shrink-0">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={placeholderText}
                    disabled={isSending}
                    className="w-full bg-vista-light-gray border border-vista-dark text-vista-text text-sm rounded-lg focus:ring-vista-accent focus:border-vista-accent p-2.5"
                    aria-label="Chat input"
                />
                {voiceActivationMode === VoiceActivationMode.Off && (
                    <button
                        type="button"
                        onClick={onManualListen}
                        disabled={isSending}
                        className="p-2.5 bg-vista-light-gray text-vista-text rounded-lg hover:bg-opacity-90 disabled:bg-vista-dark disabled:cursor-not-allowed transition-colors"
                        aria-label="Activate voice command"
                    >
                       <MicIcon className="w-5 h-5" />
                    </button>
                )}
                <button
                    type="submit"
                    disabled={isSending || !message.trim()}
                    className="p-2.5 bg-vista-accent text-white rounded-lg hover:bg-opacity-90 disabled:bg-vista-light-gray disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                >
                    {isSending ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                        <SendIcon className="w-5 h-5" />
                    )}
                </button>
            </form>
        </div>
    );
};

export default ChatPanel;