import React from "react";
import { ArrowDown, ArrowUp, Pause } from "lucide-react";

interface HRVMonitorProps {
  rmssd: number | null;
  baseline?: number | null;
}

const HRVMonitor: React.FC<HRVMonitorProps> = ({ rmssd, baseline }) => {
  const hasRmssd = rmssd !== null && rmssd > 0;
  
  let deltaPercent = 0;
  if (hasRmssd && baseline && baseline > 0) {
    deltaPercent = ((rmssd - baseline) / baseline) * 100;
  }

  const hasData = hasRmssd && baseline && baseline > 0;
  const isStressed = hasData && deltaPercent < -5; // Lower HRV = Stress
  const isRelaxed = hasData && deltaPercent > 5; // Higher HRV = Relaxed
  
  const textColor = !hasData 
    ? "text-primary opacity-80" 
    : isStressed 
      ? "text-red-400" 
      : isRelaxed 
        ? "text-primary" 
        : "text-primary";
        
  const glowShadow = !hasData 
    ? "drop-shadow-md" 
    : isStressed 
      ? "drop-shadow-[0_0_20px_rgba(248,113,113,0.6)]" 
      : isRelaxed 
        ? "drop-shadow-[0_0_20px_rgba(0,24,100,0.35)]" 
        : "drop-shadow-[0_0_20px_rgba(96,165,250,0.6)]";

  return (
    <div className="flex flex-col items-start">
      <div className="flex items-baseline gap-1">
        <span className={`text-4xl font-mono tracking-wider ${textColor} ${glowShadow}`}>
          {hasData ? (
            `${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}`
          ) : (
             "--"
          )}
        </span>
        <span className={`text-2xl font-medium ${textColor} ${glowShadow}`}>%</span>
      </div>

      <div className="flex items-center gap-2 mt-1 w-full">
        {hasData && deltaPercent !== 0 ? (
          deltaPercent > 0 ? (
             <span className="flex items-center text-xs font-semibold text-primary/75 uppercase tracking-widest"><ArrowUp className="w-4 h-4 mr-1" /> HRV Delta (Relaxed)</span>
          ) : (
             <span className="flex items-center text-xs font-semibold text-primary/75 uppercase tracking-widest"><ArrowDown className="w-4 h-4 mr-1" /> HRV Delta (Load)</span>
          )
        ) : (
          <span className="flex items-center text-xs font-semibold text-primary/75 uppercase tracking-widest"><Pause className="w-3 h-3 mr-1" /> HRV Delta (Baseline)</span>
        )}
      </div>
    </div>
  );
};

export default HRVMonitor;