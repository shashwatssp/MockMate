import React, { useState, useEffect, useRef } from 'react';
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

  // Holds the `popstate` handler so we can detach it before we intentionally
  // manipulate history when closing (avoids any back-handling loop).
  const popStateHandler = useRef<((e: PopStateEvent) => void) | null>(null);

  // When the preview is open we manage browser history, body scroll and
  // keyboard behaviour so the screen never feels "stuck": the preview can
  // always be dismissed via the × button, the backdrop, Escape, or the mobile
  // back button (which closes the preview instead of navigating away).
  useEffect(() => {
    if (!isZoomOpen) return undefined;

    // Lock body scroll so the page behind doesn't scroll while previewing.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Mobile back button: close the preview instead of leaving the screen.
    // One history entry is pushed on open and popped on close, keeping the
    // back stack balanced so subsequent back presses behave normally.
    const onPopState = () => {
      setIsZoomOpen(false);
    };
    popStateHandler.current = onPopState;
    window.addEventListener('popstate', onPopState);

    // Escape closes the preview for keyboard / laptop users.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsZoomOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      if (popStateHandler.current) {
        window.removeEventListener('popstate', popStateHandler.current);
        popStateHandler.current = null;
      }
      window.removeEventListener('keydown', onKeyDown);
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
    // Push a placeholder entry so the back button dismisses the preview first.
    window.history.pushState({ zoomOpen: true }, '');
    setIsZoomOpen(true);
  };
  const closeZoom = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Detach the back-handler before we touch history, so the popstate we are
    // about to fire (via history.back) doesn't re-trigger a close.
    if (popStateHandler.current) {
      window.removeEventListener('popstate', popStateHandler.current);
      popStateHandler.current = null;
    }
    setIsZoomOpen(false);
    // Pop the placeholder entry pushed on open so the back stack is restored
    // and the next back press leaves the screen as expected.
    if (window.history.state?.zoomOpen) {
      window.history.back();
    }
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
