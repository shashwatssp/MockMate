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

/** Create (and cache) a single worker shared across the session. Loads English
 *  plus Greek so science papers that use Greek/math symbols (Δ, μ, Ω) — which
 *  otherwise surface as PUA tofu in the text layer — are read correctly.
 *  Greek is best-effort: if the model fails to load (offline / CDN blocked),
 *  we fall back to English-only so OCR still works at reduced coverage. */
export async function getOcrWorker(): Promise<OcrWorker> {
  if (worker) return worker;
  if (loading) return loading;
  loading = (async () => {
    const { createWorker } = await import('tesseract.js');
    // tesseract.js v7: language models are passed to createWorker, which
    // auto-loads the WASM core + models. The v4/v5 `load()` / `loadLanguages()`
    // / `initialize()` calls were removed in v7 — calling them throws at runtime
    // (`w.loadLanguages is not a function`), silently breaking every OCR
    // salvage and returning the garbled fallback every time.
    try {
      const w = await createWorker('eng+ell');
      worker = w as unknown as OcrWorker;
    } catch (e) {
      // Greek model unavailable/offline — fall back to English only so OCR
      // still runs (the teacher reviews/edits the result afterwards).
      console.warn('[ocr] eng+ell worker failed, falling back to eng-only:', e);
      const w = await createWorker('eng');
      worker = w as unknown as OcrWorker;
    }
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
