
import React, { useState } from 'react';

interface AccordionPanelProps {
  title: string;
  children: React.ReactNode;
  isOpenDefault?: boolean;
}

const AccordionPanel: React.FC<AccordionPanelProps> = ({ title, children, isOpenDefault = false }) => {
  const [isOpen, setIsOpen] = useState(isOpenDefault);

  return (
    <div className="bg-vista-gray rounded-lg shadow-md overflow-hidden">
      <button
        className="w-full flex justify-between items-center p-3 text-left font-bold text-vista-accent bg-gray-700 hover:bg-gray-600 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        <svg
          className={`w-5 h-5 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>
      {isOpen && (
        <div className="p-3">
          {children}
        </div>
      )}
    </div>
  );
};

export default AccordionPanel;
