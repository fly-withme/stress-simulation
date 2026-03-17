"use client";

import React from 'react';

export const ConcentrationMetric = ({ workload }: { workload: number }) => {

  return (
    <div className="flex flex-col items-end">
      <div className="text-4xl font-mono tracking-wider text-slate-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
        {Math.round(workload)}%
      </div>
      <div className="text-xs uppercase tracking-widest text-[#93c5fd] font-semibold mt-1">
        Konzentration
      </div>
    </div>
  );
};
export default ConcentrationMetric;
