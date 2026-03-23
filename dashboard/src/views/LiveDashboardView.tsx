"use client";

import React, { useMemo } from "react";
import { Play, Square, Activity, Pause, Brain, Eye, Video, Heart, Timer, TrendingDown, Zap, Target, Leaf } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { SessionDataPoint } from "../types";

interface LiveDashboardViewProps {
  sessionData: SessionDataPoint[];
  currentRmssd: number | null;
  baselineRmssd: number | null;
  workloadValue: number;
  bpm: number | null;
  session: any;
  isSessionPaused: boolean;
  setIsSessionPaused: React.Dispatch<React.SetStateAction<boolean>>;
  endSession: () => void;
  liveMode: "biofeedback" | "camera" | "minimal";
  setLiveMode: React.Dispatch<React.SetStateAction<"biofeedback" | "camera" | "minimal">>;
}

export default function LiveDashboardView({
  sessionData,
  currentRmssd,
  baselineRmssd,
  workloadValue,
  bpm,
  session,
  isSessionPaused,
  setIsSessionPaused,
  endSession,
  liveMode,
  setLiveMode
}: LiveDashboardViewProps) {
  // ── Derived live values ──────────────────────────────────────
  const sessionDurationSec = sessionData.length;
  const totalSamples = sessionData.length;
  const calmSamples = sessionData.filter(d => d.workload > -30).length;
  const accuracyPct = totalSamples > 0 ? Math.round((calmSamples / totalSamples) * 100) : 0;
  const recentData = sessionData.slice(-60);

  const cogLoadPct = Math.round(workloadValue);
  const isCalibrated = baselineRmssd !== null && baselineRmssd > 0;

  const GAUGE_R = 70;
  const gaugeCirc = 2 * Math.PI * GAUGE_R;
  const cogDonutFilled = gaugeCirc * (cogLoadPct / 100);
  const gaugeColor = cogLoadPct >= 66 ? "#ef4444" : cogLoadPct >= 33 ? "#f59e0b" : "#10b981";
  const gaugeGlow = cogLoadPct >= 66
      ? "drop-shadow(0 0 8px rgba(239,68,68,0.4))"
      : cogLoadPct >= 33
      ? "drop-shadow(0 0 8px rgba(245,158,11,0.4))"
      : "drop-shadow(0 0 8px rgba(16,185,129,0.3))";
  const zoneLabel = cogLoadPct >= 66 ? "Overload Warning" : cogLoadPct >= 33 ? "High Effort" : "Optimal / Baseline";

  const hrvDelta = currentRmssd !== null && baselineRmssd && baselineRmssd > 0
    ? ((currentRmssd - baselineRmssd) / baselineRmssd) * 100
    : null;
  
  const stressPct = hrvDelta !== null ? Math.round(Math.max(0, Math.min(100, hrvDelta < 0 ? (Math.abs(hrvDelta) / 30) * 100 : 0))) : 0;
  const stressDonutFilled = gaugeCirc * (stressPct / 100);
  const stressDonutColor = stressPct >= 66 ? "#ef4444" : stressPct >= 33 ? "#f59e0b" : "#3b579f";
  const stressTrafficColor = stressPct >= 66 ? "#ef4444" : stressPct >= 33 ? "#f59e0b" : "#10b981";
  const stressDonutGlow = stressPct >= 66
      ? "drop-shadow(0 0 8px rgba(239,68,68,0.4))"
      : stressPct >= 33
      ? "drop-shadow(0 0 8px rgba(245,158,11,0.4))"
      : "drop-shadow(0 0 8px rgba(59,87,159,0.3))";

  const durMins = Math.floor(sessionDurationSec / 60);
  const durSecs = sessionDurationSec % 60;

  // Performance score
  const perfScore = totalSamples > 0 ? Math.round(accuracyPct * 0.7 + Math.min(100, (60 / Math.max(1, sessionDurationSec / 3)) * 100) * 0.3) : 0;
  const perfTrafficColor = totalSamples > 0 ? (perfScore >= 70 ? "#10b981" : perfScore >= 40 ? "#f59e0b" : "#ef4444") : "#94a3b8";

  // Sparkline for bottom timeline
  const tlW = 800, tlH = 32;
  const tlPoints = recentData.length > 1;

  const liveChartData = useMemo(() => {
    return sessionData.map(d => {
      let knobPercentage = 0;
      if (d.workload >= -15) {
        knobPercentage = Math.max(0, ((-d.workload + 10) / 25) * 33);
      } else if (d.workload >= -30) {
        knobPercentage = 33 + ((-d.workload - 15) / 15) * 33;
      } else {
        knobPercentage = 66 + ((-d.workload - 30) / 15) * 34;
      }
      return {
        timeOffset: d.timeOffset,
        cogLoad: Math.round(Math.min(100, Math.max(0, knobPercentage))),
        hrvDelta: Math.round(d.workload)
      };
    });
  }, [sessionData]);

  const isCameraMode = liveMode === "camera";
  const isMinimalMode = liveMode === "minimal";

  return (
    <main className="flex-1 w-full h-full relative overflow-hidden flex flex-col bg-soft-white">
      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div className="relative z-30 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200">
        {/* Left: live dot + session label */}
        <div className="flex items-center gap-3">
          <span className="live-dot" />
          <span className="text-slate-800 text-sm font-semibold tracking-widest uppercase select-none">Live Session</span>
          {isSessionPaused && (
            <span className="ml-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase" style={{ background: "rgba(251,191,36,0.15)", color: "#d97706", border: "1px solid rgba(251,191,36,0.3)" }}>Paused</span>
          )}
          <span className="ml-2 text-slate-300 text-xs">|</span>
          <span className="text-slate-500 text-xs font-medium">{session?.user?.name || "Practitioner"}</span>

          <div className="toggle-pill ml-4">
            <button
              onClick={() => setLiveMode("biofeedback")}
              className={liveMode === "biofeedback" ? "active" : "inactive"}
            >
              <Activity className="w-3.5 h-3.5" />
              Biofeedback
            </button>
            <button
              onClick={() => setLiveMode("camera")}
              className={liveMode === "camera" ? "active" : "inactive"}
            >
              <Video className="w-3.5 h-3.5" />
              Camera + Bio
            </button>
          </div>

          <button
            onClick={() => setLiveMode("minimal")}
            title="Minimal camera focus view"
            aria-label="Switch to minimal focus view"
            className="w-9 h-9 rounded-full border transition-all flex items-center justify-center ml-2"
            style={{
              borderColor: liveMode === "minimal" ? "rgba(16,185,129,0.45)" : "rgba(148,163,184,0.35)",
              background: liveMode === "minimal" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.7)",
              color: liveMode === "minimal" ? "#059669" : "#64748b"
            }}
          >
            <Leaf className="w-4 h-4" />
          </button>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-3">
          {/* Session Control Center — unified Duration, Pause, End Session */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-full overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2 border-r border-slate-200/60">
              <Timer className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                {`${String(durMins).padStart(2, "0")}:${String(durSecs).padStart(2, "0")}`}
              </span>
            </div>
            
            <button
              onClick={() => setIsSessionPaused(p => !p)}
              className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors border-r border-slate-200/60"
            >
              {isSessionPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
              {isSessionPaused ? "Resume" : "Pause"}
            </button>
            
            <button
              onClick={endSession}
              className="flex items-center gap-1.5 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-50/50 transition-colors"
            >
              <Square className="w-3 h-3 fill-current" />
              End Session
            </button>
          </div>
        </div>
      </div>

      {/* ── BIOFEEDBACK MODE ────────────────────────────────── */}
      {!isCameraMode && !isMinimalMode && (
        <div className="flex-1 flex flex-col gap-4 p-4 lg:p-6 overflow-y-auto relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
            
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="glass-card p-4 flex flex-col gap-2 justify-center flex-1">
                <p className="metric-label flex items-center gap-2 justify-between">
                  Pupil Dilation <Eye className="w-4 h-4 text-slate-500" />
                </p>
                <div className="flex flex-col mt-auto items-center justify-center flex-1 w-full gap-2">
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-5xl font-light text-slate-400">--</span>
                      <span className="text-slate-400 font-medium text-lg">mm</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Sensor not connected</p>
                </div>
              </div>

              <div className="glass-card p-4 flex flex-col gap-2 justify-center flex-1">
                <p className="metric-label flex items-center gap-2 justify-between">
                  HRV (RMSSD) <Heart className="w-4 h-4 text-slate-500" />
                </p>
                <div className="flex flex-col mt-auto items-center justify-center flex-1 w-full gap-2">
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-5xl font-light text-primary">
                        {currentRmssd !== null ? currentRmssd.toFixed(1) : "--"}
                      </span>
                      <span className="text-slate-500 font-medium text-lg">ms</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-full border border-slate-200 mt-1 bg-slate-50">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mr-2">Baseline</span>
                      <span className="text-xs font-medium text-slate-600 font-mono">{baselineRmssd ? `${baselineRmssd.toFixed(1)} ms` : "--"}</span>
                    </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 glass-card p-6 flex flex-col gap-8 items-center justify-center relative overflow-hidden bg-white/40">
                <p className="metric-label absolute top-6 left-6 tracking-[0.2em]">Live Synthesis</p>
                
                <div className="flex gap-12 sm:gap-20 items-center justify-center relative z-10 w-full">
                  <div className="flex flex-col items-center gap-5">
                    <div className="relative" style={{ width: 170, height: 170 }}>
                      <svg viewBox="0 0 180 180" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke="rgba(0,24,100,0.05)" strokeWidth="16" />
                        <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke={stressDonutColor} strokeWidth="16"
                          strokeDasharray={`${stressDonutFilled} ${gaugeCirc - stressDonutFilled}`} strokeLinecap="round" style={{ filter: stressDonutGlow }} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-400 mb-1">Stress</span>
                        <div className="flex items-baseline">
                          <span className="font-mono text-5xl font-light tabular-nums" style={{ color: stressDonutColor }}>{stressPct}</span>
                          <span className="text-sm font-bold ml-0.5 opacity-60" style={{ color: stressDonutColor }}>%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                       <span className="text-xs font-bold uppercase tracking-wider" style={{ color: stressDonutColor }}>Physical Load</span>
                       <span className="text-[10px] text-slate-400 font-medium mt-0.5">derived from HRV Δ</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-5">
                    <div className="relative" style={{ width: 170, height: 170 }}>
                      <svg viewBox="0 0 180 180" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke="rgba(0,24,100,0.05)" strokeWidth="16" />
                        <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke={gaugeColor} strokeWidth="16"
                          strokeDasharray={`${cogDonutFilled} ${gaugeCirc - cogDonutFilled}`} strokeLinecap="round" style={{ filter: gaugeGlow }} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-400 mb-1">Workload</span>
                        <div className="flex items-baseline">
                          <span className="font-mono text-5xl font-light tabular-nums" style={{ color: gaugeColor }}>{cogLoadPct}</span>
                          <span className="text-sm font-bold ml-0.5 opacity-60" style={{ color: gaugeColor }}>%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-center text-center">
                       <span className="text-xs font-bold uppercase tracking-wider" style={{ color: gaugeColor }}>Cognitive effort</span>
                       <span className="text-[10px] text-slate-400 font-medium mt-0.5">{zoneLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="w-full max-w-md bg-slate-100/50 rounded-2xl p-4 mt-4 flex items-center justify-between border border-slate-200/40">
                   <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Session Accuracy</span>
                      <span className="text-xl font-mono font-semibold text-emerald-600">{accuracyPct}%</span>
                   </div>
                   <div className="w-px h-8 bg-slate-200" />
                   <div className="flex flex-col text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Perf. Score</span>
                      <span className="text-xl font-mono font-semibold text-primary">{perfScore}</span>
                   </div>
                </div>
            </div>

            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="glass-card p-4 flex flex-col gap-2 justify-center flex-1">
                <p className="metric-label flex items-center gap-2 justify-between">
                  Heart Rate <Activity className="w-4 h-4 text-slate-500" />
                </p>
                <div className="flex flex-col mt-auto items-center justify-center flex-1 w-full gap-2">
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-5xl font-light text-primary">
                        {bpm !== null && bpm > 0 ? bpm : "--"}
                      </span>
                      <span className="text-slate-500 font-medium text-lg">bpm</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-full border border-slate-200 mt-1 bg-slate-50">
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${bpm && bpm > 100 ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
                          <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Status: {bpm && bpm > 100 ? "Elevated" : "Normal"}</span>
                       </div>
                    </div>
                </div>
              </div>

              <div className="glass-card p-4 flex flex-col gap-2 justify-center flex-1">
                <p className="metric-label flex items-center gap-2 justify-between">
                  Performance <Target className="w-4 h-4 text-slate-500" />
                </p>
                <div className="flex flex-col mt-auto items-center justify-center flex-1 w-full gap-3">
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-5xl font-light text-[#3b579f]">{perfScore}</span>
                      <span className="text-slate-500 font-medium text-lg">pts</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                       <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${perfScore}%` }} />
                    </div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-4 md:p-6 flex flex-col gap-2 w-full h-[220px] lg:h-[260px] shrink-0 mt-2">
            <div className="flex items-center justify-between">
              <p className="metric-label tracking-widest uppercase">Live Session Timeline</p>
              <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" /><span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Stress Δ (%)</span></div>
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#3b579f]" /><span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Cognitive Load</span></div>
              </div>
            </div>
            <div className="flex-1 w-full min-h-0 mt-4">
              {liveChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={liveChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="timeOffset" tickFormatter={(t) => `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`} stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} minTickGap={30} />
                    <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={12} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", zIndex: 100, fontSize: "12px", padding: "12px" }}
                      labelStyle={{ color: '#0f172a', fontWeight: 600, paddingBottom: 6 }}
                      labelFormatter={(t) => `Time: ${Math.floor(Number(t)/60)}:${String(Number(t)%60).padStart(2,'0')}`} 
                    />
                    <Line yAxisId="left" type="monotone" name="Cognitive Load" dataKey="cogLoad" stroke="#3b579f" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" name="Stress Δ (%)" dataKey="hrvDelta" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-base font-medium">Waiting for session data...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CAMERA + BIO OVERLAY MODE ───────────────────────── */}
      {isCameraMode && (
        <div className="flex-1 relative overflow-hidden z-10">
          <div className="absolute inset-0 camera-feed-placeholder bg-slate-50">
            <div className="flex flex-col items-center gap-4">
              <Video className="w-16 h-16 text-slate-200" />
              <p className="text-slate-400 text-sm font-medium">POV Camera Feed</p>
              <p className="text-slate-300 text-xs text-center px-6">Connect laparoscope camera to start streaming</p>
            </div>
          </div>

          <div className="absolute top-6 left-6 glass-hud-white px-8 py-5 flex items-center gap-8 z-20">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">Heart Rate</p>
              <div className="flex items-baseline gap-1">
                <span className="metric-value text-4xl text-slate-800">{bpm !== null && bpm > 0 ? bpm : "--"}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">bpm</span>
              </div>
            </div>
            <div className="w-px h-12 bg-slate-200" />
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">Stress Level</p>
              <span className="metric-value text-4xl" style={{ color: stressPct >= 66 ? "#ef4444" : stressPct >= 33 ? "#f59e0b" : "#3b579f" }}>
                {hrvDelta !== null ? `${stressPct}%` : "--"}
              </span>
            </div>
          </div>

          <div className="absolute bottom-12 left-6 glass-hud-white px-8 py-5 flex items-center gap-8 z-20">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">HRV (RMSSD)</p>
              <div className="flex items-baseline gap-1">
                <span className="metric-value text-4xl text-slate-800">{currentRmssd !== null ? currentRmssd.toFixed(0) : "--"}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase">ms</span>
              </div>
            </div>
            <div className="w-px h-12 bg-slate-200" />
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">Cognitive Load</p>
              <span className="metric-value text-4xl" style={{ color: gaugeColor }}>
                {isCalibrated ? `${cogLoadPct}%` : "--"}
              </span>
            </div>
          </div>

          <div className="absolute bottom-12 right-6 glass-hud-white px-8 py-5 flex items-center gap-8 z-20">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">Duration</p>
              <span className="metric-value text-4xl text-slate-800">
                {`${String(durMins).padStart(2, "0")}:${String(durSecs).padStart(2, "0")}`}
              </span>
            </div>
            <div className="w-px h-12 bg-slate-200" />
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold mb-1">Performance</p>
              <span className="metric-value text-4xl" style={{ color: perfScore >= 70 ? "#10b981" : perfScore >= 40 ? "#f59e0b" : "#ef4444" }}>
                {totalSamples > 0 ? `${perfScore}%` : "--"}
              </span>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 timeline-strip px-6 py-2 z-20">
            {tlPoints && (
              <svg width="100%" height={32} viewBox={`0 0 ${tlW} 32`} preserveAspectRatio="none">
                <polygon points={`0,32 ${recentData.map((d, i) => {
                  const x = (i / (recentData.length - 1)) * tlW;
                  const y = 32 - Math.max(0, Math.min(32, ((d.workload + 100) / 200) * 32));
                  return `${x},${y}`;
                }).join(" ")} ${tlW},32`} fill={`${gaugeColor}12`} />
                <polyline points={recentData.map((d, i) => {
                  const x = (i / (recentData.length - 1)) * tlW;
                  const y = 32 - Math.max(0, Math.min(32, ((d.workload + 100) / 200) * 32));
                  return `${x},${y}`;
                }).join(" ")} fill="none" stroke={gaugeColor} strokeWidth="1.5" strokeLinejoin="round" style={{ filter: gaugeGlow }} />
              </svg>
            )}
          </div>
        </div>
      )}

      {isMinimalMode && (
        <div className="flex-1 relative overflow-hidden z-10 bg-slate-100">
          <div className="absolute inset-0 camera-feed-placeholder bg-slate-50">
            <div className="flex flex-col items-center gap-4">
              <Video className="w-16 h-16 text-slate-200" />
              <p className="text-slate-400 text-sm font-medium">POV Camera Feed</p>
              <p className="text-slate-300 text-xs text-center px-6">Connect laparoscope camera to start streaming</p>
            </div>
          </div>

          <div className="absolute inset-0 z-20 pointer-events-none">
            <div title="Cognitive effort" className="absolute top-6 left-6 sm:top-8 sm:left-8">
              <Brain
                className="w-14 h-14 sm:w-16 sm:h-16"
                style={{
                  color: gaugeColor,
                  filter: `drop-shadow(0 0 18px ${gaugeColor}aa)`
                }}
              />
            </div>

            <div title="Stress" className="absolute top-6 right-6 sm:top-8 sm:right-8">
              <TrendingDown
                className="w-14 h-14 sm:w-16 sm:h-16"
                style={{
                  color: stressTrafficColor,
                  filter: `drop-shadow(0 0 18px ${stressTrafficColor}aa)`
                }}
              />
            </div>

            <div title="Performance" className="absolute bottom-7 right-6 sm:bottom-9 sm:right-8">
              <Target
                className="w-14 h-14 sm:w-16 sm:h-16"
                style={{
                  color: perfTrafficColor,
                  filter: `drop-shadow(0 0 18px ${perfTrafficColor}aa)`
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
