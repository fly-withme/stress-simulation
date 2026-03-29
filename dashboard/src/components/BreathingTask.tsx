"use client";

import React, { useEffect, useState } from "react";

export default function BreathingTask() {
  const [phase, setPhase] = useState<"START" | "IN" | "HOLD_IN" | "OUT" | "HOLD_OUT">("START");
  
  useEffect(() => {
    // Start small and immediately trigger the IN phase to let the CSS transition animate it to big size
    const startTimer = setTimeout(() => {
      setPhase("IN");
    }, 50);

    let currentPhase = "IN";
    
    // 4-4-4-4 Box breathing
    const interval = setInterval(() => {
      if (currentPhase === "IN") {
        currentPhase = "HOLD_IN";
      } else if (currentPhase === "HOLD_IN") {
        currentPhase = "OUT";
      } else if (currentPhase === "OUT") {
        currentPhase = "HOLD_OUT";
      } else {
        currentPhase = "IN";
      }
      setPhase(currentPhase as "IN" | "HOLD_IN" | "OUT" | "HOLD_OUT");
    }, 4000); 
    
    return () => {
      clearTimeout(startTimer);
      clearInterval(interval);
    };
  }, []);

  const getScale = () => {
    if (phase === "IN" || phase === "HOLD_IN") return "scale-100";
    return "scale-[0.4]"; // Applies to START, OUT, and HOLD_OUT
  };

  const getText = () => {
    if (phase === "START" || phase === "IN") return "Breathe In...";
    if (phase === "HOLD_IN") return "Hold...";
    if (phase === "OUT") return "Breathe Out...";
    if (phase === "HOLD_OUT") return "Hold...";
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-10 mt-4">
      <div className="relative w-80 h-80 flex items-center justify-center">
        {/* Background guides */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
          <div className="w-80 h-80 rounded-full border-2 border-slate-300/50 border-dashed transition-all duration-4000"></div>
        </div>

        {/* Central Breathing Orb - 3D render look */}
        <div 
          className={`z-10 w-80 h-80 rounded-full transition-transform duration-4000 ease-in-out flex items-center justify-center relative ${getScale()}`}
          style={{
            background: "radial-gradient(circle at 35% 35%, rgba(103, 232, 249, 1) 0%, rgba(6, 182, 212, 0.9) 25%, rgba(8, 145, 178, 0.95) 50%, rgba(22, 78, 99, 0.9) 80%, rgba(8, 47, 73, 1) 100%)",
            boxShadow: "inset -25px -25px 50px rgba(0,0,0,0.6), inset 15px 15px 30px rgba(255,255,255,0.5), 0 0 50px rgba(6,182,212,0.5)"
          }}
        >
          {/* Subtle inner core highlight to enhance 3D feel */}
          <div className="absolute top-1/4 left-1/4 w-1/3 h-1/3 rounded-full bg-white/20 blur-xl mix-blend-overlay"></div>
        </div>
      </div>

      <div className="mt-16 h-8 text-center z-20">
        <div className="font-light tracking-[0.4em] uppercase text-xl sm:text-2xl text-slate-700 drop-shadow-md transition-all duration-1000 animate-pulse">
          {getText()}
        </div>
      </div>
    </div>
  );
}