
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isListening: boolean;
  interimTranscript: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isListening, interimTranscript }) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);
  
  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-96">
      <div className="flex-1 overflow-y-auto pr-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex items-start gap-2.5 my-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
            {msg.sender === 'jarvis' && (
              <div className="w-8 h-8 rounded-full bg-vista-accent flex items-center justify-center font-bold text-white">J</div>
            )}
            <div className={`flex flex-col max-w-[320px] leading-1.5 p-3 border-gray-200 ${msg.sender === 'user' ? 'bg-vista-accent rounded-s-xl rounded-ee-xl' : 'bg-gray-700 rounded-e-xl rounded-es-xl'}`}>
              <p className="text-sm font-normal text-white">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={isListening ? interimTranscript : inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isListening ? "Listening..." : "Message Jarvis..."}
          className="flex-1 bg-vista-dark border border-gray-600 rounded-md p-2 text-vista-text focus:ring-vista-accent focus:border-vista-accent"
          disabled={isListening}
        />
        <button
          onClick={handleSend}
          className="bg-vista-accent text-white p-2 rounded-md hover:bg-blue-500 transition-colors disabled:bg-gray-500"
          disabled={isListening}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
