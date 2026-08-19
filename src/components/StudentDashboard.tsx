import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentProfile, getTestsForBatch, getStudentResults, batchLeaderboard, getBatchById } from '../lib/database';
import { ProgressChart } from './ProgressChart';
import type { StudentIdentity, BatchRow } from '../lib/database';
import type { Test, TestResult } from '../types/exam.types';
import { BookOpen, BarChart3, Users, Percent, Loader2, RefreshCw, AlertCircle, Eye } from 'lucide-react';
import type { BatchLeaderboardEntry } from '../lib/database';
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
        const [assigned, prior] = await Promise.all([
          getTestsForBatch(profile.batchId),
          getStudentResults(profile.id),
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

  const percentile = (testId: string) => {
    const entry = leaderboardByTest[testId]?.find(e => e.studentId === me?.id);
    return entry ? Math.round(entry.percentage) : null;
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
          <div className="stat-value"><BarChart3 size={16} /><strong>{results.length}</strong></div>
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
          <div className="stat-value"><Users size={16} /><strong>{me.batchId ? (leaderboardByTest[results[0]?.testId ?? '']?.length ?? 0) : 0}</strong></div>
          <span className="stat-label">Batch peers</span>
        </div>
      </section>

      {/* Progress graph */}
      <section className="student-progress-card">
        <h2>Progress over time</h2>
        <ProgressChart results={results} />
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
                      <div className="student-test-percentile">vs batch: {pct}th percentile</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (t === 'available' || t === 'attempted' || t === 'expired') navigate(`/exam/${test.testKey}/entry`);
                    }}
                    disabled={t === 'upcoming'}
                    className="student-test-btn"
                  >
                    {attempted ? <Eye size={14} /> : null} {attempted ? 'Review' : 'Take test'}
                  </button>
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
