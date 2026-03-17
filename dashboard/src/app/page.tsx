"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import { Wifi, WifiOff, Play, Square, Activity, Video, LogOut, User, RefreshCw, RotateCcw, Volume2, VolumeX, Settings, Maximize, Pause, Brain } from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import NBackTest from "../components/NBackTest";
import HeartRateMonitor from "../components/HeartRateMonitor";
import HRVMonitor from "../components/HRVMonitor";
import ConcentrationMetric from "../components/ConcentrationMetric";
import Sidebar from "../components/Sidebar";

type ViewState = "LOGIN" | "OVERVIEW" | "HISTORY" | "SETTINGS" | "CALIBRATION_PENDING" | "CALIBRATION_ACTIVE" | "INTRODUCTION" | "LIVE" | "SAVING" | "REVIEW";

interface SessionInfo {
  sessionId: string;
  timestamp: number;
  reviewStats: { 
    max: number; 
    avg: number; 
    duration: number; 
    avgBpm?: number; 
    avgRmssd?: number;
    avgCognitiveEffort?: number;
    avgPupilSize?: number;
    nBackStats?: {
      hits: number;
      misses: number;
      falseAlarms: number;
    };
  };
}

interface SessionDataPoint {
  timeOffset: number; // Seconds since session started
  bpm: number;
  rmssd: number;
  workload: number;
}

const CALIBRATION_DURATION_SEC = 180;
const SESSION_PHASE_DURATION_SEC = 60; // Duration of each N-Back phase

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [viewState, setViewState] = useState<ViewState>("LOGIN");
  const [userId, setUserId] = useState("");
  const [pastSessions, setPastSessions] = useState<SessionInfo[]>([]);
  const [currentReviewSession, setCurrentReviewSession] = useState<SessionInfo | null>(null);

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

  // Session State
  const [sessionData, setSessionData] = useState<SessionDataPoint[]>([]);

  // Media Recording State
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  const [isSessionPaused, setIsSessionPaused] = useState(false);
  const [sessionDurationSecs, setSessionDurationSecs] = useState(0);
  const [currentNBackLevel, setCurrentNBackLevel] = useState(1);
  const [sessionPhase, setSessionPhase] = useState(1);
  const [countDown, setCountDown] = useState<number | null>(null);

  // Refs for tracking time across websocket callbacks without dependency loops
  const viewStateRef = useRef<ViewState>("LOGIN");
  const isSessionPausedRef = useRef<boolean>(false);
  const calibrationStartRef = useRef<number>(0);
  const calibrationDataRef = useRef<number[]>([]);
  const sessionStartRef = useRef<number>(0);
  const baselineRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRescanRef = useRef<boolean>(false);
  const scanningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const reviewVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const nBackStatsRef = useRef<{ hits: number, misses: number, falseAlarms: number } | null>(null);

  // Sync refs with state
  useEffect(() => { viewStateRef.current = viewState; }, [viewState]);
  useEffect(() => { isSessionPausedRef.current = isSessionPaused; }, [isSessionPaused]);
  useEffect(() => { baselineRef.current = baselineRmssd; }, [baselineRmssd]);
  useEffect(() => { calibrationDataRef.current = calibrationData; }, [calibrationData]);
  useEffect(() => { mediaStreamRef.current = mediaStream; }, [mediaStream]);

  // Cleanup MediaStream on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

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

            if (newBpm !== null) setBpm(newBpm);
            if (newRmssd !== null) setCurrentRmssd(newRmssd);

            const now = Date.now();
            const currentState = viewStateRef.current;

            // Handle Calibration Logging
            if (currentState === "CALIBRATION_ACTIVE" && newRmssd !== null && newRmssd > 0) {
              const elapsed = Math.floor((now - calibrationStartRef.current) / 1000);
              setCalibrationElapsed(elapsed);

              setCalibrationData((prev) => [...prev, newRmssd]);

              if (elapsed >= CALIBRATION_DURATION_SEC) {
                // Finish Calibration
                const allData = [...calibrationDataRef.current, newRmssd];
                const avg = allData.reduce((acc, val) => acc + val, 0) / allData.length;
                setBaselineRmssd(avg);

                // Save to Local Storage
                const emailKey = `calibration_baseline_${userId || 'anonymous'}`;
                localStorage.setItem(emailKey, avg.toString());
                setSavedBaselineRmssd(avg);

                // Transition: Onboarding goes to OVERVIEW, normal goes to LIVE
                setViewState("INTRODUCTION");
              }
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

  // Phase Progression during LIVE Session
  useEffect(() => {
    if (viewState === "LIVE" && !isSessionPaused) {
      const activeSeconds = sessionData.length;
      setSessionDurationSecs(activeSeconds);
      
      const newPhase = Math.floor(activeSeconds / SESSION_PHASE_DURATION_SEC) + 1;
      
      if (newPhase <= 3) {
        if (newPhase !== sessionPhase) {
          setSessionPhase(newPhase);
          setCurrentNBackLevel(newPhase);
        }
      } else {
        // Automatically end session after 3 phases (e.g. 3 mins)
        // We can either call endSession, or just let it continue. Instruction doesn't explicitly mention auto-ending,
        // but "soll dann aus drei teilen bestehen" implies it ends. Let's just cap the level at 3 if it continues.
        if (sessionPhase !== 3) {
          setSessionPhase(3);
          setCurrentNBackLevel(3);
        }
      }
    }
  }, [sessionData.length, viewState, isSessionPaused, sessionPhase]);

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
    calibrationStartRef.current = Date.now();
    setViewState("CALIBRATION_ACTIVE");
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: "start" }));
    }
  };

  const startNewSessionFromDashboard = () => {
    if (savedBaselineRmssd !== null) {
      setViewState("INTRODUCTION");
    } else {
      // Navigate to calibration since it hasn't been done yet
      setViewState("CALIBRATION_PENDING");
    }
  };

  const startCountdown = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setMediaStream(stream);
      mediaStreamRef.current = stream;
    } catch (err) {
      console.warn("Screen recording access denied or error:", err);
    }
    
    setCountDown(3);
    let counter = 3;
    const interval = setInterval(() => {
      counter -= 1;
      if (counter > 0) {
        setCountDown(counter);
      } else {
        clearInterval(interval);
        setCountDown(null);
        beginLiveSession(true);
      }
    }, 1000);
  };

  const beginLiveSession = async (streamAlreadyCaptured = false) => {
    try {
      let stream = mediaStreamRef.current;
      if (!streamAlreadyCaptured || !stream) {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        setMediaStream(stream);
        mediaStreamRef.current = stream;
      }
      
      if (savedBaselineRmssd !== null) {
        setBaselineRmssd(savedBaselineRmssd);
      }
      setViewState("LIVE");
      sessionStartRef.current = Date.now();
      setSessionData([]);
      nBackStatsRef.current = null;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ command: "start" }));
      }

      // Start Video Recording
      try {
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          setRecordedVideoUrl(URL.createObjectURL(blob));
          // Stop screen sharing tracks
          stream.getTracks().forEach(t => t.stop());
          setMediaStream(null);
        };

        recorder.start();
      } catch (recorderErr) {
        console.error("Failed to start MediaRecorder:", recorderErr);
      }
    } catch (err) {
      console.error("Screen sharing access denied or cancelled:", err);
    }
  };

  const endSession = async () => {
    setViewState("SAVING");
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: "stop" }));
    }

    // Stop recording gracefully
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    // Wait briefly for the onstop event to fire and set the blob URL
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const formData = new FormData();
      formData.append('userId', userId || 'anonymous');
      formData.append('sessionData', JSON.stringify(sessionData));

      // Calculate review stats to save them too
      const max = Math.max(...sessionData.map(d => d.workload));
      const avg = sessionData.reduce((acc, val) => acc + val.workload, 0) / sessionData.length;
      const duration = sessionData.length > 0 ? sessionData[sessionData.length - 1].timeOffset : 0;
      const avgBpm = sessionData.reduce((acc, val) => acc + val.bpm, 0) / sessionData.length;
      const avgRmssd = sessionData.reduce((acc, val) => acc + val.rmssd, 0) / sessionData.length;

      const newReviewStats = { 
        max, 
        avg, 
        duration, 
        avgBpm, 
        avgRmssd,
        nBackStats: nBackStatsRef.current || undefined
      };
      formData.append('reviewStats', JSON.stringify(newReviewStats));

      if (recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        // The object URL was already created by the onstop handler for playback
        formData.append('video', blob, 'recording.webm');
      }

      const res = await fetch('/api/sessions', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        console.error("Failed to save session via API", await res.text());
      } else {
        // Refresh sessions list
        fetchPastSessions(userId);
      }

      setCurrentReviewSession({
        sessionId: "latest",
        timestamp: sessionStartRef.current,
        reviewStats: newReviewStats
      });
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
        // Reset video to prevent seeing the previous recording
        setRecordedVideoUrl(null);
        setViewState("REVIEW");
      }
    } catch (e) {
      console.error("Failed to fetch session details", e);
    }
  };

  const returnToDashboard = () => {
    setViewState("OVERVIEW");
    setSessionData([]);
    setVideoTime(0);
    setVideoDuration(0);

    // Revoke object URL to prevent memory leaks
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
    }
  };

  // Video playback controls
  const handleVideoScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const timelineDuration = videoDuration > 0
      ? videoDuration
      : (sessionData.length > 0 ? sessionData[sessionData.length - 1].timeOffset : 0);
    if (timelineDuration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.min(1, Math.max(0, x / rect.width));
    const nextTime = percentage * timelineDuration;

    setVideoTime(nextTime);
    if (reviewVideoRef.current) {
      reviewVideoRef.current.currentTime = nextTime;
    }
  };

  const toggleVideoPlayback = () => {
    if (!reviewVideoRef.current) return;
    if (reviewVideoRef.current.paused) {
      reviewVideoRef.current.play();
    } else {
      reviewVideoRef.current.pause();
    }
  };

  const rewindVideo = () => {
    const nextTime = Math.max(0, videoTime - 10);
    setVideoTime(nextTime);
    if (reviewVideoRef.current) {
      reviewVideoRef.current.currentTime = nextTime;
    }
  };

  const toggleVideoMute = () => {
    if (!reviewVideoRef.current) return;
    const nextMuted = !reviewVideoRef.current.muted;
    reviewVideoRef.current.muted = nextMuted;
    setIsVideoMuted(nextMuted);
  };

  const cycleVideoSpeed = () => {
    if (!reviewVideoRef.current) return;
    const speedOptions = [1, 1.25, 1.5, 2];
    const currentSpeed = reviewVideoRef.current.playbackRate || 1;
    const currentIndex = speedOptions.findIndex((speed) => Math.abs(speed - currentSpeed) < 0.01);
    const nextSpeed = speedOptions[(currentIndex + 1) % speedOptions.length];

    reviewVideoRef.current.playbackRate = nextSpeed;
    setVideoPlaybackRate(nextSpeed);
  };

  const toggleVideoFullscreen = async () => {
    if (!reviewVideoContainerRef.current) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await reviewVideoContainerRef.current.requestFullscreen();
  };

  const hasReviewVideo = Boolean(recordedVideoUrl);

  // Derived Live State UI
  let workloadValue = 0; // mapped 0-100 for knob position
  let workloadDisplayValue = "0"; // the text to show (delta %)
  let workloadColor = "text-slate-500";
  let workloadLabel = "CALCULATING";
  let isCalibrated = true;

  if (baselineRmssd === null || baselineRmssd === undefined || baselineRmssd <= 0) {
    isCalibrated = false;
    workloadLabel = "Calibration Required";
    workloadColor = "text-slate-500";
    workloadValue = 0;
    workloadDisplayValue = "--";
  } else if (viewState === "LIVE" && currentRmssd !== null) {
    const deltaPercent = ((currentRmssd - baselineRmssd) / baselineRmssd) * 100;
    workloadDisplayValue = deltaPercent > 0 ? `+${deltaPercent.toFixed(0)}` : deltaPercent.toFixed(0);

    let knobPercentage = 0;

    if (deltaPercent >= -15) {
      workloadColor = "text-emerald-400";
      workloadLabel = "Optimal / Baseline";
      const x = -deltaPercent;
      knobPercentage = Math.max(0, ((x + 10) / 25) * 33);
    } else if (deltaPercent >= -30) {
      workloadColor = "text-amber-400";
      workloadLabel = "High Effort";
      const x = -deltaPercent;
      knobPercentage = 33 + ((x - 15) / 15) * 33;
    } else {
      workloadColor = "text-red-500";
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

    const nBack = currentReviewSession?.reviewStats?.nBackStats;
    const hits = nBack?.hits || 0;
    const misses = nBack?.misses || 0;
    const falseAlarms = nBack?.falseAlarms || 0;
    const totalResponses = hits + misses + falseAlarms;
    const errorRate = totalResponses > 0 ? ((misses + falseAlarms) / totalResponses) * 100 : 0;

    const validBpmData = sessionData.filter((d) => d.bpm > 0);
    const averageHeartRate =
      validBpmData.length > 0
        ? validBpmData.reduce((acc, d) => acc + d.bpm, 0) / validBpmData.length
        : (currentReviewSession?.reviewStats?.avgBpm || 0);

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

    return {
      timeOnTaskSecs,
      avgTimeOnTaskSecs,
      errorRate,
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
      return {
        ...point,
        deltaRmssd,
        cognitiveEffort: -deltaRmssd
      };
    });
  }, [sessionData, baselineRmssd, currentReviewSession]);

  const dashboardChartData = useMemo(() => {
    if (!pastSessions || pastSessions.length === 0) return [];
    return [...pastSessions].reverse().map(session => ({
      ...session,
      // For existing sessions without these stats, derive them so the chart looks nice, or leave them as missing/0
      avgCognitiveEffort: session.reviewStats?.avgCognitiveEffort ?? (session.reviewStats?.avgRmssd ? -(session.reviewStats.avgRmssd - 35) : 0),
      // Pupil size is currently empty per request, providing a fixed 0 or undefined.
      avgPupilSize: session.reviewStats?.avgPupilSize ?? 0,
    }));
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
    <div className="mb-8 md:mb-10 border-b border-slate-800/80">
      <div className="h-22 flex flex-col gap-4 md:flex-row md:items-center md:justify-between justify-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{title}</h1>
        <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-3 sm:gap-4 flex-wrap">
          {renderConnectionStatus()}
          <button
            onClick={startNewSessionFromDashboard}
            disabled={bleState !== "connected"}
            className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-primary hover:bg-primary-hover disabled:bg-slate-800 text-white disabled:text-white rounded-full font-semibold transition-all text-xs sm:text-sm cursor-pointer disabled:cursor-not-allowed"
          >
            <Video className="w-4 h-4 text-white" />
            Start New Session
          </button>
        </div>
      </div>
    </div>
  );

  const showSidebar = ["OVERVIEW", "HISTORY", "SETTINGS", "REVIEW"].includes(viewState);

  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans flex relative overflow-hidden">
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
          pastSessions={pastSessions.map(s => ({ sessionId: s.sessionId, timestamp: s.timestamp }))}
          onSessionSelect={(id) => viewSessionDetails(id)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-y-auto w-full">
      {/* VIEW: LOGIN */}
      {viewState === "LOGIN" && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-md mx-auto w-full text-center">
          <Image src="/techmed-logo-stacked.svg" alt="TechMed Logo" width={131} height={56} className="h-16 w-auto mb-8 opacity-90" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {isSignUp ? "Create Account" : "Login"}
          </h1>
          <p className="text-slate-400 mb-8">
            {isSignUp
              ? "Register to securely track your learning progress."
              : "Welcome to the Simulation Center."}
          </p>

          {status === 'loading' || session ? (
            <div className="w-full flex items-center justify-center p-4">
              <div className="animate-pulse text-slate-400 font-medium">Loading Dashboard...</div>
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
                    className="w-full px-6 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
                    required
                  />
                )}
                <input
                  type="email"
                  placeholder="University Email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-200 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
                  required
                />
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-4 mt-2 bg-slate-100 hover:bg-white text-slate-900 rounded-full font-semibold transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="flex flex-col gap-8">
              {/* Visualisierung 1: Learning Curve */}
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-3xl p-5 sm:p-8 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-semibold mb-2">Learning Curve</h2>
                <p className="text-slate-400 text-sm mb-8">Your expected learning progress.</p>
              </div>
              <div className="h-48 w-full pt-4">
                {pastSessions.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={learningCurveData}>
                      <XAxis
                        dataKey="timestamp"
                        stroke="#475569"
                        tickFormatter={(val) => new Date(val).toLocaleDateString()}
                        minTickGap={30}
                      />
                      <YAxis stroke="#475569" domain={[0, 'dataMax + 10']} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                        labelFormatter={(val) => new Date(val as number).toLocaleString()}
                      />
                      <Line
                        type="monotone"
                        dataKey="expectedWorkload"
                        name="Expected Target"
                        stroke="#475569"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="reviewStats.avg"
                        name="Avg Workload"
                        stroke="#3B98B4"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "#3B98B4", strokeWidth: 2, stroke: "#0f172a" }}
                        activeDot={{ r: 6, fill: "#31829c" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600">No data yet</div>
                )}
              </div>
            </div>

            {/* Visualisierung 2: Workload & Stress Trend */}
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-3xl p-5 sm:p-8 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-semibold mb-2">Workload & Stress Trend</h2>
                <p className="text-slate-400 text-sm mb-8">Maximum and average stress levels across your history.</p>
              </div>
              <div className="h-48 w-full pt-4">
                {pastSessions.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[...pastSessions].reverse()}>
                      <XAxis
                        dataKey="timestamp"
                        stroke="#475569"
                        tickFormatter={(val) => new Date(val).toLocaleDateString()}
                        minTickGap={30}
                      />
                      <YAxis stroke="#475569" domain={[0, 'dataMax + 10']} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                        labelFormatter={(val) => new Date(val as number).toLocaleString()}
                      />
                      <Line
                        type="monotone"
                        dataKey="reviewStats.max"
                        name="Max Workload"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#f43f5e", strokeWidth: 1, stroke: "#0f172a" }}
                        activeDot={{ r: 5, fill: "#fb7185" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="reviewStats.avg"
                        name="Avg Workload"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#0f172a" }}
                        activeDot={{ r: 6, fill: "#fbbf24" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600">No stress data yet</div>
                )}
              </div>
            </div>
            
            </div>
          </div>
        </main>
      )}

      {/* VIEW: HISTORY */}
      {viewState === "HISTORY" && (
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
          {renderMinimalHeader("History")}

          <div className="flex flex-col gap-6 w-full">
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-3xl p-5 sm:p-8">
              {pastSessions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pastSessions.map((s, index) => (
                    <div
                      key={s.sessionId}
                      onClick={() => viewSessionDetails(s.sessionId)}
                      className="bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col gap-2 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
                      <div className="flex justify-between items-start z-10">
                        <div className="font-semibold text-lg text-slate-200">Session {pastSessions.length - index}</div>
                        <div className="text-xs text-slate-400 bg-slate-800/80 px-2 py-1 rounded-md">{new Date(s.timestamp).toLocaleDateString()}</div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-2 gap-4 z-10">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Duration</div>
                          <div className="text-sm text-slate-300 font-medium">
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
                        {s.reviewStats?.nBackStats && (
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">N-Back Focus</div>
                            <div className="text-sm font-bold text-green-400">
                              {s.reviewStats.nBackStats.hits} Hits
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 bg-slate-900/30 border border-slate-800 border-dashed rounded-3xl w-full">
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
            <div className="bg-slate-900/50 border border-slate-800/50 rounded-3xl p-6 sm:p-8 flex flex-col gap-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Account Profile</h3>
                <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-2xl border border-slate-800">
                  <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold text-xl">
                    {session?.user?.name?.charAt(0) || "U"}
                  </div>
                  <div>
                    <div className="font-medium text-slate-200">{session?.user?.name || "Surgeon Profile"}</div>
                    <div className="text-sm text-slate-500">{session?.user?.email}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Bluetooth Devices</h3>
                <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-4">
                    <Activity className={`w-6 h-6 ${wsConnected && bleState === "connected" ? "text-green-500" : "text-slate-600"}`} />
                    <div>
                      <div className="font-medium text-slate-200">Polar H10 Heart Rate Monitor</div>
                      <div className="text-sm text-slate-500">
                        {wsConnected && bleState === "connected" ? "Connected" : "Disconnected"}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setReconnectTrigger(prev => prev + 1)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  >
                    Rescan
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Calibration Baseline</h3>
                <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-slate-800">
                  <div>
                    <div className="font-medium text-slate-200">Current RMSSD Baseline</div>
                    <div className="text-sm text-slate-500">
                      {savedBaselineRmssd ? `${savedBaselineRmssd.toFixed(1)} ms` : "Not calibrated"}
                    </div>
                  </div>
                  <button 
                    onClick={() => setViewState("CALIBRATION_PENDING")}
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
      {(viewState === "CALIBRATION_PENDING" || viewState === "CALIBRATION_ACTIVE") && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-2xl mx-auto w-full text-center">
          <Activity className="w-16 h-16 text-primary mb-6 opacity-80" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Baseline Calibration</h1>
          <p className="text-slate-400 text-lg mb-12">
            Relax and breathe deeply for {CALIBRATION_DURATION_SEC} seconds to establish your baseline HRV.
          </p>

          {viewState === "CALIBRATION_PENDING" ? (
            <div className="flex flex-col items-center gap-4 mt-8 w-full max-w-sm">
              <button
                onClick={startCalibration}
                disabled={bleState !== "connected"}
                className="w-full flex justify-center items-center gap-2 py-4 bg-primary/10 hover:bg-primary/20 text-primary disabled:text-slate-500 disabled:bg-slate-800 rounded-full font-semibold transition-all border border-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-5 h-5" /> Start Calibration
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center mt-12 mb-16 relative">

              {/* The Breathing Orb */}
              <div className="relative w-48 h-48 flex items-center justify-center">
                {/* Glowing Animated Background */}
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-breathe mix-blend-screen"></div>
                <div className="absolute inset-4 bg-teal-400/30 rounded-full animate-breathe delay-75 mix-blend-screen"></div>

                {/* Solid Core */}
                <div className="relative z-10 w-24 h-24 bg-primary rounded-full shadow-[0_0_40px_rgba(59,152,180,0.8)] flex items-center justify-center">
                  <span className="text-slate-950 font-bold text-2xl tracking-tighter">
                    {Math.max(0, CALIBRATION_DURATION_SEC - calibrationElapsed)}<span className="text-lg opacity-70">s</span>
                  </span>
                </div>
              </div>

              {/* Dynamic Breathing Text Guide */}
              <div className="mt-20 text-xl font-medium text-primary/90 tracking-widest uppercase animate-pulse-bg">
                {(calibrationElapsed % 8) < 4 ? "Breathe In..." : "Breathe Out..."}
              </div>
            </div>
          )}
        </main>
      )}

      {/* VIEW: INTRODUCTION */}
      {viewState === "INTRODUCTION" && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-3xl mx-auto w-full text-center">
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 sm:p-12 w-full flex flex-col items-center">
            {countDown !== null ? (
              <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
                <div className="text-8xl font-black text-primary animate-pulse">{countDown}</div>
                <div className="mt-8 text-xl text-slate-400">Auf die Plätze...</div>
              </div>
            ) : (
              <>
                <Activity className="w-16 h-16 text-primary mb-6" />
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 text-white">Gleich gehts los!</h1>
                <p className="text-slate-400 text-lg mb-8 max-w-xl">
                  1. Wir zeichnen nun deine <strong>Herzfrequenz und HRV</strong> auf. So können wir dein Stresslevel analysieren.
                  <br /><br />
                  2. Gleichzeitig machst du den <strong>N-Back-Test</strong> um dein Arbeitsgedächtnis zu trainieren und zu prüfen.
                 </p>
                
                <div className="flex flex-col gap-4 text-left w-full max-w-md bg-slate-950/50 p-6 rounded-2xl border border-slate-800/80 mb-10">
                  <h4 className="font-semibold text-primary flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    So funktioniert der N-Back-Test:
                  </h4>
                  <ul className="list-disc list-inside space-y-2 text-sm text-slate-300 ml-2">
                    <li>Du siehst nacheinander verschiedene Symbole.</li>
                    <li>Drücke die <strong>Leertaste</strong>, wenn das aktuelle Symbol das gleiche ist wie <strong>N Schritte zuvor</strong>.</li>
                    <li><strong>Achtung:</strong> Die Schwierigkeit steigt! Es gibt 3 Phasen (1-Back, 2-Back, 3-Back) à {SESSION_PHASE_DURATION_SEC} Sekunden.</li>
                    <li>Beispiel für 2-back: Stern → Herz → <strong>Stern</strong> (jetzt drücken!).</li>
                    <li>Bleibe fokussiert!</li>
                  </ul>
                </div>
    
                <button
                  onClick={startCountdown}
                  disabled={bleState !== "connected"}
                  className="mt-6 flex items-center justify-center gap-3 w-full max-w-sm py-4 bg-primary hover:bg-primary-hover disabled:bg-slate-800 text-white font-semibold rounded-full transition-all border border-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(59,152,180,0.3)] text-lg pulse-button"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Los Geht&apos;s
                </button>
                {bleState !== "connected" && (
                  <p className="text-red-400 text-sm mt-4">Bitte warten, Herzfrequenzsensor wird verbunden...</p>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {/* Live Screen Recording Indicator (Bottom Left Corner) */}
      {viewState === "LIVE" && mediaStream && (
        <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 px-4 py-2 bg-black/80 rounded-lg border border-slate-800 shadow-xl z-50 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
          <span className="text-xs uppercase font-bold text-white tracking-widest">Screen Rec</span>
        </div>
      )}

      {/* VIEW: LIVE DASHBOARD */}
      {viewState === "LIVE" && (
        <main className="flex-1 w-full h-full relative overflow-hidden bg-slate-950">
          
          {/* Top Left: HRV / RMSSD */}
          <div className="absolute top-10 left-10 flex flex-col pointer-events-none z-10">
            <div className="w-64">
               <HRVMonitor rmssd={currentRmssd} />
            </div>
          </div>

          {/* Top Right: Flow State / Workload */}
          <div className="absolute top-10 right-10 flex flex-col items-end pointer-events-none z-10 w-72 lg:w-80">
            <div className="flex justify-between items-end w-full mb-3 px-1">
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Rest</span>
                <span className="text-[10px] text-slate-500 font-medium">Baseline</span>
              </div>
              <div className="flex flex-col items-center">
                <span className={`text-3xl font-bold tracking-tighter transition-colors duration-500 ${workloadColor}`}>
                  {workloadDisplayValue}<span className="text-lg text-slate-600">%</span>
                </span>
                <span className={`text-[10px] uppercase font-bold tracking-widest ${workloadColor} opacity-90`}>
                  {workloadLabel}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Overload</span>
                <span className="text-[10px] text-slate-500 font-medium">Distress</span>
              </div>
            </div>
            
            <div className={`relative w-full h-3 rounded-full bg-slate-800 border border-slate-700 shadow-inner ${!isCalibrated ? 'opacity-30 grayscale' : ''}`}>
              {/* Spectrum Base */}
              <div className="absolute inset-0 rounded-full bg-linear-to-r from-emerald-500 via-amber-400 to-red-600 opacity-60"></div>
              
              {/* Indicator Knob */}
              <div 
                className="absolute top-1/2 w-1.5 h-6 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.9)] transition-all duration-500 ease-out"
                style={{ 
                  left: `${isCalibrated ? workloadValue : 0}%`,
                  transform: 'translate(-50%, -50%)',
                  display: isCalibrated ? 'block' : 'none'
                }}
              />
            </div>
          </div>

          {/* Bottom Left: Vitals Monitors */}
          <div className="absolute bottom-10 left-10 pointer-events-none z-10 hidden sm:flex flex-col gap-6">
             <div className="w-64">
               <HeartRateMonitor bpm={bpm} />
             </div>
          </div>

          {/* Bottom Right: Konzentration & Session Controls */}
          <div className="absolute bottom-10 right-10 flex flex-col items-end gap-6 pointer-events-auto z-10">
            <ConcentrationMetric workload={sessionData.length > 0 ? sessionData[sessionData.length - 1].workload : 0} />
          </div>

          {/* Center: N-Back Test Component */}
          <div className="absolute inset-0 flex items-center justify-center z-0 pt-10">
             <div className="w-full max-w-xl pointer-events-auto flex flex-col items-center">
                <NBackTest 
                  n={currentNBackLevel}
                  isActive={!isSessionPaused}
                  onScoreUpdate={(score) => {
                    nBackStatsRef.current = score;
                  }}
                />
                <div className="mt-8 flex items-center gap-4">
                  <button
                    onClick={() => {
                      if (isSessionPaused) {
                        setIsSessionPaused(false);
                        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
                          mediaRecorderRef.current.resume();
                        }
                      } else {
                        setIsSessionPaused(true);
                        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                          mediaRecorderRef.current.pause();
                        }
                      }
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 shadow-xl hover:bg-yellow-950/30 text-slate-400 hover:text-yellow-400 rounded-full font-medium transition-all border border-slate-800 hover:border-yellow-900/50 cursor-pointer text-sm"
                  >
                    {isSessionPaused ? (
                      <>
                        <Play className="w-4 h-4" />
                        Resume Session
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4" />
                        Pause Session
                      </>
                    )}
                  </button>
                  <button
                    onClick={endSession}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 shadow-xl hover:bg-red-950/30 text-slate-400 hover:text-red-400 rounded-full font-medium transition-all border border-slate-800 hover:border-red-900/50 cursor-pointer text-sm"
                  >
                    <Square className="w-4 h-4" />
                    End Session
                  </button>
                </div>
             </div>
          </div>
        </main>
      )}

      {/* VIEW: SAVING */}
      {viewState === "SAVING" && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-2xl mx-auto w-full text-center">
          <Activity className="w-16 h-16 text-slate-500 mb-8 animate-pulse" />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Finalizing Session</h1>
          <p className="text-slate-400 text-lg mb-12">
            Encoding surgical feed and biological timeline...
          </p>
          <div className="w-64 bg-slate-900 rounded-full h-2 mb-4 overflow-hidden relative">
            <div className="absolute top-0 left-0 bg-primary h-2 w-1/3 rounded-full animate-[ping_1.5s_ease-in-out_infinite]"></div>
          </div>
        </main>
      )}

      {/* VIEW: REVIEW */}
      {viewState === "REVIEW" && (
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
          {renderMinimalHeader(currentReviewSession ? `Session ${new Date(currentReviewSession.timestamp).toLocaleDateString()}` : "Session")}

          {/* Session Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
              <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Average Time on Task</div>
              <div className="text-3xl font-semibold text-white">{formatSeconds(reviewKpis.avgTimeOnTaskSecs)}</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
              <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Detected Stress Events</div>
              <div className="text-3xl font-semibold text-white">{reviewKpis.stressEventsCount}</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
              <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Error Rate</div>
              <div className="text-3xl font-semibold text-white">{reviewKpis.errorRate.toFixed(1)}%</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
              <div className="text-slate-500 text-sm uppercase tracking-wider mb-2">Average Heart Rate</div>
              <div className="text-3xl font-semibold text-white">{reviewKpis.averageHeartRate > 0 ? `${reviewKpis.averageHeartRate.toFixed(0)} BPM` : "--"}</div>
            </div>
          </div>

          {/* Delta RMSSD Timeline */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-8 mb-4 order-3 relative overflow-hidden flex-1 w-full">
            <div className="absolute top-0 w-full h-1 bg-linear-to-r from-transparent via-primary to-transparent opacity-20 -mx-8"></div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Delta RMSSD Timeline</h3>
                <p className="text-sm text-slate-400 mt-1">
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
                      if (reviewVideoRef.current) {
                        reviewVideoRef.current.currentTime = clickedTime;
                      }
                    }}
                  >
                    <XAxis
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      dataKey="timeOffset"
                      stroke="#475569"
                      tickFormatter={(value) => formatSeconds(value as number)}
                      minTickGap={30}
                    />
                    <YAxis
                      stroke="#475569"
                      tickFormatter={(value) => `${(value as number).toFixed(0)} ms`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                      formatter={(value) => [`${Number(value ?? 0).toFixed(1)} ms`, "Delta RMSSD"]}
                      labelFormatter={(label) => `Time ${formatSeconds(Number(label ?? 0))}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="deltaRmssd"
                      stroke="#3B98B4"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: "#3B98B4" }}
                    />
                    <ReferenceLine
                      x={videoTime}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      ifOverflow="extendDomain"
                      label={{ value: formatSeconds(videoTime), position: "top", fill: "#ef4444", fontSize: 12, fontWeight: 500 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">No RMSSD timeline data available.</div>
              )}
            </div>
          </div>

          {/* Cognitive Effort Timeline */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-8 mb-4 order-2 relative overflow-hidden flex-1 w-full">
            <div className="absolute top-0 w-full h-1 bg-linear-to-r from-transparent via-purple-500 to-transparent opacity-20 -mx-8"></div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Cognitive Effort Timeline</h3>
                <p className="text-sm text-slate-400 mt-1">
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
                      if (reviewVideoRef.current) {
                        reviewVideoRef.current.currentTime = clickedTime;
                      }
                    }}
                  >
                    <XAxis
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      dataKey="timeOffset"
                      stroke="#475569"
                      tickFormatter={(value) => formatSeconds(value as number)}
                      minTickGap={30}
                    />
                    <YAxis
                      stroke="#475569"
                      tickFormatter={(value) => `${(value as number).toFixed(0)}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                      formatter={(value) => [`${Number(value ?? 0).toFixed(1)}`, "Cognitive Effort"]}
                      labelFormatter={(label) => `Time ${formatSeconds(Number(label ?? 0))}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="cognitiveEffort"
                      stroke="#a855f7"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: "#a855f7" }}
                    />
                    <ReferenceLine
                      x={videoTime}
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      ifOverflow="extendDomain"
                      label={{ value: formatSeconds(videoTime), position: "top", fill: "#ef4444", fontSize: 12, fontWeight: 500 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">No cognitive effort data available.</div>
              )}
            </div>
          </div>

          {/* Pupil Size Timeline */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-8 mb-4 order-4 relative overflow-hidden flex-1 w-full">
            <div className="absolute top-0 w-full h-1 bg-linear-to-r from-transparent via-emerald-500 to-transparent opacity-20 -mx-8"></div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">Percentage Change in Pupil Size</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Pupil dilation variance across the session.
                </p>
              </div>
            </div>
            <div className="h-64 w-full">
              <div className="h-full flex items-center justify-center text-slate-500">No pupil size data available yet.</div>
            </div>
          </div>

          {/* Screen Daten / Workload Sync */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 sm:p-8 mb-10 order-1 relative group flex-1 w-full">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-slate-200">Screen Data</h3>
              <p className="text-sm text-slate-400 mt-1">
                Video playback matched with session timing.
              </p>
            </div>

            <div ref={reviewVideoContainerRef} className="w-full flex-1 aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 relative flex items-center justify-center cursor-pointer" onClick={toggleVideoPlayback}>

              {/* Real Recorded Video */}
              {recordedVideoUrl ? (
                <video
                  ref={reviewVideoRef}
                  src={recordedVideoUrl}
                  autoPlay
                  className="w-full h-full object-contain"
                  playsInline
                  onTimeUpdate={(e) => setVideoTime((e.target as HTMLVideoElement).currentTime)}
                  onLoadedMetadata={(e) => setVideoDuration((e.target as HTMLVideoElement).duration)}
                  onPlay={() => setIsVideoPlaying(true)}
                  onPause={() => setIsVideoPlaying(false)}
                  onRateChange={(e) => setVideoPlaybackRate((e.target as HTMLVideoElement).playbackRate)}
                  onVolumeChange={(e) => setIsVideoMuted((e.target as HTMLVideoElement).muted)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-700 w-full h-full bg-slate-900/30">
                  <Activity className="w-24 h-24 mb-6 opacity-30" />
                  <span className="text-xl uppercase tracking-widest font-medium opacity-40">No Video Available</span>
                </div>
              )}

              {/* Video Player Controls & Timeline Overlay */}
              <div
                className={`absolute bottom-0 left-0 w-full bg-linear-to-t from-[#000000_90%] via-[#00000080_95%] to-transparent pt-16 px-4 sm:px-6 pb-3 sm:pb-4 transition-all duration-300 ease-in-out flex flex-col justify-end ${
                  isVideoPlaying ? "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0" : "opacity-100 translate-y-0"
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4 max-w-6xl mx-auto w-full text-slate-200" onClick={(e) => e.stopPropagation()}>
                  
                  {/* Left Controls */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    {hasReviewVideo && (
                      <button onClick={toggleVideoPlayback} className="hover:text-white transition-colors cursor-pointer p-1.5 sm:p-2 rounded-full hover:bg-white/10" type="button" aria-label={isVideoPlaying ? "Pause video" : "Play video"}>
                        {isVideoPlaying ? (
                          <Pause className="w-5 h-5 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current" />
                        )}
                      </button>
                    )}
                    <button onClick={rewindVideo} disabled={!hasReviewVideo} className="hover:text-white transition-colors cursor-pointer p-1.5 sm:p-2 rounded-full hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" type="button" aria-label="Rewind 10 seconds">
                      <RotateCcw className="w-4 h-4 sm:w-4 sm:h-4" />
                    </button>
                  </div>

                  {/* Scrubber Area */}
                  <div className="flex-1 flex items-center gap-3 sm:gap-4">
                    <span className="text-xs sm:text-sm font-mono tracking-tight text-slate-100 min-w-10 text-right">
                      {Math.floor(videoTime / 60).toString()}:{(Math.floor(videoTime) % 60).toString().padStart(2, '0')}
                    </span>

                    <div
                      className="flex-1 relative h-10 cursor-pointer group/scrub"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVideoScrub(e);
                      }}
                    >
                      {/* Background Bar */}
                      <div className="absolute left-0 right-0 bottom-1/2 translate-y-0.75 h-2 bg-slate-700/60 rounded-full overflow-hidden transition-all duration-300 ease-out group-hover/scrub:h-12 group-hover/scrub:rounded-xl shadow-sm">
                        {(() => {
                          if (sessionData.length === 0) return null;
                          const duration = sessionData[sessionData.length - 1].timeOffset;
                          const baselineReference =
                            baselineRmssd && baselineRmssd > 0
                              ? baselineRmssd
                              : currentReviewSession?.reviewStats?.avgRmssd || sessionData[0]?.rmssd || 0;

                          if (duration <= 0 || baselineReference <= 0) return null;

                          let minVal = Infinity;
                          let maxVal = -Infinity;
                          sessionData.forEach((d) => {
                            const cognitiveEffort = -(d.rmssd - baselineReference);
                            if (cognitiveEffort < minVal) minVal = cognitiveEffort;
                            if (cognitiveEffort > maxVal) maxVal = cognitiveEffort;
                          });

                          // Y-axis in SVG goes from 0 (top) to 100 (bottom).
                          // Higher cognitive effort -> closer to top (Y=0).
                          const getSvgY = (cognitiveEffort: number) => {
                            if (maxVal === minVal) return 50;
                            // normalize so that higher effort gives smaller Y
                            const normalized = (maxVal - cognitiveEffort) / (maxVal - minVal);
                            return Math.max(0, Math.min(100, normalized * 90)); // The larger cognitive effort, the smaller Y (closer to top)
                          };

                          let pathD = ""; // Start path
                          
                          // Compute stress event tags
                          const stressBlocks: { left: number; width: number }[] = [];
                          let currentBlock: { startOffset: number } | null = null;
                          
                          sessionData.forEach((d, i) => {
                            const x = (d.timeOffset / duration) * 100;
                            const cognitiveEffort = -(d.rmssd - baselineReference);
                            const y = getSvgY(cognitiveEffort);
                            
                            if (i === 0) {
                              pathD += `M 0 ${y}\nL ${x} ${y}\n`;
                            } else {
                              pathD += `L ${x} ${y}\n`;
                            }

                            // Capture blocks where RMSSD triggers a stress event
                            const deltaPercent = ((d.rmssd - baselineReference) / baselineReference) * 100;
                            if (deltaPercent < -30) {
                              if (currentBlock === null) currentBlock = { startOffset: d.timeOffset };
                            } else {
                              if (currentBlock !== null) {
                                stressBlocks.push({
                                  left: (currentBlock.startOffset / duration) * 100,
                                  width: ((d.timeOffset - currentBlock.startOffset) / duration) * 100
                                });
                                currentBlock = null;
                              }
                            }
                          });

                          if (currentBlock !== null) {
                            const cb = currentBlock as { startOffset: number };
                            const lastOffset = sessionData[sessionData.length - 1].timeOffset;
                            stressBlocks.push({
                              left: (cb.startOffset / duration) * 100,
                              width: ((lastOffset - cb.startOffset) / duration) * 100
                            });
                          }

                          const lastCognitiveEffort = -(sessionData[sessionData.length - 1].rmssd - baselineReference);
                          pathD += `L 100 ${getSvgY(lastCognitiveEffort)}\n`; // extend to end

                          const areaPathD = `${pathD} L 100 100 L 0 100 Z`;

                          // Smooth Line Chart with softly glowing Area-Fill and Scale-Y transition
                          return (
                            <>
                              {/* Stress Event Tags (visible only when collapsed) */}
                              {stressBlocks.map((block, i) => (
                                <div
                                  key={`tag-${i}`}
                                  className="absolute top-1/2 -translate-y-1/2 h-[50%] bg-[#b63a4a] rounded-[1px] transition-all duration-300 opacity-60 group-hover/scrub:opacity-0"
                                  style={{
                                    left: `${block.left}%`,
                                    width: `${Math.max(0.4, block.width)}%`,
                                    minWidth: "2px"
                                  }}
                                />
                              ))}

                              <svg 
                                width="100%" 
                                height="100%" 
                                viewBox="0 0 100 100" 
                                preserveAspectRatio="none"
                                className="absolute inset-0 opacity-0 scale-y-75 origin-bottom transition-all duration-300 ease-out group-hover/scrub:opacity-100 group-hover/scrub:scale-y-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                              >
                                <defs>
                                  <linearGradient id="stressLineGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a855f7" />
                                    <stop offset="50%" stopColor="#c084fc" />
                                    <stop offset="100%" stopColor="#e9d5ff" />
                                  </linearGradient>
                                  <linearGradient id="stressAreaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.4" />
                                    <stop offset="50%" stopColor="#c084fc" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="#e9d5ff" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <path 
                                  d={areaPathD} 
                                  fill="url(#stressAreaGradient)" 
                                  stroke="none" 
                                />
                                <path 
                                  d={pathD} 
                                  fill="none" 
                                  stroke="url(#stressLineGradient)" 
                                  strokeWidth="2.5"
                                  vectorEffect="non-scaling-stroke"
                                  strokeLinejoin="round"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </>
                          );
                        })()}
                      </div>

                      {/* Scrubber Playhead Line */}
                      <div
                        className="absolute bottom-1/2 translate-y-0.75 transition-all duration-300 ease-out h-1.5 group-hover/scrub:h-10 z-10 pointer-events-none opacity-0 group-hover/scrub:opacity-100"
                        style={{
                          left: `${videoDuration > 0 ? (videoTime / videoDuration) * 100 : 0}%`,
                        }}
                      >
                         <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 sm:w-1.5 h-full bg-white rounded-full shadow-[0_0_12px_rgba(255,255,255,0.9)]"></div>
                      </div>
                    </div>

                    <span className="text-xs sm:text-sm font-mono tracking-tight text-slate-400 min-w-10 text-left">
                      {videoDuration > 0 ? `${Math.floor(videoDuration / 60).toString()}:${(Math.floor(videoDuration) % 60).toString().padStart(2, '0')}` : "0:00"}
                    </span>
                  </div>

                  {/* Right Controls */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button onClick={toggleVideoMute} disabled={!hasReviewVideo} className="hover:text-white transition-colors cursor-pointer p-1.5 sm:p-2 rounded-full hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" type="button" aria-label={isVideoMuted ? "Unmute video" : "Mute video"}>
                      {isVideoMuted ? (
                        <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                    <button onClick={cycleVideoSpeed} disabled={!hasReviewVideo} className="hover:text-white transition-colors cursor-pointer p-1.5 sm:p-2 rounded-full hover:bg-white/10 hidden sm:flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" type="button" aria-label="Change playback speed">
                      <Settings className="w-4 h-4 sm:w-4 sm:h-4" />
                      <span className="text-[11px] font-semibold text-slate-300 min-w-5 text-left">{videoPlaybackRate.toFixed(2).replace(/\.00$/, "")}x</span>
                    </button>
                    <button onClick={toggleVideoFullscreen} disabled={!hasReviewVideo} className="hover:text-white transition-colors cursor-pointer p-1.5 sm:p-2 rounded-full hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" type="button" aria-label="Toggle fullscreen">
                      <Maximize className="w-4 h-4 sm:w-4 sm:h-4" />
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </main>
      )}
      </div>
    </div>
  );
}
