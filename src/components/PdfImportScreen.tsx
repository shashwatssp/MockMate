import { toErrorMessage } from '../lib/errors';
import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { FileText, Upload, RefreshCw, AlertCircle, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import PdfImportReview from './PdfImportReview';
import { TestConfigSection } from './TestConfigSection';
import type { ExtractedQuestion } from '../lib/pdfExtract';
import type {
  ExtractionData,
  ExtractionProgressFrame,
  ExtractionSseFrame,
  JobStatus,
} from '../lib/extractionClient';
import {
  EXTRACTION_URL,
  extractionHealth,
  extractionExtractStream,
  extractionStartJob,
  extractionPollJob,
  mapExtractionQuestionToExtracted,
} from '../lib/extractionClient';
import { createTest, getDifficulty, generateTestKey } from '../lib/database';
import { notifyError, notifySuccess } from '../lib/shareToast';
import type { Question, Test } from '../types/exam.types';
import './PdfImport.css';
import './CreateTest.css';

interface PdfImportScreenProps {
  onBack: () => void;
  /** Where the import flow should return on completion ('/create-test' | '/create-question'). */
  returnTo: string;
  /** Called with the created Test so the parent can update its list / navigate. */
  onCreateTest?: (test: Test) => void;
}

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB safety guard
const STORAGE_KEY = 'questify-resume-jobId';
const POLL_INTERVAL_MS = 2000;

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
export const PdfImportScreen: React.FC<PdfImportScreenProps> = ({ onBack, returnTo, onCreateTest }) => {
  const [step, setStep] = useState<'upload' | 'extracting' | 'review' | 'create-test'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [accumulatedQuestions, setAccumulatedQuestions] = useState<ExtractedQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressTotal, setProgressTotal] = useState<number | null>(null);
  const [progressCurrent, setProgressCurrent] = useState<number>(0);
  /**
   * When the screen was launched from CreateTest (`returnTo === '/create-test'`),
   * the accepted questions flow directly into a test-creation form instead of
   * bouncing back to the CreateTest wizard.
   */
  const isCreateTestMode = returnTo === '/create-test';
  const [acceptedQuestions, setAcceptedQuestions] = useState<Question[]>([]);

  // ── Test config state (mirrors CreateTest so TestConfigSection can be reused) ──
  const [testName, setTestName] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [duration, setDuration] = useState(90);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  // Document-level classification from the extraction service (subject, topic,
  // year). Populated when the full ExtractionData arrives; used as a fallback for
  // questions that lack per-question metadata.
  const [docSubject, setDocSubject] = useState<string | undefined>(undefined);
  const [docTopic, setDocTopic] = useState<string | undefined>(undefined);
  const [docYear, setDocYear] = useState<string | undefined>(undefined);
  // Refs so the current doc-level metadata is always available in mapping callbacks
  // without waiting for a state re-render.
  const docMetaRef = useRef<{ subject?: string; topic?: string; year?: string }>({});

  // ── Helpers (shared with TestConfigSection's parent expectations) ──
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const getSelectedTopicCounts = (): Record<string, number> => {
    return acceptedQuestions.reduce((acc, q) => {
      const topic = q.topic || 'Unknown Topic';
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  };

  const getAverageDifficulty = (): number => {
    if (!acceptedQuestions.length) return 0;
    const score = acceptedQuestions.reduce((sum, q) => {
      const diff = getDifficulty(q);
      if (diff === 'easy') return sum + 1;
      if (diff === 'hard') return sum + 3;
      return sum + 2; // medium
    }, 0);
    return Math.round(score / acceptedQuestions.length);
  };

  const handleCreateTest = async () => {
    if (!testName.trim() || acceptedQuestions.length === 0) {
      notifyError('Please enter a test name and select at least one question.');
      return;
    }
    if (!startDate || !startTime) {
      notifyError('Please select start date and time for the test.');
      return;
    }
    setIsCreating(true);
    try {
      const testKey = generateTestKey();
      const testData = {
        testKey,
        name: testName.trim(),
        description: testDescription.trim(),
        questions: randomizeQuestions
          ? shuffleArray([...acceptedQuestions])
          : acceptedQuestions,
        startDate: new Date(`${startDate}T${startTime}`),
        endTime: endTime ? new Date(endTime) : undefined,
        duration,
        timeLimit: duration,
        settings: {
          randomizeQuestions,
          allowReview,
          showCorrectAnswers,
        },
      };
      const result = await createTest(testData);
      if (result) {
        const createdTest: Test = {
          id: result.id,
          testKey: result.test_key,
          name: result.name,
          description: result.description || '',
          questions: result.questions,
          createdAt: new Date(result.created_at),
          startDate: new Date(result.start_date),
          duration: result.duration ?? result.time_limit,
          timeLimit: result.duration ?? result.time_limit,
          settings: result.settings,
        };
        if (onCreateTest) {
          onCreateTest(createdTest);
        } else {
          notifySuccess(`Test created successfully! Test Key: ${result.test_key}`);
        }
      }
    } catch (error) {
      notifyError(`Failed to create test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const streamRef = useRef<AbortController | null>(null);
  const pollRef = useRef<number | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const accumulatedCountRef = useRef(0);
  // Tracks whether we've already flipped from 'extracting' → 'review' during this
  // extraction run, so processJobStatus doesn't call setStep('review') per poll tick
  // (step would be stale in the setInterval closure without this). */
  const hasSwitchedToReviewRef = useRef(false);

  // On mount: resume a suspended extraction job found in localStorage if the tab was
  // closed/reopened during an in-flight extraction.
  // On unmount: stop polling but do NOT abort the server-side job — it continues
  // running and can be resumed by a future tab opening.
  useEffect(() => {
    const suspendedJobId = localStorage.getItem(STORAGE_KEY);
    if (suspendedJobId) {
      resumeJob(suspendedJobId);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (keepAliveRef.current) {
        clearInterval(keepAliveRef.current);
        keepAliveRef.current = null;
      }
      streamRef.current?.abort();
      streamRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      notifyError(err);
      return;
    }
    setFile(f);
    setExtractError(null);
    setProgressMessage(null);
    runExtraction(f);
  };

  /**
   * Clear the active polling interval. The server-side job keeps running —
   * closing/aborts the client poll only; the job can be resumed later.
   */
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  /**
   * Process one JobStatus snapshot from the async job API.
   * On "running", diffs new questions against accumulatedCountRef and
   * renders them one-by-one via flushSync (defeats React 19 auto-batching).
   * On "done", finalises the accumulated set and switches to review.
   */
  /** Apply doc-level classification from the ExtractionData envelope to state + refs. */
  const applyDocMeta = (data: ExtractionData | undefined) => {
    if (!data) return;
    if (data.subject) {
      docMetaRef.current.subject = data.subject;
      setDocSubject(data.subject);
    }
    if (data.topic) {
      docMetaRef.current.topic = data.topic;
      setDocTopic(data.topic);
    }
    if (data.date) {
      const year = new Date(data.date).getFullYear().toString();
      if (year && !isNaN(Number(year))) {
        docMetaRef.current.year = year;
        setDocYear(year);
      }
    }
  };

  const processJobStatus = (status: JobStatus) => {
    if (status.status === 'error') {
      setExtractError(status.error ?? 'Extraction failed.');
      setIsGenerating(false);
      setStep('upload');
      setProgressMessage(null);
      setProgressTotal(null);
      setProgressCurrent(0);
      stopPolling();
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const total = status.total ?? null;
    setProgressTotal(total);
    setProgressCurrent(status.processed);
    setIsGenerating(true);
    setTotalQuestions(total);

    // Capture doc-level classification from the data envelope (available even
    // during 'running' on some backends, and guaranteed when 'done').
    applyDocMeta(status.data);

    const newResults = status.results ?? [];
    if (newResults.length > accumulatedCountRef.current) {
      const newQuestions = newResults.slice(accumulatedCountRef.current);
      const prevCount = accumulatedCountRef.current;
      // Switch to review as soon as the first question arrives — mirrors the
      // SSE path's progress-start behaviour so the teacher can begin reviewing
      // while extraction continues in the background.
      if (!hasSwitchedToReviewRef.current) {
        hasSwitchedToReviewRef.current = true;
        flushSync(() => { setStep('review'); });
      }
      // Render new questions one-by-one via flushSync with small delays so the
      // teacher sees each question appear rather than a sudden jump to the
      // full set. This defeats React 19's automatic batching.
      newQuestions.forEach((q, i) => {
        setTimeout(() => {
          flushSync(() => {
            setProgressMessage(
              total && total > 0
                ? `Extracting question ${prevCount + i + 1} of ${total}…`
                : `Extracting question ${prevCount + i + 1}…`,
            );
            setAccumulatedQuestions((prev) => [
              ...prev,
              mapExtractionQuestionToExtracted(
                q,
                docMetaRef.current.subject,
                docMetaRef.current.topic,
              ),
            ]);
          });
        }, i * 80);
      });
      accumulatedCountRef.current = newResults.length;
    }

    if (status.status === 'done') {
      // Final flush: synchronously render any questions that haven't appeared
      // yet via the delayed forEach (covers the case where 'done' arrived
      // before the last setTimeout fired), then clean up.
      applyDocMeta(status.data);
      const remaining = (status.results ?? []).slice(accumulatedCountRef.current);
      if (remaining.length > 0) {
        flushSync(() => {
          setAccumulatedQuestions((prev) => [
            ...prev,
            ...remaining.map((q) =>
              mapExtractionQuestionToExtracted(
                q,
                docMetaRef.current.subject,
                docMetaRef.current.topic,
              ),
            ),
          ]);
        });
        accumulatedCountRef.current = status.results.length;
      }
      flushSync(() => {
        setIsGenerating(false);
        setProgressMessage(null);
        setProgressTotal(null);
        setProgressCurrent(0);
        setStep('review');
      });
      stopPolling();
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  /**
   * Single poll tick: request the latest job status and feed it to
   * processJobStatus. A 404 means the job expired or was cleaned up — clear
   * our bookkeeping and let the user retry.
   */
  const poll = async (id: string) => {
    if (!id) return;
    try {
      const status = await extractionPollJob(id);
      processJobStatus(status);
    } catch (e: unknown) {
      const is404 = e instanceof Error && /\b404\b/.test(e.message);
      if (is404) {
        setExtractError(
          'Extraction job expired (tab was closed too long). Please re-upload the file to restart.',
        );
      } else {
        const msg = toErrorMessage(e);
        setExtractError(msg);
      }
      setIsGenerating(false);
      setStep('upload');
      setProgressMessage(null);
      setProgressTotal(null);
      setProgressCurrent(0);
      stopPolling();
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  /** Begin polling /extract/status/{job_id} at a fixed interval. */
  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = window.setInterval(() => poll(id), POLL_INTERVAL_MS);
  };

  /**
   * Resume a suspended extraction job found in localStorage (tab was closed
   * mid-extraction and reopened).
   */
  function resumeJob(id: string) {
    setFile(null);
    setExtractError(null);
    setProgressMessage('Resuming extraction…');
    setProgressCurrent(0);
    setProgressTotal(null);
    setAccumulatedQuestions([]);
    setIsGenerating(false);
    setTotalQuestions(null);
    accumulatedCountRef.current = 0;
    hasSwitchedToReviewRef.current = false;
    setStep('extracting');
    startPolling(id);
  }

  /**
   * Start a new extraction using the async job API (POST /extract/start →
   * GET /extract/status/{job_id}). The job_id is persisted to localStorage so a
   * tab close/reopen resumes the same server-side job.
   *
   * Falls back to the SSE streaming path if the backend predates /extract/start
   * (HTTP 404), keeping backward compatibility with older Questify deployments.
   */
  const runExtraction = async (f: File) => {
    if (!serviceReady) {
      setExtractError(
        `Extraction service is not reachable at ${EXTRACTION_URL}. Please verify the deployment is online and try again.`,
      );
      setStep('upload');
      return;
    }

    // Stop any prior extraction (polling or SSE).
    stopPolling();
    streamRef.current?.abort();
    streamRef.current = null;

    setStep('extracting');
    setProgressCurrent(0);
    setProgressTotal(null);
    setProgressMessage(`Sending ${f.name}…`);
    setExtractError(null);
    setAccumulatedQuestions([]);
    setIsGenerating(false);
    setTotalQuestions(null);
    accumulatedCountRef.current = 0;
    hasSwitchedToReviewRef.current = false;
    setFile(f);
    // Reset doc-level classification metadata.
    setDocSubject(undefined);
    setDocTopic(undefined);
    setDocYear(undefined);
    docMetaRef.current = {};

    try {
      const id = await extractionStartJob(f);
      localStorage.setItem(STORAGE_KEY, id);
      setProgressMessage('Extraction started…');
      startPolling(id);
    } catch (e: unknown) {
      // /extract/start not available — fall back to the SSE streaming path.
      if (e instanceof Error && e.message.includes('404')) {
        runExtractionSse(f);
      } else {
        const msg = toErrorMessage(e);
        setExtractError(msg);
        setStep('upload');
        setProgressMessage(null);
        setProgressCurrent(0);
      }
    }
  };

  /**
   * Fallback extraction path using SSE streaming (POST /extract/stream).
   * Only invoked when the async job API (/extract/start) is unavailable.
   */
  const runExtractionSse = (f: File) => {
    setStep('extracting');
    setProgressCurrent(0);
    setProgressTotal(null);
    setProgressMessage(`Sending ${f.name}…`);
    setExtractError(null);
    setAccumulatedQuestions([]);
    setIsGenerating(false);
    setTotalQuestions(null);
    // Reset doc-level classification metadata.
    setDocSubject(undefined);
    setDocTopic(undefined);
    setDocYear(undefined);
    docMetaRef.current = {};

    // Free-tier Questify cold-shuts while idle. If an extraction runs longer than
    // the idle timeout, ping /health every 30s so the render service stays warm
    // for the whole stream (prevents a mid-parse shutdown).
    const keepAlive = setInterval(() => {
      extractionHealth().catch(() => {});
    }, 30000);

    const cleanup = () => {
      clearInterval(keepAlive);
      streamRef.current?.abort();
      streamRef.current = null;
    };

    const controller = extractionExtractStream(
      f,
      (frame: ExtractionSseFrame) => {
        const d = frame.data as ExtractionProgressFrame;
        if (frame.event === 'progress-start') {
          const total = d.total_questions ?? null;
          // The progress-start frame may carry the full ExtractionData envelope
          // (subject/topic/date). Capture whatever doc-level metadata is available.
          applyDocMeta(d as unknown as ExtractionData);
          // Switch to the review screen immediately and flush synchronously so the
          // teacher sees the review view without waiting for the next tick.
          flushSync(() => {
            setTotalQuestions(total);
            setProgressTotal(total);
            setProgressMessage(`Preparing ${total ?? '?'} question(s)…`);
            setAccumulatedQuestions([]);
            setIsGenerating(true);
            setStep('review');
          });
        } else if (frame.event === 'progress-question') {
          const count = d.count ?? d.index ?? 0;
          // flushSync forces a synchronous re-render for each question so the
          // teacher sees questions appear one-by-one. This defeats React 19's
          // automatic batching, which would otherwise coalesce multiple SSE
          // frames that arrive in the same network chunk into a single render —
          // hiding all incremental updates until progress-done overwrites them.
          flushSync(() => {
            setProgressCurrent(count);
            setProgressMessage(
              d.total
                ? `Extracting question ${count} of ${d.total}…`
                : `Extracting question ${count}…`,
            );
            if (d.question) {
              setAccumulatedQuestions(prev => [
                ...prev,
                mapExtractionQuestionToExtracted(
                  d.question!,
                  docMetaRef.current.subject,
                  docMetaRef.current.topic,
                ),
              ]);
            }
          });
        } else if (frame.event === 'progress-done') {
          // The streaming backend emits BOTH per-question `progress-question` events
          // AND a final `progress-done` carrying the FULL question set. If questions
          // were already accumulated incrementally, keep them — overwriting would just
          // cause a jarring re-mount of identical content. Only fall back to the
          // bundled payload when the stream was non-incremental (e.g. 404 fallback)
          // and the accumulated array is still empty.
          const data = d as unknown as ExtractionData;
          // Capture document-level classification from the final envelope.
          applyDocMeta(data);
          flushSync(() => {
            if (d.question) {
              setAccumulatedQuestions(prev => [
                ...prev,
                mapExtractionQuestionToExtracted(
                  d.question!,
                  docMetaRef.current.subject,
                  docMetaRef.current.topic,
                ),
              ]);
            }
            if (data.questions && Array.isArray(data.questions)) {
              setAccumulatedQuestions(prev =>
                prev.length > 0
                  ? prev
                  : data.questions!.map((q) =>
                      mapExtractionQuestionToExtracted(q, data.subject, data.topic),
                    ),
              );
            }
            setIsGenerating(false);
            setProgressMessage(null);
            setProgressTotal(null);
            setProgressCurrent(0);
          });
          cleanup();
        } else if (frame.event === 'progress-error') {
          setExtractError(d.error ?? 'Extraction failed.');
          setIsGenerating(false);
          setStep('upload');
          setProgressMessage(null);
          setProgressTotal(null);
          setProgressCurrent(0);
          cleanup();
        }
      },
      (err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = toErrorMessage(err);
        setExtractError(msg);
        setIsGenerating(false);
        setStep('upload');
        setProgressMessage(null);
        setProgressTotal(null);
        setProgressCurrent(0);
        cleanup();
      },
    );
    streamRef.current = controller;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  if (step === 'create-test') {
    return (
      <div className="pdf-import-screen">
        <button
          className="action-btn secondary"
          onClick={() => setStep('review')}
          style={{ marginBottom: '1rem' }}
        >
          <ArrowLeft size={16} /> Back to review
        </button>
        <div className="pdf-import-card">
          <h1 className="pdf-import-title">Create Test from PDF</h1>
          <p className="pdf-import-subtitle">
            {acceptedQuestions.length} question(s) accepted from your PDF.
            Give your test a name and configure the settings below.
          </p>
          <TestConfigSection
            testName={testName}
            setTestName={setTestName}
            testDescription={testDescription}
            setTestDescription={setTestDescription}
            startDate={startDate}
            setStartDate={setStartDate}
            startTime={startTime}
            setStartTime={setStartTime}
            endTime={endTime}
            setEndTime={setEndTime}
            duration={duration}
            setDuration={setDuration}
            randomizeQuestions={randomizeQuestions}
            setRandomizeQuestions={setRandomizeQuestions}
            allowReview={allowReview}
            setAllowReview={setAllowReview}
            showCorrectAnswers={showCorrectAnswers}
            setShowCorrectAnswers={setShowCorrectAnswers}
            selectedTopicCounts={getSelectedTopicCounts()}
            estimatedDuration={duration}
            averageDifficulty={getAverageDifficulty()}
            selectedQuestionsCount={acceptedQuestions.length}
            isLoaded={true}
          />
          <div className="pdf-create-test-cta">
            <button
              type="button"
              className={`create-test-fab ${isCreating ? 'creating' : ''}`}
              onClick={handleCreateTest}
              disabled={
                !testName.trim() ||
                isCreating ||
                !startDate ||
                !startTime ||
                acceptedQuestions.length === 0
              }
            >
              {isCreating ? (
                <div className="fab-content creating">
                  <div className="loading-spinner"></div>
                  <span>Creating…</span>
                </div>
              ) : (
                <div className="fab-content">
                  <Sparkles className="fab-icon" />
                  <span className="fab-text">Create Test</span>
                  <ArrowRight className="fab-arrow" />
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <>
        <div className="pdf-review-backdrop">
            <PdfImportReview
            questions={accumulatedQuestions}
            isGenerating={isGenerating}
            totalQuestions={totalQuestions ?? undefined}
            createTestMode={isCreateTestMode}
            docSubject={docSubject}
            docTopic={docTopic}
            docYear={docYear}
            onComplete={(accepted, questions) => {
              if (isCreateTestMode && questions && questions.length > 0) {
                setAcceptedQuestions(questions);
                setStep('create-test');
              } else {
                notifySuccess(
                  `Import complete! ${accepted} question(s) processed. Accepted questions are now in your question bank.`,
                  6000,
                );
                onBack();
              }
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

        {accumulatedQuestions.length > 0 && step === 'upload' && (
          <p className="note-list">
            Found {accumulatedQuestions.length} question(s) parsed.
          </p>
        )}
      </div>
    </div>
  );
};

export default PdfImportScreen;
