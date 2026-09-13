import React from 'react';
import type { LucideIcon } from 'lucide-react';
import './EmptyState.css';

/**
 * Shared empty-state card (Phase 2.3) — friendly icon + one-line guidance +
 * optional primary CTA, replacing the plain "No X yet." text lines across the
 * dashboard, batch and student surfaces. Token-based, so light/dark just work.
 *
 * Use variant="compact" for in-card / secondary spots (per-test rows, filter
 * fallbacks); the default variant is for tab- or page-level empty screens.
 */
export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  variant?: 'default' | 'compact';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  variant = 'default',
  className = '',
}) => (
  <div
    className={`empty-state-card${variant === 'compact' ? ' empty-state-card-compact' : ''}${className ? ` ${className}` : ''}`}
  >
    {Icon ? (
      <div className="empty-state-icon" aria-hidden="true">
        <Icon />
      </div>
    ) : null}
    <h3 className="empty-state-title">{title}</h3>
    {description ? <p className="empty-state-desc">{description}</p> : null}
    {actionLabel && onAction ? (
      <button type="button" className="empty-state-action" onClick={onAction}>
        {ActionIcon ? <ActionIcon className="empty-state-action-icon" /> : null}
        <span>{actionLabel}</span>
      </button>
    ) : null}
  </div>
);
