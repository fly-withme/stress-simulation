"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import PerformanceSummary from "../components/PerformanceSummary";
import { SessionInfo, SessionDataPoint } from "../types";
import { DESIGN } from "../constants/design";

interface SessionReviewViewProps {
  header: React.ReactNode;
  sessionData: SessionDataPoint[];
  currentReviewSession: SessionInfo | null;
  baselineRmssd: number | null;
  videoTime: number;
  setVideoTime: React.Dispatch<React.SetStateAction<number>>;
}

export default function SessionReviewView({
  header,
  sessionData,
  currentReviewSession,
  baselineRmssd,
  videoTime,
  setVideoTime
}: SessionReviewViewProps) {
  const formatSeconds = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const reviewStats = useMemo(() => {
    if (sessionData.length === 0) return { max: 0, avg: 0, duration: 0 };
    const max = Math.max(...sessionData.map(d => d.workload));
    const avg = sessionData.reduce((acc, val) => acc + val.workload, 0) / sessionData.length;
    const duration = sessionData[sessionData.length - 1].timeOffset;
    return { max, avg, duration };
  }, [sessionData]);

  const reviewKpis = useMemo(() => {
    const timeOnTaskSecs = reviewStats.duration;
    const avgTimeOnTaskSecs = timeOnTaskSecs > 0 ? timeOnTaskSecs / 3 : 0;

    let stressEventsCount = 0;
    const baselineReference = baselineRmssd && baselineRmssd > 0 
      ? baselineRmssd 
      : (currentReviewSession?.reviewStats?.avgRmssd || sessionData[0]?.rmssd || 0);

    if (baselineReference > 0) {
      let inStressEvent = false;
      sessionData.forEach((d) => {
        const deltaPercent = ((d.rmssd - baselineReference) / baselineReference) * 100;
        if (deltaPercent < -30) {
          if (!inStressEvent) {
            stressEventsCount++;
            inStressEvent = true;
          }
        } else {
          inStressEvent = false;
        }
      });
    }

    const totalSamples = sessionData.length;
    const calmSamples = sessionData.filter((d) => d.workload > -30).length;
    const accuracyPercent = totalSamples > 0 ? (calmSamples / totalSamples) * 100 : 0;
    const errorRate = 100 - accuracyPercent;

    const expectedPhaseSeconds = DESIGN.metrics.targetPhaseDurationSec;
    const speedPercent = avgTimeOnTaskSecs > 0
      ? Math.max(0, Math.min(100, (expectedPhaseSeconds / avgTimeOnTaskSecs) * 100))
      : 0;

    const performanceScore = (accuracyPercent * 0.7) + (speedPercent * 0.3);

    const validBpmData = sessionData.filter((d) => d.bpm > 0);
    const averageHeartRate =
      validBpmData.length > 0
        ? validBpmData.reduce((acc, d) => acc + d.bpm, 0) / validBpmData.length
        : (currentReviewSession?.reviewStats?.avgBpm || 0);

    return {
      timeOnTaskSecs,
      avgTimeOnTaskSecs,
      accuracyPercent,
      errorRate,
      speedPercent,
      performanceScore,
      averageHeartRate,
      stressEventsCount,
    };
  }, [sessionData, currentReviewSession, reviewStats.duration, baselineRmssd]);

  const deltaRmssdTimeline = useMemo(() => {
    if (sessionData.length === 0) return [];

    const baselineReference =
      baselineRmssd && baselineRmssd > 0
        ? baselineRmssd
        : currentReviewSession?.reviewStats?.avgRmssd || sessionData[0].rmssd;

    return sessionData.map((point) => {
      const deltaRmssd = point.rmssd - baselineReference;
      const deltaRmssdPercent = baselineReference > 0 ? (deltaRmssd / baselineReference) * 100 : 0;
      return {
        ...point,
        deltaRmssd,
        deltaRmssdPercent,
        cognitiveEffort: -deltaRmssd
      };
    });
  }, [sessionData, baselineRmssd, currentReviewSession]);

  return (
    <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
      {header}

      {/* Session Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-6">
          <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Average Time on Task</div>
          <div className="text-3xl font-semibold text-primary">{formatSeconds(reviewKpis.avgTimeOnTaskSecs)}</div>
        </div>
        <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-6">
          <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Detected Stress Events</div>
          <div className="text-3xl font-semibold text-primary">{reviewKpis.stressEventsCount}</div>
        </div>
        <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-6">
          <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Error Rate</div>
          <div className="text-3xl font-semibold text-primary">{reviewKpis.errorRate.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-6">
          <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Average Heart Rate</div>
          <div className="text-3xl font-semibold text-primary">{reviewKpis.averageHeartRate > 0 ? `${reviewKpis.averageHeartRate.toFixed(0)} BPM` : "--"}</div>
        </div>
      </div>

      <div className="mb-8">
        <PerformanceSummary
          accuracyPercent={reviewKpis.accuracyPercent}
          speedPercent={reviewKpis.speedPercent}
          performanceScore={reviewKpis.performanceScore}
        />
      </div>

      {/* Delta RMSSD Timeline */}
      <div className="bg-slate-50/50 border border-slate-200 rounded-3xl p-5 sm:p-8 mb-4 order-3 relative overflow-hidden flex-1 w-full">
        <div className="absolute top-0 w-full h-1 bg-linear-to-r from-transparent via-primary to-transparent opacity-20 -mx-8"></div>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Delta RMSSD Timeline</h3>
            <p className="text-sm text-slate-600 mt-1">
              Heart rate variability change across the session.
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          {deltaRmssdTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={deltaRmssdTimeline}
                style={{ outline: "none" }}
                onClick={(state) => {
                  const clickedTime = typeof state?.activeLabel === "number" ? state.activeLabel : Number(state?.activeLabel);
                  if (Number.isNaN(clickedTime)) return;
                  setVideoTime(clickedTime);
                }}
              >
                <XAxis
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  dataKey="timeOffset"
                  stroke="#5f6f94"
                  tickFormatter={(value) => formatSeconds(value as number)}
                  minTickGap={30}
                />
                <YAxis
                  stroke="#5f6f94"
                  tickFormatter={(value) => `${(value as number).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#f8fbff", borderColor: "#c9def7", borderRadius: "8px", color: "#001864" }}
                  labelStyle={{ color: "#001864" }}
                  formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, "Delta RMSSD"]}
                  labelFormatter={(label) => `Time ${formatSeconds(Number(label ?? 0))}`}
                />
                <Line
                  type="monotone"
                  dataKey="deltaRmssd"
                  stroke="#001864"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#001864" }}
                />
                <ReferenceLine
                  x={videoTime}
                  stroke="#7f9ecf"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                  label={{ value: formatSeconds(videoTime), position: "top", fill: "#3b579f", fontSize: 12, fontWeight: 500 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">No RMSSD timeline data available.</div>
          )}
        </div>
      </div>

      {/* Cognitive Effort Timeline */}
      <div className="bg-slate-50/50 border border-slate-200 rounded-3xl p-5 sm:p-8 mb-4 order-2 relative overflow-hidden flex-1 w-full">
        <div className="absolute top-0 w-full h-1 bg-linear-to-r from-transparent via-primary to-transparent opacity-20 -mx-8"></div>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Cognitive Effort Timeline</h3>
            <p className="text-sm text-slate-600 mt-1">
              Estimated cognitive load derived from Delta RMSSD.
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          {deltaRmssdTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={deltaRmssdTimeline}
                style={{ outline: "none" }}
                onClick={(state) => {
                  const clickedTime = typeof state?.activeLabel === "number" ? state.activeLabel : Number(state?.activeLabel);
                  if (Number.isNaN(clickedTime)) return;
                  setVideoTime(clickedTime);
                }}
              >
                <XAxis
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  dataKey="timeOffset"
                  stroke="#5f6f94"
                  tickFormatter={(value) => formatSeconds(value as number)}
                  minTickGap={30}
                />
                <YAxis
                  stroke="#5f6f94"
                  tickFormatter={(value) => `${(value as number).toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#f8fbff", borderColor: "#c9def7", borderRadius: "8px", color: "#001864" }}
                  labelStyle={{ color: "#001864" }}
                  formatter={(value) => [`${Number(value ?? 0).toFixed(1)}`, "Cognitive Effort"]}
                  labelFormatter={(label) => `Time ${formatSeconds(Number(label ?? 0))}`}
                />
                <Line
                  type="monotone"
                  dataKey="cognitiveEffort"
                  stroke="#3b579f"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#3b579f" }}
                />
                <ReferenceLine
                  x={videoTime}
                  stroke="#7f9ecf"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                  label={{ value: formatSeconds(videoTime), position: "top", fill: "#3b579f", fontSize: 12, fontWeight: 500 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">No cognitive effort data available.</div>
          )}
        </div>
      </div>

      {/* Pupil Size Timeline */}
      <div className="bg-slate-50/50 border border-slate-200 rounded-3xl p-5 sm:p-8 mb-4 order-4 relative overflow-hidden flex-1 w-full">
        <div className="absolute top-0 w-full h-1 bg-linear-to-r from-transparent via-emerald-500 to-transparent opacity-20 -mx-8"></div>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Percentage Change in Pupil Size</h3>
            <p className="text-sm text-slate-600 mt-1">
              Pupil dilation variance across the session.
            </p>
          </div>
        </div>
        <div className="h-64 w-full">
          <div className="h-full flex items-center justify-center text-slate-500">No pupil size data available yet.</div>
        </div>
      </div>

      {/* Session timeline navigator */}
      <div className="bg-slate-50/50 border border-slate-200 rounded-3xl p-5 sm:p-8 mb-10 order-1 relative flex-1 w-full">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-slate-800">Session Timeline</h3>
          <p className="text-sm text-slate-600 mt-1">
            Move through the session timeline to align all charts to a specific moment.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-3">
            <span>{formatSeconds(videoTime)}</span>
            <span>
              {formatSeconds(sessionData.length > 0 ? sessionData[sessionData.length - 1].timeOffset : 0)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={sessionData.length > 0 ? sessionData[sessionData.length - 1].timeOffset : 0}
            step={1}
            value={Math.min(videoTime, sessionData.length > 0 ? sessionData[sessionData.length - 1].timeOffset : 0)}
            onChange={(e) => setVideoTime(Number(e.target.value))}
            disabled={sessionData.length === 0}
            className="w-full h-2 rounded-lg appearance-none bg-secondary accent-primary disabled:opacity-50"
          />
        </div>
      </div>
    </main>
  );
}
