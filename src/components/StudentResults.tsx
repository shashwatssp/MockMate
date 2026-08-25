import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getStudentProfile,
  getStudentResults,
  getTestByKey,
} from '../lib/database';
import { getStudentSession, setStudentSession } from '../lib/studentSession';
import type { StudentIdentity } from '../lib/database';
import type { Question, Test, TestResult } from '../types/exam.types';
import {
  Loader2,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  CircleDashed,
} from 'lucide-react';
import ExplanationCard from './ExplanationCard';
import { generateSimplerExplanation, toExplanationInput } from '../lib/geminiDashboard';
import './StudentResults.css';

type AnswerFilter = 'all' | 'correct' | 'incorrect' | 'unanswered';

/** Null-safe seconds → "3m 42s". Legacy rows can carry undefined/NaN timeTaken;
 *  the old `Math.round(undefined / 60)` produced "NaNm". */
const formatTimeTaken = (seconds?: number): string => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
};

type QuestionOutcome = 'correct' | 'incorrect' | 'unanswered';

interface ReviewItem {
  question: Question;
  index: number;
  selectedOption: number | null;
  outcome: QuestionOutcome;
}

const FILTERS: Array<{ key: AnswerFilter; label: string }> = [
  { key: 'incorrect', label: 'Incorrect' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'correct', label: 'Correct' },
  { key: 'all', label: 'All' },
];

// Student-facing analysis of a previously submitted attempt: score hero,
// per-question review cards grouped by outcome, and a retry path back into
// the exam entry (the active-window rule is enforced by ExamWrapper).
export const StudentResults: React.FC = () => {
  const { testCode } = useParams<{ testCode: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [me, setMe] = useState<StudentIdentity | null>(getStudentSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simplerExplanations, setSimplerExplanations] = useState<Record<string, string>>({});
  // Students care most about what went wrong, so the review opens on Incorrect.
  const [filter, setFilter] = useState<AnswerFilter>('incorrect');

  const handleRegenerateSimpler = async (q: Question) => {
    if (!q.explanation || !q.text) return;
    const simpler = await generateSimplerExplanation(toExplanationInput(q));
    if (simpler) setSimplerExplanations(prev => ({ ...prev, [q.id]: simpler }));
  };

  useEffect(() => {
    const load = async () => {
      if (!testCode) return;
      setError(null);
      try {
        const profile = await getStudentProfile();
        if (!profile) { navigate('/student/login'); return; }
        setMe(profile); setStudentSession(profile);
        if (!profile.isApproved) { navigate('/student/dashboard'); return; }

        const t = await getTestByKey(testCode.toUpperCase());
        if (!t) throw new Error('Test not found');
        setTest(t);

        // Identity hints let persisted rows saved without a student_id
        // (older submissions) still match this student across devices.
        const allResults = await getStudentResults(profile.id, {
          studentEmail: profile.email,
          studentName: profile.name ?? undefined,
        });
        const match = allResults.find(r => r.testId === t.id);
        setResult(match ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testCode]);

  const reviewItems = useMemo<ReviewItem[]>(() => {
    if (!test || !result) return [];
    return test.questions.map((question, index) => {
      const ans = result.answers.find(a => a.questionId === question.id);
      const selected = ans?.selectedOption;
      const hasAnswer = typeof selected === 'number' && Number.isFinite(selected)
        && selected >= 0 && selected < question.options.length;
      const outcome: QuestionOutcome = !hasAnswer
        ? 'unanswered'
        : selected === question.correctAnswer ? 'correct' : 'incorrect';
      return {
        question,
        index,
        selectedOption: hasAnswer ? (selected as number) : null,
        outcome,
      };
    });
  }, [test, result]);

  const counts = useMemo(
    () => ({
      all: reviewItems.length,
      correct: reviewItems.filter(i => i.outcome === 'correct').length,
      incorrect: reviewItems.filter(i => i.outcome === 'incorrect').length,
      unanswered: reviewItems.filter(i => i.outcome === 'unanswered').length,
    }),
    [reviewItems],
  );

  // If the active filter has nothing to show (e.g. a perfect paper), fall back
  // to the most relevant non-empty bucket instead of an empty wall.
  useEffect(() => {
    if (!result || counts[filter] > 0) return;
    const fallback: AnswerFilter = counts.incorrect > 0
      ? 'incorrect'
      : counts.unanswered > 0
        ? 'unanswered'
        : counts.correct > 0 ? 'correct' : 'all';
    setFilter(fallback);
  }, [filter, counts, result]);

  if (loading) {
    return <div className="student-loading"><Loader2 className="animate-spin" /> Loading results…</div>;
  }

  if (!test || !me) {
    return (
      <div className="student-shell student-content">
        <button onClick={() => navigate('/student/dashboard')} className="student-btn-plain">← Back to dashboard</button>
        <div className="student-empty-state">
          <AlertCircle size={30} />
          <h2>Result not available</h2>
          <p>We couldn&apos;t find this test, or your session has expired. Try opening your dashboard again.</p>
          <button className="sr-primary-btn" onClick={() => navigate('/student/dashboard')}>Go to dashboard</button>
        </div>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, Math.round(result?.percentage ?? 0)));
  const ringTone = pct >= 75 ? 'is-good' : pct >= 40 ? 'is-ok' : 'is-poor';
  const visibleItems = filter === 'all'
    ? reviewItems
    : reviewItems.filter(item => item.outcome === filter);

  return (
    <div className="student-shell student-content">
      <button onClick={() => navigate('/student/dashboard')} className="student-btn-plain">← Back to dashboard</button>

      {error ? (
        <div className="student-error-inline" role="alert"><AlertCircle size={16} /> {error}</div>
      ) : null}

      {result ? (
        <>
          {/* ── Score hero ─────────────────────────────────────────── */}
          <section className="sr-hero" aria-label="Score summary">
            <div className="sr-hero-main">
              <div
                className={`sr-ring ${ringTone}`}
                style={{ '--ring-value': pct } as React.CSSProperties}
                role="img"
                aria-label={`Score ${pct} percent`}
              >
                <div className="sr-ring-inner">
                  <span className="sr-ring-pct">{pct}%</span>
                  <span className="sr-ring-label">score</span>
                </div>
              </div>
              <div className="sr-hero-meta">
                <h1>{test.name}</h1>
                <p className="sr-hero-sub">
                  You answered <b>{result.correctAnswers}</b> of <b>{result.totalQuestions}</b>{' '}
                  questions correctly
                  {result.totalMarks != null && (
                    <> · scored <b>{result.score}</b>/{result.totalMarks} marks</>
                  )}.
                  {result.isPractice ? ' Practice attempt — not counted in teacher reports.' : ''}
                </p>
                <div className="sr-chip-row">
                  <span className="sr-chip sr-chip-good"><CheckCircle2 size={14} /> {result.correctAnswers} correct</span>
                  <span className="sr-chip sr-chip-bad"><XCircle size={14} /> {result.incorrectAnswers} incorrect</span>
                  <span className="sr-chip sr-chip-skip"><CircleDashed size={14} /> {result.unansweredQuestions} unanswered</span>
                  <span className="sr-chip sr-chip-time">⏱ {formatTimeTaken(result.timeTaken)}</span>
                </div>
              </div>
            </div>
            <div className="sr-hero-actions">
              <button
                className="sr-primary-btn"
                onClick={() => navigate(`/exam/${test.testKey}/entry`)}
              >
                <RotateCcw size={15} /> Practise again
              </button>
            </div>
          </section>

          {/* ── Question review ────────────────────────────────────── */}
          <section className="sr-review" aria-label="Question-by-question review">
            <div className="sr-filter-bar" role="tablist" aria-label="Filter questions">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`sr-filter ${filter === f.key ? 'is-active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  <span className="sr-filter-count">{counts[f.key]}</span>
                </button>
              ))}
            </div>

            {visibleItems.length === 0 ? (
              <div className="student-empty-state">
                <CheckCircle2 size={26} />
                <p>Nothing here — no questions match this filter for this attempt.</p>
              </div>
            ) : (
              <div className="sr-question-list">
                {visibleItems.map(({ question, index, selectedOption, outcome }) => {
                  const tone = outcome === 'correct' ? 'good' : outcome === 'incorrect' ? 'bad' : 'skip';
                  const StatusIcon = outcome === 'correct'
                    ? CheckCircle2
                    : outcome === 'incorrect' ? XCircle : CircleDashed;
                  return (
                    <article key={question.id} className={`sr-question-card tone-${tone}`}>
                      <header className="sr-question-head">
                        <StatusIcon size={18} className="sr-status-icon" aria-hidden />
                        <span className="sr-question-num">Q{index + 1}</span>
                        <span className={`sr-question-outcome tone-${tone}`}>
                          {outcome === 'correct' ? 'Correct' : outcome === 'incorrect' ? 'Incorrect' : 'Unanswered'}
                        </span>
                      </header>

                      <p className="sr-question-text">{question.text}</p>

                      <div className="sr-option-list">
                        {question.options.map((optionText, optionIndex) => {
                          const isKey = optionIndex === question.correctAnswer;
                          const isPick = selectedOption === optionIndex;
                          const classes = ['sr-option'];
                          if (isKey) classes.push('is-key');
                          if (isPick && isKey) classes.push('is-pick-good');
                          else if (isPick) classes.push('is-pick-bad');
                          return (
                            <div key={optionIndex} className={classes.join(' ')}>
                              <span className="sr-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                              <span className="sr-option-text">{optionText}</span>
                              {isKey ? <span className="sr-option-flag flag-good">correct answer</span> : null}
                              {isPick && !isKey ? <span className="sr-option-flag flag-bad">your answer</span> : null}
                            </div>
                          );
                        })}
                      </div>

                      {outcome === 'unanswered' ? (
                        <p className="sr-skip-note">You left this question unanswered.</p>
                      ) : null}

                      <ExplanationCard
                        className="student-explanation"
                        explanation={simplerExplanations[question.id] ?? question.explanation}
                        onRegenerateSimpler={
                          question.explanation && question.text
                            ? () => handleRegenerateSimpler(question)
                            : undefined
                        }
                      />
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="student-empty-state">
          <CircleDashed size={28} />
          <h2>No attempt yet</h2>
          <p>You haven&apos;t attempted this test, so there&apos;s nothing to analyse yet. Start whenever you&apos;re ready.</p>
          <button className="sr-primary-btn" onClick={() => navigate(`/exam/${test.testKey}/entry`)}>
            Start this test
          </button>
        </div>
      )}
    </div>
  );
};

export default StudentResults;
