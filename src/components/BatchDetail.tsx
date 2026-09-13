import { toErrorMessage } from '../lib/errors';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getBatchByCode, getPendingEnrollments, getStudentsInBatch,
  approveBatchEnrollment, rejectBatchEnrollment, moveStudent, removeStudentFromBatch,
  getTestsForBatch, getBatchesForTest, setTestBatches,
  createBatchEnrollment, batchLeaderboard, getBatchesForTeacher,
  getStudentResults,
} from '../lib/database';
import { getTeacherSession, assignCompetitionRanks } from '../lib/localAuth';
import { toTeacherUuid } from '../lib/database';
import type { BatchRow, StudentRow, BatchLeaderboardEntry, EnrollmentRow } from '../lib/database';
import type { Test, TestResult } from '../types/exam.types';
import {
  Users, Check, X, RefreshCw, Loader2, AlertCircle, Share2, Trash2, Mail,
  Trophy, Medal, Award, FileText, Clock, BarChart3, Target, Link2, Printer,
  UserPlus, TrendingDown, TrendingUp, Download, Pencil, Eye,
} from 'lucide-react';
import { resolvePassingScore } from '../lib/score';
import { downloadCsv } from '../lib/csv';
import { formatCompletedAt } from '../lib/dateTime';
import { ProgressChart } from './ProgressChart';
import { SkeletonList, SkeletonStats } from './Skeleton';
import { EmptyState } from './EmptyState';
import './BatchDetail.css';

type Tab = 'members' | 'pending' | 'tests' | 'results';

/** Minimal identity slice the student-detail modal needs; lets member rows
 *  (plain StudentRow) open the same modal as full leaderboard entries. */
type StudentRef = Pick<BatchLeaderboardEntry, 'studentId' | 'email' | 'username' | 'name'>;

/** Aggregated ranking row: a leaderboard entry enriched with the number of
 *  tests the student attempted and the improvement delta (latest test % minus
 *  first test %, chronological — null when there is only one data point). */
type RankingEntry = BatchLeaderboardEntry & { attempts: number; improvement: number | null };

export const BatchDetail: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [members, setMembers] = useState<StudentRow[]>([]);
  const [pending, setPending] = useState<EnrollmentRow[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [teacherBatches, setTeacherBatches] = useState<BatchRow[]>([]);
  const [tab, setTab] = useState<Tab>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [newEmail, setNewEmail] = useState('');
  const [resultsLoading, setResultsLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<string, BatchLeaderboardEntry[]>>({});
  // Per-test summary stats for the Tests tab (attempt counts + averages).
  const [testStats, setTestStats] = useState<Record<string, { attempts: number; avgPct: number | null; top: number | null; low: number | null }>>({});
  const [statsLoaded, setStatsLoaded] = useState(false);
  // Which other batches each test is assigned to (Tests tab chips).
  const [batchesByTest, setBatchesByTest] = useState<Record<string, BatchRow[]>>({});
  // Assign-to-batch modal state: open when set to a test id.
  const [assigningTestId, setAssigningTestId] = useState<string | null>(null);
  const [assignSelection, setAssignSelection] = useState<Record<string, boolean>>({});
  // Weakest-students controls for the Class Rankings card (§3.3).
  const [rankingsMode, setRankingsMode] = useState<'top' | 'weak'>('top');
  const [strugglingOnly, setStrugglingOnly] = useState(false);
  // Results auto-load + aggregated rankings (Results tab).
  const [resultsLoaded, setResultsLoaded] = useState(false);
  const [studentDetailEntry, setStudentDetailEntry] = useState<StudentRef | null>(null);
  const [studentDetailResults, setStudentDetailResults] = useState<TestResult[]>([]);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  // Members tab: which member row has its edit (pencil) panel expanded —
  // accordion pattern, only one row open at a time.
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  // useCallback so the effects below can list it as a dependency without
  // re-running on every render (identity only changes when `code` does).
  const loadBatch = useCallback(async () => {
    if (!code) return;
    setError(null); setLoading(true);
    try {
      const teacher = getTeacherSession();
      if (!teacher) { navigate('/login'); return; }
      const b = await getBatchByCode(code.toUpperCase());
      if (!b) throw new Error('Batch not found');
      if (b.teacher_id !== toTeacherUuid(teacher.id)) throw new Error('You do not manage this batch');
      setBatch(b); setTeacherId(teacher.id);
      const [mb, pe, ts, tb] = await Promise.all([
        getStudentsInBatch(b.id),
        getPendingEnrollments(b.id),
        getTestsForBatch(b.id),
        getBatchesForTeacher(),
      ]);
      setMembers(mb); setPending(pe); setTests(ts); setTeacherBatches(tb);
      setStatsLoaded(false);
      setResultsLoaded(false);
      setBatchResults({})
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [code, navigate]);

  useEffect(() => { void loadBatch(); }, [loadBatch]);

  // Tests tab data: attempt stats + which batches share each test. Loaded once
  // per visit so opening the tab is instant on repeat navigations.
  useEffect(() => {
    if (!batch || !tests.length || statsLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const [statsEntries, batchEntries] = await Promise.all([
          Promise.all(tests.map(async t => {
            try {
              const entries = await batchLeaderboard(t.id, batch.id);
              const pcts = entries.map(e => e.percentage);
              return [t.id, {
                attempts: entries.length,
                avgPct: pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null,
                top: pcts.length ? Math.max(...pcts) : null,
                low: pcts.length ? Math.min(...pcts) : null,
              }] as const;
            } catch {
              return [t.id, { attempts: 0, avgPct: null, top: null, low: null }] as const;
            }
          })),
          Promise.all(tests.map(async t => {
            try {
              const rows = await getBatchesForTest(t.id);
              return [t.id, rows] as const;
            } catch {
              return [t.id, []] as const;
            }
          })),
        ]);
        if (cancelled) return;
        setTestStats(Object.fromEntries(statsEntries));
        setBatchesByTest(Object.fromEntries(batchEntries));
        setStatsLoaded(true);
      } catch {
        if (!cancelled) setStatsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [batch, tests, statsLoaded]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setActing(a => ({ ...a, [key]: true }));
    try { await fn(); } catch (err) { setError(toErrorMessage(err)); }
    finally { setActing(a => { const n = { ...a }; delete n[key]; return n; }); }
  };

  const approve = async (enrollmentId: string) => {
    if (!teacherId) return;
    await run(`approve-${enrollmentId}`, async () => {
      await approveBatchEnrollment(enrollmentId);
      await loadBatch();
    });
  };
  const reject = async (enrollmentId: string) => {
    if (!teacherId) return;
    await run(`reject-${enrollmentId}`, async () => {
      await rejectBatchEnrollment(enrollmentId);
      await loadBatch();
    });
  };
  const moveTo = async (studentId: string, newBatchId: string) => {
    if (!teacherId) return;
    if (!newBatchId) return;
    await run(`move-${studentId}`, async () => {
      await moveStudent(studentId, newBatchId);
      await loadBatch();
    });
  };
  const reassignTest = async (testId: string, batchIds: string[]) => {
    await run(`test-${testId}`, async () => {
      await setTestBatches(testId, batchIds);
      // Refresh the shared-batch chips without a full-screen reload.
      try {
        const rows = await getBatchesForTest(testId);
        setBatchesByTest(prev => ({ ...prev, [testId]: rows }));
      } catch { /* keep previous chips */ }
    });
  };

  /** Open the assign modal pre-checked with every batch currently linked. */
  const openAssignModal = async (testId: string) => {
    setAssigningTestId(testId);
    let current: string[] = [];
    try {
      current = (batchesByTest[testId] ?? []).map(b => b.id);
    } catch { /* default to empty */ }
    const next: Record<string, boolean> = {};
    for (const b of teacherBatches) next[b.id] = current.includes(b.id);
    setAssignSelection(next);
  };

  const confirmAssign = async () => {
    if (!assigningTestId) return;
    const selected = Object.entries(assignSelection).filter(([, on]) => on).map(([id]) => id);
    await reassignTest(assigningTestId, selected);
    setAssigningTestId(null);
  };

  const assigningTest = tests.find(t => t.id === assigningTestId) ?? null;

  const removeMember = async (studentId: string) => {
    if (!teacherId) return;
    if (!window.confirm('Remove this student from the batch? They will no longer be able to see batch tests or dashboard until re-added.')) return;
    await run(`remove-${studentId}`, async () => {
      await removeStudentFromBatch(studentId);
      await loadBatch();
    });
  };

  const addMemberByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batch) return;
    await run('add-email', async () => {
      await createBatchEnrollment({ email: newEmail.trim(), batchCode: batch.code });
      setNewEmail('');
      await loadBatch();
    });
  };

  // Load leaderboards for all batch tests (lazy – triggered when Results tab
  // opens). useCallback keeps a stable identity for the auto-load effect.
  const loadAllResults = useCallback(async () => {
    if (!batch) return;
    setResultsLoading(true);
    try {
      const results: Record<string, BatchLeaderboardEntry[]> = {};
      for (const t of tests) {
        try {
      results[t.id] = await batchLeaderboard(t.id, batch.id);
        } catch {
          results[t.id] = [];
        }
      }
      setBatchResults(results);
    } catch {
      // best-effort; individual test failures are empty arrays
    } finally {
      setResultsLoading(false);
    }
  }, [batch, tests]);

  // Auto-load all test results when the Results tab becomes active, so the
  // teacher never has to click "Load All Results" manually. Defined after
  // loadAllResults so the dep array can reference its stable identity.
  useEffect(() => {
    if (tab === 'results' && tests.length > 0 && !resultsLoaded) {
      setResultsLoaded(true);
      void loadAllResults();
    }
  }, [tab, tests.length, resultsLoaded, loadAllResults]);

  // Aggregated class ranking: merge all per-test leaderboards into one overall
  // ranking based on each student's best percentage across every test.
  const batchRankings = useMemo<RankingEntry[]>(() => {
    if (Object.keys(batchResults).length === 0) return [];
    const bestByStudent = new Map<string, BatchLeaderboardEntry>();
    // Chronological attempt timeline per student (best % per test, ordered by
    // completion time) powers the improvement-since-first-attempt indicator.
    const timelineByStudent = new Map<string, { pct: number; at: string }[]>();
    for (const entries of Object.values(batchResults)) {
      for (const entry of entries) {
        const key = entry.studentId ?? entry.email;
        const existing = bestByStudent.get(key);
        if (!existing || entry.percentage > existing.percentage) {
          bestByStudent.set(key, { ...entry });
        }
        const timeline = timelineByStudent.get(key) ?? [];
        timeline.push({ pct: entry.percentage, at: entry.completedAt });
        timelineByStudent.set(key, timeline);
      }
    }
    const sorted = Array.from(bestByStudent.values()).sort(
      (a, b) => b.percentage - a.percentage || a.completedAt.localeCompare(b.completedAt),
    );
    return assignCompetitionRanks(sorted).map(entry => {
      const key = entry.studentId ?? entry.email;
      const timeline = (timelineByStudent.get(key) ?? []).sort((a, b) => a.at.localeCompare(b.at));
      const improvement = timeline.length >= 2
        ? timeline[timeline.length - 1].pct - timeline[0].pct
        : null;
      return { ...entry, attempts: timeline.length, improvement };
    });
  }, [batchResults]);

  // Pass mark for the "below pass mark only" filter — the batch's first
  // test's pass mark if configured, else the shared default (§3.3).
  const rankingsPassMark = resolvePassingScore(tests[0]?.passingScore);

  // Rankings CSV export (§5.1) — respects the active filter/sort.
  const exportRankings = () => {
    if (!batch) return;
    downloadCsv(
      `batch-${batch.code}-rankings.csv`,
      displayRankings.map(entry => ({
        Rank: entry.rank,
        Student: entry.name || entry.username || entry.email,
        'Best %': entry.percentage,
        Percentile: entry.percentile,
        Tests: entry.attempts,
        Change: entry.improvement == null ? '' : entry.improvement,
        Completed: formatCompletedAt(entry.completedAt, ''),
      })),
    );
  };

  // The rankings list as filtered/ordered by the weakest-students controls.
  // Entry.rank keeps the real competition rank, so rows stay labelled with
  // their true standing regardless of display order.
  const displayRankings = useMemo(() => {
    const base = strugglingOnly
      ? batchRankings.filter(entry => entry.percentage < rankingsPassMark)
      : batchRankings;
    if (rankingsMode === 'top') return base;
    return [...base].sort((a, b) => a.percentage - b.percentage);
  }, [batchRankings, rankingsMode, strugglingOnly, rankingsPassMark]);

  // Open the student-detail modal — fetches this student's full attempt history.
  const openStudentDetail = async (entry: StudentRef) => {
    setStudentDetailEntry(entry);
    setStudentDetailLoading(true);
    try {
      const results = await getStudentResults(entry.studentId, {
        studentEmail: entry.email,
        studentName: entry.name ?? entry.username,
      });
      setStudentDetailResults(results);
    } catch {
      setStudentDetailResults([]);
    } finally {
      setStudentDetailLoading(false);
    }
  };

  if (loading) return (
    <div className="batch-shell" role="status" aria-busy="true">
      <span className="skel-sr">Loading batch…</span>
      <SkeletonList rows={4} />
    </div>
  );
  if (!batch) return null;

  /** Read-only chip list of the batches a test is assigned to, with an
   *  "Only this batch" note when it is exclusive to the one being viewed. */
  const AssignedBatchChips: React.FC<{ testId: string }> = ({ testId }) => {
    const rows = batchesByTest[testId];
    if (!rows) return <span className="batch-chip-note">…</span>;
    if (rows.length <= 1) {
      return <span className="batch-chip-note">Only this batch</span>;
    }
    const others = rows.filter(b => b.id !== batch.id);
    return (
      <span className="batch-chip-list">
        {others.map(b => (
          <span key={b.id} className="batch-chip" title={b.name}>{b.name}</span>
        ))}
      </span>
    );
  };

  return (
    <div className="batch-shell">
      <div className="batch-header">
        <div>
          <h1>{batch.name}</h1>
          <div className="batch-header-sub">
            <code className="batch-code">{batch.code}</code>
            <button onClick={() => navigator.clipboard.writeText(batch.code)} title="Copy code" className="batch-copy"><Share2 size={12} /></button>
            <span className="student-muted">{batch.description}</span>
          </div>
        </div>
        <div className="student-header-actions">
          <button onClick={loadBatch} className="student-btn-plain"><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {error ? <div className="student-error-inline"><AlertCircle size={14} /> {error}</div> : null}

      <div className="batch-tabs">
        {(['members', 'pending', 'tests', 'results'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`batch-tab ${t === tab ? 'batch-tab-active' : 'batch-tab-inactive'}`}>
            {t === 'members' ? `Members (${members.length})` : t === 'pending' ? `Pending (${pending.length})` : t === 'tests' ? `Tests (${tests.length})` : 'Results'}
          </button>
        ))}
      </div>

      {tab === 'results' && tests.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No tests yet"
          description="Assign a test to this batch to see results and rankings here."
        />
      ) : null}

      {tab === 'results' && tests.length > 0 && resultsLoading && Object.keys(batchResults).length === 0 ? (
        <div className="batch-list" role="status" aria-busy="true">
          <SkeletonList rows={3} />
        </div>
      ) : null}

      {tab === 'pending' && (
        <div className="batch-list">
          <form onSubmit={addMemberByEmail} className="student-card batch-add-form">
            <div className="student-form-field">
              <label>Add student by email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="aarav.sharma@example.com"
                required
                className="student-form-field-input" />
            </div>
            <button type="submit" disabled={acting['add-email'] || !newEmail.trim()}
              className="batch-approve-btn">
              {acting['add-email'] ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Add
            </button>
          </form>
          {pending.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={Mail}
              title="No pending requests"
              description="Approval requests from students who register with the batch code will show up here."
            />
          ) : pending.map(e => (
            <div key={e.id} className="batch-detail-row">
              <div>
                <div className="batch-detail-name">{e.name || e.username || e.email}</div>
                <div className="batch-detail-sub">Requested {new Date(e.requested_at).toLocaleString()}</div>
              </div>
              <div className="batch-row-actions">
                <button onClick={() => approve(e.id)} disabled={acting[`approve-${e.id}`]}
                  className="batch-approve-btn">
                  {acting[`approve-${e.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />} Approve
                </button>
                <button onClick={() => reject(e.id)} disabled={acting[`reject-${e.id}`]}
                  className="batch-reject-btn">
                  {acting[`reject-${e.id}`] ? <Loader2 size={12} className="animate-spin" /> : <X size={14} />} Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'members' && (
        <div className="batch-list">
          {members.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No students yet"
              description={<>Share the batch code <strong>{batch.code}</strong> to let students register.</>}
            />
          ) : members.map(s => {
            const isEditing = editingMemberId === s.id;
            const moveTargets = teacherBatches.filter(b => b.id !== batch.id);
            return (
              <div key={s.id} className={`batch-detail-row batch-member-row ${isEditing ? 'is-editing' : ''}`}>
                <div className="batch-member-head">
                  <div>
                    <div className="batch-detail-name">{s.name || <i>{s.username || s.email}</i>}</div>
                    {/* Only show the sub-line when it adds information — otherwise
                        the card displays the same email twice. */}
                    {(s.name && (s.username || s.email)) || (!s.name && s.username && s.email && s.username !== s.email) ? (
                      <div className="batch-detail-sub">{s.username || s.email}</div>
                    ) : null}
                  </div>
                  <button
                    onClick={() => setEditingMemberId(isEditing ? null : s.id)}
                    className={`batch-member-edit-btn ${isEditing ? 'is-open' : ''}`}
                    title={isEditing ? 'Close member options' : 'Edit member'}
                    aria-expanded={isEditing}
                    aria-label={`${isEditing ? 'Close' : 'Edit'} options for ${s.name || s.username || s.email}`}
                  >
                    {isEditing ? <X size={13} /> : <Pencil size={13} />}
                  </button>
                </div>
                {isEditing ? (
                  <div className="batch-member-edit-panel">
                    <div className="batch-edit-panel-field">
                      <label>Move to batch</label>
                      <select
                        defaultValue=""
                        onChange={e => {
                          const target = e.target.value;
                          if (!target) return;
                          setEditingMemberId(null);
                          void moveTo(s.id, target);
                        }}
                        disabled={moveTargets.length === 0 || !!acting[`move-${s.id}`]}
                      >
                        <option value="" disabled>Choose a batch…</option>
                        {moveTargets.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                        ))}
                        {moveTargets.length === 0 ? <option value="" disabled>No other batches</option> : null}
                      </select>
                      {acting[`move-${s.id}`] ? <Loader2 size={12} className="animate-spin batch-panel-spinner" /> : null}
                    </div>
                    <div className="batch-edit-panel-actions">
                      <button
                        onClick={() => {
                          setEditingMemberId(null);
                          void openStudentDetail({ studentId: s.id, email: s.email, username: s.username, name: s.name });
                        }}
                        className="batch-btn-secondary batch-panel-action"
                      >
                        <Eye size={13} /> View performance
                      </button>
                      <button onClick={() => removeMember(s.id)} disabled={!!acting[`remove-${s.id}`]}
                        title="Remove this student from the batch"
                        className="batch-remove-btn batch-panel-action batch-panel-remove">
                        {acting[`remove-${s.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove from batch
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'tests' && (
        <div className="batch-list">
          {tests.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No tests assigned"
              description="Use “Manage assignment” on a test card to attach one to this batch."
            />
          ) : tests.map(t => {
            const stat = testStats[t.id];
            return (
              <div key={t.id} className="student-result-card batch-test-card">
                <div className="batch-test-card-head">
                  <div>
                    <div className="batch-detail-name">
                      {t.name} <span className="student-test-info">({t.testKey})</span>
                    </div>
                    <div className="batch-detail-sub batch-test-meta-line">
                      <span><FileText size={12} /> {t.questions.length} questions</span>
                      <span><Clock size={12} /> {t.duration || t.timeLimit} min</span>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(`/print/${t.testKey}`, '_blank')}
                    className="batch-print-btn"
                    title="Open a printable PDF of this test"
                  >
                    <Printer size={13} /> Print / PDF
                  </button>
                </div>

                {/* Attempt statistics — instant health signal per test. */}
                <div className="batch-test-stats">
                  <div className="batch-test-stat">
                    <BarChart3 size={14} />
                    <strong>{stat ? stat.attempts : '…'}</strong>
                    <span>of {members.length} attempted</span>
                  </div>
                  <div className="batch-test-stat">
                    <Target size={14} />
                    <strong>{stat?.avgPct != null ? `${stat.avgPct}%` : '—'}</strong>
                    <span>class average</span>
                  </div>
                  <div className="batch-test-stat">
                    <Trophy size={14} />
                    <strong>{stat?.top != null ? `${stat.top}%` : '—'}</strong>
                    <span>highest</span>
                  </div>
                  <div className="batch-test-stat">
                    <AlertCircle size={14} />
                    <strong>{stat?.low != null ? `${stat.low}%` : '—'}</strong>
                    <span>lowest</span>
                  </div>
                </div>
                {!stat || stat.attempts === 0 ? (
                  <div className="batch-test-empty-hint">
                    No one has attempted this test yet.
                  </div>
                ) : stat.avgPct != null && stat.avgPct < 40 ? (
                  <div className="batch-test-warn-hint">
                    Low class average — consider reviewing this material with the batch.
                  </div>
                ) : null}

                <div className="batch-test-foot">
                  <div className="batch-detail-sub batch-assigned-line">
                    Shared with: <AssignedBatchChips testId={t.id} />
                  </div>
                  <button
                    onClick={() => { void openAssignModal(t.id); }}
                    disabled={!!acting[`test-${t.id}`]}
                    className="batch-assign-btn"
                  >
                    {acting[`test-${t.id}`]
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Link2 size={13} />}
                    Manage assignment
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign-to-batch modal (opened from the Tests tab). */}
      {assigningTest && (
        <div className="batch-modal-overlay" role="dialog" aria-modal="true"
          onClick={() => !acting[`test-${assigningTest.id}`] && setAssigningTestId(null)}>
          <div className="batch-modal" onClick={e => e.stopPropagation()}>
            <h3>Assign “{assigningTest.name}”</h3>
            <p className="batch-modal-sub">
              Choose which batches can see this test. The current selection replaces
              the previous one — untick everything to unlist the test.
            </p>
            <div className="batch-modal-options">
              {teacherBatches.map(b => (
                <label key={b.id} className={`batch-modal-option ${assignSelection[b.id] ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!assignSelection[b.id]}
                    onChange={e => setAssignSelection(s => ({ ...s, [b.id]: e.target.checked }))}
                  />
                  <span className="batch-modal-option-name">{b.name}</span>
                  <span className="batch-modal-option-code">{b.code}{b.id === batch.id ? ' · this batch' : ''}</span>
                </label>
              ))}
            </div>
            <div className="batch-modal-actions">
              <button onClick={() => setAssigningTestId(null)} disabled={!!acting[`test-${assigningTest.id}`]}
                className="batch-btn-secondary">Cancel</button>
              <button onClick={() => { void confirmAssign(); }} disabled={!!acting[`test-${assigningTest.id}`]}
                className="batch-save-btn">
                {acting[`test-${assigningTest.id}`]
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Check size={13} />} Save assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Rankings — aggregated across all tests in the batch */}
      {tab === 'results' && batchRankings.length > 0 ? (
        <div className="batch-list">
          <div className="batch-rankings-card">
            <h2>Class Rankings</h2>
            <p className="student-muted">Overall ranking based on best percentage across all {tests.length} tests. Click a student to see their detailed performance.</p>
            <div className="batch-rankings-controls">
              <button
                type="button"
                className={`batch-rankings-toggle ${rankingsMode === 'weak' ? 'is-on' : ''}`}
                onClick={() => setRankingsMode(m => (m === 'weak' ? 'top' : 'weak'))}
                title={rankingsMode === 'weak' ? 'Back to best-performing first' : 'Show students who need the most help first'}
              >
                {rankingsMode === 'weak' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {rankingsMode === 'weak' ? 'Top first' : 'Weakest first'}
              </button>
              <button
                type="button"
                onClick={exportRankings}
                className="batch-rankings-toggle"
                title="Download the rankings as a CSV file"
              >
                <Download size={14} /> Export CSV
              </button>
              <label className="batch-rankings-check">
                <input
                  type="checkbox"
                  checked={strugglingOnly}
                  onChange={e => setStrugglingOnly(e.target.checked)}
                />
                Below {rankingsPassMark}% only
              </label>
            </div>
            {displayRankings.length === 0 ? (
              <p className="batch-chip-note">No students are below {rankingsPassMark}% — nothing to worry about here.</p>
            ) : (
            <div className="batch-rankings-table-wrapper">
              <table className="batch-rankings-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Student</th>
                    <th>Best %</th>
                    <th>Percentile</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRankings.map(entry => {
                    const rankIcon = entry.rank === 1 ? <Trophy size={16} /> : entry.rank === 2 ? <Medal size={16} /> : entry.rank === 3 ? <Award size={16} /> : null;
                    const rankClass = entry.rank === 1 ? 'top-1' : entry.rank === 2 ? 'top-2' : entry.rank === 3 ? 'top-3' : '';
                    return (
                      <tr key={entry.studentId ?? entry.email} className={`batch-results-row ${rankClass}`}>
                        <td className="batch-results-rank" data-label="Rank">
                          <span className={`batch-rank-badge ${rankClass}`}>{rankIcon}<span>{entry.rank}</span></span>
                        </td>
                        <td className="batch-results-student" data-label="Student">
                          <button
                            onClick={() => openStudentDetail(entry)}
                            className="batch-student-link"
                            title={`View ${entry.name || entry.username || entry.email}'s performance`}
                          >
                            {entry.name || entry.username || entry.email}
                          </button>
                        </td>
                        <td className="batch-results-percent" data-label="Best %">{entry.percentage}%</td>
                        <td className="batch-results-pctile" data-label="Percentile"><span className="batch-pctile-pill">{entry.percentile}th</span></td>
                        <td className="batch-results-change" data-label="Change">
                          {entry.improvement == null ? (
                            <span className="student-muted">—</span>
                          ) : (
                            <span className={`batch-improvement ${entry.improvement > 0 ? 'is-up' : entry.improvement < 0 ? 'is-down' : ''}`}>
                              {entry.improvement > 0 ? <TrendingUp size={13} /> : entry.improvement < 0 ? <TrendingDown size={13} /> : null}
                              {entry.improvement > 0 ? '+' : ''}{entry.improvement}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'results' && tests.length > 0 && Object.keys(batchResults).length > 0 ? (
        <div className="batch-list">
          <h3>All Tests</h3>
          {tests.map(t => {
            const entries = batchResults[t.id] ?? [];
            // Build the top performer / average summary for this test
            const topPerformer = entries.length > 0 ? entries[0] : null;
            const avgPct = entries.length > 0
              ? Math.round(entries.reduce((sum, e) => sum + e.percentage, 0) / entries.length)
              : 0;
            return (
              <div key={t.id} className="batch-results-test">
                <div className="batch-results-test-header">
                  <div>
                    <div className="batch-detail-name">{t.name}</div>
                    <div className="batch-detail-sub">{t.testKey} · {t.questions.length} questions</div>
                  </div>
                  {topPerformer ? (
                    <div className="batch-results-top">
                      <Trophy size={16} className="batch-results-trophy" />
                      <span>Top: {topPerformer.name || topPerformer.username || topPerformer.email}</span>
                      <span className="student-muted">({topPerformer.percentage}%)</span>
                    </div>
                  ) : null}
                </div>

                {entries.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    icon={BarChart3}
                    title="No results yet"
                    description="No one has attempted this test yet."
                  />
                ) : (
                  <table className="batch-results-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Student</th>
                        <th>Score</th>
                        <th>%</th>
                        <th>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => {
                        const rankIcon = i === 0 ? <Trophy size={16} /> : i === 1 ? <Medal size={16} /> : i === 2 ? <Award size={16} /> : null;
                        const rankClass = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : '';
                        // Null-safe friendly timestamp — legacy rows carrying
                        // junk (e.g. "1:7:53") render as "—", never garbage.
                        const timeStr = formatCompletedAt(e.completedAt);
                        return (
                          <tr key={e.studentId ?? e.email} className={`batch-results-row ${i < 3 ? 'top-three' : ''}`}>
                        <td className="batch-results-rank" data-label="Rank">
                          <span className={`batch-rank-badge ${rankClass}`}>{rankIcon}<span>{e.rank || i + 1}</span></span>
                        </td>
                            <td className="batch-results-student" data-label="Student">
                              <button
                                onClick={() => openStudentDetail(e)}
                                className="batch-student-link"
                                title={`View ${e.name || e.username || e.email}'s performance`}
                              >
                                {e.name || e.username || e.email}
                              </button>
                            </td>
                            <td data-label="Score">{e.score ?? '—'}/{e.totalMarks ?? '—'}</td>
                            <td className="batch-results-percent" data-label="%">{e.percentage ?? 0}%</td>
                            <td className="student-muted" data-label="Completed">{timeStr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <div className="batch-results-summary">
                  <span className="student-muted">Average: {avgPct}%</span>
                  <span className="student-muted">{entries.length} attempt{entries.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Student detail modal (opened by clicking a student name). */}
      {studentDetailEntry ? (
        <div className="batch-modal-overlay" role="dialog" aria-modal="true"
          onClick={() => setStudentDetailEntry(null)}>
          <div className="batch-modal student-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="student-detail-header">
              <h3>{studentDetailEntry.name || studentDetailEntry.username || studentDetailEntry.email}</h3>
              <button
                onClick={() => setStudentDetailEntry(null)}
                className="batch-btn-secondary"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            {studentDetailLoading ? (
              <div className="student-detail-content" role="status" aria-busy="true">
                <SkeletonStats count={4} />
                <SkeletonList rows={3} />
              </div>
            ) : studentDetailResults.length === 0 ? (
              <EmptyState
                variant="compact"
                icon={Users}
                title="No attempt data"
                description="No attempt data found for this student."
              />
            ) : (
              <div className="student-detail-content">
                {(() => {
                  const pcts = studentDetailResults.map(r => r.percentage);
                  const avgPct = pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : 0;
                  const best = pcts.length ? Math.max(...pcts) : 0;
                  const lowest = pcts.length ? Math.min(...pcts) : 0;
                  return (
                    <>
                      <div className="student-detail-stats">
                        <div className="student-stat-card"><div className="stat-value"><BarChart3 size={16} /><strong>{studentDetailResults.length}</strong></div><span className="stat-label">Attempts</span></div>
                        <div className="student-stat-card"><div className="stat-value"><Target size={16} /><strong>{best}%</strong></div><span className="stat-label">Best score</span></div>
                        <div className="student-stat-card"><div className="stat-value"><Trophy size={16} /><strong>{avgPct}%</strong></div><span className="stat-label">Class avg vs</span></div>
                        <div className="student-stat-card"><div className="stat-value"><AlertCircle size={16} /><strong>{lowest}%</strong></div><span className="stat-label">Lowest</span></div>
                      </div>
                      <div className="student-detail-progress">
                        <h4>Progress over time</h4>
                        <ProgressChart results={studentDetailResults} />
                      </div>
                      <div className="student-detail-tests">
                        <h4>Test history</h4>
                        <div className="student-test-list">
                          {studentDetailResults.map(r => {
                            const t = tests.find(tt => tt.id === r.testId);
                            return (
                              <div key={r.id} className="student-test-item student-detail-test-item">
                                <div>
                                  <div className="student-test-name">{t ? t.name : r.testId}</div>
                                  <div className="student-test-info">{t ? t.testKey : '—'} · {r.totalQuestions} questions · {t ? (t.duration || t.timeLimit) : '—'} min</div>
                                </div>
                                <div className="student-test-meta">
                                  <div className="student-test-score">Score: {r.score ?? 0}/{r.totalMarks ?? r.totalQuestions ?? 0} · {r.percentage ?? 0}%</div>
                                  <div className="student-test-percentile">Completed {formatCompletedAt(r.completedAt)}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="batch-footer-stats">
        <Users size={14} /> {members.length} member{members.length !== 1 ? 's' : ''} · {pending.length} pending request{pending.length !== 1 ? 's' : ''} · {tests.length} test{tests.length !== 1 ? 's' : ''} assigned
      </div>
    </div>
  );
};

export default BatchDetail;
