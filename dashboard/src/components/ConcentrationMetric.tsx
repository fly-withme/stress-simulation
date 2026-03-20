"use client";

import React from 'react';

export const ConcentrationMetric = ({ workload }: { workload: number | null }) => {

  return (
    <div className="flex flex-col items-end">
      <div className={`text-4xl font-mono tracking-wider text-primary drop-shadow-[0_0_15px_rgba(0,24,100,0.2)] ${workload === null ? 'opacity-80' : ''}`}>
        {workload !== null ? `${Math.round(workload)}%` : '--%'}
      </div>
      <div className="text-xs uppercase tracking-widest text-primary/75 font-semibold mt-1">
        Changes in Pupil Dilation
      </div>
    </div>
  );
};
export default ConcentrationMetric;
