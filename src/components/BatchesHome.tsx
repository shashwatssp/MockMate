import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBatch, getBatchesForTeacher } from '../lib/database';
import { getTeacherSession } from '../lib/localAuth';
import type { BatchRow } from '../lib/database';
import { BookOpen, Plus, Copy, Loader2, AlertCircle } from 'lucide-react';
import './BatchDetail.css';

export const BatchesHome: React.FC = () => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    setError(null);
    try {
      const teacher = getTeacherSession();
      if (!teacher) { navigate('/login'); return; }
      setBatches(await getBatchesForTeacher());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
  };

  return (
    <div className="batch-shell">
      <div className="batch-header">
        <h1>Batches</h1>
        <button onClick={() => navigate('/dashboard')} className="student-btn-plain">← Dashboard</button>
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
        <div className="student-loading">Loading batches…</div>
      ) : batches.length === 0 ? (
        <div className="student-empty-text">
          <BookOpen size={32} />
          <p>No batches yet. Create one above to get started.</p>
        </div>
      ) : (
        <div className="batch-list">
          {batches.map(batch => (
            <div key={batch.id} className="batch-item">
              <div>
                <div className="batch-name">{batch.name}</div>
                <div className="batch-meta">{batch.description || '—'} · {new Date(batch.created_at).toLocaleDateString()}</div>
                <div className="batch-code">
                  <code>{batch.code}</code>
                  <button onClick={() => copyCode(batch.code)} title="Copy batch code" className="batch-copy"><Copy size={12} /></button>
                </div>
              </div>
              <div className="batch-manage">
                <a href={`/batches/${batch.code}`} className="batch-manage-link">Manage</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BatchesHome;
