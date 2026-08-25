import React from 'react';
import type { TestResult } from '../types/exam.types';

interface Props {
  results: TestResult[];
  height?: number;
}

// A dependency-free (no recharts/chart.js) inline SVG line chart so the
// progress graph adds nothing to the bundle budget.
export const ProgressChart: React.FC<Props> = ({ results, height = 160 }) => {
  const points = results
    .slice()
    .reverse() // oldest -> newest
    .map((r, i) => ({ x: i, y: r.percentage }));
  const n = points.length;
  if (n === 0) {
    return <p style={{ color: 'var(--color-text-secondary)' }}>No attempts yet — take a test to see your progress.</p>;
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

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      {/* viewBox is REQUIRED: without it a fluid-width svg clips instead of
          scaling, which used to hide every gridline below ~40% on mobile. */}
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={padding} y={padding} width={pw} height={ph} fill="none" stroke="var(--color-border-strong)" />
        {gridValues.map(v => {
          const gy = yFor(v);
          return (
            <g key={v}>
              <line x1={padding} y1={gy} x2={padding + pw} y2={gy} stroke="var(--color-border-strong)" strokeWidth={1} />
              <text x={padding - 6} y={gy + 3} fontSize={10} fill="var(--color-text-secondary)" textAnchor="end">{v}%</text>
            </g>
          );
        })}
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
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
            <polygon points={areaPath} fill="url(#areaGrad)" fillOpacity={0.14} />
            <polyline points={points.map(p => `${xFor(p.x).toFixed(1)},${yFor(p.y).toFixed(1)}`).join(' ')}
              fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map(p => (
              <circle key={p.x} cx={xFor(p.x)} cy={yFor(p.y)} r={3} fill="var(--color-accent)" />
            ))}
          </>
        )}
      </svg>
    </div>
  );
};

export default ProgressChart;
