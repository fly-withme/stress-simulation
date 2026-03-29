"use client";

import React from "react";

interface DeviceCheckViewProps {
  cameraSensorReady: boolean;
  pupilDilationSensorReady: boolean;
  hrvSensorReady: boolean;
  allCalibrationSensorsReady: boolean;
  isDevMode: boolean;
  openCalibrationRunView: (bypassDeviceCheck?: boolean) => void;
}

export default function DeviceCheckView({
  cameraSensorReady,
  pupilDilationSensorReady,
  hrvSensorReady,
  allCalibrationSensorsReady,
  isDevMode,
  openCalibrationRunView,
}: DeviceCheckViewProps) {
  return (
    <main className="flex-1 flex flex-col bg-soft-white w-full h-full relative">
      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div className="relative z-30 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <span className="live-dot-off w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-slate-800 text-sm font-semibold tracking-widest uppercase select-none">Device Check</span>
          <span className="ml-2 text-slate-300 text-xs">|</span>
          <span className="text-slate-500 text-xs font-medium">Pre-Session Setup</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-full overflow-hidden shadow-sm pr-1 py-1">
            <div className="flex items-center gap-2 px-4 border-r border-slate-200/60">
              <span className="font-mono text-[11px] font-semibold text-slate-600 uppercase tracking-widest">
                {allCalibrationSensorsReady ? 'Ready' : 'Waiting'}
              </span>
            </div>
            
            <button
              onClick={() => openCalibrationRunView(isDevMode && !allCalibrationSensorsReady ? true : undefined)}
              disabled={!allCalibrationSensorsReady && !isDevMode}
              className="flex items-center gap-1.5 px-4 py-1.5 ml-2 mr-0.5 text-[10px] font-bold uppercase tracking-wider text-white bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:hover:bg-primary rounded-full transition-colors cursor-pointer"
            >
              Start Calibration
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto w-full">
        <p className="text-slate-500 text-sm sm:text-base text-center max-w-2xl mb-8">
          Confirm all sensors are ready before starting baseline calibration.
        </p>

      <div className="w-full max-w-4xl mt-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 place-items-center">
          <div className={`w-full max-w-60 min-h-34 rounded-3xl border p-8 flex items-center justify-center text-center text-lg font-semibold transition-all duration-300 ${cameraSensorReady ? "bg-primary text-white border-primary shadow-[0_10px_30px_rgba(0,24,100,0.18)]" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
            Camera
          </div>
          <div className={`w-full max-w-60 min-h-34 rounded-3xl border p-8 flex items-center justify-center text-center text-lg font-semibold transition-all duration-300 ${pupilDilationSensorReady ? "bg-primary text-white border-primary shadow-[0_10px_30px_rgba(0,24,100,0.18)]" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
            Pupil Dilation
          </div>
          <div className={`w-full max-w-60 min-h-34 rounded-3xl border p-8 flex items-center justify-center text-center text-lg font-semibold transition-all duration-300 ${hrvSensorReady ? "bg-primary text-white border-primary shadow-[0_10px_30px_rgba(0,24,100,0.18)]" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
            HRV
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 min-h-24">
        {/* Buttons moved to header */}
      </div>
    </div>
    </main>
  );
}
