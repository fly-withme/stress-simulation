'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Star, Heart, Circle, Square, Triangle, Hexagon, Octagon, 
  Cloud, Sun, Moon, Zap, Umbrella, Wind, Snowflake, Flame 
} from 'lucide-react';

const ICONS = [Star, Heart, Circle, Square, Triangle, Hexagon, Octagon, Cloud, Sun, Moon, Zap, Umbrella, Wind, Snowflake, Flame];
const DISPLAY_TIME = 1500;
const BLANK_TIME = 500;

export interface NBackScore {
  hits: number;
  misses: number;
  falseAlarms: number;
}

interface NBackTestProps {
  n?: number;
  onScoreUpdate?: (score: NBackScore) => void;
  isActive?: boolean;
}

export default function NBackTest({ n = 2, onScoreUpdate, isActive = true }: NBackTestProps) {
  const [currentIconIdx, setCurrentIconIdx] = useState<number | null>(null);
  const [score, setScore] = useState({ hits: 0, misses: 0, falseAlarms: 0 });
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [trialCount, setTrialCount] = useState(0);

  const sequenceRef = useRef<number[]>([]);
  const hasRespondedRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (onScoreUpdate) {
      onScoreUpdate(score);
    }
  }, [score, onScoreUpdate]);

  // Fix nextTrial recursive invocation
  const nextTrialRef = useRef<(() => void) | null>(null);

  const nextTrial = useCallback(() => {
    // Check if the PREVIOUS trial was a missed target
    if (sequenceRef.current.length > n && !hasRespondedRef.current) {
      const prevIcon = sequenceRef.current[sequenceRef.current.length - 1];
      const targetIcon = sequenceRef.current[sequenceRef.current.length - 1 - n];
      if (prevIcon === targetIcon) {
        setScore(s => ({ ...s, misses: s.misses + 1 }));
      }
    }

    hasRespondedRef.current = false;
    setFeedback(null);

    // Generate new icon index
    const isTarget = sequenceRef.current.length >= n && Math.random() < 0.3;
    let nextIconIdx = 0;
    
    if (isTarget) {
      nextIconIdx = sequenceRef.current[sequenceRef.current.length - n];
    } else {
      do {
        nextIconIdx = Math.floor(Math.random() * ICONS.length);
      } while (sequenceRef.current.length >= n && nextIconIdx === sequenceRef.current[sequenceRef.current.length - n]);
    }

    sequenceRef.current.push(nextIconIdx);
    setCurrentIconIdx(nextIconIdx);
    setTrialCount(prev => prev + 1);

    // Hide icon after DISPLAY_TIME
    setTimeout(() => {
      setCurrentIconIdx(null);
    }, DISPLAY_TIME);

    // Schedule next trial
    timerRef.current = setTimeout(() => {
      if (nextTrialRef.current) nextTrialRef.current();
    }, DISPLAY_TIME + BLANK_TIME);

  }, [n]);

  useEffect(() => {
    nextTrialRef.current = nextTrial;
  }, [nextTrial]);

  useEffect(() => {
    if (isActive) {
      sequenceRef.current = [];
      hasRespondedRef.current = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
      setScore({ hits: 0, misses: 0, falseAlarms: 0 });
      setTrialCount(0);
      nextTrial();
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrentIconIdx(null);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, nextTrial]);

  const handleMatch = useCallback(() => {
    if (!isActive || currentIconIdx === null || hasRespondedRef.current) return;
    
    hasRespondedRef.current = true;
    
    if (sequenceRef.current.length <= n) {
      // Too early to match
      setScore(s => ({ ...s, falseAlarms: s.falseAlarms + 1 }));
      setFeedback('incorrect');
      return;
    }

    const currentIdx = sequenceRef.current.length - 1;
    const targetIconIdx = sequenceRef.current[currentIdx - n];

    if (currentIconIdx === targetIconIdx) {
      setScore(s => ({ ...s, hits: s.hits + 1 }));
      setFeedback('correct');
    } else {
      setScore(s => ({ ...s, falseAlarms: s.falseAlarms + 1 }));
      setFeedback('incorrect');
    }
  }, [isActive, currentIconIdx, n]);

  // Keyboard shortcut for Match
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleMatch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMatch]);

  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-transparent w-full max-w-md mx-auto h-96">
        <div className="animate-pulse flex flex-col items-center">
           <div className="text-3xl font-bold text-primary mb-2">Paused</div>
           <div className="text-slate-400 text-sm">Session is currently paused</div>
        </div>
      </div>
    );
  }

  const CurrentIcon = currentIconIdx !== null ? ICONS[currentIconIdx] : null;

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto h-96 relative">
      <div className="absolute top-4 left-4">
        <div className="px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-lg font-bold tracking-widest text-sm uppercase">
          {n}-Back Level
        </div>
      </div>
      <div className="absolute top-4 right-4 flex gap-4 text-sm font-mono text-slate-500">
        <span className="text-green-400">H: {score.hits}</span>
        <span className="text-red-400">FA: {score.falseAlarms}</span>
        <span className="text-orange-400">M: {score.misses}</span>
      </div>
      
      <div className="flex items-center justify-center h-64 w-64 mb-8">
        {CurrentIcon ? (
          <div className="text-primary drop-shadow-[0_0_20px_rgba(59,152,180,0.6)]">
            <CurrentIcon size={240} strokeWidth={2} />
          </div>
        ) : (
          <div className="w-4 h-4 rounded-full bg-slate-700"></div> // fixation dot
        )}
      </div>

      <div className="h-12 w-full flex justify-center items-center mb-4">
        {feedback === 'correct' && <div className="text-green-500 font-bold text-xl uppercase tracking-widest animate-pulse">Correct</div>}
        {feedback === 'incorrect' && <div className="text-red-500 font-bold text-xl uppercase tracking-widest animate-pulse">Incorrect</div>}
      </div>

      <button
        onClick={handleMatch}
        className="px-12 py-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white rounded-2xl font-bold text-xl transition-all shadow-lg active:scale-95 w-full max-w-xs cursor-pointer"
      >
        MATCH (Space)
      </button>
    </div>
  );
}
