import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface LatexTextProps {
  /** Raw text that may contain `$…$` inline math segments. */
  text: string | null | undefined;
}

/** Segment produced by splitting text on `$…$` delimiters. */
interface LatexSegment {
  text: string;
  math: boolean;
}

/**
 * Splits a string on `$…$` delimiters into alternating plain-text and math
 * segments.
 *
 * Scope note (matches the question bank): only **single-`$`** inline math is
 * recognised. Double-`$$` display math is intentionally not supported — every
 * extracted question uses `$…$` inline notation. If display math is needed
 * later, the regex should check for `$$` pairs first and fall back to `$`.
 */
const splitLatex = (text: string): LatexSegment[] => {
  const segments: LatexSegment[] = [];
  // `[^$]+` forbids nested `$` inside a single math expression, which is the
  // correct behaviour for inline-only math.
  const regex = /\$([^$]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), math: false });
    }
    segments.push({ text: match[1], math: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), math: false });
  }

  return segments;
};

/**
 * Render text that may contain `$…$` inline math via KaTeX.
 *
 * - Math segments are rendered with `katex.renderToString` (HTML injected via
 *   `dangerouslySetInnerHTML`, which is safe here because KaTeX produces
 *   sanitized, escaped HTML).
 * - Plain segments are emitted as JSX text, which React escapes automatically,
 *   so non-math text is passed through safely.
 *
 * `throwOnError: false` keeps a malformed expression from crashing the render;
 * KaTeX logs a console warning and renders the raw token instead.
 */
export const LatexText: React.FC<LatexTextProps> = ({ text }) => {
  if (text == null) return null;

  const segments = splitLatex(String(text));

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.math) {
          return (
            <span
              key={index}
              className="mockmate-latex-inline"
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(segment.text, {
                  throwOnError: false,
                  displayMode: false,
output: 'htmlAndMathml',
                }),
              }}
            />
          );
        }
        return <React.Fragment key={index}>{segment.text}</React.Fragment>;
      })}
    </>
  );
};

export default LatexText;
