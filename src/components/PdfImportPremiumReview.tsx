import React, { useState, useRef } from 'react';
import {
  Save,
  Trash2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Crop,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import type { Question } from '../types/exam.types';
import { insertQuestions, uploadQuestionImage } from '../lib/database';
import type { GeminiQuestion } from '../lib/geminiExtract';
import type { Band } from '../lib/pdfExtract';
import './PdfImport.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

interface Draft {
  text: string;
  options: string[];
  correctAnswer: number;
  subject: string;
  topic: string;
  marks: number;
  /** Whether to persist the question's image on accept. */
  attachImage: boolean;
  /** Base64 data URL of the diagram crop (or full page if uncropped). */
  imageData: string | null;
  /** Base64 data URL of the full source page/image (for uncrop / reference). */
  pageImageData: string | null;
  /** True once a manual crop has been applied. */
  cropApplied: boolean;
}

interface PdfImportPremiumReviewProps {
  questions: GeminiQuestion[];
  /** Where the import flow should return on completion ('/create-test' | '/create-question'). */
  returnTo: string;
  onBack: () => void;
}

type Status = 'pending' | 'accepted' | 'discarded';

function dataURLToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] ?? 'image/png';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

/**
 * One-by-one review flow for Gemini (AI) extracted questions.
 *
 * No OCR toggle (AI already read the text), but the teacher can crop the
 * diagram image further or restore the full page image (uncrop) if the
 * auto-crop was too aggressive. The teacher edits the question stem, options,
 * correct answer, subject, topic, and marks, then accepts, discards, or
 * finishes.
 */
export const PdfImportPremiumReview: React.FC<PdfImportPremiumReviewProps> = ({
  questions,
  returnTo,
  onBack,
}) => {
  const total = questions.length;
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState<Record<number, Status>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    questions.map(q => ({
      text: q.text,
      options: q.options.length ? q.options.slice() : ['', '', '', ''],
      correctAnswer: Math.min(
        q.correctAnswer,
        Math.max(0, (q.options.length || 4) - 1),
      ),
      subject: q.subject || 'General',
      topic: q.topic || 'General',
      marks: q.marks || 1,
      attachImage: !!q.imageData,
      imageData: q.imageData ?? null,
      pageImageData: q.pageImageData ?? null,
      cropApplied: false,
    })),
  );

  // --- Crop state ----------------------------------------------------------
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [cropMode, setCropMode] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropBox, setCropBox] = useState<Band | null>(null);

  const acceptedCount = Object.values(reviewed)
    .filter(v => v === 'accepted').length;
  const discardedCount = Object.values(reviewed)
    .filter(v => v === 'discarded').length;

  const current = questions[index];
  const draft = drafts[index];
  const canAccept = draft.options.length >= 2 && draft.text.trim().length > 0;

  // Natural->display scale for the currently shown image.
  const imgScale = (() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.offsetWidth) return 1;
    return img.naturalWidth / img.offsetWidth;
  })();

  const statusFor = (i: number): Status => {
    if (i === index) return 'pending';
    return reviewed[i] ?? 'pending';
  };

  const updateDraft = (patch: Partial<Draft>) => {
    setDrafts(d =>
      d.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const setOption = (i: number, value: string) => {
    setDrafts(d => {
      const next = d[index].options.slice();
      next[i] = value;
      return d.map((item, k) =>
        k === index ? { ...item, options: next } : item,
      );
    });
  };

  const addOption = () => {
    setDrafts(d =>
      d.map((item, i) =>
        i === index ? { ...item, options: [...item.options, ''] } : item,
      ),
    );
  };

  const removeOption = (i: number) => {
    setDrafts(d => {
      const next = d[index].options.slice();
      next.splice(i, 1);
      if (next.length === 0) next.push('');
      let correct = d[index].correctAnswer;
      if (correct >= next.length) correct = 0;
      if (correct > i) correct -= 1;
      return d.map((item, k) =>
        k === index ? { ...item, options: next, correctAnswer: correct } : item,
      );
    });
  };

  const advance = () => setIndex(i => (i < total - 1 ? i + 1 : i));

  // --- Crop handlers -------------------------------------------------------
  const enterCropMode = () => {
    if (!draft.imageData) return;
    setCropMode(true);
    setCropBox(null);
    setCropStart(null);
    setSelecting(false);
    setError(null);
  };

  const exitCropMode = () => {
    setCropMode(false);
    setSelecting(false);
    setCropBox(null);
    setCropStart(null);
  };

  /** Convert a mouse or touch pointer event into the shown image's natural-space coords. */
  const cropPointerPos = (
    e: MouseEvent | TouchEvent,
  ): { x: number; y: number } | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    let cx: number;
    let cy: number;
    if ('touches' in e && e.touches && e.touches.length) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches && e.changedTouches.length) {
      cx = e.changedTouches[0].clientX;
      cy = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      cx = e.clientX;
      cy = e.clientY;
    } else {
      return null;
    }
    const scale = img.naturalWidth / img.offsetWidth;
    return { x: (cx - rect.left) * scale, y: (cy - rect.top) * scale };
  };

  const handleCropStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cropMode || selecting) return;
    const pos = cropPointerPos(e.nativeEvent);
    if (!pos) return;
    setCropStart(pos);
    setSelecting(true);
    setCropBox({ xMin: pos.x, yMin: pos.y, xMax: pos.x, yMax: pos.y });
  };

  const handleCropMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cropMode || !selecting || !cropStart) return;
    const pos = cropPointerPos(e.nativeEvent);
    if (!pos) return;
    setCropBox({
      xMin: Math.min(cropStart.x, pos.x),
      yMin: Math.min(cropStart.y, pos.y),
      xMax: Math.max(cropStart.x, pos.x),
      yMax: Math.max(cropStart.y, pos.y),
    });
  };

  const handleCropEnd = () => {
    if (!cropMode || !selecting) return;
    setSelecting(false);
  };

  const applyCrop = async () => {
    if (
      !cropBox ||
      cropBox.xMax - cropBox.xMin < 10 ||
      cropBox.yMax - cropBox.yMin < 10
    ) {
      return;
    }
    const src = draft.imageData;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const cw = cropBox!.xMax - cropBox!.xMin;
      const ch = cropBox!.yMax - cropBox!.yMin;
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          img,
          cropBox!.xMin,
          cropBox!.yMin,
          cw,
          ch,
          0,
          0,
          cw,
          ch,
        );
      }
      const dataURL = c.toDataURL('image/png');
      updateDraft({ imageData: dataURL, cropApplied: true });
      setCropBox(null);
      setCropMode(false);
    };
    img.src = src;
  };

  /** Restore the full page image when the auto-crop was too aggressive (uncrop). */
  const restorePageImage = () => {
    if (draft.pageImageData) {
      updateDraft({ imageData: draft.pageImageData, cropApplied: false });
    }
  };

  const handleAccept = async () => {
    if (!canAccept) return;
    if (cropMode) return; // don't accept mid-crop
    setError(null);
    setUploading(true);
    try {
      let imageUrl = '';
      const d = drafts[index];
      if (d.attachImage && d.imageData) {
        const blob = dataURLToBlob(d.imageData);
        const file = new File([blob], `page-${index + 1}.png`, {
          type: 'image/png',
        });
        imageUrl = await uploadQuestionImage(file);
      }
      const payload: Omit<Question, 'id'> = {
        text: d.text.trim() || `Page question ${index + 1}`,
        options: d.options,
        correctAnswer: d.correctAnswer,
        topic: d.topic || 'General',
        subject: d.subject || 'General',
        year: '',
        ...(imageUrl ? { imageUrl } : {}),
      };
      await insertQuestions([payload]);
      setReviewed(r => ({ ...r, [index]: 'accepted' }));
      if (index < total - 1) {
        advance();
      } else {
        onBack();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(err);
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDiscard = () => {
    setReviewed(r => ({ ...r, [index]: 'discarded' }));
    if (index < total - 1) advance();
    else onBack();
  };

  if (!current) {
    return (
      <div className="pdf-review-empty">
        <AlertCircle className="icon" />
        <p>No questions were found in this document. Try a different file.</p>
        <button className="action-btn secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>
    );
  }

  const st: Status = statusFor(index);

  const cropRectStyle: React.CSSProperties = cropBox
    ? {
        left: cropBox.xMin / imgScale,
        top: cropBox.yMin / imgScale,
        width: (cropBox.xMax - cropBox.xMin) / imgScale,
        height: (cropBox.yMax - cropBox.yMin) / imgScale,
      }
    : {};

  return (
    <div className="pdf-premium-review">
      <div className="pdf-review">
        <header className="pdf-review-header">
          <div className="progress-bar" role="list">
            {questions.map((_, i) => {
              const s = statusFor(i);
              const active = i === index;
              return (
                <button
                  key={i}
                  type="button"
                  className={`marker marker-${s} ${active ? 'active' : ''}`}
                  onClick={() => setIndex(i)}
                  title={`Question ${i + 1} — ${s}`}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Question ${i + 1} (${s})`}
                >
                  {i === index ? (
                    <span className="marker-num">{i + 1}</span>
                  ) : s === 'accepted' ? (
                    <CheckCircle size={14} />
                  ) : s === 'discarded' ? (
                    <AlertCircle size={14} />
                  ) : (
                    <span className="marker-num">{i + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="pdf-review-meta">
            <span className="meta-chip">Question {index + 1} of {total}</span>
            <span className="meta-chip success">Accepted: {acceptedCount}</span>
            <span className="meta-chip danger">Discarded: {discardedCount}</span>
            <span className={`meta-chip ${st === 'pending' ? 'success' : ''}`}>
              Status: {st}
            </span>
          </div>
        </header>

        <main className="pdf-review-main">
          <div className="pdf-review-card">
            <div className="review-media">
              {draft.attachImage && draft.imageData ? (
                <div
                  className={`crop-wrapper ${cropMode ? 'crop-active' : ''}`}
                  ref={imgWrapRef}
                  style={{ position: 'relative', display: 'inline-block' }}
                >
                  <img
                    ref={imgRef}
                    className="review-image"
                    src={draft.imageData}
                    alt={`Diagram for question ${index + 1}`}
                  />
                  {cropMode && (
                    <div
                      className="crop-overlay"
                      onMouseDown={handleCropStart}
                      onMouseMove={handleCropMove}
                      onMouseUp={handleCropEnd}
                      onMouseLeave={handleCropEnd}
                      onTouchStart={handleCropStart}
                      onTouchMove={handleCropMove}
                      onTouchEnd={handleCropEnd}
                    />
                  )}
                  {cropMode && cropBox && (
                    <div className="crop-rect" style={cropRectStyle} />
                  )}
                  {cropMode && (
                    <div className="crop-hud">
                      <button
                        type="button"
                        className="action-btn accept"
                        onClick={applyCrop}
                        disabled={
                          cropBox == null ||
                          cropBox.xMax - cropBox.xMin < 10 ||
                          cropBox.yMax - cropBox.yMin < 10
                        }
                      >
                        <Check size={14} /> Apply crop
                      </button>
                      <button
                        type="button"
                        className="action-btn secondary"
                        onClick={exitCropMode}
                      >
                        <X size={14} /> Cancel crop
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="review-image-placeholder">
                  No diagram image attached (will not be saved on accept)
                </div>
              )}
              {draft.pageImageData && (
                <img
                  className="review-thumb"
                  src={draft.pageImageData}
                  alt="Full page reference"
                  title="Full page image — use Uncrop to restore"
                />
              )}
            </div>

            <div className="pdf-review-fields">
              <label className="field-label">Question text</label>
              <textarea
                className="text-area"
                value={draft.text}
                onChange={e => updateDraft({ text: e.target.value })}
                placeholder="Edit the question stem…"
                rows={4}
              />

              <div className="options-block">
                <div className="options-header">
                  <span className="field-label">
                    Options (mark the correct one)
                  </span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={addOption}
                    disabled={draft.options.length >= LETTERS.length}
                  >
                    + Add option
                  </button>
                </div>
                {draft.options.map((opt, i) => (
                  <div className="option-row" key={i}>
                    <span className="option-label">{LETTERS[i]}</span>
                    <input
                      className="option-input"
                      value={opt}
                      onChange={e => setOption(i, e.target.value)}
                      placeholder={`Option ${LETTERS[i]}`}
                    />
                    <label className="correct-radio">
                      <input
                        type="radio"
                        name="correct"
                        checked={draft.correctAnswer === i}
                        onChange={() => updateDraft({ correctAnswer: i })}
                      />
                      <span>Correct</span>
                    </label>
                    {draft.options.length > 2 && (
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove option"
                        onClick={() => removeOption(i)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="options-block">
                <div className="options-header">
                  <span className="field-label">Metadata</span>
                </div>
                <div className="marks-row">
                  <div className="marks-field">
                    <label>Subject</label>
                    <input
                      className="option-input"
                      value={draft.subject}
                      onChange={e => updateDraft({ subject: e.target.value })}
                      placeholder="e.g. Physics"
                    />
                  </div>
                  <div className="marks-field">
                    <label>Topic</label>
                    <input
                      className="option-input"
                      value={draft.topic}
                      onChange={e => updateDraft({ topic: e.target.value })}
                      placeholder="e.g. Mechanics"
                    />
                  </div>
                  <div className="marks-field">
                    <label>Marks</label>
                    <input
                      className="option-input"
                      type="number"
                      min={1}
                      max={20}
                      value={draft.marks}
                      onChange={e =>
                        updateDraft({
                          marks: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="controls-row">
                {draft.imageData && (
                  <>
                    <button
                      type="button"
                      className={`action-btn secondary ${cropMode ? 'crop-active' : ''}`}
                      onClick={enterCropMode}
                      disabled={uploading || cropMode}
                      title="Crop this diagram image"
                    >
                      <Crop size={16} /> Crop image
                    </button>
                    {draft.pageImageData && draft.pageImageData !== draft.imageData && (
                      <button
                        type="button"
                        className="action-btn secondary"
                        onClick={restorePageImage}
                        disabled={uploading || cropMode}
                        title="Restore full page image (uncrop)"
                      >
                        <RefreshCw size={14} /> Uncrop
                      </button>
                    )}
                  </>
                )}
                {draft.imageData && (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={draft.attachImage}
                      onChange={e =>
                        updateDraft({ attachImage: e.target.checked })
                      }
                      disabled={uploading || cropMode}
                    />
                    <span>Attach diagram image</span>
                  </label>
                )}
              </div>

              {error && (
                <div className="error-msg">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div className="review-actions">
                <button
                  type="button"
                  className="action-btn discard"
onClick={handleDiscard}
                  disabled={uploading || cropMode}
                >
                  <Trash2 size={16} /> Discard
                </button>
                <button
                  type="button"
                  className="action-btn accept"
                  onClick={handleAccept}
disabled={uploading || !canAccept || cropMode}
                >
                  {uploading ? (
                    <>
                      <span className="spinner" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Accept &amp; next
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className="pdf-review-footer">
<button
            type="button"
            className="action-btn secondary"
            onClick={() => setIndex(0)}
            disabled={uploading || cropMode}
          >
            Back to first
          </button>
          {index < total - 1 && (
            <button
              type="button"
              className="action-btn secondary"
onClick={advance}
              disabled={uploading || cropMode}
            >
              Skip to next
            </button>
          )}
          <button
            type="button"
            className="action-btn secondary"
onClick={onBack}
            disabled={uploading || cropMode}
          >
            Back to {returnTo === '/create-question' ? 'Create Question' : 'Create Test'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PdfImportPremiumReview;
