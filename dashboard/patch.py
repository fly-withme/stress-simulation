import os

with open('/Users/flywithme/Documents/Projekte/8_uni/TSS/stresssimulation/dashboard/src/app/page.tsx', 'r') as f:
    t = f.read()

s1 = 'const deltaRmssdTimeline = useMemo(() => {'
s2 = '  }, [sessionData, baselineRmssd, currentReviewSession]);'
idx1 = t.find(s1)
idx2 = t.find(s2, idx1) + len(s2)

new_memo = """const deltaRmssdTimeline = useMemo(() => {
    if (sessionData.length === 0) return [];

    const baselineReference =
      baselineRmssd && baselineRmssd > 0
        ? baselineRmssd
        : currentReviewSession?.reviewStats?.avgRmssd || sessionData[0].rmssd;

    return sessionData.map((point) => {
      const mockPupil = 3.0 + (point.bpm / 100) * 1.5 + (Math.random() * 0.4 - 0.2); 
      return {
        ...point,
        deltaRmssd: point.rmssd - baselineReference,
        cognitiveLoad: point.rmssd - baselineReference,
        pupillaryDilatation: Math.max(2.0, Math.min(8.0, mockPupil)),
      };
    });
  }, [sessionData, baselineRmssd, currentReviewSession]);"""

t = t[:idx1] + new_memo + t[idx2:]

t = t.replace('<h3 className="text-lg font-semibold text-slate-200">Screen Data</h3>', '<h3 className="text-lg font-semibold text-slate-200">Screen Data & Cognitive Load</h3>')

chart_start = '          {/* Delta RMSSD Timeline */}'
chart_end = '          {/* Screen Daten / Workload Sync */}'
i1 = t.find(chart_start)
i2 = t.find(chart_end)

if i1 != -1 and i2 != -1:
    block = t[i1:i2]

    # Cognitive load block
    c1 = block.replace('{/* Delta RMSSD Timeline */}', '{/* Cognitive Load over time */}')
    c1 = c1.replace('Delta RMSSD Timeline', 'Cognitive Load over time')
    c1 = c1.replace('Heart rate variability change across the session.', 'Estimated cognitive load across the session.')
    c1 = c1.replace('dataKey="deltaRmssd"', 'dataKey="cognitiveLoad"')
    c1 = c1.replace('stroke="#3B98B4"', 'stroke="#8b5cf6"')
    c1 = c1.replace('fill: "#3B98B4"', 'fill: "#8b5cf6"')
    c1 = c1.replace('"Delta RMSSD"', '"Cognitive Load"')
    c1 = c1.replace('No RMSSD timeline data available.', 'No data available.')
    c1 = c1.replace('order-2', 'order-2')

    # Original RMSSD block mapped to order-3
    orig = block.replace('order-2', 'order-3')

    # Pupillary Dilatation block
    c2 = block.replace('{/* Delta RMSSD Timeline */}', '{/* Task-Evoked Pupillary Response (TEPR) over time */}')
    c2 = c2.replace('Delta RMSSD Timeline', 'Task-Evoked Pupillary Response (TEPR) over time')
    c2 = c2.replace('Heart rate variability change across the session.', 'Estimated pupillary dilatation over the session time.')
    c2 = c2.replace('dataKey="deltaRmssd"', 'dataKey="pupillaryDilatation"')
    c2 = c2.replace('stroke="#3B98B4"', 'stroke="#10b981"')
    c2 = c2.replace('fill: "#3B98B4"', 'fill: "#10b981"')
    c2 = c2.replace('"Delta RMSSD"', '"Pupillary Dilatation"')
    c2 = c2.replace("domain={['dataMin', 'dataMax']}", "domain={['dataMin - 0.5', 'dataMax + 0.5']}")
    c2 = c2.replace('order-2', 'order-4')
    c2 = c2.replace('No RMSSD timeline data available.', 'No data available.')
    # Update formatter units
    c2 = c2.replace('`${(value as number).toFixed(0)} ms`', '`${(value as number).toFixed(1)} mm`')
    c2 = c2.replace('`${Number(value ?? 0).toFixed(1)} ms`', '`${Number(value ?? 0).toFixed(2)} mm`')

    t = t[:i1] + c1 + '\n' + orig + '\n' + c2 + '\n' + t[i2:]

    with open('/Users/flywithme/Documents/Projekte/8_uni/TSS/stresssimulation/dashboard/src/app/page.tsx', 'w') as f:
        f.write(t)
    print("SUCCESS")
else:
    print("FAILED TO FIND MARKERS")