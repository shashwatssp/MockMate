import React, { useState } from 'react';
import { FileText, Upload, RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import PdfImportReview from './PdfImportReview';
import { extractQuestionsFromFile } from '../lib/pdfExtract';
import type { PdfExtractResult } from '../lib/pdfExtract';
import './PdfImport.css';

interface PdfImportScreenProps {
  onBack: () => void;
  /** Where the import flow should return on completion ('/create-test' | '/create-question'). */
  returnTo: string;
}

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB safety guard

/**
 * Orchestrates the PDF import journey:
 *  1. pick a .pdf file (guarded by size/type)
 *  2. extract questions client-side with pdfjs-dist (lazy-loaded)
 *  3. hand off to the one-by-one review screen
 *
 * pdfjs is only imported the moment a file is confirmed, so the heavy PDF
 * runtime stays out of the initial bundle / critical path.
 */
export const PdfImportScreen: React.FC<PdfImportScreenProps> = ({ onBack, returnTo }) => {
  const [step, setStep] = useState<'upload' | 'extracting' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PdfExtractResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const validate = (f: File): string | null => {
    if (!f.name.toLowerCase().endsWith('.pdf')) return 'Please select a PDF file.';
    if (f.size === 0) return 'The selected PDF is empty.';
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
    runExtract(f);
  };

  const runExtract = async (f: File) => {
    setStep('extracting');
    try {
      const r = await extractQuestionsFromFile(f);
      setResult(r);
      setStep('review');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExtractError(msg);
      setStep('upload');
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
                `PDF import complete! ${accepted} question(s) processed. Accepted questions are now in your question bank.`,
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
      <button className="action-btn secondary" onClick={onBack} style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to {returnTo === '/create-question' ? 'Create Question' : 'Create Test'}
      </button>

      <div className="pdf-import-card">
        <h1 className="pdf-import-title">Import questions from PDF</h1>
        <p className="pdf-import-subtitle">
          Upload a hand-written, scanned or typed question paper. Questions are
          extracted on-device (no internet credits used) and presented one by one
          for you to edit, accept or discard.
        </p>

        {step === 'extracting' && (
          <div className="extracting">
            <RefreshCw className="spin" size={28} />
            <p>Analyzing {file?.name}</p>
            <p className="note">This may take a moment for large files…</p>
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
              <span>Drop a PDF here, or click to browse</span>
            )}
          </div>
          <input
            id="pdf-file-input"
            type="file"
            accept="application/pdf"
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
              <Upload size={16} /> Choose PDF
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
