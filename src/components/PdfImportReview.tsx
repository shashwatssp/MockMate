import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  Trash2,
  CheckCircle,
  AlertCircle,
  Crop,
  EyeOff,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import type { Question } from '../types/exam.types';
import { insertQuestions, uploadQuestionImage } from '../lib/database';
import type { ExtractedQuestion, Band } from '../lib/pdfExtract';
import { parseQuestionText } from '../lib/pdfExtract';
import { ocrImageText, terminateOcrWorker } from '../lib/ocr';
import './PdfImport.css';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

interface Draft {
  text: string;
  options: string[];
  correctAnswer: number;
  /** Whether to persist the question's image on accept. */
  attachImage: boolean;
  /** Mutable per-question image (updated by the crop tool). */
  imageBlob: Blob | null;
  /** Mutable per-question preview (updated by the crop tool). */
  pageImage: string | null;
  /** True once OCR text has been applied to this question. */
  ocrApplied: boolean;
  /** True once the crop tool has produced a cropped image for this question. */
  cropApplied: boolean;
  /** Snapshot of the original image captured when crop mode was entered, so a
   *  second question can be carved out of the same photo after accepting. */
  originalImageBlob: Blob | null;
  originalPageImage: string | null;
}

interface PdfImportReviewProps {
  questions: ExtractedQuestion[];
  /** True while the backend is still streaming in new questions. */
  isGenerating?: boolean;
  /** Total expected questions (from the backend); used for the live "k of N" copy. */
  totalQuestions?: number;
  /** Called with the accepted count once the teacher finishes (navigates away). */
  onComplete: (accepted: number) => void;
}

type Status = 'pending' | 'accepted' | 'discarded';

function dataURLToBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] ?? 'image/png';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

/**
 * One-by-one review flow for PDF-extracted questions.
 *
 * The teacher walks through each question, edits the stem / options / correct
 * answer, optionally crops the image (and crops again to carve out another
 * region), can run on-device OCR to pre-fill text from handwriting, and chooses
 * Discard (skip), Accept (persist to the bank) or Finish early. The layout
 * collapses to a single column on mobile and a two-column grid on
 * laptop/tablet.
 */
export const PdfImportReview: React.FC<PdfImportReviewProps> = ({
  questions,
  isGenerating = false,
  totalQuestions,
  onComplete,
}) => {
  const total = totalQuestions ?? questions.length;
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState<Record<number, Status>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared factory so the lazy initializer and the growth effect below build one
  // question's draft with exactly the same shape.
  const makeDraft = (q: ExtractedQuestion): Draft => ({
    text: q.text,
    options: q.options.length ? q.options.slice() : ['', '', '', ''],
    correctAnswer: Math.min(
      q.correctAnswer,
      Math.max(0, (q.options.length || 4) - 1),
    ),
    attachImage: q.imageBlob != null,
    imageBlob: q.imageBlob,
    pageImage: q.pageImage,
    ocrApplied: false,
    cropApplied: false,
    originalImageBlob: q.imageBlob,
    originalPageImage: q.pageImage,
  });

  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(makeDraft));
  const prevQuestionsLenRef = useRef(questions.length);

  // As the server streams in new questions, append a draft for each newly-arrived
  // question WITHOUT resetting drafts already in flight (preserves edits). The
  // initial render seeds all loaded questions; subsequent polls only append tail.
  useEffect(() => {
    const n = questions.length;
    if (n > prevQuestionsLenRef.current) {
      const tail = questions
        .slice(prevQuestionsLenRef.current)
        .map(makeDraft);
      setDrafts(d => [...d, ...tail]);
      prevQuestionsLenRef.current = n;
    }
  }, [questions, isGenerating, totalQuestions]);

  // --- Crop state -----------------------------------------------------------
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [cropMode, setCropMode] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropBox, setCropBox] = useState<Band | null>(null);

  // --- OCR state ------------------------------------------------------------
  const [ocrLoading, setOcrLoading] = useState(false);
  // Text-off toggle (garbled OCR / image-only papers): hides rendered text while
  // still preserving edits so they persist on accept.
  const [hideText, setHideText] = useState(false);

  // Free the worker + its WASM heap once the whole review screen is left.
  useEffect(() => {
    return () => { void terminateOcrWorker(); };
  }, []);

  const acceptedCount = Object.values(reviewed)
    .filter(v => v === 'accepted').length;
  const discardedCount = Object.values(reviewed)
    .filter(v => v === 'discarded').length;

  const current = questions[index];
  // `draft` is undefined while the index points past what has arrived during live
  // extraction; the main render shows a "still extracting" placeholder.
  const draft = drafts[index] ?? (current ? makeDraft(current) : undefined);
  const canAccept = !!draft && draft.options.length >= 2;

  // Natural->display scale for the currently shown image (naturalWidth/renderedWidth).
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
      let correct = d[index].correctAnswer;
      if (next.length === 0) next.push('');
      if (correct >= next.length) correct = 0;
      if (correct > i) correct -= 1;
      return d.map((item, k) =>
        k === index ? { ...item, options: next, correctAnswer: correct } : item,
      );
    });
  };

  /** Remove OCR-extracted text from this question's options. Use this when the
   *  question is answered from a photo: the option letter (A/B/C/D) is already
   *  shown as a label, so clearing the option values turns each entry into just
   *  its letter while the image carries the option text.
   *  `correctAnswer` (an index) is preserved, so it still points at the right
   *  option letter. */
  const clearOptionText = () => {
    setDrafts(d =>
      d.map((item, i) =>
        i === index
          ? { ...item, options: Array(item.options.length).fill('') }
          : item,
      ),
    );
  };

  const advance = () => setIndex(i => (i < total - 1 ? i + 1 : i));
  const jumpTo = (i: number) => setIndex(i);

  const handleAccept = async () => {
    if (!canAccept) return;
    if (cropMode) return; // don't accept mid-crop
    setError(null);
    setUploading(true);
    try {
      let imageUrl = '';
      const d = drafts[index];
      if (d.attachImage && d.imageBlob) {
        const file = new File([d.imageBlob], `page-${current.pageNumber}.png`, {
          type: 'image/png',
        });
        imageUrl = await uploadQuestionImage(file);
      }
      const payload: Omit<Question, 'id'> = {
        text: d.text.trim() || `Page ${current.pageNumber} question`,
        options: d.options,
        correctAnswer: d.correctAnswer,
        topic: 'General',
        subject: 'General',
        year: '',
        // `marks`/`negative_marks` are no longer stored on the question bank
        // (they are decided when a test is built), so they are intentionally omitted.
        ...(imageUrl ? { imageUrl } : {}),
      };
      await insertQuestions([payload]);
      setReviewed(r => ({ ...r, [index]: 'accepted' }));
      if (d.cropApplied) {
        // A crop was used for this photo: do NOT advance to the next
        // pre-existing question. Stay on this card and reset it back to the
        // original image so the teacher can crop out and accept a second
        // question (or a third, ... ) from the same photo.
        setCropMode(false);
        setCropBox(null);
        setCropStart(null);
        setSelecting(false);
        updateDraft({
          cropApplied: false,
          imageBlob: d.originalImageBlob,
          pageImage: d.originalPageImage,
          attachImage: d.originalImageBlob != null,
          text: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          ocrApplied: false,
        });
      } else if (index < total - 1) {
        advance();
      } else {
        onComplete(acceptedCount);
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
    else onComplete(acceptedCount);
  };

  // --- Crop handlers --------------------------------------------------------
  const enterCropMode = () => {
    if (!draft.imageBlob || !draft.pageImage) return;
    // Snapshot the original (pre-crop) image so that, after accepting this crop,
    // the teacher can carve a second question out of the same photo.
    updateDraft({
      originalImageBlob: draft.imageBlob,
      originalPageImage: draft.pageImage,
    });
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

  /** Converts a mouse *or* touch pointer event into image-natural-space
   *  coordinates, so the same crop math works on laptop (mouse) and mobile
   *  (touch). Uses the image's bounding rect so it is independent of the
   *  overlay element size. */
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
    const src = draft.pageImage;
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
      const blob = dataURLToBlob(dataURL);
      // In-place crop: replace the working image but stay on this card, so the
      // teacher can crop again or accept the crop. `cropApplied` is flagged so
      // `handleAccept` knows to stay here (and reset) rather than advance.
      updateDraft({ imageBlob: blob, pageImage: dataURL, cropApplied: true });
      setCropBox(null);
      setCropMode(false);
    };
    img.src = src;
  };

  // --- OCR handlers ---------------------------------------------------------
  const handleOcrToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const on = e.target.checked;
    if (on && !draft.ocrApplied && draft.imageBlob) {
      setOcrLoading(true);
      setError(null);
      try {
        const text = await ocrImageText(draft.imageBlob);
        const parsed = parseQuestionText(text);
        setDrafts(prev =>
          prev.map((item, i) =>
            i === index
              ? {
                  ...item,
                  text: parsed ? parsed.stem || item.text : text.trim() || item.text,
                  options: parsed ? parsed.options : item.options,
                  correctAnswer: parsed ? parsed.correctAnswer : item.correctAnswer,
                  ocrApplied: true,
                }
              : item,
          ),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`OCR failed: ${msg}`);
      } finally {
        setOcrLoading(false);
      }
    } else {
      // Allow re-running by un-checking; text the teacher edited is preserved.
      setDrafts(prev =>
        prev.map((item, i) =>
          i === index ? { ...item, ocrApplied: on } : item,
        ),
      );
    }
  };

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
                onClick={() => jumpTo(i)}
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
          <span className="meta-chip">Page {current?.pageNumber ?? '—'}</span>
          <span className="meta-chip">Question {index + 1} of {total}</span>
          <span className="meta-chip success">Accepted: {acceptedCount}</span>
          <span className="meta-chip danger">Discarded: {discardedCount}</span>
          <span className={`meta-chip ${st === 'pending' ? 'success' : ''}`}>
            Status: {st}
          </span>
          {isGenerating && questions.length < total && (
            <span className="meta-chip extracting-pulse">
              <RefreshCw size={12} className="spin" /> Extracting…
            </span>
          )}
        </div>
      </header>

      <main className="pdf-review-main">
        {!current && isGenerating && questions.length < total ? (
          <div className="loading-next">
            <RefreshCw className="spin" size={18} />
            <span>
              Still extracting question {index + 1} of {total}…
            </span>
          </div>
        ) : !current ? (
          <div className="loading-next">
            <span>No questions have arrived yet.</span>
          </div>
        ) : (
          <div className="pdf-review-card">
          <div className="review-media">
            {draft.attachImage && draft.pageImage ? (
              <div
                className="crop-wrapper"
                ref={imgWrapRef}
                style={{ position: 'relative', display: 'inline-block' }}
              >
                <img
                  ref={imgRef}
                  className="review-image"
                  src={draft.pageImage}
                  alt={`Page ${current.pageNumber} preview`}
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
                Image not attached (will not be saved on accept)
              </div>
            )}
            {!draft.imageBlob && current.pageImage && (
              <img
                className="review-thumb"
                src={current.pageImage}
                alt={`Page ${current.pageNumber} reference`}
                title="Page reference"
              />
            )}
          </div>

          <div className="pdf-review-fields">
            <label className="field-label">Question text</label>
            <textarea
              className="text-area"
              value={hideText ? '' : draft.text}
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
                    value={hideText ? '' : opt}
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

            <div className="controls-row">
              {draft.imageBlob ? (
                <button
                  type="button"
                  className={`action-btn secondary ${cropMode ? 'crop-active' : ''}`}
                  onClick={enterCropMode}
                  disabled={uploading}
                  title="Crop this question's image (stay on this question so you can crop again or accept)"
                >
                  <Crop size={16} /> Crop image
                </button>
              ) : null}
              {draft.imageBlob && (
                <label className="checkbox-field ocr-toggle">
                  <input
                    type="checkbox"
                    checked={draft.ocrApplied}
                    onChange={handleOcrToggle}
                    disabled={ocrLoading || uploading || cropMode}
                  />
                  <span>
                    {ocrLoading ? (
                      <RefreshCw size={14} className="spin" />
                    ) : draft.ocrApplied ? (
                      <Check size={14} />
                    ) : null}{' '}
                    Use OCR text
                  </span>
                  {ocrLoading && <span className="ocr-note">reading…</span>}
                </label>
              )}
              {draft.imageBlob && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.attachImage}
                    onChange={e =>
                      updateDraft({ attachImage: e.target.checked })
                    }
                    disabled={uploading || cropMode}
                  />
                  <span>Attach question image</span>
                </label>
              )}
            <label className="checkbox-field hide-text-toggle">
              <input
                type="checkbox"
                checked={hideText}
                onChange={e => setHideText(e.target.checked)}
                disabled={uploading || cropMode}
              />
              <EyeOff size={14} />
              Hide question text
            </label>
            <button
              type="button"
              className="link-btn"
              onClick={clearOptionText}
              disabled={uploading || cropMode || !draft.options.some(o => o.trim())}
              title="Remove the OCR-extracted text from every option. Use when the question is answered from a photo: the option letters (A/B/C/D) remain as labels and the image carries the option text."
            >
              <X size={14} /> Clear extracted option text
            </button>
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
                disabled={uploading || ocrLoading}
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
                    <Save size={16} /> Accept & next
                  </>
                )}
              </button>
            </div>
          </div>
        </div>)} 
      </main>

      <footer className="pdf-review-footer">
        <button
          type="button"
          className="action-btn secondary"
          onClick={() => jumpTo(0)}
        >
          Back to first
        </button>
        {index < total - 1 && (
          <button
            type="button"
            className="action-btn secondary"
            onClick={advance}
            disabled={cropMode}
          >
            Skip to next
          </button>
        )}
        <button
          type="button"
          className="action-btn secondary"
          onClick={() => onComplete(acceptedCount)}
        >
          Finish ({acceptedCount} accepted, {discardedCount} discarded)
        </button>
      </footer>
    </div>
  );
};

export default PdfImportReview;
