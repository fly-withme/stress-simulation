import React from "react";

interface PerformanceSummaryProps {
  accuracyPercent: number;
  speedPercent: number;
  performanceScore: number;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({
  accuracyPercent,
  speedPercent,
  performanceScore,
}) => {
  const accuracy = clampPercent(accuracyPercent);
  const speed = clampPercent(speedPercent);
  const score = clampPercent(performanceScore);
  const balanceGap = Math.abs(accuracy - speed);
  const balanceLabel =
    balanceGap <= 8 ? "Balanced" : accuracy > speed ? "Accuracy-led" : "Speed-led";

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h3 className="text-lg font-semibold text-primary">Performance</h3>
          <p className="text-sm text-slate-600 mt-1">Performance is defined by two signals: accuracy and speed.</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Balance</div>
          <div className="text-sm font-semibold text-primary mt-1">{balanceLabel}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex items-end justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-slate-500">Accuracy</span>
            <span className="text-3xl font-semibold text-primary leading-none">{accuracy.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex items-end justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-slate-500">Speed</span>
            <span className="text-3xl font-semibold text-primary leading-none">{speed.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-slate-600 rounded-full transition-all duration-500"
              style={{ width: `${speed}%` }}
            />
          </div>
        </article>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wider text-slate-500">Combined Performance</span>
        <span className="text-sm font-semibold text-primary">{score.toFixed(1)}%</span>
      </div>
    </section>
  );
};

export default PerformanceSummary;
