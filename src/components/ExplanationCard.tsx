import React from 'react';
import { LatexText } from './LatexText';

export interface ExplanationCardProps {
  /** The AI-generated rationale. When absent/null/empty the card renders nothing. */
  explanation?: string | null;
  className?: string;
  /** Optional label for the simpler-explanation button (defaults to "Show simpler"). */
  simplerLabel?: string;
  /** Called when the user clicks the "Show simpler" button (opt-in regeneration). */
  onRegenerateSimpler?: () => void;
}

/**
 * Renders a question's AI explanation as a native collapsible `<details>`
 * block. Null-safe: returns `null` when there is no explanation, so it can be
 * dropped into any question row without guarding.
 */
export const ExplanationCard: React.FC<ExplanationCardProps> = ({
  explanation,
  className = '',
  simplerLabel = 'Show simpler',
  onRegenerateSimpler,
}) => {
  if (!explanation || !explanation.trim()) return null;
  return (
    <details className={`explanation-card ${className}`}>
      <summary className="explanation-summary" data-testid="explanation-summary">
        <span>Show explanation</span>
        {onRegenerateSimpler ? (
          <button
            type="button"
            className="explanation-simpler-btn"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRegenerateSimpler();
            }}
            data-testid="explanation-simpler"
          >
            {simplerLabel}
          </button>
        ) : null}
      </summary>
      <p className="explanation-text" data-testid="explanation-text">
        <LatexText text={explanation} />
      </p>
    </details>
  );
};

export default ExplanationCard;
