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
    return <p style={{ color: '#94a3b8' }}>No attempts yet — take a test to see your progress.</p>;
  }

  const padding = 16;
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
      <svg width={w} height={h} style={{ width: '100%', height: 'auto' }}>
        <rect x={padding} y={padding} width={pw} height={ph} fill="none" stroke="#e2e8f0" />
        {gridValues.map(v => {
          const gy = yFor(v);
          return (
            <g key={v}>
              <line x1={padding} y1={gy} x2={padding + pw} y2={gy} stroke="#f1f5f9" strokeWidth={1} />
              <text x={padding - 6} y={gy + 3} fontSize={10} fill="#94a3b8" textAnchor="end">{v}%</text>
            </g>
          );
        })}
        <polygon points={areaPath} fill="url(#areaGrad)" fillOpacity={0.14} />
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#2563eb" stopOpacity={0.3} />
            <stop stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <polyline points={points.map(p => `${xFor(p.x).toFixed(1)},${yFor(p.y).toFixed(1)}`).join(' ')}
          fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map(p => (
          <circle key={p.x} cx={xFor(p.x)} cy={yFor(p.y)} r={3} fill="#2563eb" />
        ))}
      </svg>
    </div>
  );
};

export default ProgressChart;
