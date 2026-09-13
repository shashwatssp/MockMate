import { toErrorMessage } from '../lib/errors';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createBatch, getBatchesForTeacher, getPendingEnrollments,
  getStudentsInBatch, getTestsForBatch, updateBatch,
} from '../lib/database';
import { getTeacherSession } from '../lib/localAuth';
import type { BatchRow } from '../lib/database';
import {
  Users, Plus, Copy, Loader2, AlertCircle, Pencil, Check, X, ChevronRight, Mail, FileText,
} from 'lucide-react';
import { SkeletonList } from './Skeleton';
import { EmptyState } from './EmptyState';
import { copyTextToClipboard, notifySuccess } from '../lib/shareToast';
import './BatchDetail.css';

/** Per-batch counts surfaced on the list (best-effort — null on failure). */
interface BatchStat {
  members: number | null;
  pending: number | null;
  tests: number | null;
}

export const BatchesHome: React.FC = () => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [stats, setStats] = useState<Record<string, BatchStat>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Per-action busy flags + the batch currently being renamed inline.
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // useCallback gives load a stable identity for the mount effect below.
  const load = useCallback(async () => {
    setError(null);
    try {
      const teacher = getTeacherSession();
      if (!teacher) { navigate('/login'); return; }
      const myBatches = await getBatchesForTeacher();
      setBatches(myBatches);
      // Per-batch stats, best-effort: a failing count must never block the list.
      const entries = await Promise.all(myBatches.map(async b => {
        try {
          const [students, pendingRows, tests] = await Promise.all([
            getStudentsInBatch(b.id),
            getPendingEnrollments(b.id),
            getTestsForBatch(b.id),
          ]);
          return [b.id, { members: students.length, pending: pendingRows.length, tests: tests.length }] as const;
        } catch {
          return [b.id, { members: null, pending: null, tests: null }] as const;
        }
      }));
      setStats(Object.fromEntries(entries));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setActing(a => ({ ...a, [key]: true }));
    try { await fn(); } catch (err) { setError(toErrorMessage(err)); }
    finally { setActing(a => { const n = { ...a }; delete n[key]; return n; }); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const teacher = getTeacherSession();
      if (!teacher) throw new Error('Not authenticated');
      const batch = await createBatch({ name: name.trim(), description: description.trim() || undefined });
      setBatches(prev => [batch, ...prev]);
      setName(''); setDescription('');
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    if (await copyTextToClipboard(code)) notifySuccess(`Join code ${code} copied.`);
  };

  const startEdit = (batch: BatchRow) => {
    setEditingId(batch.id);
    setEditName(batch.name);
    setEditDescription(batch.description ?? '');
  };

  const saveEdit = (batch: BatchRow) => {
    if (!editName.trim()) return;
    void run(`edit-${batch.id}`, async () => {
      const nextDescription = editDescription.trim() || null;
      const updated = await updateBatch(batch.id, { name: editName.trim(), description: nextDescription });
      setBatches(prev => prev.map(b => (b.id === batch.id ? updated : b)));
      setEditingId(null);
      notifySuccess('Batch updated.');
    });
  };

  const toggleActive = (batch: BatchRow) => {
    void run(`toggle-${batch.id}`, async () => {
      const updated = await updateBatch(batch.id, { isActive: !batch.is_active });
      setBatches(prev => prev.map(b => (b.id === batch.id ? updated : b)));
      notifySuccess(updated.is_active
        ? `“${updated.name}” is active — students can join and it shows on your public page.`
        : `“${updated.name}” is deactivated — joins are paused and it is hidden from your public page.`);
    });
  };

  return (
    <div className="batch-shell">
      <div className="batch-header">
        <h1>Batches</h1>
      </div>

      <section className="student-card batch-create-section">
        <h2 className="student-profile-label">Create a batch</h2>
        <form onSubmit={handleCreate} className="batch-create-form">
          <div className="batch-form-field full-width">
            <label>Batch name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Class 10A" required disabled={creating}
              className="student-form-field-input" />
          </div>
          <div className="batch-form-row">
            <div className="batch-form-field">
              <label>Description (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" disabled={creating}
                className="student-form-field-input" />
            </div>
            <button type="submit" disabled={creating || !name.trim()}
              className="batch-submit">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
            </button>
          </div>
        </form>
      </section>

      {error ? <div className="student-error-inline"><AlertCircle size={14} /> {error}</div> : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : batches.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No batches yet"
          description="Create your first batch above, then share its join code with your students."
        />
      ) : (
        <div className="batch-list">
          {batches.map(batch => {
            const stat = stats[batch.id];
            return (
              <div key={batch.id} className={`batch-item ${batch.is_active ? '' : 'is-inactive'}`}>
                {editingId === batch.id ? (
                  <div className="batch-edit-form">
                    <div className="batch-form-field full-width">
                      <label>Batch name</label>
                      <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={60}
                        disabled={!!acting[`edit-${batch.id}`]} className="student-form-field-input" />
                    </div>
                    <div className="batch-form-field full-width">
                      <label>Description</label>
                      <input value={editDescription} onChange={e => setEditDescription(e.target.value)} maxLength={140}
                        disabled={!!acting[`edit-${batch.id}`]} className="student-form-field-input" />
                    </div>
                    <div className="batch-edit-actions">
                      <button onClick={() => saveEdit(batch)} disabled={!!acting[`edit-${batch.id}`] || !editName.trim()}
                        className="batch-approve-btn">
                        {acting[`edit-${batch.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Save
                      </button>
                      <button onClick={() => setEditingId(null)} disabled={!!acting[`edit-${batch.id}`]}
                        className="batch-btn-secondary">
                        <X size={13} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="batch-item-main">
                      <div className="batch-name">
                        {batch.name}
                        {!batch.is_active ? <span className="batch-status-chip">Inactive</span> : null}
                      </div>
                      <div className="batch-meta">{batch.description || '—'} · {new Date(batch.created_at).toLocaleDateString()}</div>
                      <div className="batch-item-stats">
                        <span>
                          <Users size={12} /> {stat ? (stat.members ?? '—') : '…'} member{(stat?.members ?? 0) === 1 ? '' : 's'}
                        </span>
                        {stat?.pending ? (
                          <span className="batch-stat-pending"><Mail size={11} /> {stat.pending} pending</span>
                        ) : null}
                        {stat?.tests != null ? (
                          <span><FileText size={12} /> {stat.tests} test{stat.tests === 1 ? '' : 's'}</span>
                        ) : null}
                      </div>
                      <div className="batch-code">
                        <code>{batch.code}</code>
                        <button onClick={() => void copyCode(batch.code)} title="Copy batch code" className="batch-copy"><Copy size={12} /></button>
                      </div>
                    </div>
                    <div className="batch-item-actions">
                      <button onClick={() => startEdit(batch)} className="batch-icon-btn"
                        title="Rename / edit batch" aria-label={`Rename ${batch.name}`}>
                        <Pencil size={14} />
                      </button>
                      <label
                        className={`batch-switch ${batch.is_active ? 'is-on' : ''}`}
                        title={batch.is_active
                          ? 'Deactivate — pauses joins and hides the batch from your public page'
                          : 'Activate — students can join again and it shows on your public page'}
                      >
                        <input
                          type="checkbox"
                          checked={batch.is_active}
                          disabled={!!acting[`toggle-${batch.id}`]}
                          onChange={() => toggleActive(batch)}
                          aria-label={`${batch.is_active ? 'Deactivate' : 'Activate'} ${batch.name}`}
                        />
                        <span className="batch-switch-track" aria-hidden="true">
                          <span className="batch-switch-thumb" />
                        </span>
                      </label>
                      <a href={`/batches/${batch.code}`} className="batch-manage-link" aria-label={`Manage ${batch.name}`}>
                        Manage <ChevronRight size={14} />
                      </a>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BatchesHome;
