export type ViewState = "LOGIN" | "OVERVIEW" | "HISTORY" | "SETTINGS" | "CALIBRATION_PENDING" | "CALIBRATION_ACTIVE" | "LIVE" | "SAVING" | "REVIEW";

export interface SessionInfo {
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

export interface SessionDataPoint {
  timeOffset: number; // Seconds since session started
  bpm: number;
  rmssd: number;
  workload: number;
}
