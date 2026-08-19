import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getBatchByCode, getPendingEnrollments, getStudentsInBatch,
  approveBatchEnrollment, rejectBatchEnrollment, moveStudent, removeStudentFromBatch,
  getTestsForBatch, getBatchesForTest, setTestBatches,
  createBatchEnrollment, batchLeaderboard, getBatchesForTeacher,
} from '../lib/database';
import { getTeacherSession } from '../lib/localAuth';
import { toTeacherUuid } from '../lib/database';
import type { BatchRow, StudentRow, BatchLeaderboardEntry } from '../lib/database';
import type { Test } from '../types/exam.types';
import { Users, Check, X, RefreshCw, Loader2, AlertCircle, Share2,Trash2, Mail, Trophy, Medal, Award } from 'lucide-react';
import './BatchDetail.css';

type Tab = 'members' | 'pending' | 'tests' | 'results';

export const BatchDetail: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [members, setMembers] = useState<StudentRow[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [teacherBatches, setTeacherBatches] = useState<BatchRow[]>([]);
  const [tab, setTab] = useState<Tab>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [newEmail, setNewEmail] = useState('');
  const [resultsLoading, setResultsLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<string, BatchLeaderboardEntry[]>>({});

  const loadBatch = async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadBatch(); }, [code]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setActing(a => ({ ...a, [key]: true }));
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
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
      await loadBatch();
 });
  };

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

  // Load leaderboards for all batch tests (lazy – triggered when Results tab opens)
  const loadAllResults = async () => {
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
    } catch (err) {
      // best-effort; individual test failures are empty arrays
    } finally {
      setResultsLoading(false);
    }
  };

  if (loading) return (<div className="batch-shell"><div className="student-loading"><Loader2 className="animate-spin" /> Loading batch…</div></div>);
  if (!batch) return null;

  const TestBatchSelector: React.FC<{ testId: string }> = ({ testId }) => {
    const [selected, setSelected] = useState<string[]>([]);
    const [init, setInit] = useState(false);
    useEffect(() => {
      if (!init) {
        getBatchesForTest(testId).then(rows => {
          const ids = rows.filter(b => b.id !== batch.id).map(b => b.id);
          setSelected(ids);
          setInit(true);
        });
      }
    }, [testId, init]);
    const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    const save = () => reassignTest(testId, [batch.id, ...selected]);
    return (
      <div className="batch-test-selector">
        {teacherBatches.filter(b => b.id !== batch.id).map(b => {
          const on = selected.includes(b.id);
          return (
            <button key={b.id}
              type="button"
              onClick={() => toggle(b.id)}
              title={b.name}
              className={`batch-toggle-btn ${on ? 'active' : ''}`}>
              {b.name}
            </button>
          );
        })}
        <button onClick={save} disabled={acting[`test-${testId}`]}
          className="batch-save-btn">
          {acting[`test-${testId}`] ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
        </button>
      </div>
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
          <button onClick={() => navigate('/batches')} className="student-btn-plain">← All batches</button>
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
        <div className="batch-list">
          <p className="student-empty-text">No tests assigned to this batch yet.</p>
        </div>
      ) : null}

      {tab === 'results' && tests.length > 0 && Object.keys(batchResults).length === 0 && !resultsLoading ? (
        <div className="batch-list">
          <div className="student-card">
            <h2>Batch Performance</h2>
            <p className="student-muted">Compare student scores across all tests in this batch.</p>
            <button onClick={loadAllResults} className="batch-save-btn">
              Load All Results
            </button>
          </div>
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
            <p className="student-empty-text">No pending approval requests.</p>
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
            <p className="student-empty-text">No students have joined this batch yet. Share the batch code <strong>{batch.code}</strong> to let students register.</p>
          ) : members.map(s => (
            <div key={s.id} className="batch-detail-row">
              <div>
                <div className="batch-detail-name">{s.name || <i>{s.username || s.email}</i>}</div>
                <div className="batch-detail-sub">{s.username || s.email}</div>
              </div>
              <div className="batch-row-actions">
                <select
                  defaultValue=""
                  onChange={e => e.target.value ? moveTo(s.id, e.target.value) : undefined}
                  className="batch-row-actions-select"
                  disabled={!!acting[`move-${s.id}`]}
                >
                  <option value="" disabled>Move to…</option>
                  {teacherBatches.filter(b => b.id !== batch.id).map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
                {acting[`move-${s.id}`] ? <Loader2 size={12} className="animate-spin" /> : null}
                <button onClick={() => removeMember(s.id)} disabled={!!acting[`remove-${s.id}`]} title="Remove from batch"
                  className="batch-remove-btn">
                  {acting[`remove-${s.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'tests' && (
        <div className="batch-list">
          {tests.length === 0 ? (
            <p className="student-empty-text">No tests assigned to this batch yet. Assign a test from its editor or the Create Test screen.</p>
          ) : tests.map(t => (
            <div key={t.id} className="student-result-card">
              <div className="batch-detail-name">
                {t.name} <span className="student-test-info">({t.testKey})</span>
              </div>
              <div className="batch-detail-sub">
                Assigned to batches: <TestBatchSelector testId={t.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {resultsLoading && tab === 'results' ? (
        <div className="student-loading">Loading results…</div>
      ) : null}

      {tab === 'results' && tests.length > 0 && Object.keys(batchResults).length > 0 ? (
        <div className="batch-list">
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
                  <p className="student-empty-text">No results yet for this test.</p>
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
                        const timeStr = e.completedAt
                          ? new Date(e.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—';
                        return (
                          <tr key={e.studentId ?? e.email} className={`batch-results-row ${i < 3 ? 'top-three' : ''}`}>
                            <td className="batch-results-rank">
                              {rankIcon}{e.rank}
                            </td>
                            <td className="batch-results-student">{e.name || e.username || e.email}</td>
                            <td>{e.score}/{e.totalMarks}</td>
                            <td className="batch-results-percent">{e.percentage}%</td>
                            <td className="student-muted">{timeStr}</td>
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

      <div className="batch-footer-stats">
        <Users size={14} /> {members.length} member{members.length !== 1 ? 's' : ''} · {pending.length} pending request{pending.length !== 1 ? 's' : ''} · {tests.length} test{tests.length !== 1 ? 's' : ''} assigned
      </div>
    </div>
  );
};

export default BatchDetail;
