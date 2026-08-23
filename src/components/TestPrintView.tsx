/**
 * TestPrintView — a printable, offline-friendly rendering of a test's
 * questions and options. Intended for teachers who want a hard-copy
 * reference or a PDF (Ctrl/Cmd+P → "Save as PDF").
 *
 * Renders in a dedicated route (`/print/:testCode`) so it avoids the
 * dashboard/App chrome and prints cleanly.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTestByKey } from '../lib/database';
import type { Test, Question } from '../types/exam.types';
import { Printer, FileText, HelpCircle } from 'lucide-react';
import './TestPrintView.css';

interface TestPrintViewProps {
  test: Test;
}

/** Internal option-label helper (A, B, C, …). */
const optionLabel = (index: number): string => String.fromCharCode(65 + index);

/** Resolve once every <img> in the document has finished (or failed) loading,
 *  capped at `timeoutMs` so a slow CDN can never block printing entirely. */
const waitForImages = async (timeoutMs = 3000): Promise<void> => {
  const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
  const pending = images
    .filter(img => !img.complete)
    .map(img => new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    }));
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(pending),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ]);
};

export const TestPrintView: React.FC<TestPrintViewProps> = ({ test }) => {
  useEffect(() => {
    if (!test) return;
    let cancelled = false;
    // Auto-trigger the browser print dialog only after question images have
    // loaded (with a hard cap) — firing earlier printed blank/faint diagrams.
    const t = setTimeout(() => {
      void waitForImages().then(() => {
        if (!cancelled) window.print();
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [test]);

  if (!test) {
    return (
      <div className="print-error">
        <p>Unable to load the test for printing.</p>
        <button onClick={() => (window.location.href = '/')}>Back to Dashboard</button>
      </div>
    );
  }
  const formatDate = (date?: Date) =>
    date
      ? new Date(date).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  const correctOptionLetter = (question: Question): string => {
    const idx = question.correctAnswer;
    return idx >= 0 && idx < question.options.length
      ? optionLabel(idx)
      : '?';
  };

  return (
    <div className="print-view">
      {/* ===== Print header (always visible) ===== */}
      <header className="print-header">
        <div className="print-header-left">
          <FileText size={32} className="print-logo-icon" />
          <div>
            <h1 className="print-title">{test.title || test.name}</h1>
            <p className="print-meta">
{(test.questions?.length ?? 0)} questions · {formatDate(test.startDate)} start
              {test.endTime ? ` · closes ${formatDate(test.endTime)}` : ''}
            </p>
          </div>
        </div>
        <div className="print-header-right">
          <span className="print-code">Code: {test.testKey}</span>
        </div>
      </header>

      {/* ===== Question list ===== */}
      <main className="print-main">
        {(test.questions ?? []).map((question, qIndex) => (
          <article className="print-question" key={question.id}>
            <div className="print-question-header">
              <span className="print-question-number">Q{qIndex + 1}</span>
              <div className="print-question-meta">
                <span className="print-subject">{question.subject || 'General'}</span>
                <span className="print-divider">·</span>
                <span className="print-topic">{question.topic || 'Unspecified'}</span>
                {question.difficulty && (
                  <>
                    <span className="print-divider">·</span>
                    <span className="print-difficulty">{question.difficulty}</span>
                  </>
                )}
              </div>
            </div>

            <p className="print-question-text">{question.text}</p>

            {question.imageUrl && (
              <img
                src={question.imageUrl}
                alt={`Question ${qIndex + 1} diagram`}
                className="print-question-image"
              />
            )}

            <ul className="print-options">
              {question.options.map((option, oIndex) => {
                const isCorrect = oIndex === question.correctAnswer;
                return (
                  <li
                    key={`${question.id}-opt-${oIndex}`}
                    className={isCorrect ? 'print-option correct' : 'print-option'}
                  >
                    <span className="print-option-label">{optionLabel(oIndex)}</span>
                    <span className="print-option-text">{option}</span>
                    {isCorrect && (
                      <span className="print-correct-badge">
                        <HelpCircle size={14} />
                        Correct
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </main>

      {/* ===== Print footer with answer key ===== */}
      <footer className="print-footer">
        <h2 className="print-footer-title">Answer Key</h2>
        <div className="print-answer-key">
          {(test.questions ?? []).map((question, qIndex) => (
            <div className="print-answer-row" key={`key-${question.id}`}>
              <span className="print-answer-qnum">Q{qIndex + 1}</span>
              <span className="print-answer-letter">
                {correctOptionLetter(question)}
              </span>
            </div>
          ))}
        </div>
      </footer>

      {/* Manual retry-print button in case the auto-dialog is blocked */}
      <button
        type="button"
        className="print-manual-btn"
        onClick={() => window.print()}
        title="Print this test (Ctrl/Cmd+P)"
      >
        <Printer size={16} />
        Print
      </button>
    </div>
  );
};

/**
 * Wrapper that resolves the test from the URL `:testCode` parameter and
 * renders `TestPrintView` once loaded. Falls back to an inline error.
 */
export const TestPrintViewRoute: React.FC = () => {
  const { testCode } = useParams<{ testCode: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!testCode) return;
    getTestByKey(testCode.toUpperCase())
      .then((data) => {
        if (!data) {
          setError('Test not found.');
        } else {
          setTest(data);
        }
      })
      .catch(() => setError('Unable to load the test for printing.'));
  }, [testCode]);

  if (error) {
    return (
      <div className="print-error">
        <p>{error}</p>
        <button onClick={() => (window.location.href = '/')}>Back to Dashboard</button>
      </div>
    );
  }

  if (!test) {
    return <div className="print-loading">Loading test for printing…</div>;
  }

  return <TestPrintView test={test} />;
};

export default TestPrintView;
