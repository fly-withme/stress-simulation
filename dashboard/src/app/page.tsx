"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Wifi, WifiOff, Play, Square, Activity, LogOut, User, RefreshCw, Pause, Brain, Pencil, Check, X, Eye, Video, Heart, Timer, Shield, TrendingDown, Zap, Target } from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import HeartRateMonitor from "../components/HeartRateMonitor";
import HRVMonitor from "../components/HRVMonitor";
import ConcentrationMetric from "../components/ConcentrationMetric";
import PerformanceSummary from "../components/PerformanceSummary";
import Sidebar from "../components/Sidebar";

type ViewState = "LOGIN" | "OVERVIEW" | "HISTORY" | "SETTINGS" | "CALIBRATION_PENDING" | "CALIBRATION_ACTIVE" | "LIVE" | "SAVING" | "REVIEW";

interface SessionInfo {
  sessionId: string;
  timestamp: number;
  sessionName?: string;
  reviewStats: { 
    max: number; 
    avg: number; 
    duration: number; 
    avgBpm?: number; 
    avgRmssd?: number;
    avgCognitiveEffort?: number;
    avgPupilSize?: number;
    stressEventsCount?: number;
  };
}

interface SessionDataPoint {
  timeOffset: number; // Seconds since session started
  bpm: number;
  rmssd: number;
  workload: number;
}

const CALIBRATION_DURATION_SEC = 60;
const TARGET_PHASE_DURATION_SEC = 60;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const isDevMode = process.env.NODE_ENV === "development";
  const [viewState, setViewState] = useState<ViewState>("LOGIN");
  const [userId, setUserId] = useState("");
  const [pastSessions, setPastSessions] = useState<SessionInfo[]>([]);
  const [currentReviewSession, setCurrentReviewSession] = useState<SessionInfo | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [isSavingSessionName, setIsSavingSessionName] = useState(false);

  // Login Form State
  const [usernameInput, setUsernameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Real-time metrics
  const [bpm, setBpm] = useState<number | null>(null);
  const [currentRmssd, setCurrentRmssd] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0);
  const [bleState, setBleState] = useState<"scanning" | "connected" | "offline">("scanning");

  // Calibration State
  const [calibrationData, setCalibrationData] = useState<number[]>([]);
  const [calibrationElapsed, setCalibrationElapsed] = useState<number>(0);
  const [baselineRmssd, setBaselineRmssd] = useState<number | null>(null);
  const [savedBaselineRmssd, setSavedBaselineRmssd] = useState<number | null>(null);
  const [calibrationCompleted, setCalibrationCompleted] = useState(false);
  const [isCalibrationRunning, setIsCalibrationRunning] = useState(false);
  const [calibrationFlowTarget, setCalibrationFlowTarget] = useState<"LIVE" | "OVERVIEW">("LIVE");

  // Hardware status state for baseline pre-check
  const [eyeTrackerConnected, setEyeTrackerConnected] = useState(false);
  const [eyeTrackerCalibrated, setEyeTrackerCalibrated] = useState(false);
  const [boxCameraFeedActive, setBoxCameraFeedActive] = useState(false);

  // Session State
  const [sessionData, setSessionData] = useState<SessionDataPoint[]>([]);

  // Review timeline cursor
  const [videoTime, setVideoTime] = useState(0);
  const [isSessionPaused, setIsSessionPaused] = useState(false);
  const [liveMode, setLiveMode] = useState<"biofeedback" | "camera">("biofeedback");

  // Refs for tracking time across websocket callbacks without dependency loops
  const viewStateRef = useRef<ViewState>("LOGIN");
  const isSessionPausedRef = useRef<boolean>(false);
  const calibrationStartRef = useRef<number>(0);
  const calibrationDataRef = useRef<number[]>([]);
  const sessionStartRef = useRef<number>(0);
  const baselineRef = useRef<number | null>(null);
  const calibrationFlowTargetRef = useRef<"LIVE" | "OVERVIEW">("LIVE");
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRescanRef = useRef<boolean>(false);
  const scanningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const canStartLiveFlow = bleState === "connected" || isDevMode;
  const hrvSensorReady = wsConnected && bleState === "connected";
  const pupilDilationSensorReady = eyeTrackerConnected && eyeTrackerCalibrated;
  const cameraSensorReady = boxCameraFeedActive;
  const allCalibrationSensorsReady = hrvSensorReady && pupilDilationSensorReady && cameraSensorReady;

  // Sync refs with state
  useEffect(() => { viewStateRef.current = viewState; }, [viewState]);
  useEffect(() => { isSessionPausedRef.current = isSessionPaused; }, [isSessionPaused]);
  useEffect(() => { baselineRef.current = baselineRmssd; }, [baselineRmssd]);
  useEffect(() => { calibrationDataRef.current = calibrationData; }, [calibrationData]);
  useEffect(() => { calibrationFlowTargetRef.current = calibrationFlowTarget; }, [calibrationFlowTarget]);

  // Calibration Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCalibrationRunning) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - calibrationStartRef.current) / 1000);
        
        if (elapsed >= CALIBRATION_DURATION_SEC) {
          // Finish Calibration Timer
          setCalibrationElapsed(CALIBRATION_DURATION_SEC);
          setIsCalibrationRunning(false);
          setCalibrationCompleted(true);
          
          const allData = calibrationDataRef.current;
          let avg = 60; // fallback
          if (allData.length > 0) {
            avg = allData.reduce((acc, val) => acc + val, 0) / allData.length;
          }
          setBaselineRmssd(avg);
          setSavedBaselineRmssd(avg);
          
          const emailKey = `calibration_baseline_${userId || 'anonymous'}`;
          localStorage.setItem(emailKey, avg.toString());

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ command: "stop" }));
          }
        } else {
          setCalibrationElapsed(elapsed);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCalibrationRunning, userId]);

  // WebSocket Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;

    const connect = () => {
      try {
        ws = new WebSocket("ws://localhost:8765");
        wsRef.current = ws;

        ws.onopen = () => {
          if (isMounted) {
            setWsConnected(true);
            if (pendingRescanRef.current) {
              console.log("[WS] Connection established. Executing pending rescan...");
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ command: "rescan" }));
              }
              pendingRescanRef.current = false;
            }
          }
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const parsedData = JSON.parse(event.data);

            if (parsedData.type === "ble_status") {
              setBleState(parsedData.state);
              return;
            }

            const newBpm = typeof parsedData.bpm === 'number' ? parsedData.bpm : null;
            const newRmssd = typeof parsedData.rmssd === 'number' ? parsedData.rmssd : null;
            if (typeof parsedData.eyeTrackerConnected === 'boolean') {
              setEyeTrackerConnected(parsedData.eyeTrackerConnected);
            }
            if (typeof parsedData.eyeTrackerCalibrated === 'boolean') {
              setEyeTrackerCalibrated(parsedData.eyeTrackerCalibrated);
            }
            if (typeof parsedData.boxCameraFeedActive === 'boolean') {
              setBoxCameraFeedActive(parsedData.boxCameraFeedActive);
            }

            if (newBpm !== null) setBpm(newBpm);
            if (newRmssd !== null) setCurrentRmssd(newRmssd);

            const now = Date.now();
            const currentState = viewStateRef.current;

            // Handle Calibration Logging
            if (currentState === "CALIBRATION_ACTIVE" && newRmssd !== null && newRmssd > 0) {
              setCalibrationData((prev) => [...prev, newRmssd]);
            }

            // Handle Live Session Logging
            if (currentState === "LIVE" && !isSessionPausedRef.current && newRmssd !== null && newBpm !== null && baselineRef.current !== null) {
              const baseline = baselineRef.current;
              // Workload uses dynamic delta: ((current - baseline) / baseline) * 100
              const workload = ((newRmssd - baseline) / baseline) * 100;
              
              setSessionData((prev) => {
                // Just use the length of the array to determine logical seconds recorded while not paused
                const timeOffset = prev.length;

                // Prevent duplicate time offsets if multiple messages come in same second
                if (prev.length > 0 && prev[prev.length - 1].timeOffset === timeOffset) {
                  return prev;
                }
                const validBpm = newBpm > 0 ? newBpm : (prev.length > 0 ? prev[prev.length - 1].bpm : 0);
                return [
                  ...prev,
                  { timeOffset, bpm: validBpm, rmssd: newRmssd, workload }
                ];
              });
            }
          } catch (err) {
            console.error("Failed to parse websocket message", err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          setBleState("offline");
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch (err) {
        if (isMounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
        console.debug("WS Connect error", err); // use the err so it's not unused
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (scanningTimeoutRef.current) clearTimeout(scanningTimeoutRef.current);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [userId, reconnectTrigger]);

  const fetchPastSessions = (email: string) => {
    fetch(`/api/sessions?userId=${encodeURIComponent(email)}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPastSessions(data);
      })
      .catch(err => console.error("Failed to fetch sessions", err));
  };

  // Check for saved baseline and past sessions when user logs in
  useEffect(() => {
    if (session?.user?.email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserId(session.user.email);
      const saved = localStorage.getItem(`calibration_baseline_${session.user.email}`);

      // Initial Auth Flow check
      if (saved) {
        setSavedBaselineRmssd(parseFloat(saved));
        setBaselineRmssd(parseFloat(saved));
      }

      // Navigate to dashboard automatically if authenticated
      if (viewState === "LOGIN") {
        setViewState("OVERVIEW");
      }

      // Fetch past sessions
      fetchPastSessions(session.user.email);
    }
  }, [session, viewState]);

  // Actions
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || (isSignUp && !usernameInput)) {
      setLoginError("Please fill in all required fields.");
      return;
    }
    setIsLoggingIn(true);
    setLoginError("");

    // For prototyping, both Login and Signup use the same Credentials Provider
    const res = await signIn('credentials', {
      redirect: false,
      username: usernameInput,
      email: emailInput,
      password: passwordInput,
    });

    setIsLoggingIn(false);

    if (res?.error) {
      setLoginError(isSignUp ? "Sign up failed. Please try again." : "Invalid credentials. Please try again.");
    } else {
      setUsernameInput("");
      setEmailInput("");
      setPasswordInput("");

      // Auto-redirect logic moved here to ensure seamless UX after entering details
      // It handles setting the view state instead of relying on the user to click a button.
      if (emailInput) {
        setUserId(emailInput);
        const saved = localStorage.getItem(`calibration_baseline_${emailInput}`);
        if (saved) {
          setSavedBaselineRmssd(parseFloat(saved));
          setBaselineRmssd(parseFloat(saved));
        }
        setViewState("OVERVIEW");
      }
    }
  };

  const startCalibration = () => {
    setCalibrationData([]);
    setCalibrationElapsed(0);
    setCalibrationCompleted(false);
    setIsCalibrationRunning(true);
    calibrationStartRef.current = Date.now();
    setViewState("CALIBRATION_ACTIVE");
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: "start" }));
    }
  };

  const resetCalibration = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: "stop" }));
    }
    setCalibrationCompleted(false);
    setIsCalibrationRunning(false);
    setCalibrationData([]);
    setCalibrationElapsed(0);
  };

  const openCalibrationRunView = (bypassDeviceCheck = false) => {
    if (!allCalibrationSensorsReady && !(isDevMode && bypassDeviceCheck)) return;
    setCalibrationCompleted(false);
    setIsCalibrationRunning(false);
    setCalibrationData([]);
    setCalibrationElapsed(0);
    setViewState("CALIBRATION_ACTIVE");
  };

  const startNewSessionFromDashboard = () => {
    // A fresh baseline is required before every session start.
    setCalibrationFlowTarget("LIVE");
    setCalibrationCompleted(false);
    setCalibrationData([]);
    setCalibrationElapsed(0);
    setViewState("CALIBRATION_PENDING");
  };

  const beginLiveSession = (forcedBaseline?: number) => {
    setIsCalibrationRunning(false);
    if (typeof forcedBaseline === "number") {
      setBaselineRmssd(forcedBaseline);
      setSavedBaselineRmssd(forcedBaseline);
    } else if (savedBaselineRmssd !== null) {
      setBaselineRmssd(savedBaselineRmssd);
    }
    setViewState("LIVE");
    sessionStartRef.current = Date.now();
    setSessionData([]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: "start" }));
    }
  };

  const endSession = async () => {
    setViewState("SAVING");
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: "stop" }));
    }

    try {
      const formData = new FormData();
      formData.append('userId', userId || 'anonymous');
      formData.append('sessionData', JSON.stringify(sessionData));
      const defaultSessionName = `Session ${new Date().toLocaleDateString()}`;
      formData.append('sessionName', defaultSessionName);

      // Calculate review stats to save them too
      const max = Math.max(...sessionData.map(d => d.workload));
      const avg = sessionData.reduce((acc, val) => acc + val.workload, 0) / sessionData.length;
      const duration = sessionData.length > 0 ? sessionData[sessionData.length - 1].timeOffset : 0;
      const avgBpm = sessionData.reduce((acc, val) => acc + val.bpm, 0) / sessionData.length;
      const avgRmssd = sessionData.reduce((acc, val) => acc + val.rmssd, 0) / sessionData.length;
      let stressEventsCount = 0;
      let inStressEvent = false;

      for (const point of sessionData) {
        const isStress = point.workload < -30;
        if (isStress && !inStressEvent) {
          stressEventsCount += 1;
          inStressEvent = true;
        } else if (!isStress) {
          inStressEvent = false;
        }
      }

      const newReviewStats = { 
        max, 
        avg, 
        duration, 
        avgBpm, 
        avgRmssd,
        stressEventsCount,
      };
      formData.append('reviewStats', JSON.stringify(newReviewStats));

      const res = await fetch('/api/sessions', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        console.error("Failed to save session via API", await res.text());
      } else {
        const savedSession = await res.json();
        // Refresh sessions list
        fetchPastSessions(userId);

        setCurrentReviewSession({
          sessionId: savedSession.sessionId || "latest",
          timestamp: sessionStartRef.current,
          sessionName: savedSession.sessionName || defaultSessionName,
          reviewStats: newReviewStats
        });
      }
    } catch (err) {
      console.error("Error posting session data:", err);
    }

    setViewState("REVIEW");
  };

  const viewSessionDetails = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions?userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const fullSession = await res.json();
        setSessionData(fullSession.timeline || []);
        setCurrentReviewSession(fullSession);
        setViewState("REVIEW");
      }
    } catch (e) {
      console.error("Failed to fetch session details", e);
    }
  };

  const startRenamingSession = (sessionItem: SessionInfo) => {
    setEditingSessionId(sessionItem.sessionId);
    setEditingSessionName(sessionItem.sessionName || "");
  };

  const cancelRenamingSession = () => {
    setEditingSessionId(null);
    setEditingSessionName("");
  };

  const saveSessionName = async (sessionId: string) => {
    const trimmedName = editingSessionName.trim();
    const effectiveUserId = userId || session?.user?.email || "";
    if (!trimmedName || !effectiveUserId) return;

    setIsSavingSessionName(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          sessionId,
          sessionName: trimmedName,
        }),
      });

      if (!res.ok) {
        console.error('Failed to rename session', await res.text());
        return;
      }

      setPastSessions(prev =>
        prev.map(item =>
          item.sessionId === sessionId
            ? { ...item, sessionName: trimmedName }
            : item
        )
      );

      setCurrentReviewSession(prev =>
        prev && prev.sessionId === sessionId
          ? { ...prev, sessionName: trimmedName }
          : prev
      );

      setEditingSessionId(null);
      setEditingSessionName("");

      // Ensure UI reflects persisted backend state.
      fetchPastSessions(effectiveUserId);
    } catch (err) {
      console.error('Error renaming session', err);
    } finally {
      setIsSavingSessionName(false);
    }
  };

  const returnToDashboard = () => {
    setViewState("OVERVIEW");
    setSessionData([]);
    setVideoTime(0);
  };

  // Derived Live State UI
  let workloadValue = 0; // mapped 0-100 for knob position
  let workloadDisplayValue = "0"; // the text to show (delta %)
  let workloadColor = "text-primary/70";
  let workloadLabel = "CALCULATING";
  let isCalibrated = true;

  if (baselineRmssd === null || baselineRmssd === undefined || baselineRmssd <= 0) {
    isCalibrated = false;
    workloadLabel = "Calibration Required";
    workloadColor = "text-primary/60";
    workloadValue = 0;
    workloadDisplayValue = "--";
  } else if (viewState === "LIVE" && currentRmssd !== null) {
    const deltaPercent = ((currentRmssd - baselineRmssd) / baselineRmssd) * 100;
    workloadDisplayValue = deltaPercent > 0 ? `+${deltaPercent.toFixed(0)}` : deltaPercent.toFixed(0);

    let knobPercentage = 0;

    if (deltaPercent >= -15) {
      workloadColor = "text-primary";
      workloadLabel = "Optimal / Baseline";
      const x = -deltaPercent;
      knobPercentage = Math.max(0, ((x + 10) / 25) * 33);
    } else if (deltaPercent >= -30) {
      workloadColor = "text-[#3b579f]";
      workloadLabel = "High Effort";
      const x = -deltaPercent;
      knobPercentage = 33 + ((x - 15) / 15) * 33;
    } else {
      workloadColor = "text-[#00124d]";
      workloadLabel = "Overload Warning";
      const x = -deltaPercent;
      knobPercentage = 66 + ((x - 30) / 15) * 34;
    }

    workloadValue = Math.min(100, Math.max(0, knobPercentage));
  }

  // Derived Review State Stats
  const reviewStats = useMemo(() => {
    if (sessionData.length === 0) return { max: 0, avg: 0, duration: 0 };
    const max = Math.max(...sessionData.map(d => d.workload));
    const avg = sessionData.reduce((acc, val) => acc + val.workload, 0) / sessionData.length;
    const duration = sessionData[sessionData.length - 1].timeOffset;
    return { max, avg, duration };
  }, [sessionData]);

  const formatSeconds = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

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

    const expectedPhaseSeconds = TARGET_PHASE_DURATION_SEC;
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
      errorRate,
      accuracyPercent,
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

  const calibrationProgressPercent = useMemo(() => {
    if (!isCalibrationRunning) return 0;
    return Math.min(100, (calibrationElapsed / CALIBRATION_DURATION_SEC) * 100);
  }, [isCalibrationRunning, calibrationElapsed]);

  const breathingPhaseLabel = useMemo(() => {
    if (!isCalibrationRunning) return "Breath in • Breath out";
    const cycle = calibrationElapsed % 10;
    if (cycle < 5) return "Breath in";
    return "Breath out";
  }, [isCalibrationRunning, calibrationElapsed]);

  const calibrationArcRadius = 100;
  const calibrationArcCircumference = 2 * Math.PI * calibrationArcRadius;
  const calibrationArcOffset = calibrationArcCircumference * (1 - (calibrationProgressPercent / 100));

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

  const renderConnectionStatus = () => {
    if (bleState === "scanning") {
      return (
        <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-primary text-primary rounded-full font-semibold transition-all text-xs sm:text-sm">
          <Activity className="w-4 h-4 text-primary animate-pulse" />
          <span>Scanning for Belt...</span>
        </div>
      );
    }

    if (wsConnected && bleState === "connected") {
      return (
        <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-green-500 text-green-500 rounded-full font-semibold transition-all text-xs sm:text-sm">
          <Wifi className="w-4 h-4 text-green-500" />
          <span>Belt Connected</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-red-500 text-red-500 rounded-full font-semibold transition-all text-xs sm:text-sm">
        <WifiOff className="w-4 h-4 text-red-500" />
        <span>Device disconnected</span>
        <button
          onClick={() => {
            console.log("[UI] Reconnect button clicked.");
            // Enforce a minimum 2 second visual "Scanning" state to prevent flicker
            setBleState("scanning");
            if (scanningTimeoutRef.current) clearTimeout(scanningTimeoutRef.current);
            scanningTimeoutRef.current = setTimeout(() => {
              // This acts as a fallback if no actual state updates arrive from backend
              if (wsRef.current?.readyState !== WebSocket.OPEN) {
                setBleState("offline");
              }
            }, 2500);

            if (!wsConnected) {
              console.log("[UI] WebSocket disconnected. Queueing pending rescan & triggering WS reconnect.");
              pendingRescanRef.current = true;
              setReconnectTrigger(prev => prev + 1);
            } else if (wsRef.current?.readyState === WebSocket.OPEN) {
              console.log("[UI] WebSocket connected. Sending immediate RESCAN command.");
              wsRef.current.send(JSON.stringify({ command: "rescan" }));
            }
          }}
          className="p-1 -mr-2 bg-transparent hover:bg-red-500/20 text-red-500 rounded-full cursor-pointer transition-colors"
          title="Reconnect"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const renderMinimalHeader = (title: string) => (
    <div className="mb-8 md:mb-10 border-b border-slate-200/80">
      <div className="h-(--header-height) min-h-(--header-height) flex flex-col gap-4 md:flex-row md:items-center md:justify-between justify-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary">{title}</h1>
        <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-3 sm:gap-4 flex-wrap">
          {renderConnectionStatus()}
          <button
            onClick={startNewSessionFromDashboard}
            disabled={!canStartLiveFlow}
            className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-primary hover:bg-primary-hover disabled:bg-slate-200 text-white disabled:text-white rounded-full font-semibold transition-all text-xs sm:text-sm cursor-pointer disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 text-white" />
            Start New Session
          </button>
        </div>
      </div>
    </div>
  );

  const renderReviewHeader = () => {
    const sessionId = currentReviewSession?.sessionId;
    const canRename = Boolean(sessionId && sessionId !== "latest");
    const title = currentReviewSession?.sessionName || (currentReviewSession ? `Session ${new Date(currentReviewSession.timestamp).toLocaleDateString()}` : "Session");

    return (
      <div className="mb-8 md:mb-10 border-b border-slate-200/80">
        <div className="h-(--header-height) min-h-(--header-height) flex flex-col gap-4 md:flex-row md:items-center md:justify-between justify-center">
          <div className="flex items-center gap-3 min-w-0">
            {editingSessionId === sessionId && canRename ? (
              <div className="flex items-center gap-2 w-full max-w-xl">
                <input
                  value={editingSessionName}
                  onChange={(e) => setEditingSessionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && sessionId) {
                      e.preventDefault();
                      saveSessionName(sessionId);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRenamingSession();
                    }
                  }}
                  className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-lg text-primary focus:outline-none focus:border-primary"
                  placeholder="Session name"
                  maxLength={60}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => sessionId && saveSessionName(sessionId)}
                  disabled={isSavingSessionName || editingSessionName.trim().length === 0}
                  className="p-2 rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
                  title="Save"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelRenamingSession}
                  className="p-2 rounded-lg bg-slate-200 text-primary hover:bg-slate-300 cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary truncate">{title}</h1>
                {canRename && currentReviewSession && (
                  <button
                    type="button"
                    onClick={() => startRenamingSession(currentReviewSession)}
                    className="p-1.5 rounded-md text-primary hover:bg-secondary transition-colors cursor-pointer shrink-0"
                    title="Rename session"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-3 sm:gap-4 flex-wrap">
            {renderConnectionStatus()}
            <button
              onClick={startNewSessionFromDashboard}
              disabled={!canStartLiveFlow}
              className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-primary hover:bg-primary-hover disabled:bg-slate-200 text-white disabled:text-white rounded-full font-semibold transition-all text-xs sm:text-sm cursor-pointer disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 text-white" />
              Start New Session
            </button>
          </div>
        </div>
      </div>
    );
  };

  const showSidebar = ["OVERVIEW", "HISTORY", "SETTINGS", "REVIEW"].includes(viewState);

  return (
    <div className={`h-screen text-primary font-sans flex relative overflow-hidden ${viewState === "LIVE" || viewState === "CALIBRATION_ACTIVE" ? "bg-[#020a1a]" : "bg-slate-50"}`}>
      {showSidebar && (
        <Sidebar 
          activeView={viewState === "REVIEW" ? "HISTORY" : viewState} 
          onViewChange={(v) => {
            if (v === "OVERVIEW" || v === "HISTORY" || v === "SETTINGS") {
              setViewState(v as ViewState);
            }
          }} 
          userName={session?.user?.name || "Surgeon"} 
          userEmail={session?.user?.email || ""} 
          onLogout={() => signOut()} 
          pastSessions={pastSessions.map(s => ({ sessionId: s.sessionId, timestamp: s.timestamp, sessionName: s.sessionName }))}
          onSessionSelect={(id) => viewSessionDetails(id)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-y-auto w-full">
      {/* VIEW: LOGIN */}
      {viewState === "LOGIN" && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-md mx-auto w-full text-center">
          <h2 className="inline-flex items-center gap-3 text-4xl font-extrabold text-[#001864] mb-8 tracking-tight">
            <Brain className="w-9 h-9 text-primary" />
            BioTrace
          </h2>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {isSignUp ? "Create Account" : "Login"}
          </h1>
          <p className="text-slate-600 mb-8">
            {isSignUp
              ? "Register to securely track your learning progress."
              : "Welcome to the Simulation Center."}
          </p>

          {status === 'loading' || session ? (
            <div className="w-full flex items-center justify-center p-4">
              <div className="animate-pulse text-slate-600 font-medium">Loading Dashboard...</div>
            </div>
          ) : (
            <div className="w-full flex flex-col gap-6">
              <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
                {loginError && (
                  <div className="text-sm font-medium text-red-400 bg-red-950/50 py-2 px-4 rounded-lg border border-red-900/50">
                    {loginError}
                  </div>
                )}
                {isSignUp && (
                  <input
                    type="text"
                    placeholder="Username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
                    required
                  />
                )}
                <input
                  type="email"
                  placeholder="University Email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
                  required
                />
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-4 mt-2 bg-primary hover:bg-primary-hover text-white rounded-full font-semibold transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingIn
                    ? "Authenticating..."
                    : isSignUp ? "Create Account" : "Log In"}
                </button>
              </form>

              <div className="text-sm text-slate-500">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setLoginError("");
                  }}
                  className="text-primary hover:text-primary-hover font-medium transition-colors cursor-pointer"
                >
                  {isSignUp ? "Log In" : "Sign Up"}
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {/* VIEW: OVERVIEW (Dashboard) */}
      {viewState === "OVERVIEW" && (
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
          {renderMinimalHeader("Dashboard")}

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
      )}

      {/* VIEW: HISTORY */}
      {viewState === "HISTORY" && (
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
          {renderMinimalHeader("History")}

          <div className="flex flex-col gap-6 w-full">
            <div className="bg-slate-50/50 border border-slate-200/50 rounded-3xl p-5 sm:p-8">
              {pastSessions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pastSessions.map((s, index) => (
                    <div
                      key={s.sessionId}
                      onClick={() => viewSessionDetails(s.sessionId)}
                      className="bg-slate-50/80 hover:bg-slate-200 border border-slate-200 rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col gap-2 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
                      <div className="flex justify-between items-start z-10">
                        <div className="min-w-0 flex-1 mr-2">
                          {editingSessionId === s.sessionId ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                value={editingSessionName}
                                onChange={(e) => setEditingSessionName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    saveSessionName(s.sessionId);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelRenamingSession();
                                  }
                                }}
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-primary focus:outline-none focus:border-primary"
                                placeholder="Session name"
                                maxLength={60}
                              />
                              <button
                                type="button"
                                onClick={() => saveSessionName(s.sessionId)}
                                disabled={isSavingSessionName || editingSessionName.trim().length === 0}
                                className="p-1.5 rounded-md bg-primary text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
                                title="Save"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelRenamingSession}
                                className="p-1.5 rounded-md bg-slate-200 text-primary hover:bg-slate-300 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="font-semibold text-lg text-slate-800 truncate">
                                {s.sessionName || `Session ${pastSessions.length - index}`}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startRenamingSession(s);
                                }}
                                className="p-1 rounded-md text-slate-600 hover:text-primary hover:bg-secondary transition-colors cursor-pointer"
                                title="Rename session"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 bg-slate-200/80 px-2 py-1 rounded-md">{new Date(s.timestamp).toLocaleDateString()}</div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-2 gap-4 z-10">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Duration</div>
                          <div className="text-sm text-slate-700 font-medium">
                            {Math.floor((s.reviewStats?.duration || 0) / 60)}m {(s.reviewStats?.duration || 0) % 60}s
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Stress</div>
                          <div className="text-sm font-bold text-orange-400">
                            {s.reviewStats?.avg?.toFixed(1) || 0}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Peak Stress</div>
                          <div className="text-sm font-bold text-red-400">
                            {s.reviewStats?.max?.toFixed(1) || 0}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 bg-slate-50/30 border border-slate-200 border-dashed rounded-3xl w-full">
                  <Activity className="w-12 h-12 text-slate-700 mb-4" />
                  <p className="text-slate-500 text-center text-base">No sessions recorded yet.</p>
                  <p className="text-slate-600 text-center text-sm mt-2">Complete a simulation to see your history here.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* VIEW: SETTINGS */}
      {viewState === "SETTINGS" && (
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
          {renderMinimalHeader("Settings")}

          <div className="flex flex-col gap-6 w-full max-w-2xl">
            <div className="bg-slate-50/50 border border-slate-200/50 rounded-3xl p-6 sm:p-8 flex flex-col gap-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Account Profile</h3>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold text-xl">
                    {session?.user?.name?.charAt(0) || "U"}
                  </div>
                  <div>
                    <div className="font-medium text-slate-800">{session?.user?.name || "Surgeon Profile"}</div>
                    <div className="text-sm text-slate-500">{session?.user?.email}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Bluetooth Devices</h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-4">
                    <Activity className={`w-6 h-6 ${wsConnected && bleState === "connected" ? "text-green-500" : "text-slate-600"}`} />
                    <div>
                      <div className="font-medium text-slate-800">Polar H10 Heart Rate Monitor</div>
                      <div className="text-sm text-slate-500">
                        {wsConnected && bleState === "connected" ? "Connected" : "Disconnected"}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setReconnectTrigger(prev => prev + 1)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-700 text-slate-800 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  >
                    Rescan
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Calibration Baseline</h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <div className="font-medium text-slate-800">Current RMSSD Baseline</div>
                    <div className="text-sm text-slate-500">
                      {savedBaselineRmssd ? `${savedBaselineRmssd.toFixed(1)} ms` : "Not calibrated"}
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setCalibrationFlowTarget("OVERVIEW");
                      setCalibrationCompleted(false);
                      setCalibrationData([]);
                      setCalibrationElapsed(0);
                      setViewState("CALIBRATION_PENDING");
                    }}
                    className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  >
                    Recalibrate
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* VIEW: CALIBRATION */}
      {viewState === "CALIBRATION_PENDING" && (
        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto w-full">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-primary text-center">Device Check</h1>
          <p className="text-slate-500 text-sm sm:text-base mt-3 text-center max-w-2xl">
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
            {allCalibrationSensorsReady && (
              <button
                onClick={() => openCalibrationRunView()}
                className="px-10 py-3.5 rounded-full bg-primary hover:bg-primary-hover text-white font-semibold transition-colors cursor-pointer"
              >
                Continue
              </button>
            )}

            {isDevMode && !allCalibrationSensorsReady && (
              <button
                onClick={() => openCalibrationRunView(true)}
                className="px-8 py-3 rounded-full border border-primary/40 text-primary hover:bg-primary/10 font-semibold transition-colors cursor-pointer"
              >
                Bypass Device Check (Dev Mode)
              </button>
            )}
          </div>
        </main>
      )}

      {/* VIEW: CALIBRATION GOING */}
      {viewState === "CALIBRATION_ACTIVE" && (
        <main
          className="flex-1 w-full flex flex-col items-center justify-center relative overflow-hidden"
          style={{ background: "radial-gradient(ellipse 90% 70% at 50% 60%, #0d1e4a 0%, #000a1f 100%)" }}
        >
          {/* Skip Button */}
          <button
            onClick={() => beginLiveSession()}
            className="absolute top-8 right-8 z-50 p-3 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Skip Calibration"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Ambient background glow */}
          <div
            className="pointer-events-none absolute"
            style={{
              width: 700,
              height: 700,
              borderRadius: "9999px",
              background: "radial-gradient(circle, rgba(127,158,207,0.07) 0%, transparent 70%)",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />

          {/* Top label */}
          <p className="relative z-10 text-slate-400 text-xs tracking-[0.25em] uppercase font-semibold mb-14 select-none">
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
              className="text-white text-2xl font-light tracking-widest transition-opacity duration-500"
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
                      background: active ? "#c9def7" : "rgba(127,158,207,0.25)",
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
              ? `${calibrationElapsed}s / ${CALIBRATION_DURATION_SEC}s`
              : "Press Start when ready"}
          </p>

          {/* Controls */}
          <div className="relative z-10 mt-10 flex items-center gap-4">
            {!isCalibrationRunning && (
              <button
                onClick={startCalibration}
                className="flex items-center gap-2.5 px-8 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer"
                style={{
                  background: "rgba(201,222,247,0.15)",
                  border: "1.5px solid rgba(201,222,247,0.35)",
                  color: "#c9def7",
                  backdropFilter: "blur(8px)",
                }}
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}
            <button
              onClick={resetCalibration}
              disabled={!isCalibrationRunning && calibrationElapsed === 0}
              className="flex items-center gap-2.5 px-8 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "transparent",
                border: "1.5px solid rgba(127,158,207,0.2)",
                color: "rgba(127,158,207,0.7)",
              }}
            >
              Reset
            </button>
          </div>
        </main>
      )}

      {/* VIEW: LIVE DASHBOARD — Redesigned */}
      {viewState === "LIVE" && (() => {
        // ── Derived live values ──────────────────────────────────────
        const sessionDurationSec = sessionData.length;
        const totalSamples = sessionData.length;
        const calmSamples = sessionData.filter(d => d.workload > -30).length;
        const accuracyPct = totalSamples > 0 ? Math.round((calmSamples / totalSamples) * 100) : 0;
        const recentData = sessionData.slice(-60);

        const cogLoadPct = Math.round(workloadValue);

        const GAUGE_R = 70;
        const GAUGE_SPAN_DEG = 220;
        const gaugeCirc = 2 * Math.PI * GAUGE_R;
        const gaugeFilled = gaugeCirc * ((GAUGE_SPAN_DEG / 360) * (cogLoadPct / 100));
        const gaugeColor = cogLoadPct >= 66 ? "#ef4444" : cogLoadPct >= 33 ? "#f59e0b" : "#10b981";
        const gaugeGlow = cogLoadPct >= 66
            ? "drop-shadow(0 0 8px rgba(239,68,68,0.4))"
            : cogLoadPct >= 33
            ? "drop-shadow(0 0 8px rgba(245,158,11,0.4))"
            : "drop-shadow(0 0 8px rgba(16,185,129,0.3))";
        const gaugeTotal = gaugeCirc * (GAUGE_SPAN_DEG / 360);
        const zoneLabel = cogLoadPct >= 66 ? "Overload Warning" : cogLoadPct >= 33 ? "High Effort" : "Optimal / Baseline";
        const cogDonutFilled = gaugeCirc * (cogLoadPct / 100);

        const hrvDelta = currentRmssd !== null && baselineRmssd && baselineRmssd > 0
          ? ((currentRmssd - baselineRmssd) / baselineRmssd) * 100
          : null;
        
        const stressPct = hrvDelta !== null ? Math.round(Math.max(0, Math.min(100, hrvDelta < 0 ? (Math.abs(hrvDelta) / 30) * 100 : 0))) : 0;
        const stressDonutFilled = gaugeCirc * (stressPct / 100);
        const stressDonutColor = stressPct >= 66 ? "#ef4444" : stressPct >= 33 ? "#f59e0b" : "#3b579f";
        const stressDonutGlow = stressPct >= 66
            ? "drop-shadow(0 0 8px rgba(239,68,68,0.4))"
            : stressPct >= 33
            ? "drop-shadow(0 0 8px rgba(245,158,11,0.4))"
            : "drop-shadow(0 0 8px rgba(59,87,159,0.3))";

        const stressColor = hrvDelta === null ? "#cbd5e1" : hrvDelta < -15 ? "#ef4444" : hrvDelta > 5 ? "#059669" : "#3b579f";

        const durMins = Math.floor(sessionDurationSec / 60);
        const durSecs = sessionDurationSec % 60;

        // Performance score
        const perfScore = totalSamples > 0 ? Math.round(accuracyPct * 0.7 + Math.min(100, (60 / Math.max(1, sessionDurationSec / 3)) * 100) * 0.3) : 0;

        // Stress events count
        let liveStressEvents = 0;
        let inStress = false;
        sessionData.forEach(d => {
          if (d.workload < -30) { if (!inStress) { liveStressEvents++; inStress = true; } }
          else inStress = false;
        });

        // Sparkline for bottom timeline
        const tlW = 800, tlH = 48;
        const tlPoints = recentData.length > 1
          ? recentData.map((d, i) => {
              const x = (i / (recentData.length - 1)) * tlW;
              const y = tlH - Math.max(0, Math.min(tlH, ((d.workload + 100) / 200) * tlH));
              return `${x},${y}`;
            }).join(" ")
          : null;
        const tlFillPoints = tlPoints ? `0,${tlH} ${tlPoints} ${tlW},${tlH}` : null;

        const liveChartData = sessionData.map(d => {
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

        const isCameraMode = liveMode === "camera";

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
              </div>

              {/* Right: mode toggle + controls */}
              <div className="flex items-center gap-3">
                {/* Mode toggle */}
                <div className="toggle-pill">
                  <button
                    id="live-mode-biofeedback"
                    onClick={() => setLiveMode("biofeedback")}
                    className={liveMode === "biofeedback" ? "active" : "inactive"}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Biofeedback
                  </button>
                  <button
                    id="live-mode-camera"
                    onClick={() => setLiveMode("camera")}
                    className={liveMode === "camera" ? "active" : "inactive"}
                  >
                    <Video className="w-3.5 h-3.5" />
                    Camera + Bio
                  </button>
                </div>

                <button
                  onClick={() => setIsSessionPaused(p => !p)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-all bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200"
                >
                  {isSessionPaused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
                </button>
                <button
                  onClick={endSession}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-semibold cursor-pointer transition-all"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}
                >
                  <Square className="w-3.5 h-3.5" /> End Session
                </button>
              </div>
            </div>

            {/* ── BIOFEEDBACK MODE ────────────────────────────────── */}
            {!isCameraMode && (
              <div className="flex-1 flex flex-col gap-4 p-4 lg:p-6 overflow-y-auto relative z-10 w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
                  
                  {/* ── LEFT SIDE (Span 3) ── */}
                  <div className="lg:col-span-3 flex flex-col gap-4">
                    {/* Pupil Dilation */}
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

                    {/* HRV (RMSSD in ms) */}
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

                  {/* ── CENTER (Span 6) ── */}
                  <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Cognitive Workload Card */}
                    <div className="glass-card flex-1 p-4 flex items-center justify-center relative flex-col">
                      <p className="absolute top-4 left-4 metric-label tracking-widest uppercase flex items-center gap-2">
                        <Brain className="w-4 h-4 text-slate-500" /> Cognitive Workload
                      </p>
                      <div className="relative shrink-0 mt-6" style={{ width: 140, height: 140 }}>
                        <svg viewBox="0 0 180 180" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke="rgba(0,24,100,0.06)" strokeWidth="14" />
                          <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke={gaugeColor} strokeWidth="14"
                            strokeDasharray={`${cogDonutFilled} ${gaugeCirc - cogDonutFilled}`} strokeLinecap="round"
                            style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.6s ease", filter: gaugeGlow }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="font-mono text-4xl font-light transition-all duration-700" style={{ color: gaugeColor }}>
                            {isCalibrated ? cogLoadPct : "--"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col items-center gap-1">
                        <span className="text-base font-medium" style={{ color: gaugeColor }}>
                           {isCalibrated ? zoneLabel : "Not calibrated"}
                        </span>
                        {isCalibrated && (
                          <span className="text-[11px] text-slate-400">Target zone: Optimal / Baseline</span>
                        )}
                      </div>
                    </div>

                    {/* Stress Level Card */}
                    <div className="glass-card flex-1 p-4 flex items-center justify-center relative flex-col">
                      <p className="absolute top-4 left-4 metric-label tracking-widest uppercase flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-slate-500" /> Stress Levels
                      </p>
                      <div className="relative shrink-0 mt-6" style={{ width: 140, height: 140 }}>
                        <svg viewBox="0 0 180 180" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke="rgba(0,24,100,0.06)" strokeWidth="14" />
                          <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke={stressDonutColor} strokeWidth="14"
                            strokeDasharray={`${stressDonutFilled} ${gaugeCirc - stressDonutFilled}`} strokeLinecap="round"
                            style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.6s ease", filter: stressDonutGlow }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="font-mono text-4xl font-light transition-all duration-700" style={{ color: stressDonutColor }}>
                            {isCalibrated && hrvDelta !== null ? stressPct : "--"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col items-center gap-1">
                        <span className="text-base font-medium" style={{ color: stressDonutColor }}>
                           {isCalibrated && hrvDelta !== null 
                              ? (stressPct >= 66 ? "High Stress Active" : stressPct >= 33 ? "Elevated Warning" : "Relaxed State") 
                              : "Not calibrated"}
                        </span>
                        {isCalibrated && (
                          <span className="text-[11px] text-slate-400">Based on HRV deviation</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── RIGHT SIDE (Span 3) ── */}
                  <div className="lg:col-span-3 flex flex-col gap-4">
                    {/* Session Duration */}
                    <div className="glass-card p-4 flex flex-col gap-2 justify-center flex-1">
                      <p className="metric-label flex items-center gap-2 justify-between">
                        Session Duration <Timer className="w-4 h-4 text-slate-500" />
                      </p>
                      <div className="flex flex-col mt-auto items-center justify-center flex-1 w-full gap-2">
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono text-4xl font-light text-slate-800">
                            {`${String(durMins).padStart(2, "0")}:${String(durSecs).padStart(2, "0")}`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Active recording time</p>
                      </div>
                    </div>

                    {/* Task Speed */}
                    <div className="glass-card p-4 flex flex-col gap-2 justify-center flex-1">
                      <p className="metric-label flex items-center gap-2 justify-between">
                        Task Speed <Zap className="w-4 h-4 text-slate-500" />
                      </p>
                      <div className="flex flex-col mt-auto items-center justify-center flex-1 w-full gap-2">
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono text-4xl font-light text-slate-400">
                            --
                          </span>
                          <span className="text-slate-400 font-medium ml-1">op/m</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Telemetry not linked</p>
                      </div>
                    </div>

                    {/* Accuracy */}
                    <div className="glass-card p-4 flex flex-col justify-center flex-1">
                      <p className="metric-label flex items-center gap-2 justify-between">
                        Accuracy <Target className="w-4 h-4 text-slate-500" />
                      </p>
                      <div className="flex flex-col mt-auto items-center justify-center flex-1 w-full gap-3">
                        <div className="relative flex items-center justify-center shrink-0" style={{ width: 100, height: 100 }}>
                           <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                             <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,24,100,0.04)" strokeWidth="8" />
                             <circle cx="50" cy="50" r="44" fill="none" stroke="url(#accuracyGradient)" strokeWidth="8"
                               strokeDasharray={`${2 * Math.PI * 44 * (accuracyPct / 100)} ${2 * Math.PI * 44}`} strokeLinecap="round" />
                             <defs>
                               <linearGradient id="accuracyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                 <stop offset="0%" stopColor="#3b579f" />
                                 <stop offset="100%" stopColor="#10b981" />
                               </linearGradient>
                             </defs>
                           </svg>
                           <div className="flex items-baseline gap-1 relative z-10">
                              <span className="font-mono text-3xl font-light text-primary">
                                {totalSamples > 0 ? accuracyPct : "--"}
                              </span>
                              <span className="text-slate-500 font-medium text-lg">%</span>
                           </div>
                        </div>
                        <p className="text-[11px] text-slate-500 text-center">Based on optimal workload zones</p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* ── LIVE SESSION TIMELINE (Full Width Row) ── */}
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
                {/* Video feed placeholder */}
                <div className="absolute inset-0 camera-feed-placeholder">
                  <div className="flex flex-col items-center gap-4">
                    <Video className="w-16 h-16 text-white/15" />
                    <p className="text-white/20 text-sm font-medium">POV Camera Feed</p>
                    <p className="text-white/10 text-xs">Connect laparoscope camera to start streaming</p>
                  </div>
                </div>

                {/* Floating HUD — Top Left: BPM */}
                <div className="absolute top-5 left-5 glass-hud px-5 py-3 flex items-center gap-3 z-20">
                  <Heart className="w-5 h-5 text-red-400" />
                  <div>
                    <span className="metric-value text-2xl text-white/90">{bpm !== null && bpm > 0 ? bpm : "--"}</span>
                    <span className="text-xs text-white/40 ml-1">bpm</span>
                  </div>
                </div>

                {/* Floating HUD — Top Right: HRV Delta */}
                <div className="absolute top-5 right-5 glass-hud px-5 py-3 flex items-center gap-3 z-20">
                  <Activity className="w-4 h-4" style={{ color: stressColor }} />
                  <div>
                    <span className="text-[10px] text-white/35 uppercase tracking-wider block">HRV Δ</span>
                    <span className="metric-value text-2xl" style={{ color: stressColor }}>
                      {hrvDelta !== null ? `${hrvDelta > 0 ? "+" : ""}${hrvDelta.toFixed(1)}%` : "--"}
                    </span>
                  </div>
                </div>

                {/* Floating HUD — Bottom Left: Cognitive Load mini gauge */}
                <div className="absolute bottom-20 left-5 glass-hud p-4 flex items-center gap-4 z-20">
                  <div className="relative" style={{ width: 56, height: 56 }}>
                    <svg viewBox="0 0 60 60" className="w-full h-full" style={{ transform: "rotate(160deg)" }}>
                      <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4"
                        strokeDasharray={`${2 * Math.PI * 24 * (220 / 360)} ${2 * Math.PI * 24 * (140 / 360)}`} strokeLinecap="round" />
                      <circle cx="30" cy="30" r="24" fill="none" stroke={gaugeColor} strokeWidth="4"
                        strokeDasharray={`${2 * Math.PI * 24 * (220 / 360) * (cogLoadPct / 100)} ${2 * Math.PI * 24}`} strokeLinecap="round"
                        style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.6s ease", filter: gaugeGlow }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="metric-value text-sm" style={{ color: gaugeColor }}>{isCalibrated ? cogLoadPct : "--"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-wider">Cognitive Load</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: gaugeColor }}>{zoneLabel}</p>
                  </div>
                </div>

                {/* Floating HUD — Bottom Right: Duration + Performance */}
                <div className="absolute bottom-20 right-5 glass-hud px-5 py-3 flex items-center gap-5 z-20">
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-wider">Duration</p>
                    <span className="metric-value text-2xl text-white/90">
                      {`${String(durMins).padStart(2, "0")}:${String(durSecs).padStart(2, "0")}`}
                    </span>
                  </div>
                  <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.1)" }} />
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-wider">Performance</p>
                    <span className="metric-value text-2xl" style={{ color: perfScore >= 70 ? "#34d399" : perfScore >= 40 ? "#fbbf24" : "#f87171" }}>
                      {totalSamples > 0 ? `${perfScore}%` : "--"}
                    </span>
                  </div>
                </div>

                {/* Bottom timeline strip */}
                <div className="absolute bottom-0 left-0 right-0 timeline-strip px-6 py-2 z-20">
                  <svg width="100%" height={32} viewBox={`0 0 ${tlW} 32`} preserveAspectRatio="none">
                    {tlPoints && (
                      <>
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
                      </>
                    )}
                  </svg>
                </div>
              </div>
            )}

            {/* ── BOTTOM TIMELINE STRIP (Biofeedback mode only) ─── */}
            {!isCameraMode && (
              <div className="relative z-10 timeline-strip px-6 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="metric-label">Session Timeline</p>
                  <span className="text-[10px] text-white/25 font-mono tabular-nums">
                    {`${String(durMins).padStart(2, "0")}:${String(durSecs).padStart(2, "0")}`}
                  </span>
                </div>
                <svg width="100%" height={36} viewBox={`0 0 ${tlW} 36`} preserveAspectRatio="none">
                  <line x1="0" y1="18" x2={tlW} y2="18" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                  {recentData.length > 1 && (() => {
                    const pts = recentData.map((d, i) => {
                      const x = (i / (recentData.length - 1)) * tlW;
                      const y = 36 - Math.max(0, Math.min(36, ((d.workload + 100) / 200) * 36));
                      return `${x},${y}`;
                    });
                    const polyStr = pts.join(" ");
                    const fillStr = `0,36 ${polyStr} ${tlW},36`;
                    return (
                      <>
                        <polygon points={fillStr} fill={`${gaugeColor}10`} />
                        <polyline points={polyStr} fill="none" stroke={gaugeColor} strokeWidth="1.5"
                          strokeLinejoin="round" strokeLinecap="round" style={{ filter: gaugeGlow }} />
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}
          </main>
        );
      })()}

      {/* VIEW: SAVING */}
      {viewState === "SAVING" && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-2xl mx-auto w-full text-center">
          <Activity className="w-16 h-16 text-slate-500 mb-8 animate-pulse" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Finalizing Session</h1>
          <p className="text-slate-600 text-lg mb-12">
            Saving biological timeline and metrics...
          </p>
          <div className="w-64 bg-slate-50 rounded-full h-2 mb-4 overflow-hidden relative">
            <div className="absolute top-0 left-0 bg-primary h-2 w-1/3 rounded-full animate-[ping_1.5s_ease-in-out_infinite]"></div>
          </div>
        </main>
      )}

      {/* VIEW: REVIEW */}
      {viewState === "REVIEW" && (
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
          {renderReviewHeader()}

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
      )}
      </div>
    </div>
  );
}
