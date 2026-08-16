import React from 'react';
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
  if (!question?.imageUrl) return null;

  const text = question.text || '';
  const alt = text
    ? `Illustration for: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`
    : 'Question illustration';

  const style: React.CSSProperties & Record<string, string> = {
    '--q-max': `${maxHeight}px`,
  };

  return (
    <img
      src={question.imageUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="mockmate-question-image"
      style={style}
    />
  );
};

export default QuestionImage;
