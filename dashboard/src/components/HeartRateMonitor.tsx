import React from "react";

interface HeartRateMonitorProps {
  bpm: number | null;
}

const getSegmentPath = (
  cx: number,
  cy: number,
  r: number,
  R: number,
  startAngle: number,
  endAngle: number
) => {
  const startRad = (180 - startAngle) * (Math.PI / 180);
  const endRad = (180 - endAngle) * (Math.PI / 180);

  const x1 = cx + R * Math.cos(startRad);
  const y1 = cy - R * Math.sin(startRad);
  const x2 = cx + R * Math.cos(endRad);
  const y2 = cy - R * Math.sin(endRad);

  const x3 = cx + r * Math.cos(endRad);
  const y3 = cy - r * Math.sin(endRad);
  const x4 = cx + r * Math.cos(startRad);
  const y4 = cy - r * Math.sin(startRad);

  const largeArcFlag = 0;

  return `M ${x1} ${y1} A ${R} ${R} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`;
};

const HeartRateMonitor: React.FC<HeartRateMonitorProps> = ({ bpm }) => {
  const segments = [
    { color: "#166b8d" },
    { color: "#2598c2" },
    { color: "#8abdc9" },
    { color: "#ccc491" },
    { color: "#edab0d" },
    { color: "#dc5c17" },
    { color: "#c63116" },
  ];

  const totalAngle = 180;
  const gap = 3;
  const totalGaps = (segments.length - 1) * gap;
  const segmentSpan = (totalAngle - totalGaps) / segments.length;

  const cx = 150;
  const cy = 130;
  const r = 55;
  const R = 110;

  const mapBpmToAngle = (bpmValue: number) => {
    const minBpm = 40;
    const maxBpm = 200;
    const clamped = Math.max(minBpm, Math.min(maxBpm, bpmValue));
    return ((clamped - minBpm) / (maxBpm - minBpm)) * 180;
  };

  const needleAngle = bpm !== null && bpm > 0 ? mapBpmToAngle(bpm) : 0;

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-[320px] aspect-square">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 300 160"
        className="overflow-visible"
        style={{ filter: "drop-shadow(0px 10px 15px rgba(0,0,0,0.5))" }}
      >
        {/* Draw Segments */}
        <g strokeLinejoin="round" strokeLinecap="round">
          {segments.map((seg, i) => {
            const startAngle = i * (segmentSpan + gap);
            const endAngle = startAngle + segmentSpan;
            return (
              <path
                key={i}
                d={getSegmentPath(cx, cy, r, R, startAngle, endAngle)}
                fill={seg.color}
                stroke="#1e293b" // slate-800 to match background if there's any bleed
                strokeWidth="1"
              />
            );
          })}
        </g>

        {/* Needle */}
        <g transform={`rotate(${needleAngle}, ${cx}, ${cy})`}>
          {/* Shadow of needle */}
          <polygon
            points={`${cx - R + 10},${cy} ${cx + 15},${cy - 5} ${
              cx + 15
            },${cy + 5}`}
            fill="rgba(0,0,0,0.4)"
            transform="translate(2, 4)"
          />
          {/* Main needle */}
          <polygon
            points={`${cx - R + 10},${cy} ${cx + 15},${cy - 4} ${
              cx + 15
            },${cy + 4}`}
            fill="#3f3f3f"
            stroke="#222"
            strokeWidth="1"
          />
          <polygon
            points={`${cx - R + 15},${cy} ${cx + 12},${cy - 1} ${cx + 12},${cy}`}
            fill="#7a7a7a"
          />
        </g>

        {/* Pivot Center */}
        <circle cx={cx} cy={cy} r="10" fill="#2d2d2d" stroke="#111" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="4" fill="#555" />
      </svg>

      <div className="absolute bottom-2 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-1 justify-center">
          <span className="text-6xl font-normal tracking-tight text-slate-100 mix-blend-screen drop-shadow-md">
            {bpm !== null && bpm > 0 ? bpm : "--"}
          </span>
          <span className="text-xl font-medium text-slate-400 drop-shadow-md ml-1">bpm</span>
        </div>
        <div
          className="text-[14px] font-bold tracking-widest text-slate-300 uppercase -mt-1 text-center"
          style={{ letterSpacing: "0.15em", transform: "scaleY(0.9)" }}
        >
          Heart Rate
        </div>
      </div>
    </div>
  );
};

export default HeartRateMonitor;
