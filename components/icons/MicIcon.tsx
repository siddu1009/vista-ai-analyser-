
import React from 'react';

const MicIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6V7.5a6 6 0 0 0-12 0v5.25a6 6 0 0 0 6 6Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5v2.25a7.5 7.5 0 0 1-15 0v-2.25" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a.75.75 0 0 0 .75-.75V15.75a.75.75 0 0 0-1.5 0v2.25a.75.75 0 0 0 .75.75Z" />
  </svg>
);

export default MicIcon;
