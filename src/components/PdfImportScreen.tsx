import React, { useEffect, useRef, useState } from 'react';
import { FileText, Upload, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import PdfImportReview from './PdfImportReview';
import type { PdfExtractResult } from '../lib/pdfExtract';
import type { ExtractionData, ExtractionSseFrame } from '../lib/extractionClient';
import {
  EXTRACTION_URL,
  extractionHealth,
  extractionExtractStream,
  mapExtractionToExtracted,
} from '../lib/extractionClient';
import './PdfImport.css';

interface PdfImportScreenProps {
  onBack: () => void;
  /** Where the import flow should return on completion ('/create-test' | '/create-question'). */
  returnTo: string;
}

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB safety guard

/**
 * Orchestrates the PDF import journey:
 *  1. pick a .pdf / image file (guarded by size/type)
 *  2. upload it to the extraction service (server-side layout analysis)
 *  3. hand off the structured questions to the one-by-one review screen
 *
 * No LLM and no credits: text is read from the PDF layer (or the rendered image
 * is returned for on-demand review-screen OCR), giving clean output with no
 * PUA/garbled-symbol tofu.
 */
export const PdfImportScreen: React.FC<PdfImportScreenProps> = ({ onBack, returnTo }) => {
  const [step, setStep] = useState<'upload' | 'extracting' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PdfExtractResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressTotal, setProgressTotal] = useState<number | null>(null);
  const [progressCurrent, setProgressCurrent] = useState<number>(0);
  const streamRef = useRef<AbortController | null>(null);

  // Abort any in-flight upload on unmount.
  useEffect(() => () => streamRef.current?.abort(), []);

  // Probe the service once on mount. In dev the Vite proxy forwards
  // /extraction/* to the service, so no restart or proxy config is required.
  useEffect(() => {
    let live = true;
    extractionHealth()
      .then(() => {
        if (live) setServiceReady(true);
      })
      .catch(() => {
        if (live) setServiceReady(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const validate = (f: File): string | null => {
    const isPdf = f.name.toLowerCase().endsWith('.pdf');
    const isImage = f.type.startsWith('image/');
    if (!isPdf && !isImage) return 'Please select a PDF or image file.';
    if (f.size === 0) return 'The selected file is empty.';
    if (f.size > MAX_BYTES) return `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).`;
    return null;
  };

  const handleFile = (f: File) => {
    const err = validate(f);
    if (err) {
      alert(err);
      return;
    }
    setFile(f);
    setExtractError(null);
    setProgressMessage(null);
    runExtraction(f);
  };

  const runExtraction = async (f: File) => {
    if (!serviceReady) {
      setExtractError(
        `Extraction service is not reachable at ${EXTRACTION_URL}. Please verify the deployment is online and try again.`,
      );
      setStep('upload');
      return;
    }
    setStep('extracting');
    setProgressCurrent(0);
    setProgressTotal(null);
    setProgressMessage(`Sending ${f.name}…`);
    setExtractError(null);

    // Abort any prior in-flight extraction (e.g. a re-parse while one is running).
    streamRef.current?.abort();

  let finalResult: PdfExtractResult | null = null;

  // Free-tier Questify cold-shuts while idle. If an extraction runs longer than
  // the idle timeout, ping /health every 30s so the render service stays warm
  // for the whole stream (prevents a mid-parse shutdown).
  const keepAlive = setInterval(() => {
    extractionHealth().catch(() => {});
  }, 30000);
  try {
    await new Promise<void>((resolve, reject) => {
        const controller = extractionExtractStream(
          f,
          (frame: ExtractionSseFrame) => {
            const d = frame.data as ExtractionData & {
              index?: number;
              count?: number;
              total?: number;
              error?: string;
            };
            if (frame.event === 'progress-start') {
              setProgressTotal(d.total_questions ?? null);
              setProgressMessage(`Preparing ${d.total_questions ?? '?'} question(s)…`);
            } else if (frame.event === 'progress-question') {
              setProgressCurrent(d.count ?? d.index ?? 0);
              setProgressMessage(
                d.total
                  ? `Extracting question ${d.count} of ${d.total}…`
                  : `Extracting question ${d.count}…`,
              );
            } else if (frame.event === 'progress-done') {
              finalResult = mapExtractionToExtracted(d);
              setProgressMessage('Finishing up…');
              resolve();
            } else if (frame.event === 'progress-error') {
              reject(new Error(d.error ?? 'Extraction failed.'));
            }
          },
          (err: unknown) => {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            const msg = err instanceof Error ? err.message : String(err);
            reject(err instanceof Error ? err : new Error(msg));
          },
        );
        streamRef.current = controller;
      });
      if (finalResult) {
        setResult(finalResult);
        setStep('review');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExtractError(msg);
      setStep('upload');
    } finally {
      clearInterval(keepAlive);
      streamRef.current?.abort();
      streamRef.current = null;
      setProgressTotal(null);
      setProgressCurrent(0);
      setProgressMessage(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  if (step === 'review' && result) {
    return (
      <>
        <div className="pdf-review-backdrop">
          <PdfImportReview
            questions={result.questions}
            onComplete={() => {
              const accepted = result.questions.length; // rough count until review marks them
              alert(
                `Import complete! ${accepted} question(s) processed. Accepted questions are now in your question bank.`,
              );
              onBack();
            }}
          />
        </div>
      </>
    );
  }

  return (
    <div className="pdf-import-screen">
      <button
        className="action-btn secondary"
        onClick={onBack}
        style={{ marginBottom: '1rem' }}
      >
        <ArrowLeft size={16} /> Back to {returnTo === '/create-question' ? 'Create Question' : 'Create Test'}
      </button>

      <div className="pdf-import-card">
        <h1 className="pdf-import-title">Import questions from PDFs or images</h1>
        <p className="pdf-import-subtitle">
          Upload a typed, hand-written or scanned question paper (PDF or image). Questions
          are extracted server-side — no LLM, no credits, and Greek/math symbols stay
          clean. Each question is rendered for review, where you can crop the image and run
          on-demand OCR.
        </p>

        {step === 'extracting' && (
          <div className="extracting">
            <RefreshCw className="spin" size={28} />
            <p>Processing {file?.name}…</p>
            {progressTotal != null ? (
              <>
                <div className="progress-linear">
                  <div
                    style={{
                      width: `${Math.min(100, (progressCurrent / progressTotal) * 100)}%`,
                    }}
                  />
                </div>
<p className="note">{progressMessage ?? 'Extracting questions…'}</p>
              </>
            ) : (
              <p className="note">{progressMessage ?? 'This may take a moment — extraction runs server-side.'}</p>
            )}
            {extractError && (
              <div className="error-msg">
                <AlertCircle size={14} />
                <span>{extractError}</span>
              </div>
            )}
          </div>
        )}

        {extractError && step !== 'extracting' && (
          <div className="error-msg">
            <AlertCircle size={14} />
            <span>{extractError}</span>
          </div>
        )}

        {serviceReady === false && (
          <div className="error-msg">
            <AlertCircle size={14} />
            <span>Extraction service unreachable at {EXTRACTION_URL} — start it first.</span>
          </div>
        )}

        <div
          className={`upload-dropzone ${!file ? '' : 'has-file'}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => document.getElementById('pdf-file-input')?.click()}
        >
          <FileText size={36} className="dz-icon" />
          <div>
            {file ? (
              <strong>{file.name}</strong>
            ) : (
              <span>Drop a PDF or image here, or click to browse</span>
            )}
          </div>
          <input
            id="pdf-file-input"
            type="file"
            accept="application/pdf,image/*"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {file ? null : (
            <button
              type="button"
              className="upload-btn"
              onClick={e => {
                e.stopPropagation();
                document.getElementById('pdf-file-input')?.click();
              }}
            >
              <Upload size={16} /> Choose PDF or image
            </button>
          )}
        </div>

        {file && step !== 'extracting' && (
          <button type="button" className="upload-btn" onClick={() => handleFile(file)}>
            <RefreshCw size={16} /> Re-parse {file.name}
          </button>
        )}

        {result && step === 'upload' && (
          <p className="note-list">
            Found {result.pageCount} page(s). {result.questions.length} question(s)
            parsed. {result.errors.length > 0 && `${result.errors.length} warning(s).`}
          </p>
        )}
      </div>
    </div>
  );
};

export default PdfImportScreen;
