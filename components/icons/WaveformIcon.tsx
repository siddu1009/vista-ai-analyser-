import React from 'react';

const WaveformIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h.007v.007H3.75V12Zm4.125 0h.007v.007h-.007V12Zm4.125 0h.007v.007h-.007V12Zm4.125 0h.007v.007h-.007V12Zm4.125 0h.007v.007h-.007V12Z" />
  </svg>
);

export default WaveformIcon;
