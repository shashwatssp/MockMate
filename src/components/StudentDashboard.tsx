import { toErrorMessage } from '../lib/errors';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentProfile, getTestsForBatch, getStudentResults, getStudentAttemptCountsByTest, batchLeaderboard, getBatchById, syncPendingLocalResults } from '../lib/database';
import { ProgressChart } from './ProgressChart';
import type { StudentIdentity, BatchRow } from '../lib/database';
import type { Test, TestResult } from '../types/exam.types';
import { BookOpen, BarChart3, Users, Percent, RefreshCw, AlertCircle, Eye, Sparkles, RotateCcw } from 'lucide-react';
import { Skeleton, SkeletonList, SkeletonStats } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ThemeToggle } from './ThemeToggle';
import type { BatchLeaderboardEntry } from '../lib/database';
import { explainStudentInsight, hasGeminiKey } from '../lib/geminiDashboard';
import './StudentDashboard.css';

interface Props {
  batch: BatchRow | null;
}

export const StudentDashboard: React.FC<Props> = ({ batch: initialBatch }) => {
  const navigate = useNavigate();
  const [me, setMe] = useState<StudentIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<Test[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [batch, setBatch] = useState<BatchRow | null>(initialBatch);
  const [leaderboardByTest, setLeaderboardByTest] = useState<Record<string, BatchLeaderboardEntry[]>>({});
  // Attempts used per test — decides Retake (credited) vs Practice (unsaved).
  const [attemptsByTest, setAttemptsByTest] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightRequested, setInsightRequested] = useState(false);
  // True when the last request came back empty (no key / API failure) — without
  // this the button just appeared to do nothing.
  const [insightFailed, setInsightFailed] = useState(false);

  // Stable identity (only navigate) so the mount effect can depend on it
  // without re-firing, while remaining a valid exhaustive-deps member.
  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await getStudentProfile();
      if (!profile) {
        // Not logged in -> back to login.
        navigate('/student/login');
        return;
      }
      if (!profile.isApproved) {
        // Awaiting teacher approval still shows here.
        setMe(profile);
        setBatch(null);
        setTests([]);
        setResults([]);
        setLoading(false);
        return;
      }
      setMe(profile);
      setBatch(null);
      if (profile.batchId) {
        try {
          const b = await getBatchById(profile.batchId);
          setBatch(b);
        } catch {
          /* batch not found — fall back to id display */
        }
        const hints = {
          studentEmail: profile.email,
          studentName: profile.name ?? undefined,
        };
        // Self-heal first: push any attempts stuck in device storage (offline
        // submits, historical save failures) up to test_results so the teacher
        // sees them and cross-device reads agree.
        await syncPendingLocalResults(profile.id, hints);
        const [assigned, prior] = await Promise.all([
          getTestsForBatch(profile.batchId),
          // Identity hints let persisted rows saved without a student_id
          // (older submissions) still match this student across devices.
          getStudentResults(profile.id, hints),
        ]);
        setTests(assigned);
        setResults(prior);
        // Per-test attempt counts power the Retake vs Practice split (§3.5).
        getStudentAttemptCountsByTest(profile.id, {
          studentEmail: profile.email,
          studentName: profile.name ?? undefined,
        })
          .then(counts => setAttemptsByTest(counts))
          .catch(() => setAttemptsByTest({}));
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  // True batch percentile (rank-derived standing), not the raw score %.
  const percentile = (testId: string) => {
    const entry = leaderboardByTest[testId]?.find(e => e.studentId === me?.id);
    return entry ? entry.percentile : null;
  };

  /** English ordinal suffix: 1st, 2nd, 3rd, 4th… 11th/12th/13th stay -th. */
  const ordinalSuffix = (value: number): string => {
    if (!Number.isFinite(value)) return 'th';
    const remainder100 = Math.abs(Math.trunc(value)) % 100;
    if (remainder100 >= 11 && remainder100 <= 13) return 'th';
    switch (Math.abs(Math.trunc(value)) % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // Rank of the student's best attempt within the batch leaderboard.
  const batchRank = (testId: string) => {
    const entry = leaderboardByTest[testId]?.find(e => e.studentId === me?.id);
    return entry ? entry.rank : null;
  };

  const attemptedTestIds = useMemo(() => new Set(results.map(r => r.testId)), [results]);

  const statusFor = (test: Test) => {
    const start = test.startDate ? new Date(test.startDate).getTime() : null;
    const end = test.endTime ? new Date(test.endTime).getTime()
      : test.endDate ? new Date(test.endDate).getTime() : null;
    const now = Date.now();
    if (end && now > end) return 'expired';
    if (attemptedTestIds.has(test.id)) return 'attempted';
    if (start && now < start) return 'upcoming';
    return 'available';
  };

  // Best-topic + batch-percentile context for the student insight.
  const questionsByTest = useMemo(() => {
    const map = new Map<string, Test['questions']>();
    tests.forEach((t) => map.set(t.id, t.questions));
    return map;
  }, [tests]);

  const bestTopicInfo = useMemo(() => {
    if (!results.length) return undefined;
    const topicStats = new Map<string, { correct: number; total: number }>();
    results.forEach((r) => {
      const questions = questionsByTest.get(r.testId);
      if (!questions) return;
      const answered = r.answers.filter((a) => a.selectedOption >= 0);
      answered.forEach((a) => {
        const q = questions.find((qq) => qq.id === a.questionId);
        if (!q || !q.topic) return;
        const stat = topicStats.get(q.topic) ?? { correct: 0, total: 0 };
        stat.total += 1;
        if (a.selectedOption === q.correctAnswer) stat.correct += 1;
        topicStats.set(q.topic, stat);
      });
    });
    let bestTopic: string | undefined;
    let bestAccuracy = 0;
    topicStats.forEach((stat, topic) => {
      if (stat.total === 0) return;
      const acc = stat.correct / stat.total;
      if (acc > bestAccuracy) { bestAccuracy = acc; bestTopic = topic; }
    });
    return bestTopic ? { bestTopic, bestTopicAccuracy: bestAccuracy } : undefined;
  }, [results, questionsByTest]);

  // Batch percentile for the student's latest result (rank-derived standing).
  const studentPercentile = useMemo(() => {
    if (!me?.id || !results.length) return undefined;
    const latestTestId = results[0]?.testId;
    if (!latestTestId) return undefined;
    const entry = leaderboardByTest[latestTestId]?.find((e) => e.studentId === me.id);
    return entry ? entry.percentile : undefined;
  }, [me, results, leaderboardByTest]);

  useEffect(() => {
    if (!me || !me.id || !me.batchId) return;
    const batchId = me.batchId;
    // Warm leaderboards only for attempted tests.
    const fetch = async () => {
      const acc: Record<string, BatchLeaderboardEntry[]> = {};
      await Promise.all(
        results
          .filter(r => r.testId)
          .map(async r => {
            if (!acc[r.testId]) {
              try { acc[r.testId] = await batchLeaderboard(r.testId, batchId); } catch { acc[r.testId] = []; }
            }
          }),
      );
      setLeaderboardByTest(acc);
    };
    void fetch();
  }, [me, results]);

  // AI insight is OPT-IN (§4.4): no Gemini call fires until the student asks
  // for it. The old behavior spent tokens (and shared API quota) on every
  // dashboard load whether the student wanted it or not.
  const requestInsight = () => {
    if (!me || !me.id || !results.length || insightLoading) return;
    setInsightRequested(true);
    setInsightLoading(true);
    setInsightFailed(false);
    const context = { batchPercentile: studentPercentile, ...bestTopicInfo };
    void explainStudentInsight(me.id, results, context)
      .then((value) => {
        setInsight(value);
        if (!value) setInsightFailed(true);
      })
      .catch(() => {
        setInsight(null);
        setInsightFailed(true);
      })
      .finally(() => setInsightLoading(false));
  };

  if (loading) {
    return (
      <div className="student-shell student-content" role="status" aria-busy="true">
        <span className="skel-sr">Loading dashboard…</span>
        <SkeletonStats count={4} />
        <div className="skeleton-card skel-progress">
          <Skeleton className="skeleton-line" style={{ width: '40%', height: 18 }} />
          <Skeleton style={{ width: '100%', height: 120 }} />
        </div>
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (!me) {
    return null;
  }

  if (!me.isApproved) {
    return (
      <div className="student-shell">
        <div className="student-awaiting">
          <BookOpen size={40} className="awaiting-icon" />
          <h2>Awaiting approval</h2>
          <p className="student-awaiting-text">Your teacher will approve your account before you can see tests and analytics.</p>
          <button onClick={load} className="student-btn-primary" style={{ marginTop: '1rem' }}>
            <RefreshCw size={14} /> Check again
          </button>
        </div>
      </div>
    );
  }

  const lastScore = results.length ? results[0] : null;

  return (
    <div className="student-shell student-content">
      <header className="student-page-header">
        <div>
          <h1 className="student-header-title">Welcome, {me.name ?? me.username ?? me.email}</h1>
          <p className="student-muted">
            {batch ? `${batch.name} (${batch.code})` : me.batchId ? `Batch ID: ${me.batchId.slice(0, 8)}…` : '—'}
          </p>
        </div>
        <div className="student-header-actions">
          <ThemeToggle />
          <button onClick={load} className="student-btn-plain">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => navigate('/student/profile')} className="student-btn-plain">Profile</button>
        </div>
      </header>

      {error ? (
        <div className="student-error-inline"><AlertCircle /> {error}</div>
      ) : null}

      {/* Vs peers summary */}
      <section className="student-stats-summary">
        <div className="student-stat-card">
          <div className="stat-value"><BookOpen size={16} /><strong>{tests.length}</strong></div>
          <span className="stat-label">Assigned tests</span>
        </div>
        <div className="student-stat-card">
          {/* Count only attempts for currently-assigned tests so the number can
              never exceed "Assigned tests" (legacy/orphan attempts excluded). */}
          <div className="stat-value"><BarChart3 size={16} /><strong>{tests.filter(t => attemptedTestIds.has(t.id)).length}</strong></div>
          <span className="stat-label">Tests attempted</span>
        </div>
        <div className="student-stat-card">
          <div className="stat-value">
            <Percent size={16} />
            <strong>{lastScore ? `${lastScore.percentage}%` : '—'}</strong>
          </div>
          <span className="stat-label">Last score</span>
        </div>
        <div className="student-stat-card">
          <div className="stat-value"><Users size={16} /><strong>{lastScore ? (batchRank(lastScore.testId) ?? '—') : '—'}</strong></div>
          <span className="stat-label">Batch rank (latest)</span>
        </div>
      </section>

      {/* Progress graph */}
      <section className="student-progress-card">
        <h2>Progress over time</h2>
        <ProgressChart results={results} />
        {insight ? (
          <div className="student-insight-nudge">
            <Sparkles size={14} className="student-insight-icon" />
            <span>{insight}</span>
          </div>
        ) : results.length > 0 && !hasGeminiKey() ? (
          <p className="student-muted student-insight-disabled">
            AI study tips aren't enabled yet — a Gemini API key (VITE_GEMINI_API_KEY) is needed on the server.
          </p>
        ) : results.length > 0 ? (
          <div className="student-insight-optin">
            {insightFailed ? (
              <p className="student-muted">Couldn't generate a tip right now — try again in a moment.</p>
            ) : null}
            <button
              onClick={requestInsight}
              disabled={insightLoading}
              className="student-btn-plain"
              title="Optional: generate a short AI tip from your results"
            >
              <Sparkles size={14} />
              {insightLoading ? 'Thinking…' : insightRequested ? 'Retry AI tip' : 'Get an AI study tip'}
            </button>
          </div>
        ) : null}
      </section>

      {/* Assigned tests */}
      <section className="student-tests-section">
        <h2>Your tests</h2>
        {tests.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No tests yet"
            description="Nothing has been assigned to your batch yet. Check back once your teacher schedules a test."
          />
        ) : (
          <div className="student-test-list">
            {tests.map(test => {
              const t = statusFor(test);
              const attempted = attemptedTestIds.has(test.id);
              const last = results.find(r => r.testId === test.id);
              const pct = last ? percentile(test.id) : null;
              const StatusIcon = t === 'available' ? 'student-status-available' : t === 'upcoming' ? 'student-status-upcoming' : t === 'attempted' ? 'student-status-attempted' : 'student-status-expired';
              return (
                <div key={test.id} className="student-test-item">
                  <div>
                    <div className="student-test-name">{test.name}</div>
                    <div className="student-test-info">
                      Code {test.testKey} · {test.questions.length} questions · {test.duration || test.timeLimit} min
                    </div>
                  </div>
                  <div className="student-test-meta">
                    <span className={`student-test-status ${StatusIcon}`}>{t}</span>
                    {last ? <div className="student-test-score">Score: {last.score}/{last.totalMarks ?? last.totalQuestions} · {last.percentage}%</div> : null}
                    {attempted && pct !== null && pct > -1 && (
                      <div className="student-test-percentile">vs batch: {pct}{ordinalSuffix(pct)} percentile</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (t === 'upcoming') return;
                      // Review must open the saved result, not re-enter the exam
                      // flow (which ExamWrapper would downgrade to practice mode).
                      if (attempted) {
                        navigate(`/student/results/${test.testKey}`);
                        return;
                      }
                      // Expired and never attempted: practice is the only option.
                      navigate(`/exam/${test.testKey}/entry${t === 'expired' ? '?practice=1' : ''}`);
                    }}
                    disabled={t === 'upcoming'}
                    className="student-test-btn"
                  >
                    {attempted
                      ? <Eye size={14} /> : t === 'expired'
                        ? <RotateCcw size={14} /> : null}
                    {' '}
                    {attempted ? 'Review' : t === 'expired' ? 'Practice' : 'Take test'}
                  </button>
                  {attempted && t !== 'upcoming' && t !== 'expired' && (() => {
                    const used = attemptsByTest[test.id] ?? 1;
                    const max = Math.max(1, test.maxAttempts ?? test.settings?.maxAttempts ?? 1);
                    // Attempts left in the allowance → a credited retake;
                    // allowance used up → the unsaved Practice button (§3.5).
                    if (used < max) {
                      return (
                        <button
                          onClick={() => navigate(`/exam/${test.testKey}/entry`)}
                          className="student-test-btn student-practice-btn"
                          title={`Retake this test — attempt ${used + 1} of ${max}, saved for credit`}
                        >
                          <RotateCcw size={14} /> Retake ({max - used} left)
                        </button>
                      );
                    }
                    return (
                      <button
                        onClick={() => navigate(`/exam/${test.testKey}/entry?practice=1`)}
                        className="student-test-btn student-practice-btn"
                        title="Retake this test in Practice Mode — your score is shown to you but never saved for credit"
                      >
                        <RotateCcw size={14} /> Practice
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default StudentDashboard;
