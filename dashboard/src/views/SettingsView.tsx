"use client";

import React from "react";
import { Activity } from "lucide-react";

interface SettingsViewProps {
  header: React.ReactNode;
  session: any;
  wsConnected: boolean;
  bleState: "scanning" | "connected" | "offline";
  setReconnectTrigger: React.Dispatch<React.SetStateAction<number>>;
  savedBaselineRmssd: number | null;
  onRecalibrate: () => void;
}

export default function SettingsView({
  header,
  session,
  wsConnected,
  bleState,
  setReconnectTrigger,
  savedBaselineRmssd,
  onRecalibrate
}: SettingsViewProps) {
  return (
    <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
      {header}

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
                className="px-4 py-2 bg-slate-200 hover:bg-slate-700 text-slate-800 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
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
                onClick={onRecalibrate}
                className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                Recalibrate
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
