import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Question } from '../types/exam.types';
import './QuestionImage.css';

interface QuestionImageProps {
  /** The question whose backing image (if any) should be rendered. */
  question: Question;
  /** Desktop height cap in pixels. The image still auto-scales to the
   *  viewport on small screens via `max-height: min(…, 45vh)`. */
  maxHeight?: number;
}

/**
 * Renders an image-backed question consistently across the bank grid, the
 * student exam view and every preview. Centralising the markup keeps images
 * responsive on mobile and desktop: they never overflow their container, use
 * `object-contain`, lazy-load and expose a descriptive (screen-reader) alt
 * built from the question text.
 */
export const QuestionImage: React.FC<QuestionImageProps> = ({ question, maxHeight = 200 }) => {
  // Click-to-enlarge: opens a fullscreen preview of the full-resolution image.
  // Stops propagation so clicks on the image in selectable grids (e.g. the
  // create-test question bank) zoom instead of toggling selection.
  // Hooks are called unconditionally (before the early return) to respect the
  // Rules of Hooks — the component still renders nothing when there is no image.
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  // Keep the background from scrolling while the preview is open.
  useEffect(() => {
    if (!isZoomOpen) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isZoomOpen]);

  if (!question?.imageUrl) return null;

  const text = question.text || '';
  const alt = text
    ? `Illustration for: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`
    : 'Question illustration';

  const style: React.CSSProperties & Record<string, string> = {
    '--q-max': `${maxHeight}px`,
  };

  const openZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsZoomOpen(true);
  };
  const closeZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsZoomOpen(false);
  };

  return (
    <>
      <img
        src={question.imageUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="mockmate-question-image"
        style={style}
        onClick={openZoom}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            openZoom(e as unknown as React.MouseEvent);
          }
        }}
        tabIndex={0}
      />
      {isZoomOpen && (
        <div
          className="mockmate-image-zoom-overlay"
          onClick={closeZoom}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <button
            type="button"
            className="mockmate-image-zoom-close"
            onClick={closeZoom}
            aria-label="Close"
          >
            <X size={24} />
          </button>
          <div
            className="mockmate-image-zoom-content"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={question.imageUrl}
              alt={alt}
              className="mockmate-image-zoom-img"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default QuestionImage;
