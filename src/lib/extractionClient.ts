/**
 * Client for the server-side extraction service (FastAPI).
 *
 * POSTs a PDF (or image) to `/extract` and receives the extractor's `data` dict:
 * { exam, subject, topic, ..., total_questions, questions: [...] }
 *
 * Each question carries `rendered_image_b64` (a base64 data-URL of the 2x-rendered
 * question band) and an `options` map (e.g. {"1":"a","2":"b"} for NEET or
 * {"A":"a",...}). The service redacts answer-key lines from the renders, so it
 * does NOT return the correct answer — the teacher sets it in review. No LLM, no credits.
 *
 * Also exposes `extractionExtractStream`, which POSTs to `/extract/stream` and
 * yields the same work as Server-Sent Events so the UI can show live progress.
 */

import type { ExtractedQuestion, PdfExtractResult } from './pdfExtract';

const isDev = import.meta.env?.DEV;
export const EXTRACTION_URL =
  isDev
    ? '/extraction'
    : import.meta.env?.VITE_QUESTIFY_URL || 'https://questify-ul4h.onrender.com';

export interface ExtractionQuestion {
  id: number | string;
  text?: string;
  type?: string;
  options?: Record<string, string> | string[];
  page?: number;
  equations?: unknown[];
  figures?: unknown[];
  rendered_image?: string;
  rendered_image_b64?: string;
  raw_text?: string;
}

export interface ExtractionData {
  exam?: string;
  subject?: string;
  topic?: string;
  date?: string;
  total_marks?: string | number;
  duration?: string;
  source_pdf?: string;
  total_questions?: number;
  questions: ExtractionQuestion[];
}

/** One decoded SSE frame from `/extract/stream`: `{ event, data }`. */
export interface ExtractionSseFrame {
  event: string;
  data: unknown;
}

/** Payload shape for a `progress-question` SSE frame. */
export interface ExtractionProgressFrame {
  index?: number;
  count?: number;
  total?: number;
  total_questions?: number;
  total_pages?: number;
  question?: ExtractionQuestion;
  error?: string;
}

function dataURLToBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] ?? 'image/png';
  const bstr = atob(parts[1]);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

/** Map a single backend question object to the review screen's `ExtractedQuestion` shape. */
export function mapExtractionQuestionToExtracted(
  q: ExtractionQuestion,
): ExtractedQuestion {
  const b64: string | undefined = q.rendered_image_b64;
  return {
    pageNumber: q.page ?? 1,
    text: q.text ?? '',
    options: optionsToArray(q.options),
    correctAnswer: 0, // not exposed by the service (answer-key lines are redacted)
    imageBlob: b64 ? dataURLToBlob(b64) : null,
    pageImage: b64 ?? null,
  };
}

/** Collapse the options map (e.g. {"1":"a","2":"b"}) into an ordered array. */
function optionsToArray(
  options: Record<string, string> | string[] | undefined,
): string[] {
  if (!options) return [];
  if (Array.isArray(options)) return options.map(o => (o == null ? '' : String(o)));
  return Object.keys(options)
    .sort((a, b) => {
      const an = Number(a);
      const bn = Number(b);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      if (!isNaN(an)) return -1;
      if (!isNaN(bn)) return 1;
      return a.localeCompare(b);
    })
    .map(k => (options as Record<string, string>)[k]);
}

/** Map the service's `data` dict to the PdfExtractResult shape used by the review screen. */
export function mapExtractionToExtracted(data: ExtractionData): PdfExtractResult {
  const questions: ExtractedQuestion[] = (data.questions ?? []).map(
    mapExtractionQuestionToExtracted,
  );
  const last = questions.length ? (questions[questions.length - 1].pageNumber ?? 1) : 1;
  return {
    questions,
    pageCount: last,
    pageImages: [],
    errors: [],
  };
}

/** GET /health — resolves true if the extraction service is reachable. */
export async function extractionHealth(): Promise<boolean> {
  const res = await fetch(`${EXTRACTION_URL}/health`, { method: 'GET' });
  if (!res.ok) return false;
  const body = await res.json().catch(() => ({}));
  return body.ok === true;
}

/** POST /extract — non-streaming fallback returning the parsed data dict. */
export async function extractionExtract(file: File): Promise<ExtractionData> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${EXTRACTION_URL}/extract`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status})${txt ? ': ' + txt : ''}`);
  }
  return (await res.json()) as ExtractionData;
}

/**
 * POST /extract/stream — stream extraction progress as Server-Sent Events.
 *
 * A file upload requires a request body, so this can't use the browser's native
 * `EventSource` (GET-only). Instead it POSTs and parses the response body with
 * the Streams API, honouring the standard SSE wire format (`event:` / `data:`
 * lines framed by a blank line). The returned `AbortController` cancels an
 * in-flight upload (e.g. on unmount or re-upload).
 *
 * If the streaming endpoint is absent (HTTP 404, e.g. a backend running an older
 * build), it transparently falls back to the non-streaming `extractionExtract`
 * and synthesises `progress-start` + `progress-done` frames so the UI flow is
 * identical either way.
 */
export function extractionExtractStream(
  file: File,
  onEvent: (frame: ExtractionSseFrame) => void,
  onError: (err: unknown) => void,
): AbortController {
  const controller = new AbortController();
  const form = new FormData();
  form.append('file', file);

  fetch(`${EXTRACTION_URL}/extract/stream`, {
    method: 'POST',
    body: form,
    signal: controller.signal,
  }).then(async (res) => {
    if (res.status === 404) {
      // Streaming endpoint missing — fall back to the classic POST /extract and
      // synthesise terminal events so the UI stays in sync.
      const data = await extractionExtract(file);
      onEvent({ event: 'progress-start', data: { total_pages: 1, total_questions: data.total_questions ?? 0 } });
      onEvent({ event: 'progress-done', data });
      return;
    }
    if (!res.ok) {
      throw new Error(`Stream request failed (${res.status})`);
    }
    const readable = res.body?.pipeThrough(new TextDecoderStream());
    if (!readable) {
      throw new Error('Streaming response is not supported by this browser.');
    }
    const reader = readable.getReader();
    let buf = '';
    const pump = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += value ?? '';
          let sep: number;
          // SSE frames are separated by a blank line (double newline).
          while ((sep = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, sep).trim();
            buf = buf.slice(sep + 2);
            if (frame) parseSseFrame(frame, onEvent, onError);
          }
        }
      } catch (e: unknown) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) onError(e);
      } finally {
        reader.releaseLock();
      }
    };
    pump();
  }).catch((e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    onError(e);
  });

  return controller;
}

/** Parse one SSE frame string (`event:` / `data:` lines) into a frame object. */
function parseSseFrame(
  frame: string,
  onEvent: (frame: ExtractionSseFrame) => void,
  onError: (err: unknown) => void,
) {
  const lines = frame.split('\n');
  let evt = 'message';
  let data = '';
  for (const ln of lines) {
    if (ln.startsWith('event:')) {
      evt = ln.slice(6).trim();
    } else if (ln.startsWith('data:')) {
      data += ln.slice(5).trimStart();
    }
  }
  if (data) {
    try {
      onEvent({ event: evt, data: JSON.parse(data) });
    } catch (e: unknown) {
      onError(e);
    }
  }
}

/** Convenience: POST /extract then map to PdfExtractResult. Used by the import screen's non-streaming path. */
export async function extractionExtractQuestions(file: File): Promise<PdfExtractResult> {
  const data = await extractionExtract(file);
  return mapExtractionToExtracted(data);
}
