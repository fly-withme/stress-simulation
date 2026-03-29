"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { SessionInfo } from "../types";

interface DashboardMainViewProps {
  header: React.ReactNode;
  pastSessions: SessionInfo[];
}

export default function DashboardMainView({ header, pastSessions }: DashboardMainViewProps) {
  const learningCurveData = useMemo(() => {
    if (!pastSessions || pastSessions.length === 0) return [];
    const reversed = [...pastSessions].reverse();
    const startWorkload = reversed[0]?.reviewStats?.avg || 80;

    return reversed.map((session, index) => {
      const expected = Math.max(20, startWorkload * Math.pow(0.85, index));
      return {
        ...session,
        expectedWorkload: expected
      };
    });
  }, [pastSessions]);

  const overviewSessionData = useMemo(() => {
    if (!pastSessions || pastSessions.length === 0) return [];

    return [...pastSessions].reverse().map((session, index) => {
      const avgWorkload = session.reviewStats?.avg ?? 0;
      const peakStress = session.reviewStats?.max ?? avgWorkload;
      const mentalLoad = session.reviewStats?.avgCognitiveEffort ?? Math.max(0, Math.abs(avgWorkload));
      const stressEventsCount = session.reviewStats?.stressEventsCount ?? Math.max(0, Math.round(Math.max(0, peakStress) / 18));
      const performanceScore = Math.max(0, Math.min(100, 100 - Math.max(0, avgWorkload)));

      return {
        ...session,
        sessionIndex: index + 1,
        sessionLabel: `S${index + 1}`,
        avgWorkload,
        peakStress,
        mentalLoad,
        stressEventsCount,
        performanceScore,
      };
    });
  }, [pastSessions]);

  const avgStressEventsPerSession = useMemo(() => {
    if (overviewSessionData.length === 0) return 0;
    const total = overviewSessionData.reduce((acc, item) => acc + (item.stressEventsCount ?? 0), 0);
    return total / overviewSessionData.length;
  }, [overviewSessionData]);

  const personalBestTimes = useMemo(() => {
    if (!pastSessions || pastSessions.length === 0) return null;

    const sessionsWithDuration = pastSessions
      .filter((session) => (session.reviewStats?.duration ?? 0) > 0)
      .map((session) => ({
        sessionName: session.sessionName || `Session ${new Date(session.timestamp).toLocaleDateString()}`,
        duration: session.reviewStats.duration,
      }));

    if (sessionsWithDuration.length === 0) return null;

    const fastestSession = sessionsWithDuration.reduce((best, current) =>
      current.duration < best.duration ? current : best
    );

    const bestAvgPhaseTimeSecs = sessionsWithDuration.reduce((best, current) => {
      const avgPhase = current.duration / 3;
      return avgPhase < best ? avgPhase : best;
    }, Number.POSITIVE_INFINITY);

    return {
      fastestSessionName: fastestSession.sessionName,
      fastestSessionDurationSecs: fastestSession.duration,
      bestAvgPhaseTimeSecs,
    };
  }, [pastSessions]);

  const formatSeconds = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
      {header}

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-semibold text-primary">Learning Journey</h2>
              <p className="text-slate-600 text-sm mt-1">Tracks your expected progress against actual workload over time.</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Sessions</p>
              <p className="text-2xl font-semibold text-primary">{pastSessions.length}</p>
            </div>
          </div>
          <div className="h-56 w-full">
            {learningCurveData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={learningCurveData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis
                    dataKey="timestamp"
                    stroke="#5f6f94"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => new Date(val).toLocaleDateString()}
                    minTickGap={26}
                  />
                  <YAxis stroke="#5f6f94" tickLine={false} axisLine={false} domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#f8fbff', borderColor: '#c9def7', borderRadius: '10px', color: '#001864' }}
                    labelStyle={{ color: '#001864' }}
                    labelFormatter={(val) => new Date(val as number).toLocaleString()}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedWorkload"
                    name="Expected"
                    stroke="#7f9ecf"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="reviewStats.avg"
                    name="Actual Workload"
                    stroke="#001864"
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={{ r: 5, fill: "#001864", stroke: "#c9def7", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No sessions yet to build your learning curve.</div>
            )}
          </div>
          </section>

          <section className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 flex flex-col">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-primary">Personal Best Times</h2>
              <p className="text-slate-600 text-sm mt-1">Your fastest timing benchmarks across all sessions.</p>
            </div>
            {personalBestTimes ? (
              <div className="flex flex-col gap-4 mt-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Best Session Duration</p>
                  <p className="text-3xl font-semibold text-primary mt-2">{formatSeconds(personalBestTimes.fastestSessionDurationSecs)}</p>
                  <p className="text-xs text-slate-600 mt-2 truncate" title={personalBestTimes.fastestSessionName}>
                    {personalBestTimes.fastestSessionName}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Best Avg Time / Phase</p>
                  <p className="text-3xl font-semibold text-primary mt-2">{formatSeconds(personalBestTimes.bestAvgPhaseTimeSecs)}</p>
                  <p className="text-xs text-slate-600 mt-2">Based on 3-phase session timing</p>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-40 flex items-center justify-center text-slate-600">Complete sessions to unlock your personal bests.</div>
            )}
          </section>
        </div>

        <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 flex flex-col">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-primary">Performance Over Sessions</h2>
            <p className="text-slate-600 text-sm mt-1">Higher score means lower average workload.</p>
          </div>
          <div className="h-48 w-full">
            {overviewSessionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overviewSessionData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="performanceAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#001864" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#001864" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="sessionLabel" stroke="#5f6f94" tickLine={false} axisLine={false} />
                  <YAxis stroke="#5f6f94" tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#f8fbff', borderColor: '#c9def7', borderRadius: '10px', color: '#001864' }}
                    labelStyle={{ color: '#001864' }}
                    formatter={(value) => [`${Number(value ?? 0).toFixed(0)} pts`, 'Performance Score']}
                  />
                  <Area type="monotone" dataKey="performanceScore" stroke="#001864" strokeWidth={2.4} fill="url(#performanceAreaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No performance trend available yet.</div>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 flex flex-col">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-primary">Mental Workload Across Sessions</h2>
            <p className="text-slate-600 text-sm mt-1">Shows how your cognitive load evolved from session to session.</p>
          </div>
          <div className="h-60 w-full">
            {overviewSessionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overviewSessionData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="sessionLabel" stroke="#5f6f94" tickLine={false} axisLine={false} />
                  <YAxis stroke="#5f6f94" tickLine={false} axisLine={false} domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#f8fbff', borderColor: '#c9def7', borderRadius: '10px', color: '#001864' }}
                    labelStyle={{ color: '#001864' }}
                    formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, 'Mental Workload']}
                  />
                  <Line
                    type="monotone"
                    dataKey="mentalLoad"
                    name="Mental Workload"
                    stroke="#001864"
                    strokeWidth={2.7}
                    dot={false}
                    activeDot={{ r: 5, fill: '#001864' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">Complete sessions to unlock workload analytics.</div>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-semibold text-primary">Stress Events per Session</h2>
              <p className="text-slate-600 text-sm mt-1">Counts distinct stress events detected in each session.</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Avg / Session</p>
              <p className="text-2xl font-semibold text-primary">{avgStressEventsPerSession.toFixed(1)}</p>
            </div>
          </div>
          <div className="h-60 w-full">
            {overviewSessionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overviewSessionData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="sessionLabel" stroke="#5f6f94" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#5f6f94" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#f8fbff', borderColor: '#c9def7', borderRadius: '10px', color: '#001864' }}
                    labelStyle={{ color: '#001864' }}
                    formatter={(value) => [`${Number(value ?? 0).toFixed(0)}`, 'Stress Events']}
                  />
                  <Bar dataKey="stressEventsCount" name="Stress Events" fill="#3b579f" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600">No stress-event data available yet.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
