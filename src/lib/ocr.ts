/**
 * On-demand OCR helper for hand-written / scanned question images.
 *
 * Uses `tesseract.js` (pure-WASM Tesseract 5 port) which runs entirely in the
 * browser — no server, no API keys, no credits consumed. The worker and its
 * ~10–30 MB WASM core are lazy-imported from `tesseract.js` only the moment a
 * teacher toggles "Use OCR text" in the PDF review screen, so the heavy OCR
 * stack never enters the initial bundle.
 *
 * Note on accuracy: the 2026 OCR benchmark shows Tesseract is weakest on
 * handwriting (≈23% char error vs ≈4% for GPT-4o). It is still the right call
 * here because it keeps every pixel on-device at zero marginal cost; the teacher
 * reviews and edits the result, so imperfect text is recoverable.
 */

type OcrWorker = {
  recognize(
    image: File | Blob | string,
    options?: Record<string, unknown>,
    overrides?: Record<string, unknown>,
  ): Promise<{ data: { text: string; confidence: number } }>;
  setParameters(params: Record<string, unknown>): Promise<void>;
  terminate(): Promise<void>;
};

let worker: OcrWorker | null = null;
let loading: Promise<OcrWorker> | null = null;

/** Create (and cache) a single English worker shared across the session. */
export async function getOcrWorker(): Promise<OcrWorker> {
  if (worker) return worker;
  if (loading) return loading;
  loading = (async () => {
    const { createWorker } = await import('tesseract.js');
    // Default English model. The teacher reviews / edits the OCR result, so we
    // favour speed and a clean bundle over aggressive parameter tuning.
    const w = await createWorker('eng');
    worker = w as unknown as OcrWorker;
    return worker;
  })();
  return loading;
}

/** Recognise text from an image Blob/File/data-URL and return the raw string. */
export async function ocrImageText(image: File | Blob | string): Promise<string> {
  const w = await getOcrWorker();
  const { data } = await w.recognize(image);
  return data.text;
}

/** Release the worker + its WASM heap. Call on screen unmount / completion. */
export async function terminateOcrWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
    worker = null;
  }
  loading = null;
}
