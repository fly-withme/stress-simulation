import React from "react";

interface HRVMonitorProps {
  rmssd: number | null;
}

const HRVMonitor: React.FC<HRVMonitorProps> = ({ rmssd }) => {
  const hasRmssd = rmssd !== null && rmssd > 0;
  
  // Create a gentle, calming pulse for HRV, slightly slower than heart rate
  const pulseDuration = "2s"; 

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-[320px] aspect-square">
      <style>
        {`
          @keyframes heartbeat {
            0% { transform: scale(1); opacity: 0.8; }
            10% { transform: scale(1.15); opacity: 1; }
            20% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(1); opacity: 0.8; }
          }
          .animate-heartbeat {
            animation: heartbeat var(--pulse-duration, 1s) infinite;
            transform-origin: center;
          }
        `}
      </style>
      
      {/* Background circles */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
           className={`absolute w-56 h-56 rounded-full border-4 border-rose-500/20 ${hasRmssd ? 'animate-heartbeat' : ''}`}
           style={{ '--pulse-duration': pulseDuration } as React.CSSProperties}
        ></div>
        <div className="absolute w-44 h-44 rounded-full border-2 border-rose-500/10"></div>
        <div className="absolute w-32 h-32 rounded-full border border-rose-500/5 bg-rose-500/5"></div>
      </div>

      {/* Heart Icon SVG */}
      <div className="absolute top-[20%] text-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.6)]">
        <svg 
          width="40" 
          height="40" 
          viewBox="0 0 24 24" 
          fill="currentColor"
          className={hasRmssd ? "animate-heartbeat" : ""}
          style={{ '--pulse-duration': pulseDuration } as React.CSSProperties}
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </div>

      <div className="z-10 flex flex-col items-center justify-center mt-12 text-center">
        <div className="flex items-baseline gap-1 justify-center">
          <span className="text-6xl font-normal tracking-tight text-slate-100 mix-blend-screen drop-shadow-md">
            {hasRmssd ? Math.round(rmssd) : "--"}
          </span>
          <span className="text-xl font-medium text-slate-400 drop-shadow-md ml-1">ms</span>
        </div>
        <div
          className="text-[14px] font-bold tracking-widest text-slate-300 uppercase mt-2 w-full text-center"
          style={{ letterSpacing: "0.15em", transform: "scaleY(0.9)" }}
        >
          HRV (RMSSD)
        </div>
      </div>
    </div>
  );
};

export default HRVMonitor;
