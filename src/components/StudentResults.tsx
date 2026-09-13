import { toErrorMessage } from '../lib/errors';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getStudentProfile,
  getStudentResults,
  getStudentResultsForTest,
  getTestByKey,
} from '../lib/database';
import { getStudentSession, setStudentSession } from '../lib/studentSession';
import type { StudentIdentity } from '../lib/database';
import type { Question, Test, TestResult } from '../types/exam.types';
import {
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  CircleDashed,
} from 'lucide-react';
import { Skeleton, SkeletonList } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ProgressChart } from './ProgressChart';
import ExplanationCard from './ExplanationCard';
import { LatexText } from './LatexText';
import { generateSimplerExplanation, toExplanationInput } from '../lib/geminiDashboard';
import { resolvePassingScore } from '../lib/score';
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
  // Every scored attempt for this test, newest first (§3.5 history chart).
  const [attemptHistory, setAttemptHistory] = useState<TestResult[]>([]);

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
        setError(toErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testCode]);

  // Load the full attempt history for this test once the identity is known.
  useEffect(() => {
    if (!test || !me) return;
    let cancelled = false;
    void getStudentResultsForTest(me.id, test.id, {
      studentEmail: me.email,
      studentName: me.name ?? undefined,
    })
      .then(rows => { if (!cancelled) setAttemptHistory(rows); })
      .catch(() => { if (!cancelled) setAttemptHistory([]); });
    return () => { cancelled = true; };
  }, [test, me]);

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

  // Topic buckets for this attempt (report card §3.1): per-topic accuracy
  // recomputed from the test's questions + saved answers, weakest first.
  // The DB stores raw answers only, so this is derived at view time — the
  // same computation ExamWrapper performs when a live attempt finishes.
  const topicBuckets = useMemo(() => {
    if (!test || !result) return [];
    const buckets = new Map<string, { correct: number; total: number }>();
    test.questions.forEach(question => {
      const topic = question.topic || 'General';
      if (!buckets.has(topic)) buckets.set(topic, { correct: 0, total: 0 });
      const bucket = buckets.get(topic)!;
      bucket.total += 1;
      const answer = result.answers.find(a => a.questionId === question.id);
      if (
        answer &&
        answer.selectedOption >= 0 &&
        answer.selectedOption === question.correctAnswer
      ) {
        bucket.correct += 1;
      }
    });
    return Array.from(buckets.entries())
      .map(([topic, { correct, total }]) => ({
        topic,
        correct,
        total,
        pct: total > 0 ? Math.round((correct / total) * 100) : 0,
      }))
      .sort((a, b) => a.pct - b.pct || b.total - a.total);
  }, [test, result]);

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
    return (
      <div className="student-shell student-content" role="status" aria-busy="true">
        <span className="skel-sr">Loading results…</span>
        <div className="skeleton-card skel-results-hero">
          <Skeleton className="skel-ring" />
          <div className="skel-results-lines">
            <Skeleton className="skeleton-line" style={{ width: '55%', height: 22 }} />
            <Skeleton className="skeleton-line skeleton-line-thin" style={{ width: '85%' }} />
            <Skeleton className="skeleton-line skeleton-line-thin" style={{ width: '72%' }} />
          </div>
        </div>
        <div className="skel-filter-row" aria-hidden="true">
          {['Incorrect', 'Unanswered', 'Correct', 'All'].map(label => (
            <Skeleton key={label} className="skel-pill" />
          ))}
        </div>
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!test || !me) {
    return (
      <div className="student-shell student-content">
        <button onClick={() => navigate('/student/dashboard')} className="student-btn-plain">← Back to dashboard</button>
        <EmptyState
          icon={AlertCircle}
          title="Result not available"
          description="We couldn't find this test, or your session has expired. Try opening your dashboard again."
          actionLabel="Go to dashboard"
          onAction={() => navigate('/student/dashboard')}
        />
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, Math.round(result?.percentage ?? 0)));
  const ringTone = pct >= 75 ? 'is-good' : pct >= 40 ? 'is-ok' : 'is-poor';
  const bestPct = attemptHistory.reduce((best, a) => Math.max(best, a.percentage), 0);
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
                  )}{' '}
                  · pass mark {resolvePassingScore(test.passingScore)}%
                  {result.isPractice ? ' Practice attempt — not counted in teacher reports.' : ''}
                </p>
                <div className="sr-chip-row">
                  {result.passed != null ? (
                    <span className={`sr-chip ${result.passed ? 'sr-chip-verdict-good' : 'sr-chip-verdict-bad'}`}>
                      {result.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {result.passed ? 'Passed' : 'Not passed'} · Grade {result.grade ?? '—'}
                    </span>
                  ) : null}
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

          {/* ── What to practise next (topic buckets, weakest first) ─ */}
          {topicBuckets.length > 0 ? (
            <section className="sr-topics" aria-label="Topic performance and practice suggestions">
              <h2>What to practise next</h2>
              <div className="sr-topic-list">
                {topicBuckets.map(bucket => {
                  const tone = bucket.pct >= 75 ? 'good' : bucket.pct >= 40 ? 'ok' : 'poor';
                  return (
                    <div key={bucket.topic} className={`sr-topic tone-${tone}`}>
                      <div className="sr-topic-head">
                        <span className="sr-topic-name">{bucket.topic}</span>
                        <span className="sr-topic-score">{bucket.correct}/{bucket.total} · {bucket.pct}%</span>
                      </div>
                      <div
                        className="sr-topic-bar"
                        role="img"
                        aria-label={`${bucket.pct} percent accuracy on ${bucket.topic}`}
                      >
                        <span className="sr-topic-fill" style={{ width: `${bucket.pct}%` }} />
                      </div>
                      <p className="sr-topic-tip">
                        {bucket.pct >= 100
                          ? 'Full marks on this topic — keep it up.'
                          : tone === 'good'
                            ? 'Nearly there — review the missed questions below.'
                            : tone === 'ok'
                              ? 'Focus revision here before your next test.'
                              : 'Priority topic — rebuild the basics, then retry the questions below.'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ── Attempt history (§3.5) ───────────────────────────── */}
          {attemptHistory.length > 1 ? (
            <section className="sr-history" aria-label="Attempt history and improvement over time">
              <h2>
                Attempt history
                {test.maxAttempts != null && test.maxAttempts > 1
                  ? ` · ${attemptHistory.length} of ${test.maxAttempts} used`
                  : ` · ${attemptHistory.length} attempts`}
              </h2>
              <ProgressChart results={attemptHistory} height={140} />
              <div className="sr-attempt-chips">
                {attemptHistory.map((attempt, i) => {
                  const isBest = attempt.percentage === bestPct;
                  return (
                    <span
                      key={attempt.id ?? `${attempt.completedAt}-${i}`}
                      className={`sr-attempt-chip ${isBest ? 'is-best' : ''}`}
                    >
                      #{attemptHistory.length - i} · {attempt.percentage}%{isBest ? ' · best' : ''}
                    </span>
                  );
                })}
              </div>
            </section>
          ) : null}

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
              <EmptyState
                variant="compact"
                icon={CheckCircle2}
                title="Nothing here"
                description="No questions match this filter for this attempt."
              />
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

                      <p className="sr-question-text"><LatexText text={question.text} /></p>

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
                              <span className="sr-option-text"><LatexText text={optionText} /></span>
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
        <EmptyState
          icon={CircleDashed}
          title="No attempt yet"
          description="You haven't attempted this test, so there's nothing to analyse yet. Start whenever you're ready."
          actionLabel="Start this test"
          onAction={() => navigate(`/exam/${test.testKey}/entry`)}
        />
      )}
    </div>
  );
};

export default StudentResults;
