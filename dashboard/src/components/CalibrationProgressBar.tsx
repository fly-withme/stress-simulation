import React, { useState, useEffect } from "react";

interface Props {
  durationSec: number;
  startTime: number;
}

export default function CalibrationProgressBar({ durationSec, startTime }: Props) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let animationFrameId: number;

    const updateProgress = () => {
      const now = Date.now();
      const elapsedMs = now - startTime;
      const percent = Math.min(100, Math.max(0, (elapsedMs / (durationSec * 1000)) * 100));
      
      setProgress(percent);

      if (percent < 100) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    return () => cancelAnimationFrame(animationFrameId);
  }, [durationSec, startTime]);

  return (
    <div className="fixed top-0 left-0 w-full h-2 bg-slate-50 z-50 overflow-hidden">
      <div 
        className="h-full bg-primary/80 shadow-[0_0_15px_rgba(59,152,180,0.8)]" 
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}