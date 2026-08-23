import React, { useEffect, useState } from 'react';
import { X, Users, Check } from 'lucide-react';
import { getBatchesForTeacher, getBatchesForTest, assignTestToBatches } from '../lib/database';
import type { BatchRow } from '../lib/database';
import type { Test } from '../types/exam.types';
import './AssignBatchesModal.css';

interface AssignBatchesModalProps {
  test: Test;
  onClose: () => void;
  onAssigned: () => void;
}

export const AssignBatchesModal: React.FC<AssignBatchesModalProps> = ({
  test,
  onClose,
  onAssigned,
}) => {
  const [allBatches, setAllBatches] = useState<BatchRow[]>([]);
  const [assignedBatches, setAssignedBatches] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBatches = async () => {
      setLoading(true);
      try {
        const [teacherBatches, currentAssignments] = await Promise.all([
          getBatchesForTeacher(),
          getBatchesForTest(test.id),
        ]);
        setAllBatches(teacherBatches);
        setAssignedBatches(new Set(currentAssignments.map((b) => b.id)));
      } catch (err) {
        setError('Failed to load batches.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void loadBatches();
  }, [test.id]);

  const toggleBatch = (batchId: string) => {
    setAssignedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await assignTestToBatches(test.id, Array.from(assignedBatches));
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign test to batches.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="abm-overlay" onClick={onClose}>
      <div className="abm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="abm-header">
          <h2>Assign &ldquo;{test.name || test.title}&rdquo; to batches</h2>
          <button
            type="button"
            className="abm-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="abm-body">
          {loading ? (
            <div className="abm-loading">Loading batches…</div>
          ) : error ? (
            <div className="abm-error">{error}</div>
          ) : allBatches.length === 0 ? (
            <div className="abm-empty">
              <Users size={32} className="abm-empty-icon" />
              <p>You haven&lsquo;t created any batches yet.</p>
              <p className="abm-empty-hint">Create a batch first at /batches.</p>
            </div>
          ) : (
            <ul className="abm-batch-list">
              {allBatches.map((batch) => {
                const isAssigned = assignedBatches.has(batch.id);
                return (
                  <li key={batch.id} className="abm-batch-item">
                    <label className="abm-batch-label">
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => toggleBatch(batch.id)}
                        disabled={saving}
                      />
                      <span className="abm-batch-name">{batch.name}</span>
                      <span className="abm-batch-code">Code: {batch.code}</span>
                      {isAssigned && <Check size={16} className="abm-assigned-check" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="abm-footer">
          <button
            type="button"
            className="abm-btn abm-btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="abm-btn abm-btn-primary"
            onClick={handleSave}
            disabled={saving || loading || allBatches.length === 0}
          >
            {saving ? 'Saving…' : 'Save assignments'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignBatchesModal;
