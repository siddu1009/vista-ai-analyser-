import React, { useState, ReactNode } from 'react';
import ChevronDownIcon from './icons/ChevronDownIcon';

interface AccordionPanelProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

const AccordionPanel: React.FC<AccordionPanelProps> = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="w-full bg-vista-gray rounded-lg shadow-lg flex flex-col">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-3 text-vista-accent">
          {icon}
          <h2 className="text-xl font-bold text-vista-text">{title}</h2>
        </div>
        <ChevronDownIcon className={`w-6 h-6 text-vista-text-muted transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[1000px]' : 'max-h-0'}`}>
        <div className="p-4 border-t-2 border-vista-light-gray">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AccordionPanel;
