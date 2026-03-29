"use client";

import React, { useState } from "react";
import { Activity, Pencil, Check, X } from "lucide-react";
import { SessionInfo } from "../types";

interface HistoryViewProps {
  header: React.ReactNode;
  pastSessions: SessionInfo[];
  onViewSessionDetails: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newName: string) => Promise<void>;
}

export default function HistoryView({
  header,
  pastSessions,
  onViewSessionDetails,
  onRenameSession
}: HistoryViewProps) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [isSavingSessionName, setIsSavingSessionName] = useState(false);

  const startRenamingSession = (sessionItem: SessionInfo) => {
    setEditingSessionId(sessionItem.sessionId);
    setEditingSessionName(sessionItem.sessionName || "");
  };

  const cancelRenamingSession = () => {
    setEditingSessionId(null);
    setEditingSessionName("");
  };

  const handleSaveName = async (sessionId: string) => {
    const trimmed = editingSessionName.trim();
    if (!trimmed) return;
    setIsSavingSessionName(true);
    try {
      await onRenameSession(sessionId, trimmed);
    } finally {
      setIsSavingSessionName(false);
      setEditingSessionId(null);
      setEditingSessionName("");
    }
  };

  return (
    <main className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 max-w-6xl mx-auto w-full">
      {header}

      <div className="flex flex-col gap-6 w-full">
        <div className="bg-slate-50/50 border border-slate-200/50 rounded-3xl p-5 sm:p-8">
          {pastSessions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pastSessions.map((s, index) => (
                <div
                  key={s.sessionId}
                  onClick={() => onViewSessionDetails(s.sessionId)}
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
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveName(s.sessionId);
                              }
                              if (e.key === "Escape") {
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
                            onClick={() => handleSaveName(s.sessionId)}
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
                    <div className="text-xs text-slate-600 bg-slate-200/80 px-2 py-1 rounded-md">
                      {new Date(s.timestamp).toLocaleDateString()}
                    </div>
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
  );
}
