import React from 'react';
import './Skeleton.css';

/**
 * Shimmering skeleton primitives (Phase 0.7 mobile polish) — replace the
 * spinner-text "Loading…" lines on dashboard/batch/list surfaces so data
 * fetches feel instant instead of unfinished. Colors come from the shared
 * design tokens (--color-bg-elevated), so light/dark just work.
 */

/** A single shimmering block. Size it with style/className. */
export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...rest
}) => (
  <div className={`skeleton ${className}`.trim()} aria-hidden="true" {...rest} />
);

/** Card rows matching the batch/test list silhouettes (title + meta line). */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({
  rows = 3,
  className = '',
}) => (
  <div className={`skeleton-list ${className}`.trim()} role="status" aria-busy="true">
    <span className="skel-sr">Loading…</span>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="skeleton-card">
        <Skeleton
          className="skeleton-line"
          style={{ width: `${58 - (i % 3) * 9}%`, animationDelay: `${i * 0.12}s` }}
        />
        <Skeleton
          className="skeleton-line skeleton-line-thin"
          style={{ width: `${84 - (i % 4) * 7}%`, animationDelay: `${i * 0.12 + 0.06}s` }}
        />
      </div>
    ))}
  </div>
);

/** Stat-card row matching the dashboard "quick stats" silhouettes. */
export const SkeletonStats: React.FC<{ count?: number; className?: string }> = ({
  count = 3,
  className = '',
}) => (
  <div className={`skeleton-stats ${className}`.trim()} role="status" aria-busy="true">
    <span className="skel-sr">Loading…</span>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="skeleton-card skeleton-stat-card">
        <Skeleton className="skeleton-line" style={{ width: 46, height: 26 }} />
        <Skeleton className="skeleton-line skeleton-line-thin" style={{ width: '72%' }} />
      </div>
    ))}
  </div>
);
