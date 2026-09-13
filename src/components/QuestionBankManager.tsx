import { toErrorMessage } from '../lib/errors';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Loader2, Lock, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  deleteBankQuestion,
  forkBankQuestion,
  getBankQuestionsWithOwner,
  updateBankQuestion,
} from '../lib/database';
import { notifySuccess } from '../lib/shareToast';
import type { BankQuestionRow } from '../lib/database';
import type { Difficulty } from '../types/exam.types';
import { SkeletonList } from './Skeleton';
import { EmptyState } from './EmptyState';
import './QuestionBankManager.css';

const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'medium', 'hard'];

/** Question bank manager (§3.4): edit/delete for the questions a teacher
 *  ingested. Shared-pool rows stay read-only (ownership is enforced again
 *  server-side by app_edit_question/app_delete_question). Existing tests
 *  embed frozen copies of bank questions, so edits never touch running or
 *  historical exams. */
export const QuestionBankManager: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BankQuestionRow[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<BankQuestionRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Structured filters (combined with the free-text search below).
  const [filters, setFilters] = useState<{
    subject: string;
    topic: string;
    difficulty: 'all' | Difficulty;
    ownership: 'all' | 'mine' | 'shared';
  }>({ subject: 'all', topic: 'all', difficulty: 'all', ownership: 'all' });
  // Which row's detail panel is expanded (one at a time, accordion style).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<string | null>(null);

  // Edit-form state (kept detached from the row so cancel is trivial).
  const [form, setForm] = useState({
    text: '',
    options: ['', '', '', ''] as string[],
    correctAnswer: 0,
    topic: '',
    subject: '',
    year: '',
    difficulty: 'medium' as Difficulty,
  });

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      setRows(await getBankQuestionsWithOwner());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const subjectOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.subject).filter((s): s is string => !!s))).sort(),
    [rows],
  );
  const topicOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.topic).filter((t): t is string => !!t))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(row => {
      if (
        needle &&
        !row.text.toLowerCase().includes(needle) &&
        !(row.topic ?? '').toLowerCase().includes(needle) &&
        !(row.subject ?? '').toLowerCase().includes(needle)
      ) return false;
      if (filters.subject !== 'all' && (row.subject ?? '') !== filters.subject) return false;
      if (filters.topic !== 'all' && (row.topic ?? '') !== filters.topic) return false;
      if (filters.difficulty !== 'all' && (row.difficulty ?? 'medium') !== filters.difficulty) return false;
      if (filters.ownership === 'mine' && !row.ownedByMe) return false;
      if (filters.ownership === 'shared' && row.ownedByMe) return false;
      return true;
    });
  }, [rows, search, filters]);

  const hasActiveFilters =
    filters.subject !== 'all' ||
    filters.topic !== 'all' ||
    filters.difficulty !== 'all' ||
    filters.ownership !== 'all';

  const resetFilters = () =>
    setFilters({ subject: 'all', topic: 'all', difficulty: 'all', ownership: 'all' });

  const openEdit = (row: BankQuestionRow) => {
    setActionError(null);
    setEditing(row);
    setForm({
      text: row.text,
      options: [...row.options, '', '', '', ''].slice(0, Math.max(4, row.options.length)),
      correctAnswer: row.correctAnswer,
      topic: row.topic ?? '',
      subject: row.subject ?? '',
      year: row.year ?? '',
      difficulty: row.difficulty ?? 'medium',
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.text.trim() || form.options.some(o => !o.trim())) {
      setActionError('Question text and every option are required.');
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await updateBankQuestion(editing.id, {
        text: form.text.trim(),
        options: form.options.map(o => o.trim()),
        correctAnswer: form.correctAnswer,
        topic: form.topic.trim() || 'General',
        subject: form.subject.trim() || 'General',
        year: form.year.trim(),
        difficulty: form.difficulty,
      });
      // Update the local row in place (bank edits never touch existing tests).
      setRows(prev => prev.map(row => (
        row.id === editing.id
          ? {
              ...row,
              text: form.text.trim(),
              options: form.options.map(o => o.trim()),
              correctAnswer: form.correctAnswer,
              topic: form.topic.trim() || 'General',
              subject: form.subject.trim() || 'General',
              year: form.year.trim(),
              difficulty: form.difficulty,
            }
          : row
      )));
      setEditing(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save the question.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: BankQuestionRow) => {
    if (!window.confirm('Delete this question from your bank? Existing tests keep their own copy — only future tests are affected.')) {
      return;
    }
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteBankQuestion(row.id);
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the question.');
    } finally {
      setDeletingId(null);
    }
  };

  /** Fork a shared question into the teacher's own bank as a private copy. */
  const handleFork = async (row: BankQuestionRow) => {
    setForkingId(row.id);
    setActionError(null);
    try {
      await forkBankQuestion(row);
      notifySuccess('Copy saved to your bank.');
      setExpandedId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save a copy of the question.');
    } finally {
      setForkingId(null);
    }
  };

  const ownedCount = rows.filter(row => row.ownedByMe).length;

  return (
    <div className="bank-shell">
      <div className="bank-header">
        <div>
          <h1>Question bank</h1>
          <p className="bank-sub">
            {rows.length} visible · {ownedCount} yours. Editing or deleting only affects future tests —
            existing tests keep their own copy.
          </p>
        </div>
        <div className="bank-header-actions">
          <button onClick={() => void load()} className="bank-btn-plain" title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => navigate('/dashboard')} className="bank-btn-plain">
            <ArrowLeft size={14} /> Dashboard
          </button>
        </div>
      </div>

      {error ? <div className="student-error-inline" role="alert"><AlertCircle size={14} /> {error}</div> : null}

      <div className="bank-search-box">
        <Search className="bank-search-icon" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search text, topic or subject…"
          className="bank-search-input"
          aria-label="Search the question bank"
        />
      </div>

      <div className="bank-filters" role="group" aria-label="Filter questions">
        <label className="bank-filter">
          <span>Subject</span>
          <select
            value={filters.subject}
            onChange={e => setFilters(f => ({ ...f, subject: e.target.value }))}
          >
            <option value="all">All subjects</option>
            {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="bank-filter">
          <span>Topic</span>
          <select
            value={filters.topic}
            onChange={e => setFilters(f => ({ ...f, topic: e.target.value }))}
          >
            <option value="all">All topics</option>
            {topicOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="bank-filter">
          <span>Difficulty</span>
          <select
            value={filters.difficulty}
            onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value as 'all' | Difficulty }))}
          >
            <option value="all">All levels</option>
            {DIFFICULTY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="bank-filter">
          <span>Ownership</span>
          <select
            value={filters.ownership}
            onChange={e => setFilters(f => ({ ...f, ownership: e.target.value as 'all' | 'mine' | 'shared' }))}
          >
            <option value="all">Everyone's</option>
            <option value="mine">Mine only</option>
            <option value="shared">Shared pool</option>
          </select>
        </label>
        {hasActiveFilters ? (
          <button type="button" onClick={resetFilters} className="bank-filter-reset" title="Clear all filters">
            <X size={13} /> Reset
          </button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={rows.length === 0 ? 'No questions yet' : 'No matches'}
          description={
            rows.length === 0
              ? 'Add questions from the dashboard, or import a PDF to build your bank.'
              : hasActiveFilters || search
                ? 'No questions match the current search and filters — try clearing them.'
                : 'Nothing matches this view.'
          }
        />
      ) : (
        <div className="bank-list">
          {filtered.map(row => {
            const isExpanded = expandedId === row.id;
            return (
              <div key={row.id} className={`bank-row ${isExpanded ? 'is-expanded' : ''}`}>
                <div className="bank-row-main">
                  <p className={`bank-row-text ${isExpanded ? 'is-open' : ''}`}>{row.text}</p>
                  <div className="bank-row-chips">
                    {row.subject ? <span className="bank-chip">{row.subject}</span> : null}
                    {row.topic ? <span className="bank-chip">{row.topic}</span> : null}
                    {row.difficulty ? <span className={`bank-chip bank-chip-${row.difficulty}`}>{row.difficulty}</span> : null}
                    {row.year ? <span className="bank-chip">{row.year}</span> : null}
                    {row.imageUrl ? <span className="bank-chip">image</span> : null}
                  </div>
                </div>
                <div className="bank-row-actions">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    className="bank-expand-btn"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Hide question details' : 'View question details'}
                    title={isExpanded ? 'Hide details' : 'View details'}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {row.ownedByMe ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="bank-btn-plain"
                        title="Edit this question"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row)}
                        disabled={deletingId === row.id}
                        className="bank-btn-plain bank-btn-danger"
                        title="Delete this question"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  ) : (
                    <span className="bank-row-locked" title="Shared-pool questions can only be changed by their owner">
                      <Lock size={13} /> Shared
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <div className="bank-row-panel">
                    <p className="bank-panel-text">{row.text}</p>
                    <div className="bank-panel-options">
                      {row.options.map((option, index) => (
                        <div
                          key={index}
                          className={`bank-panel-option ${index === row.correctAnswer ? 'is-key' : ''}`}
                        >
                          <span className="bank-option-letter">{String.fromCharCode(65 + index)}</span>
                          <span className="bank-panel-option-text">{option}</span>
                          {index === row.correctAnswer ? <Check size={14} className="bank-panel-check" /> : null}
                        </div>
                      ))}
                    </div>
                    {row.explanation ? <p className="bank-panel-explain">{row.explanation}</p> : null}
                    {!row.ownedByMe ? (
                      <button
                        type="button"
                        onClick={() => void handleFork(row)}
                        disabled={forkingId === row.id}
                        className="bank-btn-primary bank-fork-btn"
                      >
                        {forkingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                        Save a copy to my bank
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editing ? (
        <div className="bank-modal-overlay" role="dialog" aria-modal="true" onClick={() => !saving && setEditing(null)}>
          <div className="bank-modal" onClick={e => e.stopPropagation()}>
            <div className="bank-modal-head">
              <h3>Edit question</h3>
              <button onClick={() => setEditing(null)} disabled={saving} className="bank-btn-plain" title="Close">
                <X size={14} />
              </button>
            </div>

            {actionError ? (
              <div className="student-error-inline" role="alert"><AlertCircle size={14} /> {actionError}</div>
            ) : null}

            <div className="bank-form">
              <label className="bank-field">
                <span>Question text</span>
                <textarea
                  value={form.text}
                  onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                  rows={3}
                  disabled={saving}
                />
              </label>

              <div className="bank-options">
                {form.options.map((option, index) => (
                  <label key={index} className={`bank-option-row ${form.correctAnswer === index ? 'is-key' : ''}`}>
                    <input
                      type="radio"
                      name="bank-correct-answer"
                      checked={form.correctAnswer === index}
                      onChange={() => setForm(f => ({ ...f, correctAnswer: index }))}
                      disabled={saving}
                      aria-label={`Mark option ${String.fromCharCode(65 + index)} as the correct answer`}
                    />
                    <span className="bank-option-letter">{String.fromCharCode(65 + index)}</span>
                    <input
                      type="text"
                      value={option}
                      onChange={e => setForm(f => ({
                        ...f,
                        options: f.options.map((o, i) => (i === index ? e.target.value : o)),
                      }))}
                      placeholder={`Option ${String.fromCharCode(65 + index)}`}
                      disabled={saving}
                    />
                  </label>
                ))}
              </div>

              <div className="bank-field-row">
                <label className="bank-field">
                  <span>Subject</span>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Physics"
                    disabled={saving}
                  />
                </label>
                <label className="bank-field">
                  <span>Topic</span>
                  <input
                    type="text"
                    value={form.topic}
                    onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                    placeholder="Mechanics"
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="bank-field-row">
                <label className="bank-field">
                  <span>Year</span>
                  <input
                    type="text"
                    value={form.year}
                    onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                    placeholder="2025"
                    disabled={saving}
                  />
                </label>
                <label className="bank-field">
                  <span>Difficulty</span>
                  <select
                    value={form.difficulty}
                    onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as Difficulty }))}
                    disabled={saving}
                  >
                    {DIFFICULTY_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="bank-modal-actions">
                <button onClick={() => setEditing(null)} disabled={saving} className="bank-btn-plain">
                  Cancel
                </button>
                <button onClick={() => void handleSave()} disabled={saving} className="bank-btn-primary">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default QuestionBankManager;
