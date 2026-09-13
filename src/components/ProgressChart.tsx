import React, { useId, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { TestResult } from '../types/exam.types';
import { EmptyState } from './EmptyState';

interface Props {
  results: TestResult[];
  height?: number;
}

interface ChartPoint {
  x: number;
  y: number;
  /** Short x-axis / tooltip label: "Mar 4", or "#3" when the row has no date. */
  label: string;
}

// A dependency-free (no recharts/chart.js) inline SVG line chart so the
// progress graph adds nothing to the bundle budget.
export const ProgressChart: React.FC<Props> = ({ results, height = 160 }) => {
  const [active, setActive] = useState<number | null>(null);
  const gradId = `areaGrad-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

  const points: ChartPoint[] = results
    .slice()
    .reverse() // oldest -> newest
    .map((r, i) => {
      const d = r.completedAt ? new Date(r.completedAt) : null;
      const label = d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : `#${i + 1}`;
      return { x: i, y: r.percentage, label };
    });
  const n = points.length;
  if (n === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={TrendingUp}
        title="No attempts yet"
        description="Take a test to see your progress here."
      />
    );
  }

  // Left padding must fit the "100%" y-axis labels; 16px clipped them to a
  // bare "%". 40px leaves room for three digits + the % sign.
  const padding = 40;
  const w = 480;
  const h = height;
  const pw = w - padding * 2;
  const ph = h - padding * 2;
  const maxY = 100;
  const minY = 0;
  const yFor = (v: number) => padding + ph - ((v - minY) / (maxY - minY)) * ph;
  const xFor = (i: number) => (n === 1 ? padding : padding + (i / (n - 1)) * pw);

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.y).toFixed(1)}`)
    .join(' ');

  const areaPath = `${path} L${xFor(n - 1).toFixed(1)},${yFor(minY).toFixed(1)} L${xFor(0).toFixed(1)},${yFor(minY).toFixed(1)} Z`;

  const gridValues = [0, 20, 40, 60, 80, 100];

  // X labels crowd quickly on phones — thin them out as attempts pile up
  // (every 2nd past 8 points, every 3rd past 16). The newest always shows.
  const labelEvery = n <= 8 ? 1 : n <= 16 ? 2 : 3;

  // Tooltip geometry for the active dot, clamped inside the viewBox.
  const tip = (() => {
    if (active == null || !points[active]) return null;
    const p = points[active];
    const text = `${p.y}% · ${p.label}`;
    const tw = text.length * 6.4 + 18;
    const th = 22;
    const cx = xFor(p.x);
    const cy = yFor(p.y);
    const rectX = Math.min(Math.max(cx - tw / 2, 2), w - tw - 2);
    return { p, text, tw, th, cx, cy, rectX, rectY: Math.max(cy - th - 12, 2) };
  })();

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      {/* viewBox is REQUIRED: without it a fluid-width svg clips instead of
          scaling, which used to hide every gridline below ~40% on mobile. */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Score progress chart"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setActive(null)}
      >
        <rect x={padding} y={padding} width={pw} height={ph} fill="none" stroke="var(--color-border-strong)" />
        {gridValues.map(v => {
          const gy = yFor(v);
          return (
            <g key={v}>
              <line x1={padding} y1={gy} x2={padding + pw} y2={gy} stroke="var(--color-border-strong)" strokeWidth={1} />
              <text x={padding - 6} y={gy + 3.5} fontSize={11} fill="var(--color-text-secondary)" textAnchor="end">{v}%</text>
            </g>
          );
        })}
        {/* X-axis date labels: hidden entirely on the single-point case, and
            thinned as attempts accumulate (see labelEvery) so they stay
            readable at phone width where the viewBox scaling shrinks text. */}
        {n > 1 && points.map((p, i) => (
          (i % labelEvery === 0 || i === n - 1) ? (
            <text
              key={p.x}
              x={xFor(i)}
              y={h - padding + 15}
              fontSize={10.5}
              fill={active === i ? 'var(--color-text)' : 'var(--color-text-tertiary)'}
              textAnchor="middle"
            >
              {p.label}
            </text>
          ) : null
        ))}
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--color-accent)" stopOpacity={0.3} />
            <stop stopColor="var(--color-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Single-attempt charts degenerated into a diagonal line to the floor
            (area closed at y=0); draw one clear dot instead of a fake trend. */}
        {n === 1 ? (
          <circle cx={xFor(0)} cy={yFor(points[0].y)} r={4} fill="var(--color-accent)" />
        ) : (
          <>
            <polygon points={areaPath} fill={`url(#${gradId})`} fillOpacity={0.14} />
            <polyline points={points.map(p => `${xFor(p.x).toFixed(1)},${yFor(p.y).toFixed(1)}`).join(' ')}
              fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {/* Visible dots — the active one enlarges for a clear focus ring. */}
        {points.map((p, i) => (
          <circle
            key={p.x}
            cx={xFor(p.x)}
            cy={yFor(p.y)}
            r={active === i ? 4.5 : 3}
            fill="var(--color-accent)"
          />
        ))}
        {/* Tap/hover/focus targets: an oversized invisible ring per dot —
            touch targets here scale with the chart, so the ring compensates. */}
        {points.map((p, i) => (
          <circle
            key={`hit-${p.x}`}
            cx={xFor(p.x)}
            cy={yFor(p.y)}
            r={14}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`Score ${p.y} percent, ${p.label}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(prev => (prev === i ? null : prev))}
            onClick={() => setActive(prev => (prev === i ? null : i))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActive(prev => (prev === i ? null : i));
              }
            }}
            style={{ cursor: 'pointer', outline: 'none' }}
          />
        ))}
        {/* Tooltip: dark pill above the active dot (SVG-rendered so it also
            survives printing and needs no portal). */}
        {tip ? (
          <g pointerEvents="none">
            <rect
              x={tip.rectX}
              y={tip.rectY}
              width={tip.tw}
              height={tip.th}
              rx={8}
              fill="var(--color-text)"
            />
            <text
              x={tip.rectX + tip.tw / 2}
              y={tip.rectY + 15}
              fontSize={11}
              fontWeight={600}
              fill="var(--color-bg-card)"
              textAnchor="middle"
            >
              {tip.text}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
};

export default ProgressChart;
