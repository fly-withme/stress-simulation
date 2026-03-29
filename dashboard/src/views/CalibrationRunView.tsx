"use client";

import React from "react";
import { Play, X } from "lucide-react";
import { DESIGN } from "../constants/design";

interface CalibrationRunViewProps {
  beginLiveSession: () => void;
  breathingPhaseLabel: string;
  isCalibrationRunning: boolean;
  calibrationElapsed: number;
  startCalibration: () => void;
  resetCalibration: () => void;
}

export default function CalibrationRunView({
  beginLiveSession,
  breathingPhaseLabel,
  isCalibrationRunning,
  calibrationElapsed,
  startCalibration,
  resetCalibration
}: CalibrationRunViewProps) {
  const durationSec = DESIGN.metrics.calibrationDurationSec;

  return (
    <main className="flex-1 w-full flex flex-col relative overflow-hidden bg-soft-white">
      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div className="relative z-50 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shrink-0 w-full">
        <div className="flex items-center gap-3">
          <span className="live-dot-off w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-slate-800 text-sm font-semibold tracking-widest uppercase select-none">Calibration</span>
          <span className="ml-2 text-slate-300 text-xs">|</span>
          <span className="text-slate-500 text-xs font-medium">Establishing Baseline</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => beginLiveSession()}
            className="flex items-center gap-1.5 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
            Skip Calibration
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative w-full h-full">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: 700,
          height: 700,
          borderRadius: "9999px",
          background: "radial-gradient(circle, rgba(59,87,159,0.05) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Top label */}
      <p className="relative z-10 text-slate-500 text-xs tracking-[0.25em] uppercase font-semibold mb-14 select-none">
        Baseline Calibration
      </p>

      <div className="relative z-10 flex items-center justify-center" style={{ width: 340, height: 340 }}>
        {/* Breathing orb — uses 6-layer gradient 3-D sphere (only the ball remains) */}
        <div className={`calib-orb ${isCalibrationRunning ? "calib-breathe-active" : "calib-idle"}`}>
          <div className="calib-sphere" />
        </div>
      </div>

      {/* Phase label */}
      <div className="relative z-10 mt-12 flex flex-col items-center gap-3 select-none">
        <p
          className="text-slate-800 text-2xl font-light tracking-widest transition-opacity duration-500"
          style={{ fontFamily: "inherit", letterSpacing: "0.18em" }}
        >
          {breathingPhaseLabel}
        </p>
        {/* Cycle progress dots */}
        <div className="flex gap-1.5 mt-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const cycle = calibrationElapsed % 10;
            let active = false;
            if (isCalibrationRunning) {
              const activeDots = cycle < 5 ? cycle + 1 : 9 - cycle;
              active = i < activeDots;
            }
            return (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: 5,
                  height: 5,
                  background: active ? "var(--color-primary)" : "var(--color-slate-200)",
                  transform: active ? "scale(1.3)" : "scale(1)",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Session progress text */}
      <p className="relative z-10 mt-6 text-slate-500 text-sm tabular-nums tracking-wider select-none">
        {isCalibrationRunning
          ? `${calibrationElapsed}s / ${durationSec}s`
          : "Press Start when ready"}
      </p>

      {/* Controls */}
      <div className="relative z-10 mt-10 mb-8 flex items-center gap-4">
        {!isCalibrationRunning && (
          <button
            onClick={startCalibration}
            className="flex items-center gap-2.5 px-8 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer bg-slate-800 text-white hover:bg-slate-900 shadow-md"
          >
            <Play className="w-4 h-4" />
            Start
          </button>
        )}
        <button
          onClick={resetCalibration}
          disabled={!isCalibrationRunning && calibrationElapsed === 0}
          className="flex items-center gap-2.5 px-8 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed bg-transparent text-slate-500 border-[1.5px] border-slate-200 hover:bg-slate-50"
        >
          Reset
        </button>
      </div>
      </div>
    </main>
  );
}
