import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentProfile, getTestsForBatch, getStudentResults, batchLeaderboard, getBatchById, syncPendingLocalResults } from '../lib/database';
import { ProgressChart } from './ProgressChart';
import type { StudentIdentity, BatchRow } from '../lib/database';
import type { Test, TestResult } from '../types/exam.types';
import { BookOpen, BarChart3, Users, Percent, Loader2, RefreshCw, AlertCircle, Eye, Sparkles, RotateCcw } from 'lucide-react';
import type { BatchLeaderboardEntry } from '../lib/database';
import { explainStudentInsight } from '../lib/geminiDashboard';
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
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoaded, setInsightLoaded] = useState(false);

  const load = async () => {
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

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

  // Lazy, once-per-session load of the cached/fresh student insight nudge.
  useEffect(() => {
    if (!me || !me.id || !results.length || insightLoaded) return;
    setInsightLoaded(true);
    const context = { batchPercentile: studentPercentile, ...bestTopicInfo };
    void explainStudentInsight(me.id, results, context)
      .then((insight) => setInsight(insight))
      .catch(() => setInsight(null));
  }, [me, results.length, insightLoaded, studentPercentile, bestTopicInfo]);

  if (loading) {
    return <div className="student-loading"><Loader2 className="animate-spin" /> Loading dashboard…</div>;
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
        ) : null}
      </section>

      {/* Assigned tests */}
      <section className="student-tests-section">
        <h2>Your tests</h2>
        {tests.length === 0 ? (
          <p className="student-empty-text">No tests have been assigned to your batch yet.</p>
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
                      navigate(`/exam/${test.testKey}/entry`);
                    }}
                    disabled={t === 'upcoming'}
                    className="student-test-btn"
                  >
                    {attempted ? <Eye size={14} /> : null} {attempted ? 'Review' : 'Take test'}
                  </button>
                  {attempted && t !== 'upcoming' && (
                    <button
                      onClick={() => navigate(`/exam/${test.testKey}/entry?practice=1`)}
                      className="student-test-btn student-practice-btn"
                      title="Retake this test in Practice Mode — your score is shown to you but never saved for credit"
                    >
                      <RotateCcw size={14} /> Practice
                    </button>
                  )}
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
