/**
 * Spatial PDF/Image → question extraction pipeline.
 *
 * Reimplements the PyMuPDF (fitz) reference architecture in pure browser
 * TypeScript using pdfjs-dist as the rendering + text-extraction engine.
 * All processing happens client-side — no server, no API keys, no credits.
 *
 * Core ideas (ported from the Python reference):
 *  1. Spatial segmentation — question positions detected via numbering-pattern
 *     + y-coordinate matching, NOT just whitespace gaps.
 *  2. Auto-detection of format — numbering style (decimal, letter, Roman),
 *     option format, header/footer, separator lines, watermarks.
 *  3. Image replacement (white rectangles) for watermark removal — NOT redaction.
 *  4. Targeted redaction for answer-key lines ("Answer: B", etc.).
 *  5. Pattern-normalised header/footer detection + trimming.
 *  6. Font-relaxed detection for N. (Roman numeral) question numbering.
 *
 * Supports both PDF files and raster images (PNG/JPG).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedQuestion {
  /** 1-based page number the question came from. */
  pageNumber: number;
  /** Question stem text (may be empty for pure image questions). */
  text: string;
  /** Options (variable length; defaults to A/B/C/D for image questions). */
  options: string[];
  /** Index of the correct option; defaults to 0 so the teacher can re-mark. */
  correctAnswer: number;
  /** Per-question image blob (cropped band or whole page) used when the page is image-backed. */
  imageBlob: Blob | null;
  /** Base64 data URL of the page (served as context in the review UI). */
  pageImage: string | null;
}

export interface PdfExtractResult {
  questions: ExtractedQuestion[];
  pageCount: number;
  /** One base64 thumbnail per rendered page. */
  pageImages: string[];
  /** Human-readable notes/warnings gathered while parsing. */
  errors: string[];
}

/** A rectangle in canvas pixels. */
export interface Band {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/** Same shape as the old Gemini pipeline output — kept so the premium review
 * screen can consume spatial-extraction results without changes. */
export interface GeminiQuestion {
  text: string;
  options: string[];
  correctAnswer: number;
  subject: string;
  topic: string;
  marks: number;
  /** True only when this question requires a visual diagram/figure. */
  hasDiagram: boolean;
  /** Normalised bounding box (0–1) of the diagram within the source page image. */
  diagramBbox?: { x: number; y: number; width: number; height: number };
  /** Base64 data URL of the clean cropped diagram (only for hasDiagram questions). */
  imageData?: string;
  imageMimeType?: string;
  /** Base64 data URL of the full source page/image (for reference / uncrop in review). */
  pageImageData?: string;
}

export interface GeminiExtractProgress {
  status: 'processing' | 'complete' | 'error';
  currentPage?: number;
  totalPages?: number;
  message?: string;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PAGES = 60;
const RENDER_SCALE = 2; // 2x for crisp image crops
const Y_TOL = 7; // px tolerance for grouping text items into a line

/** Markers that introduce an option on an option line: numeric paren `(1)`,
 *  letter paren `(A)`, bare letter `A.`/`A)`, but NOT bare `1.` (which belongs to
 *  question numbers). Used to split option lines — including two options that
 *  wrapped onto a single text line, e.g. "(1)foo(2)bar". */
const OPTION_MARKER_GLOBAL = /\([1-9]\d*\)|\([A-Ea-e]\)|[A-Ea-e][\.)]/g;
const OPTION_RE = /^(\()([A-Ea-e])(\))\s*[\.\)]?\s+(.*)$|^([A-Ea-e])\s*[\.\)]\s+(.*)$/;
const DEFAULT_LETTERS = ['A', 'B', 'C', 'D'];

// Leading question-number prefix to strip from a question's first stem line
// (e.g. "Q.1 ", "1. ", "(1) ") so the extracted stem begins at the real text.
const QUESTION_NUMBER_PREFIX_RE = /^\s*(?:\((?:Q\.)?\s*\d+\)|Q\.?\s*\d+|\d+)[\.\)]\s*/;

// Answer-key line patterns: "Answer: B", "Ans. (a)", "Answer: 3", etc.
const ANSWER_LINE_RE =
  /^(?:answer|ans|key|solution)\s*[:\.]?\s*(?:\(?([A-Ea-e0-9]+)\)?|([A-Ea-e0-9]+))/i;

// ─── PDF.js text item types ──────────────────────────────────────────────────

export type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontSize?: number;
};

export type MappedItem = { str: string; x: number; y: number; w: number; h: number };

export type Line = {
  text: string;
  label?: string; // 'A'..'E' when the line is an option
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

type LineBuilder = { yAnchor: number; parts: MappedItem[] };

// ─── Numbering-style auto-detection ──────────────────────────────────────────

export type NumberingStyle =
  | 'decimal'
  | 'q-number'
  | 'paren-decimal'
  | 'letter'
  | 'paren-letter'
  | 'roman'
  | 'paren-roman'
  | 'unknown';

/** Regex sources per numbering style. Roman patterns are font-relaxed —
 *  they rely purely on the character sequence, not on font metadata. */
const NUMBERING_PATTERNS: Record<NumberingStyle, RegExp> = {
  decimal: /^\d+[\.\)]\s*/,
  // "Q.1", "Q 42", "Q.1)" — the numbering family used by NEET/JEE/BM papers.
  'q-number': /^Q\.?\s*(\d+)[\.\)]?\s/,
  'paren-decimal': /^\(\d+[\.\)]\s/,
  letter: /^[a-j][\.\)]\s/,
  'paren-letter': /^\([a-j][\.\)]\s/,
  roman: /^[ivxlcdm]+[\.\)]\s/i,
  'paren-roman': /^\([ivxlcdm]+[\.\)]\s/i,
  unknown: /^$/,
};

/** Inspect the first *k* question-like lines and pick the dominant numbering
 *  style. Falls back to `decimal` (most common in exam papers). */
export function detectNumberingStyle(lines: Line[]): NumberingStyle {
  const candidates = lines.slice(0, 12);
  const counts: Record<NumberingStyle, number> = {
    decimal: 0,
    'q-number': 0,
    'paren-decimal': 0,
    letter: 0,
    'paren-letter': 0,
    roman: 0,
    'paren-roman': 0,
    unknown: 0,
  };
  for (const line of candidates) {
    const trimmed = line.text.trim();
    // Skip option lines (lettered labels A–E, and numeric/letter paren options like
    // "(1) …" / "(A) …") — they must never be counted as question-number styles.
    if (!trimmed || line.label || parseOptionLine(trimmed) !== null) continue;
    for (const style of [
      'q-number',
      'paren-decimal',
      'paren-roman',
      'paren-letter',
      'decimal',
      'roman',
      'letter',
    ] as const) {
      if (NUMBERING_PATTERNS[style].test(trimmed)) {
        counts[style]++;
        break;
      }
    }
  }
  let best: NumberingStyle = 'decimal';
  let bestCount = counts.decimal;
  for (const style of ['q-number', 'paren-decimal', 'paren-roman', 'paren-letter', 'roman', 'letter'] as const) {
    if (counts[style] > bestCount) {
      best = style;
      bestCount = counts[style];
    }
  }
  return best;
}

export interface QuestionMatch {
  number: number;
  raw: string;
}

/** Mutable per-page state threaded across all pages of a paper so the question
 *  start gate can enforce sequence monotonicity (no duplicate/decreasing/large-jump
 *  numbers — the Bug C over-count filter). Reset once per document. */
export interface StartState {
  lastNum: number;
}

/** Tokenise an option line into its one-or-more option bodies,
 *  handling markers `(1)`, `(A)`, `A.`, `A)` — including two options that
 *  wrapped onto a single text line, e.g. "(1)foo(2)bar".
 *  Returns null when the line does NOT start with an option marker (so stem
 *  lines and "Answer (n)" lines are left alone). */
export function parseOptionLine(text: string): string[] | null {
  const markers = Array.from(text.matchAll(OPTION_MARKER_GLOBAL));
  if (markers.length === 0 || markers[0].index !== 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const bodyStart = (markers[i].index as number) + markers[i][0].length;
    const bodyEnd =
      i + 1 < markers.length ? (markers[i + 1].index as number) : text.length;
    let body = text.slice(bodyStart, bodyEnd).trim();
    // Drop a stray leading ".." / ")" left after a marker with no body yet.
    body = body.replace(/^[^A-Za-z0-9]+/, '').trim();
    if (body) parts.push(body);
  }
  // Markers present but every body was empty (e.g. "(1)(2)" for a question whose
  // option text is image-only — the symbols have no text-layer counterpart). Still
  // surface one (empty) option per marker so the band keeps the right option count.
  return parts.length ? parts : markers.map(() => '');
}

/** Collect question-start line indices in strict sequence order.
 *  Accepts a candidate start only when:
 *   • it matches the dominant numbering style,
 *   • it is NOT an option line (Line.label is set for lettered options),
 *   • its number is within [lastNum+1 .. lastNum+3] (monotonicity gate — allows
 *     a small forward skip for a mis-numbered line and rejects repeats/jumps).
 *  `state.lastNum` is updated in place and should persist across pages. */
export function collectQuestionStartIndices(
  lines: Line[],
  style: NumberingStyle,
  state: StartState = { lastNum: 0 },
): number[] {
  const idx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip blank / option lines (labelled lettered options, and numeric/letter
    // paren options such as "(1) …" / "(A) …"). With gap-aware line joining,
    // option lines now keep their post-marker space and would otherwise match the
    // paren-decimal question-number pattern, producing false starts.
    if (!line.text.trim() || line.label || parseOptionLine(line.text) !== null) continue;
    const m = matchQuestionNumber(line, style);
    if (!m) continue;
    const n = m.number;
    if (n >= state.lastNum + 1 && n <= state.lastNum + 3) {
      idx.push(i);
      state.lastNum = n;
    }
  }
  return idx;
}

/** Return the question number if the line starts with one, else null.
 *  Font-relaxed: Roman numerals are matched purely by character pattern. */
export function matchQuestionNumber(
  line: Line,
  style: NumberingStyle,
): QuestionMatch | null {
  const text = line.text.trim();
  if (!text) return null;

  // Try the detected (dominant) style only — a per-paper dominant-style gate.
  // The broad cross-style fallback was removed (Phase 2, Bug C): it caused option
  // lines such as "(1)" to be mis-read as question starts on mixed-format papers.
  const m = text.match(NUMBERING_PATTERNS[style]);
  if (!m) return null;

  const prefix = m[0].trim();
  const digits = prefix.match(/[ivxlcdm]+/gi);
  if (style === 'roman' || style === 'paren-roman') {
    const roman = (digits?.[0] ?? '').toUpperCase();
    if (roman) return { number: romanToInt(roman), raw: prefix };
  } else {
    // Pull the first digit run so prefixed styles like "Q.1" / "Q)1" resolve.
    // parseInt on the whole prefix would stop at the leading "Q" and yield NaN.
    const num = parseInt(prefix.match(/\d+/)?.[0] ?? 'NaN', 10);
    if (!Number.isNaN(num)) return { number: num, raw: prefix };
  }
  return null;
}

/** Minimal Roman → integer conversion (font-relaxed). */
function romanToInt(s: string): number {
  const vals: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = vals[s[i]] ?? 0;
    if (v < prev) total -= v;
    else {
      total += v;
      prev = v;
    }
  }
  return total;
}

// ─── PDF.js setup (lazy-loaded) ──────────────────────────────────────────────

/** Lazily load pdfjs-dist so its worker stays out of the main bundle. */
async function getPdfjs(): Promise<any> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjs;
}

// ─── Text extraction & line grouping ─────────────────────────────────────────

export function extractItemsFromTextContent(
  textContent: any,
  items: PdfTextItem[],
): PdfTextItem[] {
  for (const item of textContent.items as Array<Record<string, unknown>>) {
    const str = item?.str;
    if (typeof str === 'string' && str.trim().length > 0) {
      items.push(item as unknown as PdfTextItem);
    }
  }
  return items;
}

/** Map a pdfjs text item to canvas-pixel coordinates (flips the PDF
 *  baseline-origin to canvas top-origin using the page height transform). */
function mapItem(item: PdfTextItem, pageHeight: number): MappedItem {
  const [, , , , e, f] = item.transform;
  const x = e;
  const y = pageHeight - f; // flip: PDF bottom-origin → canvas top-origin
  const h = item.height || item.fontSize || 12;
  return { str: item.str, x, y, w: item.width || 0, h };
}

export function groupItemsIntoLines(items: PdfTextItem[], pageHeight: number): Line[] {
  const mapped: MappedItem[] = items.map(item => mapItem(item, pageHeight));
  mapped.sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: Line[] = [];
  let cur: LineBuilder | null = null;
  for (const t of mapped) {
    if (cur && Math.abs(t.y - cur.yAnchor) <= Y_TOL) {
      cur.parts.push(t);
    } else {
      if (cur) flushLine(cur, lines);
      cur = { yAnchor: t.y, parts: [t] };
    }
  }
  if (cur) flushLine(cur, lines);
  return lines;
}

function flushLine(cur: LineBuilder, out: Line[]): void {
  cur.parts.sort((a, b) => a.x - b.x);
  // Join adjacent TextItems, inserting a space between items only when the
  // horizontal gap between the previous item's right edge and the next item's
  // left edge exceeds ~20% of the previous item's average character width.
  // This repairs word-joining bugs (e.g. "thecorrectrelation") while leaving
  // legitimate single-word splits across TextItems (near-zero gap) intact.
  let built = '';
  for (let i = 0; i < cur.parts.length; i++) {
    const prev = cur.parts[i - 1];
    const curr = cur.parts[i];
    if (prev) {
      const gap = curr.x - (prev.x + prev.w);
      const avgCharW = prev.str.length ? prev.w / prev.str.length : 0;
      const threshold = avgCharW > 0 ? 0.2 * avgCharW : 4;
      if (gap > threshold) built += ' ';
    }
    built += curr.str;
  }
  const text = built.replace(/\s{2,}/g, ' ').trim();
  const xMin = Math.min(...cur.parts.map(p => p.x));
  const xMax = Math.max(...cur.parts.map(p => p.x + p.w));
  const yMin = Math.min(...cur.parts.map(p => p.y));
  const yMax = Math.max(...cur.parts.map(p => p.y + p.h));
  const trimmed = text.trim();
  const opt = trimmed.match(OPTION_RE);
  out.push({
    text: trimmed,
    label: opt ? (opt[2] ?? opt[5]).toUpperCase() : undefined,
    xMin,
    yMin,
    xMax,
    yMax,
  });
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise(resolve => {
    canvas.toBlob(b => resolve(b ?? new Blob()), 'image/png');
  });
}

/** Crop a rectangular [xMin,yMin][xMax,yMax] region from a canvas into a fresh
 *  canvas, returning both a base64 data-URL (for review thumbnails) and a Blob. */
async function cropCanvas(
  canvas: HTMLCanvasElement,
  band: Band,
): Promise<{ dataURL: string; blob: Blob }> {
  const cw = Math.round(band.xMax - band.xMin);
  const ch = Math.round(band.yMax - band.yMin);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.drawImage(
      canvas,
      band.xMin,
      band.yMin,
      cw,
      ch,
      0,
      0,
      cw,
      ch,
    );
  }
  const dataURL = c.toDataURL('image/png');
  const blob = await canvasToBlob(c);
  return { dataURL, blob };
}

/** Down-scale a canvas to a small analysis width, returning the grayscale pixel
 *  data plus the per-row ink counts. Used for band-splitting, diagram detection,
 *  and watermark scanning. */
function analyzeCanvas(canvas: HTMLCanvasElement, analysisW: number = 240) {
  const aw = analysisW;
  const ah = Math.max(2, Math.round(aw * (canvas.height / canvas.width)));
  const ac = document.createElement('canvas');
  ac.width = aw;
  ac.height = ah;
  const actx = ac.getContext('2d');
  if (!actx) return { aw, ah, scale: 1, data: new Uint8ClampedArray(0), rowInk: [] as boolean[] };
  actx.drawImage(canvas, 0, 0, aw, ah);
  const data = actx.getImageData(0, 0, aw, ah).data;
  const scale = canvas.height / ah;
  const inkThreshold = Math.max(1, Math.round(aw * 0.015));
  const rowInk: boolean[] = new Array(ah);
  for (let y = 0; y < ah; y++) {
    let dark = 0;
    const base = y * aw * 4;
    for (let x = 0; x < aw; x++) {
      const i = base + x * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 230) dark++;
    }
    rowInk[y] = dark >= inkThreshold;
  }
  return { aw, ah, scale, data, rowInk };
}

// ─── Visual cleanup: watermark removal, answer-line redaction, header/footer trim ─

/** Detect watermark regions on a rendered page.
 *
 *  A watermark is text that is:
 *   — light gray (low ink density but visible), and
 *   — either rotated/diagonal OR repeated at multiple positions.
 *
 *  We approximate by scanning for text items whose rendering shows up as
 *  sparse ink in a diagonal band or as repeated light-gray strings. In
 *  practice this catches "DRAFT", "CONFIDENTIAL", page-number stamps, etc. */
function detectWatermarks(
  lines: Line[],
  canvas: HTMLCanvasElement,
  _pageHeight: number,
): Band[] {
  const { aw, ah, scale } = analyzeCanvas(canvas);
  // Build per-row ink counts for density analysis.
  const inkThreshold = Math.max(1, Math.round(aw * 0.015));
  const rowInk: number[] = new Array(ah).fill(0);
  const ac = document.createElement('canvas');
  ac.width = aw;
  ac.height = ah;
  const actx = ac.getContext('2d');
  if (!actx) return [];
  actx.drawImage(canvas, 0, 0, aw, ah);
  const data = actx.getImageData(0, 0, aw, ah).data;
  for (let y = 0; y < ah; y++) {
    let dark = 0;
    const base = y * aw * 4;
    for (let x = 0; x < aw; x++) {
      const i = base + x * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 230) dark++;
    }
    rowInk[y] = dark;
  }

  // Light-gray rows: ink present but below 60% of threshold (watermark strength).
  const watermarkRows = new Set<number>();
  for (let y = 0; y < ah; y++) {
    if (rowInk[y] > 0 && rowInk[y] < inkThreshold * 0.6) {
      watermarkRows.add(y);
    }
  }

  // Group consecutive watermark rows into bands (in canvas pixels).
  const bands: Band[] = [];
  let start = -1;
  for (let y = 0; y < ah; y++) {
    if (watermarkRows.has(y)) {
      if (start < 0) start = y;
    } else {
      if (start >= 0) {
        bands.push(bandFromRows(start, y - 1, scale, canvas));
      }
      start = -1;
    }
  }
  if (start >= 0) {
    bands.push(bandFromRows(start, ah - 1, scale, canvas));
  }

  // Also detect diagonal watermarks via text-transform angle analysis.
  for (const line of lines) {
    // A line with a strong skew in its text items suggests rotation.
    // Check if the text is light (low contrast) by its bounding box ink density.
    const y0 = Math.round(line.yMin / scale);
    const y1 = Math.round(line.yMax / scale);
    let totalInk = 0;
    let totalPixels = 0;
    for (let y = Math.max(0, y0 - 1); y <= Math.min(ah - 1, y1 + 1); y++) {
      totalInk += rowInk[y] ?? 0;
      totalPixels += aw;
    }
    if (totalPixels > 0 && totalInk < totalPixels * 0.002) {
      // Very sparse ink — likely a watermark stamp.
      bands.push({
        xMin: 0,
        yMin: Math.max(0, line.yMin - 4),
        xMax: canvas.width,
        yMax: Math.min(canvas.height, line.yMax + 4),
      });
    }
  }

  // Merge overlapping bands.
  return mergeBands(bands);
}

function bandFromRows(y0: number, y1: number, scale: number, canvas: HTMLCanvasElement): Band {
  const pad = Math.max(0, Math.round(4 * scale));
  return {
    xMin: 0,
    yMin: Math.max(0, Math.round(y0 * scale) - pad),
    xMax: canvas.width,
    yMax: Math.min(canvas.height, Math.round((y1 + 1) * scale) + pad),
  };
}

function mergeBands(bands: Band[]): Band[] {
  if (bands.length <= 1) return bands;
  bands.sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin);
  const merged: Band[] = [bands[0]];
  for (let i = 1; i < bands.length; i++) {
    const cur = merged[merged.length - 1];
    const next = bands[i];
    // Overlap or touching?
    if (
      next.yMin <= cur.yMax &&
      next.xMin <= cur.xMax &&
      next.xMax >= cur.xMin
    ) {
      cur.xMin = Math.min(cur.xMin, next.xMin);
      cur.yMin = Math.min(cur.yMin, next.yMin);
      cur.xMax = Math.max(cur.xMax, next.xMax);
      cur.yMax = Math.max(cur.yMax, next.yMax);
    } else {
      merged.push(next);
    }
  }
  return merged;
}

/** Detect header and footer bands using pattern-normalised detection:
 *  text in the top/bottom margins that matches a consistent pattern
 *  (e.g. "Page 1", "Subject — MockMate", repeated title) gets trimmed. */
function detectHeadersFooters(
  lines: Line[],
  canvas: HTMLCanvasElement,
): { header: Band | null; footer: Band | null } {
  if (lines.length === 0) return { header: null, footer: null };

  const canvasHeight = canvas.height;
  // Margin zones: top 8% and bottom 8% of the page.
  const headerThreshold = canvasHeight * 0.08;
  const footerThreshold = canvasHeight * 0.92;

  // Look for short, repeated-like lines in the margins (page numbers, titles).
  const headerLines: Line[] = [];
  const footerLines: Line[] = [];
  for (const line of lines) {
    if (line.yMin < headerThreshold) headerLines.push(line);
    if (line.yMax > footerThreshold) footerLines.push(line);
  }

  // Pattern-normalise: strip numbers/dates to find repeating patterns.
  const normalise = (s: string): string =>
    s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

  let header: Band | null = null;
  let footer: Band | null = null;

  if (headerLines.length > 0) {
    const patterns = headerLines.map(l => normalise(l.text));
    const freq = new Map<string, number>();
    for (const p of patterns) freq.set(p, (freq.get(p) ?? 0) + 1);
    // If a normalised pattern repeats or there's only 1-2 header lines,
    // treat the top margin as a header to trim.
    const maxFreq = Math.max(...freq.values());
    if (headerLines.length <= 3 || maxFreq >= 1) {
      const yMax = Math.max(...headerLines.map(l => l.yMax));
      header = {
        xMin: 0,
        yMin: 0,
        xMax: canvas.width,
        yMax: Math.min(canvasHeight, yMax),
      };
    }
  }

  if (footerLines.length > 0) {
    const patterns = footerLines.map(l => normalise(l.text));
    const freq = new Map<string, number>();
    for (const p of patterns) freq.set(p, (freq.get(p) ?? 0) + 1);
    const maxFreq = Math.max(...freq.values());
    if (footerLines.length <= 3 || maxFreq >= 1) {
      const yMin = Math.min(...footerLines.map(l => l.yMin));
      footer = {
        xMin: 0,
        yMin: Math.max(0, yMin),
        xMax: canvas.width,
        yMax: canvasHeight,
      };
    }
  }

  return { header, footer };
}

/** Detect thin full-width separator/rule lines (e.g. NEET's 2342x14 lines) that
 *  span most of the page and would otherwise leak into question bands as noise.
 *  Runs on the rendered-canvas ink grid: a run of consecutive near-saturated ink
 *  rows whose canvas-pixel height is small is treated as a rule and white-out.
 *  Best-effort — matches the friend's aspect-ratio > 12:1 heuristic. */
function detectSeparatorLines(canvas: HTMLCanvasElement): Band[] {
  const { aw, ah, scale } = analyzeCanvas(canvas);
  const fullThreshold = Math.round(aw * 0.7);
  // Per-row ink COUNTS (analyzeCanvas only exposes booleans, which cannot
  // distinguish a full-width rule from a single glyph — so recompute here).
  const rowInk: number[] = new Array(ah).fill(0);
  const ac = document.createElement('canvas');
  ac.width = aw;
  ac.height = ah;
  const actx = ac.getContext('2d');
  if (!actx) return [];
  actx.drawImage(canvas, 0, 0, aw, ah);
  const data = actx.getImageData(0, 0, aw, ah).data;
  for (let y = 0; y < ah; y++) {
    let dark = 0;
    const base = y * aw * 4;
    for (let x = 0; x < aw; x++) {
      const i = base + x * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 230) dark++;
    }
    rowInk[y] = dark;
  }

  // Group consecutive near-saturated rows into thin bands.
  const bands: Band[] = [];
  let start = -1;
  for (let y = 0; y < ah; y++) {
    if (rowInk[y] >= fullThreshold) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      bands.push({
        xMin: 0,
        yMin: Math.max(0, Math.round(start * scale)),
        xMax: canvas.width,
        yMax: Math.min(canvas.height, Math.round(y * scale)),
      });
      start = -1;
    }
  }
  if (start >= 0) {
    bands.push({
      xMin: 0,
      yMin: Math.max(0, Math.round(start * scale)),
      xMax: canvas.width,
      yMax: canvas.height,
    });
  }
  // Keep only near-full-width AND thin runs (aspect ratio > 12:1).
  const maxHeight = Math.max(2, Math.round(4 * scale));
  return bands.filter(
    b => (b.yMax - b.yMin) <= maxHeight && (b.xMax - b.xMin) >= canvas.width * 0.85,
  );
}

/** Draw white rectangles over watermark regions (image replacement, not redaction)
 *  and black/white bars over answer-key lines (targeted redaction). */
function applyVisualCleanup(
  canvas: HTMLCanvasElement,
  watermarkBands: Band[],
  answerLineBands: Band[],
): HTMLCanvasElement {
  if (watermarkBands.length === 0 && answerLineBands.length === 0) {
    return canvas;
  }
  // Clone into a new canvas so the original is untouched.
  const clone = document.createElement('canvas');
  clone.width = canvas.width;
  clone.height = canvas.height;
  const ctx = clone.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0);
  // Watermark removal: image replacement with white fill.
  for (const b of watermarkBands) {
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.fillRect(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
    ctx.restore();
  }
  // Answer-line redaction: targeted cover with semi-transparent black.
  for (const b of answerLineBands) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
    ctx.restore();
  }
  return clone;
}

/** Detect answer-key lines (e.g. "Answer: B", "Ans. (a)") and return bands
 *  covering them so they can be redacted from the question image. */
function detectAnswerLines(lines: Line[]): Band[] {
  const bands: Band[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (ANSWER_LINE_RE.test(text)) {
      bands.push({
        xMin: line.xMin,
        yMin: line.yMin,
        xMax: line.xMax,
        yMax: line.yMax,
      });
    }
  }
  return bands;
}

// ─── Band splitting (image-only / scanned pages) ────────────────────────────

/** Split a rendered page canvas into one band per stacked question using vertical
 *  whitespace gaps. Analysis runs on a down-scaled grayscale copy so it stays cheap
 *  even for 60-page papers. */
function splitCanvasIntoBands(canvas: HTMLCanvasElement): Band[] {
  const { ah, scale, rowInk } = analyzeCanvas(canvas);

  let firstInk = -1;
  let lastInk = -1;
  for (let y = 0; y < ah; y++) {
    if (rowInk[y]) {
      if (firstInk < 0) firstInk = y;
      lastInk = y;
    }
  }
  if (firstInk < 0) return [];

  const minGap = Math.max(2, Math.round(ah * 0.01));
  const minBandHeight = Math.max(2, Math.round(ah * 0.02));

  const bands: Band[] = [];
  let start = firstInk;
  let gap = 0;
  for (let y = firstInk; y <= lastInk; y++) {
    if (rowInk[y]) {
      if (gap >= minGap && y - 1 >= start) {
        bands.push(toBand(start, y - 1, scale, canvas));
        start = y;
      }
      gap = 0;
    } else {
      gap++;
    }
  }
  if (start <= lastInk) bands.push(toBand(start, lastInk, scale, canvas));

  return bands.filter(b => b.yMax - b.yMin >= minBandHeight * scale);
}

function toBand(y0: number, y1: number, scale: number, canvas: HTMLCanvasElement): Band {
  const pad = Math.max(0, Math.round(6 * scale));
  return {
    xMin: 0,
    yMin: Math.max(0, Math.round(y0 * scale) - pad),
    xMax: canvas.width,
    yMax: Math.min(canvas.height, Math.round((y1 + 1) * scale) + pad),
  };
}

// ─── Diagram region detection ────────────────────────────────────────────────

/** Detect regions on a rendered page canvas that contain visual content
 *  (diagrams, charts, figures) but little or no selectable text. */
function detectDiagramRegions(
  canvas: HTMLCanvasElement,
  textItems: PdfTextItem[],
  pageHeight: number,
): Band[] {
  const { aw, ah, scale } = analyzeCanvas(canvas);
  const ac = document.createElement('canvas');
  ac.width = aw;
  ac.height = ah;
  const actx = ac.getContext('2d');
  if (!actx) return [];
  actx.drawImage(canvas, 0, 0, aw, ah);
  const data = actx.getImageData(0, 0, aw, ah).data;

  // Map text items to analysis-space rows.
  const textRows = new Set<number>();
  for (const item of textItems) {
    const [, , , , , f] = item.transform;
    const y = pageHeight - f;
    const h = item.height || item.fontSize || 12;
    const rowStart = Math.max(0, Math.floor(y * (ah / pageHeight)) - 1);
    const rowEnd = Math.min(ah - 1, Math.ceil((y + h) * (ah / pageHeight)) + 1);
    for (let r = rowStart; r <= rowEnd; r++) textRows.add(r);
  }

  const inkThreshold = Math.max(1, Math.round(aw * 0.015));
  const rowInk: number[] = new Array(ah).fill(0);
  for (let y = 0; y < ah; y++) {
    let dark = 0;
    const base = y * aw * 4;
    for (let x = 0; x < aw; x++) {
      const i = base + x * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 230) dark++;
    }
    rowInk[y] = dark;
  }

  const isDiagramRow = (y: number): boolean => {
    if (textRows.has(y)) return false;
    return rowInk[y] >= inkThreshold;
  };

  const minDiagramHeight = Math.max(3, Math.round(ah * 0.03));
  const bands: Band[] = [];
  let start = -1;
  for (let y = 0; y < ah; y++) {
    if (isDiagramRow(y)) {
      if (start < 0) start = y;
    } else {
      if (start >= 0 && y - start >= minDiagramHeight) {
        bands.push(toDiagBand(start, y - 1, scale, canvas));
      }
      start = -1;
    }
  }
  if (start >= 0 && ah - start >= minDiagramHeight) {
    bands.push(toDiagBand(start, ah - 1, scale, canvas));
  }
  return bands;
}

function toDiagBand(y0: number, y1: number, scale: number, canvas: HTMLCanvasElement): Band {
  const pad = Math.max(0, Math.round(4 * scale));
  return {
    xMin: 0,
    yMin: Math.max(0, Math.round(y0 * scale) - pad),
    xMax: canvas.width,
    yMax: Math.min(canvas.height, Math.round((y1 + 1) * scale) + pad),
  };
}

// ─── Spatial question segmentation ───────────────────────────────────────────

/** Using detected question-number line indices + y-coordinates, split the page
 *  into per-question Bands. Each band spans from one question's number y to the
 *  next question's number y (or to the footer/header boundary). */
function buildQuestionBands(
  lines: Line[],
  questionStartIndices: number[],
  headerFooter: { header: Band | null; footer: Band | null },
  canvas: HTMLCanvasElement,
): Array<{ band: Band; startIndex: number; endIndex: number }> {
  if (questionStartIndices.length === 0) return [];

  const results: Array<{ band: Band; startIndex: number; endIndex: number }> = [];
  const footerTop = headerFooter.footer?.yMin ?? canvas.height;
  const headerBottom = headerFooter.header?.yMax ?? 0;

  for (let i = 0; i < questionStartIndices.length; i++) {
    const startIdx = questionStartIndices[i];
    const startLine = lines[startIdx];
    const nextIdx =
      i < questionStartIndices.length - 1
        ? questionStartIndices[i + 1]
        : lines.length - 1;

    // Band bottom = either the last line before the next question, or footer top.
    let endY = canvas.height;
    for (let j = startIdx; j <= nextIdx; j++) {
      if (lines[j].yMax > footerTop) break;
      endY = lines[j].yMax;
    }

    const yMin = Math.max(startLine.yMin, headerBottom);
    const yMax = Math.min(endY, footerTop);

    if (yMax > yMin) {
      results.push({
        band: {
          xMin: 0,
          yMin,
          xMax: canvas.width,
          yMax,
        },
        startIndex: startIdx,
        endIndex: nextIdx,
      });
    }
  }
  return results;
}

// ─── Question parsing (per band) ─────────────────────────────────────────────

interface ParseResult {
  stem: string;
  options: string[];
  correctAnswer: number;
  /** The raw answer-key token captured from the "Answer (n)" line (e.g. "4" or "B").
   *  Kept for diagnostics only — the app consumes `correctAnswer`. */
  answerToken: string | null;
}

/** Map an answer-key token to a 0-indexed option index.
 *  Numeric keys are 1-indexed ("4" => 3, i.e. the 4th option); letter keys are
 *  0-indexed already ("B" => 1). `refLen` is the option count to clamp against
 *  (for image-only questions pass 4, matching DEFAULT_LETTERS).
 *  Returns null if the token is out of range or unrecognised. */
function answerTokenToIndex(token: string, refLen: number): number | null {
  let idx: number | null = null;
  if (/^[1-9]\d*$/.test(token)) {
    idx = Number(token) - 1; // 1-indexed answer key -> 0-indexed option array
  } else if (/^[A-Ea-e]$/.test(token)) {
    idx = token.toUpperCase().charCodeAt(0) - 65; // A=0 … E=4
  }
  if (idx === null || idx < 0 || idx >= refLen) return null;
  return idx;
}

/** Parse a set of in-band lines into stem + options.
 *  Handles lettered options (A. / A) / (A)), numeric paren options (1)/(1), and
 *  multiple options that wrapped onto one line, e.g. "(1)foo(2)bar".
 *  The band's first line carries the question-number prefix ("1." / "Q.1");
 *  that prefix is stripped from the stem so extraction begins at the real text.
 *  A non-option line appearing after options (e.g. "Answer (2)") terminates
 *  parsing — it belongs to the band boundary, not the stem. */
export function parseBandToQuestion(lines: Line[]): ParseResult | null {
  if (lines.length === 0) return null;

  const stemLines: string[] = [];
  const options: string[] = [];
  let correctAnswer = 0;
  let answerToken: string | null = null;
  let firstStem = true;
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const optTexts = parseOptionLine(text);
    if (optTexts !== null) {
      // An option line: push every option it carries (handles 2-per-line wraps).
      // A fresh 'A' option while options already accumulate signals a new question
      // at the call site (band boundaries are split on question starts), so just
      // collect here.
      for (const o of optTexts) options.push(o);
      firstStem = false;
    } else if (options.length === 0) {
      // Still in the stem: strip a leading question-number prefix from the first
      // stem line so it starts at the actual question text.
      const src = firstStem ? text.replace(QUESTION_NUMBER_PREFIX_RE, '') : text;
      firstStem = false;
      stemLines.push(src);
    } else {
      // After options have started, an answer-key line ("Answer: B", "Answer (2)")
      // captures which option is correct, then ends the question. Anything else
      // is a continuation of the previous option (e.g. a math formula split across
      // lines around the (n) label, e.g. "μ0i / 4R" interleaved with "(1)…").
      const am = ANSWER_LINE_RE.exec(text);
      if (am) {
        answerToken = am[1] ?? am[2] ?? null;
        if (answerToken !== null) {
          // Answer keys are 1-indexed ("Answer (4)" => the 4th option); map it to
          // the 0-indexed option array. Image-only questions use DEFAULT_LETTERS(4)
          // at the call site, so map against 4 when fewer than 2 text options exist.
          const refLen = options.length >= 2 ? options.length : 4;
          const idx = answerTokenToIndex(answerToken, refLen);
          if (idx !== null) correctAnswer = idx;
        }
        break;
      }
      options[options.length - 1] += ' ' + text;
      firstStem = false;
    }
  }
  if (options.length < 2 && stemLines.length === 0) return null;
  return {
    stem: stemLines.join('\n').trim(),
    options,
    correctAnswer,
    answerToken,
  };
}

// ─── Plain-text question parser (re-exported, same behaviour as old module) ──

const OPTION_RE_TEXT = /^(\()([A-Ea-e])(\))\s*[\.\)]?\s+(.*)$|^([A-Ea-e])\s*[\.\)]\s+(.*)$/;

/** Best-effort parse of plain text into a stem + option list.
 *  Reuses the same option-marker grammar as the spatial parser. */
export function parseQuestionText(
  text: string,
): { stem: string; options: string[]; correctAnswer: number } | null {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const stemLines: string[] = [];
  const options: string[] = [];
  for (const line of lines) {
    const m = line.match(OPTION_RE_TEXT);
    if (m) {
      const letter = (m[2] ?? m[5]).toUpperCase();
      if (options.length > 0 && letter === 'A') break;
      options.push(m[4] ?? m[6] ?? '');
    } else if (options.length === 0) {
      stemLines.push(line);
    } else {
      break;
    }
  }
  if (options.length < 2) return null;
  return {
    stem: stemLines.join('\n').trim(),
    options,
    correctAnswer: 0,
  };
}

// ─── Image-backed / garbled-question OCR salvage ─────────────────────────────

/** Returns true when a string contains codepoints that pdfjs decoded from a broken
 *  PDF ToUnicode map and that therefore render as tofu/garble on screen: the Unicode
 *  replacement char (U+FFFD) and the Private-Use-Area block (U+E000..U+F8FF).
 *  Symbol/codepoints that render fine (e.g. Greek letters U+0394, math U+2200+)
 *  are excluded — only broken PUA/replacement output triggers OCR salvage.
 */
function hasSuspiciousChar(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c >= 0xe000 && c <= 0xf8ff)) return true;
  }
  return false;
}

/**
 * Best-effort: when a question's text layer is garbled (PUA / replacement chars)
 * or empty (image-backed question), re-read the rendered question band with
 * on-device tesseract (eng+ell) to recover the real stem + options.
 *
 * Returns the OCR-parsed result when it yields a usable stem (≥2 options or a
 * non-empty stem); otherwise returns `fallback` unchanged so callers never lose
 * the spatial pipeline's output. Never runs on the server/audit path (guarded by
 * `typeof document`) — tesseract.js lives only in the browser bundle.
 */
async function salvageFromImage(
  dataUrl: string | null | undefined,
  fallback: { stem: string; options: string[] },
): Promise<{ stem: string; options: string[] }> {
  if (typeof document === 'undefined') return fallback;
  if (!dataUrl) return fallback;
  try {
    const { ocrImageText } = await import('./ocr');
    const raw = await ocrImageText(dataUrl);
    if (raw && raw.trim()) {
      console.debug('[ocr-salvage] raw OCR (%d chars):\n%s', raw.length, raw.slice(0, 800));
    }
    const parsed = parseQuestionText(raw);
    if (parsed && parsed.options.length >= 2 && parsed.options.some(o => o.trim())) {
      return { stem: parsed.stem, options: parsed.options };
    }
    // Structured parse failed or yielded <2 structured options, but a readable OCR
    // stem is still strictly better than garbled PUA text from the text layer.
    // parseQuestionText returns null when it can't group >=2 option markers, so a
    // clean stem + unstructured options previously fell through to a full fallback
    // discard — which is why image/garbled stems came back blank. Keep the stem,
    // retain the spatial fallback options.
    if (raw && raw.trim()) {
      return { stem: raw.trim(), options: fallback.options };
    }
    return fallback;
  } catch (err) {
    console.error('[spatialExtract] OCR salvage failed:', err);
    return fallback;
  }
}

// ─── Per-page extraction ─────────────────────────────────────────────────────

interface PageExtractOptions {
  onProgress?: (progress: GeminiExtractProgress) => void;
}

/** Render a single PDF page to canvas, extract text items, run spatial analysis,
 *  and return one `ExtractedQuestion` per detected question. */
async function extractPageFromPdf(
  pdf: any,
  pageNum: number,
  _totalPages: number,
  _opts: PageExtractOptions,
  pageState: StartState = { lastNum: 0 },
): Promise<{ questions: ExtractedQuestion[]; pageImage: string; errors: string[] }> {
  const errors: string[] = [];
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const renderViewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(renderViewport.width);
  canvas.height = Math.ceil(renderViewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    errors.push(`Page ${pageNum}: canvas unavailable, skipped.`);
    return { questions: [], pageImage: '', errors };
  }

  await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
  const pageImage = canvasToDataUrl(canvas);

  const textContent = await page.getTextContent();
  const items = extractItemsFromTextContent(textContent, []);
  const lines = groupItemsIntoLines(items, viewport.height);

  // ── Visual cleanup steps ──

  // 1. Detect & trim headers/footers (pattern-normalised).
  const headerFooter = detectHeadersFooters(lines, canvas);

  // 2. Detect watermark + separator/rule regions -> white rectangles
  //    (image replacement over redaction, per the reference architecture;
  //    e.g. NEET's 2342x14 full-width rule lines).
  const watermarkBands = detectWatermarks(lines, canvas, viewport.height).concat(
    detectSeparatorLines(canvas),
  );

  // 3. Detect answer-key lines → targeted redaction.
  const answerLineBands = detectAnswerLines(lines);

  // 4. Apply all visual cleanup to a cloned canvas.
  const cleanCanvas = applyVisualCleanup(canvas, watermarkBands, answerLineBands);

  // ── Spatial segmentation ──

  const numberingStyle = detectNumberingStyle(lines);

  // Skip instruction-only pages (e.g. "Important Instructions") BEFORE start
  // detection. These pages carry a numbered list (1., 2., …) that would otherwise
  // be accepted as question starts and poison the cross-page monotonicity counter
  // (`pageState.lastNum`), rejecting the real questions that follow.
  const looksLikeInstructions = lines.some(l => {
    const t = l.text.toLowerCase();
    return (
      t.includes('important instructions') ||
      t.includes('read the following') ||
      t.includes('use black ink') ||
      t.includes('scratch space') ||
      t.includes('maximum marks') ||
      t.includes('total marks') ||
      t.includes('answer sheet') ||
      t.includes('rough work')
    );
  });
  if (looksLikeInstructions) {
    errors.push(`Page ${pageNum}: instruction-only page, skipped.`);
    return { questions: [], pageImage, errors };
  }

  // Find question-start line indices. Uses the monotonicity gate so spurious
  // matches (option lines, page markers, instruction headers) don't inflate the
  // count — only numbers in [lastNum+1 .. lastNum+3] are accepted, advancing
  // `pageState.lastNum` across pages for a single contiguous 1..N sequence.
  const questionStartIndices = collectQuestionStartIndices(lines, numberingStyle, pageState);

  if (questionStartIndices.length === 0) {
    // No recognised numbering — fall back to whitespace-gap band splitting.
    if (items.length === 0) {
      // Pure image page — split into bands.
      const bands = splitCanvasIntoBands(cleanCanvas);
      if (bands.length === 0) {
        bands.push({ xMin: 0, yMin: 0, xMax: canvas.width, yMax: canvas.height });
      }
      const questions: ExtractedQuestion[] = [];
      for (const band of bands) {
        const cropped = await cropCanvas(cleanCanvas, band);
        // Image-only page (no selectable text): recover stem + options from the
        // rendered band via on-device OCR so the teacher gets real text instead of
        // blank placeholders + literal A/B/C/D option labels.
        const salvaged = await salvageFromImage(cropped.dataURL, {
          stem: '',
          options: [...DEFAULT_LETTERS],
        });
        questions.push({
          pageNumber: pageNum,
          text: salvaged.stem,
          options: salvaged.options,
          correctAnswer: 0,
          imageBlob: cropped.blob,
          pageImage,
        });
      }
      return { questions, pageImage, errors };
    }

    // Has text but no recognised numbering — parse sequentially.
    // Fallback: parse all lines as one or more questions using the old heuristic.
    const questions = await parseLinesAsQuestions(
      pageNum,
      pageImage,
      canvas,
      cleanCanvas,
      lines,
      headerFooter,
    );
    return { questions, pageImage, errors };
  }

  // ── Build per-question bands and parse ──

  const questionSegments = buildQuestionBands(lines, questionStartIndices, headerFooter, cleanCanvas);
  const diagramRegions = detectDiagramRegions(cleanCanvas, items, viewport.height);
  const diagramRegionData = await Promise.all(
    diagramRegions.map(async band => {
      const cropped = await cropCanvas(cleanCanvas, band);
      return { band, dataURL: cropped.dataURL, blob: cropped.blob };
    }),
  );

  const questions: ExtractedQuestion[] = [];
  for (const seg of questionSegments) {
    const bandLines = lines.slice(seg.startIndex, seg.endIndex + 1);
    const parsed = parseBandToQuestion(bandLines);

    // Check if any diagram overlaps this question band.
    const diagram = diagramRegionData.find(({ band }) =>
      band.yMin <= seg.band.yMax && band.yMax >= seg.band.yMin,
    );

    // Every question carries a tight screenshot of just its band: headers,
    // footers, separator rules and sibling questions are already excluded, so
    // each exported image holds exactly one question (+ its own diagram).
    const cropped = await cropCanvas(cleanCanvas, seg.band);
    const isImageQuestion = parsed && parsed.stem === '' && parsed.options.length < 2;
    const textIsGarbled = !!(parsed && hasSuspiciousChar(parsed.stem + ' ' + parsed.options.join(' ')));
    if (parsed && !isImageQuestion && parsed.options.length >= 2) {
      // Text question (stem + ≥2 options).
      let stem = parsed.stem;
      let options = parsed.options;
      // If the text layer is garbled (PUA / replacement chars from a broken
      // ToUnicode map), re-read the rendered band with on-device tesseract
      // (eng+ell) to recover the real Greek/math/English text. correctAnswer
      // from the answer-key line (already redacted on the canvas) is preserved.
      if (textIsGarbled) {
        const salvaged = await salvageFromImage(cropped.dataURL, {
          stem: parsed.stem,
          options: parsed.options,
        });
        stem = salvaged.stem;
        options = salvaged.options;
      }
      questions.push({
        pageNumber: pageNum,
        text: stem,
        options,
        correctAnswer: parsed.correctAnswer,
        imageBlob: diagram?.blob ?? cropped.blob,
        pageImage: diagram?.dataURL ?? cropped.dataURL,
      });
    } else if (isImageQuestion) {
      // Image-backed question (empty/stem-less text layer). Re-read the band
      // with tesseract so the teacher gets real stem + options instead of
      // blank placeholders A/B/C/D — the on-device image-extraction path.
      const salvaged = await salvageFromImage(cropped.dataURL, {
        stem: parsed?.stem ?? '',
        options: [...DEFAULT_LETTERS],
      });
      questions.push({
        pageNumber: pageNum,
        text: salvaged.stem,
        options: salvaged.options,
        correctAnswer: parsed?.correctAnswer ?? 0,
        imageBlob: diagram?.blob ?? cropped.blob,
        pageImage: diagram?.dataURL ?? cropped.dataURL ?? pageImage,
      });
    }
    // else: stem-only / no-options band (instruction text, formula fragments,
    // answer-key lines) — Bug D: drop rather than emit a garbage card.
  }

  return { questions, pageImage, errors };
}

/** Parse lines into questions using the sequential stem/options heuristic
 *  (used when numbering-based segmentation finds no question starts).
 *  Supports the "multiple questions in one band" case by detecting
 *  fresh 'A' option re-starts. */
async function parseLinesAsQuestions(
  pageNum: number,
  pageImage: string,
  canvas: HTMLCanvasElement,
  cleanCanvas: HTMLCanvasElement,
  lines: Line[],
  _headerFooter: { header: Band | null; footer: Band | null },
): Promise<ExtractedQuestion[]> {
  const questions: ExtractedQuestion[] = [];
  if (lines.length === 0) {
    // Whole page is one image question.
    const cropped = await cropCanvas(cleanCanvas, {
      xMin: 0, yMin: 0, xMax: canvas.width, yMax: canvas.height,
    });
    questions.push({
      pageNumber: pageNum,
      text: '',
      options: [...DEFAULT_LETTERS],
      correctAnswer: 0,
      imageBlob: cropped.blob,
      pageImage,
    });
    return questions;
  }

  let stem: Line[] = [];
  let opts: Line[] = [];
  const flush = async (
    stemLines: Line[],
    optLines: Line[],
  ): Promise<ExtractedQuestion | null> => {
    if (optLines.length === 0) {
      if (stemLines.length > 0) {
        const stemText = stemLines.map(s => s.text).join('\n');
        const band: Band = {
          xMin: Math.min(...stemLines.map(s => s.xMin)),
          yMin: Math.min(...stemLines.map(s => s.yMin)),
          xMax: Math.max(...stemLines.map(s => s.xMax)),
          yMax: Math.max(...stemLines.map(s => s.yMax)),
        };
        const cropped = await cropCanvas(cleanCanvas, band);
        return {
          pageNumber: pageNum,
          text: stemText,
          options: [...DEFAULT_LETTERS],
          correctAnswer: 0,
          imageBlob: cropped.blob,
          pageImage: cropped.dataURL,
        };
      }
      return null;
    }
    const stemText = stemLines.map(s => s.text).join('\n').trim();
    const options: string[] = [];
    for (const o of optLines) {
      const parsed = parseOptionLine(o.text.trim());
      if (parsed) {
        for (const p of parsed) options.push(p);
      } else {
        options.push(o.text.trim());
      }
    }
    // Tight screenshot of this question's stem+options band (one slide per question).
    const band: Band = {
      xMin: Math.min(...stemLines.concat(optLines).map(l => l.xMin)),
      yMin: Math.min(...stemLines.concat(optLines).map(l => l.yMin)),
      xMax: Math.max(...stemLines.concat(optLines).map(l => l.xMax)),
      yMax: Math.max(...stemLines.concat(optLines).map(l => l.yMax)),
    };
    const cropped = await cropCanvas(cleanCanvas, band);
    return {
      pageNumber: pageNum,
      text: stemText,
      options,
      correctAnswer: 0,
      imageBlob: cropped.blob,
      pageImage: cropped.dataURL,
    };
  };

  for (const line of lines) {
    if (line.label) {
      if (opts.length > 0 && line.label === 'A') {
        const q = await flush(stem, opts);
        if (q) questions.push(q);
        stem = [];
        opts = [];
      }
      opts.push(line);
    } else {
      if (opts.length > 0) {
        const q = await flush(stem, opts);
        if (q) questions.push(q);
        stem = [];
        opts = [];
      }
      stem.push(line);
    }
  }
  const q = await flush(stem, opts);
  if (q) questions.push(q);
  return questions;
}

// ─── Image-only extraction ───────────────────────────────────────────────────

/** Extract questions from a plain image (PNG/JPG/…) using the same
 *  band-split → crop → image-backed-question pipeline as a scanned PDF page. */
export async function extractQuestionsFromImage(file: File): Promise<PdfExtractResult> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas unavailable for image extraction.');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pageImage = canvasToDataUrl(canvas);
  const pageImages: string[] = [pageImage];

  // No selectable text → fall back to whitespace band-splitting.
  // Apply watermark detection on the canvas image.
  const watermarkBands = detectWatermarks([], canvas, canvas.height);
  const cleanCanvas = applyVisualCleanup(canvas, watermarkBands, []);

  const bands = splitCanvasIntoBands(cleanCanvas);
  const imageBands = bands.length
    ? bands
    : [{ xMin: 0, yMin: 0, xMax: canvas.width, yMax: canvas.height }];

  const questions: ExtractedQuestion[] = [];
  for (const band of imageBands) {
    const cropped = await cropCanvas(cleanCanvas, band);
    questions.push({
      pageNumber: 1,
      text: '',
      options: [...DEFAULT_LETTERS],
      correctAnswer: 0,
      imageBlob: cropped.blob,
      pageImage,
    });
  }

  return { questions, pageCount: 1, pageImages, errors: [] };
}

// ─── PDF extraction ──────────────────────────────────────────────────────────

export async function extractQuestionsFromFile(
  file: File,
  onProgress?: (progress: GeminiExtractProgress) => void,
): Promise<PdfExtractResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await getPdfjs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
  });

  const pdf = await loadingTask.promise;
  const questions: ExtractedQuestion[] = [];
  const pageImages: string[] = [];
  const errors: string[] = [];
  const totalPages = pdf.numPages;
  const pageCap = Math.min(totalPages, MAX_PAGES);
  if (totalPages > MAX_PAGES) {
    errors.push(`File has ${totalPages} pages; only the first ${MAX_PAGES} were processed.`);
  }

  onProgress?.({
    status: 'processing',
    currentPage: 0,
    totalPages: pdf.numPages,
    message: `Processing ${pdf.numPages} page(s)…`,
  });

  // Shared state threaded across pages so the question-start monotonicity
  // gate enforces a single contiguous 1..N sequence per document.
  const pageState: StartState = { lastNum: 0 };

  for (let i = 1; i <= pageCap; i++) {
    try {
      onProgress?.({
        status: 'processing',
        currentPage: i,
        totalPages: pdf.numPages,
        message: `Analyzing page ${i} of ${pdf.numPages}…`,
      });
      const { questions: pageQuestions, pageImage, errors: pageErrors } =
        await extractPageFromPdf(pdf, i, totalPages, { onProgress }, pageState);
      questions.push(...pageQuestions);
      pageImages.push(pageImage);
      errors.push(...pageErrors);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Page ${i}: ${msg}`);
    }
  }

  try {
    loadingTask.destroy();
  } catch {
    /* ignore destroy errors */
  }

  onProgress?.({
    status: 'complete',
    message: `Extracted ${questions.length} question(s).`,
  });

  return { questions, pageCount: totalPages, pageImages, errors };
}

// ─── Gemini bridge (delegates to spatial extraction) ─────────────────────────

/**
 * Extract questions using the spatial pipeline (the LLM/Gemini path is temporarily
 * disabled — see commented-out code in `geminiExtract.ts`).
 *
 * Returns `GeminiQuestion[]` so the premium review screen works unchanged.
 */
export async function extractQuestionsWithGemini(
  file: File,
  onProgress?: (progress: GeminiExtractProgress) => void,
): Promise<GeminiQuestion[]> {
  onProgress?.({
    status: 'processing',
    message: 'Starting extraction…',
  });

  const result = file.type.startsWith('image/')
    ? await extractQuestionsFromImage(file)
    : await extractQuestionsFromFile(file, onProgress);

  onProgress?.({
    status: 'complete',
    message: `Extracted ${result.questions.length} question(s).`,
  });

  return result.questions.map(q => ({
    text: q.text,
    options: q.options,
    correctAnswer: q.correctAnswer,
    subject: 'General',
    topic: 'General',
    marks: 1,
    hasDiagram: q.imageBlob != null,
    imageData: q.pageImage ?? undefined,
    imageMimeType: q.pageImage ? 'image/png' : undefined,
    pageImageData: q.pageImage ?? undefined,
  }));
}
