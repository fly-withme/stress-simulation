"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Wifi, WifiOff, Play, Square, Activity, LogOut, User, RefreshCw, Pause, Brain, Pencil, Check, X, Eye, Video, Heart, Timer, Shield, TrendingDown, Zap, Target, Leaf, ArrowRight } from "lucide-react";
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
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
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
    errorRate?: number;
  };
}

interface SessionDataPoint {
  timeOffset: number; // Seconds since session started
  bpm: number;
  rmssd: number;
  workload: number;
  pupilSize?: number;
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
  const [cameraStreamActive, setCameraStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Session State
  const [sessionData, setSessionData] = useState<SessionDataPoint[]>([]);

  // Review timeline cursor
  const [videoTime, setVideoTime] = useState(0);
  const [isVideoPaused, setIsVideoPaused] = useState(true);
  const [isSessionPaused, setIsSessionPaused] = useState(false);
  const [liveMode, setLiveMode] = useState<"biofeedback" | "camera" | "minimal">("biofeedback");
  const [showStressLine, setShowStressLine] = useState(true);
  const [showCogLoadLine, setShowCogLoadLine] = useState(true);

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
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const reviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastSampleTimeRef = useRef<number>(0);

  // Sync external videoTime changes (like clicking on the chart) to the video player
  useEffect(() => {
    if (reviewVideoRef.current && viewState === "REVIEW") {
      if (Math.abs(reviewVideoRef.current.currentTime - videoTime) > 0.5) {
        reviewVideoRef.current.currentTime = videoTime;
      }
    }
  }, [videoTime, viewState]);

  const attachCameraVideoRef = (el: HTMLVideoElement | null) => {
    cameraVideoRef.current = el;
    if (!el || !cameraStreamRef.current) return;
    el.srcObject = cameraStreamRef.current;
    el.play().catch(() => {
      // Autoplay may fail silently until user interaction.
    });
  };

  const canStartLiveFlow = bleState === "connected" || isDevMode;
  const isHrvSignalActive = bpm !== null && bpm > 0;
  const hrvSensorReady = wsConnected && bleState === "connected" && isHrvSignalActive;
  const pupilDilationSensorReady = eyeTrackerConnected && eyeTrackerCalibrated;
  const cameraSensorReady = boxCameraFeedActive || cameraStreamActive;
  const allCalibrationSensorsReady = hrvSensorReady && pupilDilationSensorReady && cameraSensorReady;

  // Browser camera stream for USB/webcam integration in live camera views.
  useEffect(() => {
    const shouldUseCamera = (viewState === "LIVE" && (liveMode === "camera" || liveMode === "minimal")) || viewState === "CALIBRATION_PENDING";

    const stopCameraStream = () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }
      setCameraStreamActive(false);
    };

    if (!shouldUseCamera) {
      stopCameraStream();
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera API not available in this browser");
      setCameraStreamActive(false);
      return;
    }

    let cancelled = false;

    const bindStreamToVideo = (stream: MediaStream) => {
      const videoEl = cameraVideoRef.current;
      if (!videoEl) return;
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {
        // Autoplay may fail silently until user interaction.
      });
    };

    const startCameraStream = async () => {
      try {
        if (cameraStreamRef.current) {
          bindStreamToVideo(cameraStreamRef.current);
          setCameraStreamActive(true);
          setCameraError(null);
          return;
        }

        const bootstrapStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        const pickPreferredCameraId = async () => {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === "videoinput");
          if (videoDevices.length === 0) return null;

          const scored = videoDevices.map(device => {
            const label = device.label.toLowerCase();
            let score = 0;

            if (/(usb|capture|cam link|elgato|hdmi|uvc|webcam)/.test(label)) score += 5;
            if (/(facetime|integrated|built-in|builtin|internal|laptop|isight)/.test(label)) score -= 5;

            return { id: device.deviceId, label: device.label || "Unknown camera", score };
          }).sort((a, b) => b.score - a.score);

          const preferred = scored.find(d => d.score > 0) ?? scored[0];
          console.log("[Camera] Preferred device:", preferred.label);
          return preferred.id;
        };

        let stream: MediaStream = bootstrapStream;
        const preferredCameraId = await pickPreferredCameraId();

        if (preferredCameraId) {
          try {
            const preferredStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: preferredCameraId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
            bootstrapStream.getTracks().forEach(track => track.stop());
            stream = preferredStream;
          } catch (selectionErr) {
            console.warn("[Camera] Falling back to default stream:", selectionErr);
          }
        }

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        cameraStreamRef.current = stream;
        bindStreamToVideo(stream);
        setCameraStreamActive(true);
        setCameraError(null);
      } catch (err) {
        console.error("Failed to access USB camera", err);
        setCameraStreamActive(false);
        setCameraError("Camera permission denied or camera not available");
      }
    };

    startCameraStream();

    return () => {
      cancelled = true;
    };
  }, [viewState, liveMode]);

  useEffect(() => {
    if (!cameraStreamRef.current || !cameraVideoRef.current) return;
    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    cameraVideoRef.current.play().catch(() => {
      // Autoplay may fail silently until user interaction.
    });
  }, [viewState, liveMode, cameraStreamActive]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

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
          
          const allData = calibrationDataRef.current;
          if (allData.length > 0) {
            const avg = allData.reduce((acc, val) => acc + val, 0) / allData.length;
            setBaselineRmssd(avg);
            setSavedBaselineRmssd(avg);
            
            const emailKey = `calibration_baseline_${userId || 'anonymous'}`;
            localStorage.setItem(emailKey, avg.toString());
            setCalibrationCompleted(true);
          } else {
            // No valid data was collected (e.g. sensor disconnected)
            alert("Kalibrierung fehlgeschlagen: Kein Sensorsignal empfangen. Bitte Sensor überprüfen und neu starten.");
            setCalibrationElapsed(0);
            calibrationDataRef.current = [];
            setCalibrationData([]);
            setCalibrationCompleted(false);
          }

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
            const newPupilSize = typeof parsedData.pupilSize === 'number' ? parsedData.pupilSize : null;
            
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
              calibrationDataRef.current.push(newRmssd);
            }

            // Handle Live Session Logging
            if (currentState === "LIVE" && !isSessionPausedRef.current && newRmssd !== null && newBpm !== null && baselineRef.current !== null) {
              // Only push 1 sample per second to avoid sessionData ballooning to massive sizes
              if (now - lastSampleTimeRef.current >= 1000) {
                lastSampleTimeRef.current = now;
                const baseline = baselineRef.current;
                // Workload uses dynamic delta: ((current - baseline) / baseline) * 100
                const workload = ((newRmssd - baseline) / baseline) * 100;
                
                setSessionData((prev) => {
                  const timeOffset = prev.length > 0 ? prev[prev.length - 1].timeOffset + 1 : 0;
                  const validBpm = newBpm > 0 ? newBpm : (prev.length > 0 ? prev[prev.length - 1].bpm : 0);
                  return [
                    ...prev,
                    { timeOffset, bpm: validBpm, rmssd: newRmssd, workload, pupilSize: newPupilSize ?? undefined }
                  ];
                });
              }
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
    calibrationDataRef.current = [];
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
    lastSampleTimeRef.current = 0;
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
      formData.append('baselineRmssd', baselineRmssd !== null ? baselineRmssd.toString() : '');
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
        errorRate: (sessionData.filter(d => d.workload < -30).length / Math.max(1, sessionData.length)) * 100,
        avgCognitiveEffort: sessionData.reduce((acc, d) => acc + (d.pupilSize || 0), 0) / Math.max(1, sessionData.length),
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
      workloadColor = "text-slate-600";
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
        const isHrvStress = deltaPercent < -30;
        const isGoodCognitiveLoad = d.pupilSize === undefined || d.pupilSize < 3.5;
        const isStress = isHrvStress && isGoodCognitiveLoad;

        if (isStress) {
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
    const errorRate = totalSamples - calmSamples;

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

  const timelineGradient = useMemo(() => {
    if (sessionData.length < 2 || reviewStats.duration === 0) return 'none';
    
    const baselineReference = baselineRmssd && baselineRmssd > 0 
      ? baselineRmssd 
      : (currentReviewSession?.reviewStats?.avgRmssd || sessionData[0]?.rmssd || 0);

    if (!baselineReference) return 'none';

    const gradientStops: string[] = [];
    let inStress = false;
    
    gradientStops.push(`#f1f5f9 0%`);

    sessionData.forEach((d, i) => {
      const deltaPercent = ((d.rmssd - baselineReference) / baselineReference) * 100;
      const isHrvStress = deltaPercent < -30;
      const isGoodCognitiveLoad = d.pupilSize === undefined || d.pupilSize < 3.5;
      const currentIsStress = isHrvStress && isGoodCognitiveLoad;
      
      const percentPos = (d.timeOffset / reviewStats.duration) * 100;
      
      if (currentIsStress !== inStress) {
        const color = currentIsStress ? 'rgba(239, 68, 68, 0.4)' : '#f1f5f9';
        const prevColor = inStress ? 'rgba(239, 68, 68, 0.4)' : '#f1f5f9';
        
        gradientStops.push(`${prevColor} ${percentPos}%`);
        gradientStops.push(`${color} ${percentPos}%`);
        
        inStress = currentIsStress;
      }
    });
    
    const finalColor = inStress ? 'rgba(239, 68, 68, 0.4)' : '#f1f5f9';
    gradientStops.push(`${finalColor} 100%`);
    
    return `linear-gradient(to right, ${gradientStops.join(', ')})`;
  }, [sessionData, reviewStats.duration, baselineRmssd, currentReviewSession]);

  const deltaRmssdTimeline = useMemo(() => {
    if (sessionData.length === 0) return [];

    const baselineReference =
      baselineRmssd && baselineRmssd > 0
        ? baselineRmssd
        : currentReviewSession?.reviewStats?.avgRmssd || sessionData[0]?.rmssd || 0;

    // Apply moving average to smooth the line (window size of 5)
    const smoothedData = sessionData.map((point, index, arr) => {
      const start = Math.max(0, index - 2);
      const end = Math.min(arr.length - 1, index + 2);
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += arr[i].rmssd;
      }
      return { ...point, smoothedRmssd: sum / (end - start + 1) };
    });

    return smoothedData.map((point) => {
      const deltaRmssd = point.smoothedRmssd - baselineReference;
      const deltaRmssdPercent = baselineReference > 0 ? (deltaRmssd / baselineReference) * 100 : 0;
      
      const hrvDelta = deltaRmssdPercent;
      const stressPct = Math.round(Math.max(0, Math.min(100, hrvDelta < 0 ? (Math.abs(hrvDelta) / 30) * 100 : 0)));
      
      let cogLoadPct = 0;
      if (point.pupilSize !== undefined && point.pupilSize > 0) {
        cogLoadPct = Math.round(Math.max(0, Math.min(100, ((point.pupilSize - 2.5) / 2.5) * 100)));
      } else {
        const x = -hrvDelta;
        let kp = 0;
        if (x <= -10) kp = 0;
        else if (x <= 15) kp = Math.max(0, ((x + 10) / 25) * 33);
        else if (x <= 30) kp = 33 + ((x - 15) / 15) * 33;
        else kp = 66 + ((x - 30) / 15) * 34;
        cogLoadPct = Math.round(Math.max(0, Math.min(100, kp)));
      }

      return {
        ...point,
        deltaRmssd,
        deltaRmssdPercent,
        cognitiveEffort: -deltaRmssd,
        stressPct,
        cogLoadPct
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
  
  const dashboardStats = useMemo(() => {
    if (!pastSessions || pastSessions.length === 0) return { avgStressEvents: 0, avgErrorRate: 0, avgCognitiveLoad: 0 };
    
    const totalSessions = pastSessions.length;
    const sumStressEvents = pastSessions.reduce((acc, s) => acc + (s.reviewStats.stressEventsCount || 0), 0);
    const sumErrorRate = pastSessions.reduce((acc, s) => acc + (s.reviewStats.errorRate || 0), 0);
    const sumCognitiveLoad = pastSessions.reduce((acc, s) => {
      const avgLoad = s.reviewStats.avgCognitiveEffort ?? Math.max(0, Math.abs(s.reviewStats.avg));
      return acc + (avgLoad > 100 ? 50 : avgLoad);
    }, 0);
    
    return {
      avgStressEvents: sumStressEvents / totalSessions,
      avgErrorRate: sumErrorRate / totalSessions,
      avgCognitiveLoad: sumCognitiveLoad / totalSessions
    };
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

  const renderHardwareIcons = () => (
    <div className="flex items-center gap-3 mr-2">
      <div className={`flex items-center justify-center w-11 h-11 rounded-2xl border-2 transition-colors ${cameraSensorReady ? 'border-[#001864] text-[#001864] bg-[#001864]/5 shadow-sm' : 'border-slate-200 text-slate-400 bg-white'}`} title={cameraSensorReady ? "Camera Connected" : "Camera Offline"}>
        <Video className="w-5 h-5" />
      </div>
      <div className={`flex items-center justify-center w-11 h-11 rounded-2xl border-2 transition-colors ${hrvSensorReady ? 'border-[#001864] text-[#001864] bg-[#001864]/5 shadow-sm' : 'border-slate-200 text-slate-400 bg-white'}`} title={hrvSensorReady ? "HRV Sensor Connected" : "HRV Sensor Offline"}>
        <Heart className="w-5 h-5" />
      </div>
      <div className={`flex items-center justify-center w-11 h-11 rounded-2xl border-2 transition-colors ${pupilDilationSensorReady ? 'border-[#001864] text-[#001864] bg-[#001864]/5 shadow-sm' : 'border-slate-200 text-slate-400 bg-white'}`} title={pupilDilationSensorReady ? "Eye Tracker Connected" : "Eye Tracker Offline"}>
        <Eye className="w-5 h-5" />
      </div>
    </div>
  );

  const renderMinimalHeader = (title: string) => (
    <div className="mb-8 md:mb-10 border-b border-slate-200/80">
      <div className="h-(--header-height) min-h-(--header-height) flex flex-col gap-4 md:flex-row md:items-center md:justify-between justify-center pb-4 pt-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-800">{title}</h1>
        <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-3 flex-wrap">
          {renderHardwareIcons()}
          <button
            onClick={startNewSessionFromDashboard}
            disabled={!canStartLiveFlow}
            className="flex items-center justify-center w-14 h-14 bg-[#001864] hover:bg-[#001864]/90 disabled:bg-slate-200 text-white rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer disabled:cursor-not-allowed group"
            title="Start New Session"
          >
            <Play className="w-6 h-6 fill-current ml-1 group-disabled:text-white" />
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
        <div className="h-(--header-height) min-h-(--header-height) flex flex-col gap-4 md:flex-row md:items-center md:justify-between justify-center pb-4 pt-2">
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
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-800 truncate">{title}</h1>
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

          <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-3 flex-wrap">
            {renderHardwareIcons()}
            <button
              onClick={startNewSessionFromDashboard}
              disabled={!canStartLiveFlow}
              className="flex items-center justify-center w-14 h-14 bg-[#001864] hover:bg-[#001864]/90 disabled:bg-slate-200 text-white rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer disabled:cursor-not-allowed group"
              title="Start New Session"
            >
              <Play className="w-6 h-6 fill-current ml-1 group-disabled:text-white" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const showSidebar = ["OVERVIEW", "HISTORY", "SETTINGS", "REVIEW"].includes(viewState);

  return (
    <div className="h-screen text-primary font-sans flex relative overflow-hidden bg-slate-50">
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
      <div className="flex-1 flex flex-col relative w-full overflow-hidden">
      {/* VIEW: LOGIN */}
      {viewState === "LOGIN" && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-md mx-auto w-full text-center overflow-y-auto">
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
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full overflow-y-auto">
          {renderMinimalHeader("Dashboard")}

          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <section className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 flex flex-col">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-xl font-semibold text-primary">Your progress</h2>
                    <p className="text-slate-600 text-sm mt-1">Track your actual progress against your estimate progress.</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Sessions</p>
                    <p className="text-2xl font-semibold text-primary">{pastSessions.length}</p>
                  </div>
                </div>
                <div className="h-56 w-full">
                  {learningCurveData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={learningCurveData} margin={{ top: 8, right: 30, left: 30, bottom: 0 }}>
                        <XAxis
                          dataKey="timestamp"
                          stroke="#5f6f94"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(val) => new Date(val).toLocaleDateString()}
                          minTickGap={26}
                        />
                        <YAxis stroke="#5f6f94" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#f8fbff', borderColor: '#c9def7', borderRadius: '10px', color: '#001864' }}
                          labelStyle={{ color: '#001864' }}
                          labelFormatter={(val) => new Date(val as number).toLocaleString()}
                        />
                        <Line
                          type="monotone"
                          dataKey="expectedWorkload"
                          name="Estimate Progress"
                          stroke="#7f9ecf"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="reviewStats.avg"
                          name="Actual Progress"
                          stroke="#001864"
                          strokeWidth={2.8}
                          dot={false}
                          activeDot={{ r: 5, fill: "#001864", stroke: "#c9def7", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-600">No sessions yet to track your progress.</div>
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

            {/* New Dashboard Metrics Row with Donut Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: "Avg Stress Events", value: dashboardStats.avgStressEvents, color: "#001864", unit: "", max: 20, sublabel: "Critical Spikes" },
                { label: "Avg Error Rate", value: dashboardStats.avgErrorRate, color: "#ef4444", unit: "%", max: 100, sublabel: "Workload Drops" },
                { label: "Avg Cognitive Load", value: dashboardStats.avgCognitiveLoad, color: "#f59e0b", unit: "%", max: 100, sublabel: "Processing Effort" }
              ].map((metric, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center relative shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-32 h-32 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[{ value: metric.value }, { value: Math.max(0, metric.max - metric.value) }]}
                          cx="50%" cy="50%" innerRadius={42} outerRadius={58} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}
                        >
                          <Cell key="cell-0" fill={metric.color} stroke="none" />
                          <Cell key="cell-1" fill={`${metric.color}15`} stroke="none" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-primary">{metric.value.toFixed(1)}{metric.unit}</span>
                    </div>
                  </div>
                  <div className="mt-4 text-center">
                    <p className="text-primary font-semibold text-sm">{metric.label}</p>
                    <p className="text-slate-500 text-[11px] uppercase tracking-wider mt-0.5">{metric.sublabel}</p>
                  </div>
                </div>
              ))}
            </div>



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
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full overflow-y-auto">
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
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full overflow-y-auto">
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
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Hardware Sensors</h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-4">
                    <Activity className={`w-6 h-6 ${wsConnected && bleState === "connected" ? "text-green-500" : "text-slate-600"}`} />
                    <div>
                      <div className="font-medium text-slate-800">HRV Sensor</div>
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
        <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto w-full overflow-y-auto">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-primary text-center">Device Check</h1>
          <p className="text-slate-500 text-sm sm:text-base mt-3 text-center max-w-2xl">
            Confirm all sensors are ready before starting baseline calibration.
          </p>

          <div className="w-full max-w-4xl mt-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 place-items-center">
              <div className={`w-full max-w-60 min-h-34 rounded-3xl border p-6 flex flex-col items-center justify-center text-center transition-all duration-300 ${cameraSensorReady ? "bg-primary text-white border-primary shadow-[0_10px_30px_rgba(0,24,100,0.18)]" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                <span className="text-lg font-semibold mb-2">Camera</span>
                {cameraSensorReady ? (
                  <span className="text-xs font-medium px-2.5 py-1 box-border bg-white/20 rounded-md">Connected: Laparoscope</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Waiting for device...</span>
                )}
              </div>
              <div className={`w-full max-w-60 min-h-34 rounded-3xl border p-6 flex flex-col items-center justify-center text-center transition-all duration-300 ${pupilDilationSensorReady ? "bg-primary text-white border-primary shadow-[0_10px_30px_rgba(0,24,100,0.18)]" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                <span className="text-lg font-semibold mb-2">Pupil Dilation</span>
                {pupilDilationSensorReady ? (
                  <span className="text-xs font-medium px-2.5 py-1 box-border bg-white/20 rounded-md">Connected: Eye Tracker</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Waiting for device...</span>
                )}
              </div>
              <div className={`w-full max-w-60 min-h-34 rounded-3xl border p-6 flex flex-col items-center justify-center text-center transition-all duration-300 ${hrvSensorReady ? "bg-primary text-white border-primary shadow-[0_10px_30px_rgba(0,24,100,0.18)]" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                <span className="text-lg font-semibold mb-2">HRV Sensor</span>
                {hrvSensorReady ? (
                  <span className="text-xs font-medium px-2.5 py-1 box-border bg-white/20 rounded-md">Connected: Serial ECG</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Waiting for device...</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 min-h-24">
            <button
              onClick={() => openCalibrationRunView(true)}
              className="px-10 py-3.5 rounded-full bg-primary hover:bg-primary-hover text-white font-semibold transition-colors cursor-pointer"
            >
              Continue to Calibration
            </button>
          </div>
        </main>
      )}

      {/* VIEW: CALIBRATION GOING */}
      {viewState === "CALIBRATION_ACTIVE" && (
        <main
          className="flex-1 w-full flex flex-col items-center justify-center relative overflow-hidden bg-slate-50"
        >
          {/* Skip Button */}
          <button
            onClick={() => beginLiveSession()}
            className="absolute top-8 right-8 z-50 p-3 rounded-full hover:bg-slate-200 text-slate-400 hover:text-primary transition-all cursor-pointer"
            title="Skip Calibration"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Top label */}
          <p className="relative z-10 text-primary text-xs tracking-[0.25em] uppercase font-semibold mb-14 select-none">
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
              className="text-primary text-2xl font-semibold tracking-widest transition-opacity duration-500"
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
                      background: active ? "#001864" : "rgba(0, 24, 100, 0.15)",
                      transform: active ? "scale(1.3)" : "scale(1)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Session progress text */}
          {calibrationCompleted ? (
            <div className="relative z-10 mt-6 flex flex-col items-center gap-2">
              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold uppercase tracking-wider rounded-lg border border-emerald-200 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Calibration Successful</span>
              <p className="text-slate-600 text-sm tracking-wider mt-2">
                Baseline RMSSD recorded: <span className="text-primary font-mono font-semibold text-lg ml-1">{baselineRmssd !== null ? baselineRmssd.toFixed(1) : "--"} ms</span>
              </p>
            </div>
          ) : (
            <p className="relative z-10 mt-6 text-slate-500 text-sm tabular-nums tracking-wider select-none">
              {isCalibrationRunning
                ? `${calibrationElapsed}s / ${CALIBRATION_DURATION_SEC}s`
                : "Press Start when ready"}
            </p>
          )}

          {/* Controls */}
          <div className="relative z-10 mt-10 flex items-center gap-4">
            {!isCalibrationRunning && !calibrationCompleted && (
              <button
                onClick={startCalibration}
                className="flex items-center gap-2.5 px-8 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer bg-primary hover:bg-primary-hover text-white shadow-md hover:shadow-lg"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}

            {calibrationCompleted && (
              <button
                onClick={() => beginLiveSession()}
                className="flex items-center gap-2.5 px-8 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-lg"
              >
                Continue to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {isCalibrationRunning && (
              <button
                onClick={resetCalibration}
                className="flex items-center gap-2.5 px-8 py-3 rounded-full font-semibold text-sm transition-all cursor-pointer border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Reset
              </button>
            )}
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
        const gaugeCirc = 2 * Math.PI * GAUGE_R;
        const gaugeColor = cogLoadPct >= 66 ? "#ef4444" : cogLoadPct >= 33 ? "#f59e0b" : "#10b981";
        const gaugeGlow = cogLoadPct >= 66
            ? "drop-shadow(0 0 8px rgba(239,68,68,0.4))"
            : cogLoadPct >= 33
            ? "drop-shadow(0 0 8px rgba(245,158,11,0.4))"
            : "drop-shadow(0 0 8px rgba(16,185,129,0.3))";
        const zoneLabel = cogLoadPct >= 66 ? "Overload Warning" : cogLoadPct >= 33 ? "High Effort" : "Optimal / Baseline";
        const cogDonutFilled = gaugeCirc * (cogLoadPct / 100);

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

        // Performance score (used in camera HUD)
        const perfScore = totalSamples > 0 ? Math.round(accuracyPct * 0.7 + Math.min(100, (60 / Math.max(1, sessionDurationSec / 3)) * 100) * 0.3) : 0;
        const perfTrafficColor = totalSamples > 0 ? (perfScore >= 70 ? "#10b981" : perfScore >= 40 ? "#f59e0b" : "#ef4444") : "#94a3b8";

        const isCameraMode = liveMode === "camera";
        const isMinimalMode = liveMode === "minimal";

        return (
          <main className="flex-1 w-full h-full relative overflow-hidden flex flex-col bg-soft-white">

            {/* ── TOP BAR ─────────────────────────────────────────── */}
            <div className="relative z-30 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200">
              {/* Left: live dot + session label + mode toggle */}
              <div className="flex items-center gap-3">
                <span className="live-dot" />
                <span className="text-slate-800 text-sm font-semibold tracking-widest uppercase select-none">Live Session</span>
                {hrvSensorReady && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">
                    HRV
                  </span>
                )}
                {isSessionPaused && (
                  <span className="ml-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase" style={{ background: "rgba(251,191,36,0.15)", color: "#d97706", border: "1px solid rgba(251,191,36,0.3)" }}>Paused</span>
                )}
                
                <div className="toggle-pill ml-4">
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
                  id="live-mode-minimal"
                  onClick={() => setLiveMode("minimal")}
                  title="Minimal camera focus view"
                  aria-label="Switch to minimal focus view"
                  className="w-9 h-9 rounded-full border transition-all flex items-center justify-center"
                  style={{
                    borderColor: liveMode === "minimal" ? "rgba(16,185,129,0.45)" : "rgba(148,163,184,0.35)",
                    background: liveMode === "minimal" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.7)",
                    color: liveMode === "minimal" ? "#059669" : "#64748b"
                  }}
                >
                  <Leaf className="w-4 h-4" />
                </button>
              </div>

              {/* Right: Session Control Center — unified Duration, Pause, End Session */}
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-full overflow-hidden shadow-sm">
                {/* Duration Section */}
                <div className="flex items-center gap-2 px-4 py-2 border-r border-slate-200/60">
                  <Timer className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                    {`${String(durMins).padStart(2, "0")}:${String(durSecs).padStart(2, "0")}`}
                  </span>
                </div>
                
                {/* Pause/Resume Button */}
                <button
                  onClick={() => setIsSessionPaused(p => !p)}
                  className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors border-r border-slate-200/60"
                >
                  {isSessionPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
                  {isSessionPaused ? "Resume" : "Pause"}
                </button>
                
                {/* End Session Button */}
                <button
                  onClick={endSession}
                  className="flex items-center gap-1.5 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:bg-red-50/50 transition-colors"
                >
                  <Square className="w-3 h-3 fill-current" />
                  End Session
                </button>
              </div>
            </div>

            {/* ── BIOFEEDBACK MODE — 3 × 2 Grid Blueprint ─────────── */}
            {/* ── BIOFEEDBACK MODE — Hero + KPI Row ─────────── */}
            {!isCameraMode && !isMinimalMode && (
              <div className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">
                
                {/* ZONE A: CORE STATE HERO (Top 60%) */}
                <div className="glass-card flex p-6 relative overflow-hidden shrink-0" style={{ height: "56%" }}>
                  {/* Gauges Column */}
                  <div className="flex flex-col w-[35%] min-w-70 border-r border-slate-200/40 pr-8 gap-4 min-h-0">
                    <p className="metric-label flex items-center justify-between shrink-0 mb-2">
                       Core State Synthesis <Brain className="w-4 h-4 text-slate-500" />
                    </p>
                    
                    <div className="flex-1 flex items-center justify-between px-2">
                       {/* Workload Gauge */}
                       <div className="flex flex-col items-center gap-4">
                         <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
                            <svg viewBox="0 0 180 180" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                              <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke="rgba(0,24,100,0.06)" strokeWidth="18" />
                              <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke={gaugeColor} strokeWidth="18"
                                strokeDasharray={`${cogDonutFilled} ${gaugeCirc - cogDonutFilled}`} strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center pt-2">
                               <div className="flex items-baseline">
                                 {sessionData.length > 1 ? (
                                    <span className="font-mono text-[3.25rem] font-extralight tracking-tight leading-none" style={{ color: gaugeColor }}>{cogLoadPct}</span>
                                 ) : (
                                    <span className="font-mono text-[3.25rem] font-extralight tracking-tight leading-none text-slate-300 animate-pulse">--</span>
                                 )}
                                 <span className="text-xl font-bold uppercase tracking-widest ml-1 leading-none" style={{ color: gaugeColor }}>%</span>
                               </div>
                            </div>
                         </div>
                         <div className="flex flex-col items-center text-center">
                           <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Cognitive Workload</span>
                           <span className="text-sm font-semibold mt-0.5" style={{ color: gaugeColor }}>{isCalibrated ? zoneLabel : "Baseline needed"}</span>
                         </div>
                       </div>

                       {/* Stress Gauge */}
                       <div className="flex flex-col items-center gap-4">
                         <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
                            <svg viewBox="0 0 180 180" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                              <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke="rgba(0,24,100,0.06)" strokeWidth="18" />
                              <circle cx="90" cy="90" r={GAUGE_R} fill="none" stroke={stressDonutColor} strokeWidth="18"
                                strokeDasharray={`${stressDonutFilled} ${gaugeCirc - stressDonutFilled}`} strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center pt-2">
                               <div className="flex items-baseline">
                                 {sessionData.length > 1 && hrvDelta !== null ? (
                                    <span className="font-mono text-[3.25rem] font-extralight tracking-tight leading-none" style={{ color: stressDonutColor }}>{stressPct}</span>
                                 ) : (
                                    <span className="font-mono text-[3.25rem] font-extralight tracking-tight leading-none text-slate-300 animate-pulse">--</span>
                                 )}
                                 <span className="text-xl font-bold uppercase tracking-widest ml-1 leading-none" style={{ color: stressDonutColor }}>%</span>
                               </div>
                            </div>
                         </div>
                         <div className="flex flex-col items-center text-center">
                           <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Physical Stress</span>
                           <span className="text-sm font-semibold mt-0.5" style={{ color: stressDonutColor }}>
                             {isCalibrated && hrvDelta !== null ? (stressPct >= 66 ? "High Stress Active" : stressPct >= 33 ? "Elevated Warning" : "Relaxed State") : "Baseline needed"}
                           </span>
                         </div>
                       </div>
                    </div>
                  </div>

                  {/* Chart Column */}
                  <div className="flex flex-col flex-1 pl-8 min-h-0 relative">
                     <div className="flex items-center justify-between shrink-0 mb-4">
                         <p className="metric-label flex items-center gap-2 m-0">
                           Synchronized State Timeline (Real-time)
                         </p>
                         <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-widest">
                            <span className="flex items-center gap-1.5" style={{ color: gaugeColor }}><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: gaugeColor }} />Workload</span>
                            <span className="flex items-center gap-1.5" style={{ color: stressDonutColor }}><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: stressDonutColor }} />Stress</span>
                         </div>
                     </div>
                     <div className="flex-1 w-full min-h-0 relative">
                       {sessionData.length > 1 ? (
                         <ResponsiveContainer width="100%" height="100%">
                           <LineChart data={deltaRmssdTimeline}>
                              <XAxis dataKey="timeOffset" hide />
                              <YAxis hide domain={[-500, 500]} yAxisId="workload" />
                              <YAxis hide domain={[-50, 50]} yAxisId="stress" />
                              <Line yAxisId="workload" type="monotone" dataKey="workload" stroke={gaugeColor} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                              <Line yAxisId="stress" type="monotone" dataKey="deltaRmssd" stroke={stressDonutColor} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                           </LineChart>
                         </ResponsiveContainer>
                       ) : (
                         <div className="absolute inset-0 flex items-center justify-center">
                           <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-slate-200 -translate-y-1/2 z-0" />
                           <ResponsiveContainer width="100%" height="100%" className="opacity-[0.08] animate-pulse relative z-10">
                              <LineChart data={[{v:20},{v:15},{v:30},{v:20},{v:25},{v:15},{v:35},{v:25}]}>
                                 <YAxis hide domain={[0,40]} />
                                 <Line type="basis" dataKey="v" stroke="#334155" strokeWidth={3} dot={false} isAnimationActive={false} />
                              </LineChart>
                           </ResponsiveContainer>
                         </div>
                       )}
                     </div>
                  </div>
                </div>

                {/* ZONE B: SUPPORTING KPIS (Bottom 40%) */}
                <div className="flex-1 grid grid-cols-4 gap-4 min-h-0">
                  {/* KPI 1: Pupil Dilation */}
                  <div className="glass-card p-4 flex flex-col relative overflow-hidden min-h-0 min-w-0">
                    <p className="metric-label flex items-center justify-between shrink-0 mb-3 opacity-90">
                      Pupil Dilation <Eye className="w-4 h-4" />
                    </p>
                    <div className="flex-1 flex flex-col lg:flex-row lg:items-center min-h-0 min-w-0">
                      <div className="flex items-baseline pr-3 lg:pr-4 mb-2 lg:mb-0 shrink-0">
                        {sessionData.length > 1 && (sessionData[sessionData.length - 1].pupilSize ?? 0) > 0 ? (
                           <span className="font-mono text-[3rem] 2xl:text-[3.5rem] font-extralight text-slate-600 tracking-tight leading-none">{(sessionData[sessionData.length - 1].pupilSize ?? 0).toFixed(1)}</span>
                        ) : (
                           <span className="font-mono text-[3rem] 2xl:text-[3.5rem] font-extralight text-slate-300 tracking-tight leading-none animate-pulse">--</span>
                        )}
                        <span className="text-slate-500 font-medium text-lg leading-none ml-1 relative">mm</span>
                      </div>
                      <div className="flex-1 w-full h-full relative lg:border-l lg:border-slate-200/60 lg:pl-3 min-w-0 flex items-center border-t lg:border-t-0 pt-2 lg:pt-0">
                        {sessionData.length > 1 && (sessionData[sessionData.length - 1].pupilSize ?? 0) > 0 ? (
                          <ResponsiveContainer width="100%" height="80%">
                            <LineChart data={sessionData.slice(-60)}>
                              <YAxis hide domain={["dataMin - 0.5", "dataMax + 0.5"]} />
                              <Line type="monotone" dataKey="pupilSize" stroke="#94a3b8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <>
                            <div className="absolute top-1/2 left-3 right-0 border-t border-dashed border-slate-200 -translate-y-1/2 z-0" />
                            <ResponsiveContainer width="100%" height="80%" className="opacity-15 animate-pulse relative z-10">
                              <LineChart data={[{v:2},{v:3},{v:2.5},{v:4},{v:3},{v:2.5},{v:3}]}>
                                <YAxis hide domain={[0,6]} />
                                <Line type="basis" dataKey="v" stroke="#94a3b8" strokeWidth={2} dot={false} isAnimationActive={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* KPI 2: HRV */}
                  <div className="glass-card p-4 flex flex-col relative overflow-hidden min-h-0 min-w-0">
                    <p className="metric-label flex items-center justify-between shrink-0 mb-3 opacity-90">
                      HRV (RMSSD) <Heart className="w-4 h-4" />
                    </p>
                    <div className="flex-1 flex flex-col lg:flex-row lg:items-center min-h-0 min-w-0">
                      <div className="flex items-baseline pr-3 lg:pr-4 mb-2 lg:mb-0 shrink-0">
                        {currentRmssd !== null ? (
                           <span className="font-mono text-[3rem] 2xl:text-[3.5rem] font-extralight text-[#001864] tracking-tight leading-none">{currentRmssd.toFixed(0)}</span>
                        ) : (
                           <span className="font-mono text-[3rem] 2xl:text-[3.5rem] font-extralight text-slate-300 tracking-tight leading-none animate-pulse">--</span>
                        )}
                        <span className="text-slate-500 font-medium text-lg leading-none ml-1 relative">ms</span>
                      </div>
                      <div className="flex-1 w-full h-full relative lg:border-l lg:border-slate-200/60 lg:pl-3 min-w-0 flex items-center border-t lg:border-t-0 pt-2 lg:pt-0">
                        {sessionData.length > 1 ? (
                          <ResponsiveContainer width="100%" height="80%">
                            <LineChart data={sessionData.slice(-60)}>
                              <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
                              <Line type="monotone" dataKey="rmssd" stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <>
                            <div className="absolute top-1/2 left-3 right-0 border-t border-dashed border-slate-200 -translate-y-1/2 z-0" />
                            <ResponsiveContainer width="100%" height="80%" className="opacity-15 animate-pulse relative z-10">
                              <LineChart data={[{v:40},{v:45},{v:35},{v:50},{v:40},{v:45},{v:35}]}>
                                <YAxis hide domain={[20,70]} />
                                <Line type="basis" dataKey="v" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* KPI 3: Task Speed */}
                  <div className="glass-card p-4 flex flex-col relative overflow-hidden min-h-0 min-w-0">
                    <p className="metric-label flex items-center justify-between shrink-0 mb-3 opacity-90">
                      Task Speed <Zap className="w-4 h-4" />
                    </p>
                    <div className="flex-1 flex flex-col lg:flex-row lg:items-center min-h-0 min-w-0">
                      <div className="flex items-baseline pr-3 lg:pr-4 mb-2 lg:mb-0 shrink-0">
                        <span className="font-mono text-[3rem] 2xl:text-[3.5rem] font-extralight text-slate-300 tracking-tight leading-none animate-pulse">--</span>
                        <span className="text-slate-500 font-medium text-lg leading-none ml-1 relative">op/m</span>
                      </div>
                      <div className="flex-1 w-full h-full relative lg:border-l lg:border-slate-200/60 lg:pl-3 min-w-0 flex items-center border-t lg:border-t-0 pt-2 lg:pt-0">
                        <div className="absolute top-1/2 left-3 right-0 border-t border-dashed border-slate-200 -translate-y-1/2 z-0" />
                        <ResponsiveContainer width="100%" height="80%" className="opacity-15 animate-pulse relative z-10">
                            <LineChart data={[{v:1},{v:2},{v:1.5},{v:3},{v:2},{v:1.5},{v:2}]}>
                              <YAxis hide domain={[0,4]} />
                              <Line type="basis" dataKey="v" stroke="#94a3b8" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* KPI 4: Accuracy */}
                  <div className="glass-card p-4 flex flex-col relative overflow-hidden min-h-0 min-w-0">
                    <p className="metric-label flex items-center justify-between shrink-0 mb-3 opacity-90">
                      Accuracy <Target className="w-4 h-4" />
                    </p>
                    <div className="flex-1 flex flex-col lg:flex-row lg:items-center min-h-0 min-w-0">
                      <div className="flex items-baseline pr-3 lg:pr-4 mb-2 lg:mb-0 shrink-0">
                        {totalSamples > 0 ? (
                           <span className="font-mono text-[3rem] 2xl:text-[3.5rem] font-extralight text-emerald-600 tracking-tight leading-none">{accuracyPct}</span>
                        ) : (
                           <span className="font-mono text-[3rem] 2xl:text-[3.5rem] font-extralight text-slate-300 tracking-tight leading-none animate-pulse">--</span>
                        )}
                        <span className="text-slate-500 font-medium text-lg leading-none ml-1 relative">%</span>
                      </div>
                      <div className="flex-1 w-full h-full relative lg:border-l lg:border-slate-200/60 lg:pl-3 min-w-0 flex items-center border-t lg:border-t-0 pt-2 lg:pt-0">
                        {sessionData.length > 1 ? (
                          <ResponsiveContainer width="100%" height="80%">
                            <LineChart data={sessionData.slice(-60).map(d => ({ ...d, acc: d.workload > -30 ? 100 : 0 }))}>
                              <YAxis hide domain={[0, 100]} />
                              <Line type="monotone" dataKey="acc" stroke="#10b981" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <>
                            <div className="absolute top-1/2 left-3 right-0 border-t border-dashed border-slate-200 -translate-y-1/2 z-0" />
                            <ResponsiveContainer width="100%" height="80%" className="opacity-15 animate-pulse relative z-10">
                              <LineChart data={[{v:80},{v:90},{v:85},{v:100},{v:90},{v:85},{v:90}]}>
                                <YAxis hide domain={[0,100]} />
                                <Line type="basis" dataKey="v" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── CAMERA + BIO OVERLAY MODE ───────────────────────── */}
            {isCameraMode && (
              <div className="flex-1 relative overflow-hidden z-10">
                <video
                  ref={attachCameraVideoRef}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                  autoPlay
                  muted
                  playsInline
                  onLoadedData={() => setCameraStreamActive(true)}
                  onPlaying={() => setCameraStreamActive(true)}
                  onError={() => setCameraStreamActive(false)}
                />
                {!cameraStreamActive && (
                  <div className="absolute inset-0 camera-feed-placeholder bg-slate-50">
                    <div className="flex flex-col items-center gap-4">
                      <Video className="w-16 h-16 text-slate-200" />
                      <p className="text-slate-400 text-sm font-medium">POV Camera Feed</p>
                      <p className="text-slate-300 text-xs text-center px-6">Connect laparoscope camera to start streaming</p>
                      {cameraError && <p className="text-[11px] text-red-400 text-center px-6">{cameraError}</p>}
                    </div>
                  </div>
                )}

                {/* Floating HUD — Top Left: Heart Rate + Stress Level */}
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

                {/* Floating HUD — Bottom Left: HRV + Cognitive Load */}
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

                {/* Floating HUD — Bottom Right: Duration + Performance */}
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

                {/* Bottom timeline strip */}
                <div className="absolute bottom-0 left-0 right-0 px-6 py-2 z-20" style={{ background: "rgba(255, 255, 255, 0.4)", borderTop: "1px solid rgba(0,0,0,0.05)", backdropFilter: "blur(8px)" }}>
                  {recentData.length > 1 && (
                    <svg width="100%" height={32} viewBox="0 0 800 32" preserveAspectRatio="none">
                      <polygon points={`0,32 ${recentData.map((d, i) => {
                        const x = (i / (recentData.length - 1)) * 800;
                        const y = 32 - Math.max(0, Math.min(32, ((d.workload + 100) / 200) * 32));
                        return `${x},${y}`;
                      }).join(" ")} 800,32`} fill={`${gaugeColor}12`} />
                      <polyline points={recentData.map((d, i) => {
                        const x = (i / (recentData.length - 1)) * 800;
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
                <video
                  ref={attachCameraVideoRef}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                  autoPlay
                  muted
                  playsInline
                  onLoadedData={() => setCameraStreamActive(true)}
                  onPlaying={() => setCameraStreamActive(true)}
                  onError={() => setCameraStreamActive(false)}
                />
                {!cameraStreamActive && (
                  <div className="absolute inset-0 camera-feed-placeholder bg-slate-50">
                    <div className="flex flex-col items-center gap-4">
                      <Video className="w-16 h-16 text-slate-200" />
                      <p className="text-slate-400 text-sm font-medium">POV Camera Feed</p>
                      <p className="text-slate-300 text-xs text-center px-6">Connect laparoscope camera to start streaming</p>
                      {cameraError && <p className="text-[11px] text-red-400 text-center px-6">{cameraError}</p>}
                    </div>
                  </div>
                )}

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
        <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-12 max-w-7xl mx-auto w-full overflow-y-auto">
          {renderReviewHeader()}

          {/* Top Row: KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Performance */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center items-center text-center h-36 hover:shadow-md transition-shadow">
              <div className="text-slate-500 text-xs uppercase font-bold tracking-widest mb-3 w-full text-center">Performance</div>
              <div className="text-5xl font-extrabold text-[#001864] flex-1 flex items-center justify-center">{reviewKpis.performanceScore.toFixed(0)}%</div>
            </div>

            {/* Total Time */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center items-center text-center h-36 hover:shadow-md transition-shadow">
              <div className="text-slate-500 text-xs uppercase font-bold tracking-widest mb-3 w-full text-center">Total Time</div>
              <div className="text-5xl font-extrabold text-slate-800 flex-1 flex items-center justify-center">{formatSeconds(reviewStats.duration)}</div>
            </div>

            {/* Error Rate */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center items-center text-center h-36 hover:shadow-md transition-shadow">
              <div className="text-slate-500 text-xs uppercase font-bold tracking-widest mb-3 w-full text-center">Error Rate</div>
              <div className="text-5xl font-extrabold text-red-500 flex-1 flex items-center justify-center">{reviewKpis.errorRate.toFixed(0)}%</div>
            </div>
          </div>

          {/* Full Width Chart Section */}
          <div className="w-full flex flex-col gap-6 mb-8">
             <div className="w-full bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden flex flex-col min-h-[380px]">
                <div className="mb-6 flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Session Analysis (HRV Derived)</h3>
                  <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl">
                     <button
                       onClick={() => setShowCogLoadLine(!showCogLoadLine)}
                       className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${showCogLoadLine ? 'bg-white text-[#001864] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       Cognitive Load
                     </button>
                     <button
                       onClick={() => setShowStressLine(!showStressLine)}
                       className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${showStressLine ? 'bg-white text-red-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       HRV Delta (ms)
                     </button>
                  </div>
                </div>
                <div className="flex-1 w-full min-h-0 relative">
                  {showCogLoadLine && (
                    <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-[10px] text-slate-400 font-medium py-3 z-10 pointer-events-none">
                      <span>100%</span>
                      <span>50%</span>
                      <span>0%</span>
                    </div>
                  )}
                  {deltaRmssdTimeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={deltaRmssdTimeline}
                        margin={{ top: 12, right: 12, left: 36, bottom: 0 }}
                        onClick={(state) => {
                          const clickedTime = typeof state?.activeLabel === "number" ? state.activeLabel : Number(state?.activeLabel);
                          if (!Number.isNaN(clickedTime)) {
                             setVideoTime(clickedTime);
                             if (reviewVideoRef.current) reviewVideoRef.current.currentTime = clickedTime;
                          }
                        }}
                      >
                        <XAxis type="number" domain={['dataMin', 'dataMax']} dataKey="timeOffset" hide />
                        <YAxis yAxisId="left" hide domain={[-5, 105]} />
                        <YAxis yAxisId="right" orientation="right" hide domain={['dataMin - 10', 'dataMax + 10']} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px", color: "#1e293b", padding: "8px 12px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                          labelFormatter={(l) => `Time: ${formatSeconds(Number(l))}`}
                          formatter={(value, name) => [typeof value === 'number' ? value.toFixed(1) : value, name]}
                        />
                        {showCogLoadLine && (
                          <Line yAxisId="left" type="monotone" dataKey="cogLoadPct" name="Cognitive Load (%)" stroke="#001864" strokeWidth={3} dot={false} isAnimationActive={false} />
                        )}
                        {showStressLine && (
                          <Line yAxisId="right" type="monotone" dataKey="deltaRmssd" name="HRV Delta (ms)" stroke="#ef4444" strokeWidth={3} dot={false} isAnimationActive={false} />
                        )}
                        <ReferenceLine yAxisId="left" x={videoTime} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">No timeline data available for this session.</div>
                  )}
                </div>
             </div>
          </div>

          {/* Full Width Video Section */}
          <div className="w-full flex flex-col gap-6 mb-10">
            <div className="overflow-hidden bg-[#0a0f1c] w-full aspect-video sm:h-[70vh] min-h-[400px] sm:min-h-[500px] relative group border border-slate-800 shadow-xl rounded-3xl flex justify-center items-center">
              <video
                ref={(el) => {
                  reviewVideoRef.current = el;
                  if (el) {
                    // Synchronize video current time with videoTime state if changed externally
                    if (Math.abs(el.currentTime - videoTime) > 0.5) {
                      el.currentTime = videoTime;
                    }
                  }
                }}
                src={`/api/sessions/video?userId=${encodeURIComponent(userId || 'anonymous')}&sessionId=${encodeURIComponent(currentReviewSession?.sessionId || '')}`}
                className="w-full h-full object-contain cursor-pointer"
                onTimeUpdate={(e) => setVideoTime(e.currentTarget.currentTime)}
                onPlay={() => setIsVideoPaused(false)}
                onPause={() => setIsVideoPaused(true)}
                onClick={(e) => e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause()}
              />
              {!currentReviewSession?.sessionId && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-slate-300 p-6 text-center pointer-events-none">
                  <Video className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-base font-medium opacity-60">Recording not available for this session</p>
                </div>
              )}
              
              {/* Custom Scrubber / Timeline Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-6 pt-16 bg-gradient-to-t from-[#0a0f1c] via-[#0a0f1c]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-4">
                <input
                  type="range"
                  min={0}
                  max={reviewStats.duration}
                  step={0.1}
                  value={videoTime}
                  onChange={(e) => {
                    const newTime = Number(e.target.value);
                    setVideoTime(newTime);
                    if (reviewVideoRef.current) reviewVideoRef.current.currentTime = newTime;
                  }}
                  className="w-full h-3 rounded-full appearance-none accent-white cursor-pointer border border-white/20 shadow-md transition-all hover:h-4"
                  style={{ background: timelineGradient !== 'none' ? timelineGradient : '#334155' }}
                />
                <div className="flex items-center justify-between">
                  <button 
                    onClick={() => reviewVideoRef.current?.paused ? reviewVideoRef.current.play() : reviewVideoRef.current?.pause()}
                    className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer backdrop-blur-sm shadow-sm"
                  >
                    {isVideoPaused ? <Play className="w-5 h-5 fill-current ml-0.5" /> : <Pause className="w-5 h-5 fill-current" />}
                  </button>
                  <div className="text-sm font-mono font-medium text-white/90 bg-black/40 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-white/10">
                    <span>{formatSeconds(videoTime)}</span> <span className="text-white/50 mx-1">/</span> <span>{formatSeconds(reviewStats.duration)}</span>
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
