"use client";

import React, { useState, useEffect } from "react";

interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
}

export default function BubbleTask() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  // Bubble Spawn-Logik
  useEffect(() => {
    const interval = setInterval(() => {
      setBubbles(prev => {
        if (prev.length > 8) return prev; // Limit max bubbles so it's not overwhelming
        return [
          ...prev,
          {
            id: Date.now(),
            x: Math.random() * 80 + 10, // 10% to 90%
            y: Math.random() * 80 + 10,
            size: Math.random() * 30 + 40, // 40px to 70px
            color: ['bg-primary', 'bg-blue-400', 'bg-indigo-400', 'bg-teal-400'][Math.floor(Math.random() * 4)],
          }
        ];
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Pop a bubble
  const popBubble = (id: number) => {
    setBubbles(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="w-full h-80 bg-white/50 rounded-3xl border border-slate-200 p-4 relative overflow-hidden text-slate-800 cursor-crosshair">
      {bubbles.map(bubble => (
        <div
          key={bubble.id}
          onClick={() => popBubble(bubble.id)}
          className={`absolute rounded-full cursor-pointer shadow-[0_0_15px_rgba(59,152,180,0.4)] transition-transform transform hover:scale-110 active:scale-90 animate-in fade-in zoom-in duration-300 ${bubble.color}`}
          style={{
            left: `${bubble.x}%`,
            top: `${bubble.y}%`,
            width: `${bubble.size}px`,
            height: `${bubble.size}px`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center pointer-events-none opacity-20">
        <span className="text-xl font-medium tracking-widest uppercase">Click bubbles to stay focused</span>
      </div>
    </div>
  );
}