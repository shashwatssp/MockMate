// === OLD pdfExtract.ts implementation (commented out, preserved for reuse) ===
// All exports re-routed to the new spatial-extraction pipeline (spatialExtract.ts).
// The new pipeline implements the PyMuPDF reference architecture: numbering-pattern
// + y-coord segmentation, watermark image-replacement, answer-line redaction,
// pattern-normalised header/footer trimming, and Roman-numeral (font-relaxed) detection.

export type { ExtractedQuestion, PdfExtractResult, Band } from './spatialExtract';
export { parseQuestionText, extractQuestionsFromFile, extractQuestionsFromImage } from './spatialExtract';

// /**
//  * PDF → question extraction (client-side, zero tokens/credits).
//  *
//  * Uses `pdfjs-dist` (Mozilla, MIT) with a dynamically imported worker so the
//  * ~500 KB PDF renderer never enters the main bundle. Each page is rendered to a
//  * `<canvas>` (pixels) and scanned for option markers (A–E).
//  *
//  * Two question shapes are produced:
//  *  • machine-readable questions — stem + parsed options (no image by default);
//  *  • image-backed questions — the page is attached as the question image with
//  *    placeholder options A/B/C/D. This serves hand-written / diagram-heavy
//  *    papers where the options live inside the scanned image (per the teacher's
//  *    spec clarification: the image itself carries the A/B/C/D options).
//  *
//  * Parsing is intentionally best-effort: every question lands on a one-by-one
//  * review screen where the teacher edits / accepts / discards, so imperfect
//  * extraction is recoverable rather than fatal.
//  */
// 
// export interface ExtractedQuestion {
//   /** 1-based page number the question came from. */
//   pageNumber: number;
//   /** Question stem text (may be empty for pure image questions). */
//   text: string;
//   /** Options (variable length; defaults to A/B/C/D for image questions). */
//   options: string[];
//   /** Index of the correct option; defaults to 0 so the teacher can re-mark. */
//   correctAnswer: number;
//   /** Per-question image blob (cropped band or whole page) used when the page is image-backed. */
//   imageBlob: Blob | null;
//   /** Base64 data URL of the page (served as context in the review UI). */
//   pageImage: string | null;
// }
// 
// export interface PdfExtractResult {
//   questions: ExtractedQuestion[];
//   pageCount: number;
//   /** One base64 thumbnail per rendered page. */
//   pageImages: string[];
//   /** Human-readable notes/warnings gathered while parsing. */
//   errors: string[];
// }
// 
// const MAX_PAGES = 60;
// const RENDER_SCALE = 2; // 2x for crisp image crops
// const Y_TOL = 7; // px tolerance for grouping text items into a line
// const OPTION_RE = /^(\(?)([A-Ea-e])(\)?)\s*[\.\)]\s+(.*)$/;
// const DEFAULT_LETTERS = ['A', 'B', 'C', 'D'];
// 
// type PdfTextItem = {
//   str: string;
//   transform: number[];
//   width: number;
//   height: number;
//   fontSize?: number;
// };
// 
// type MappedItem = { str: string; x: number; y: number; w: number; h: number };
// 
// type Line = {
//   text: string;
//   label?: string; // 'A'..'E' when the line is an option
//   xMin: number;
//   yMin: number;
//   xMax: number;
//   yMax: number;
// };
// 
// type LineBuilder = { yAnchor: number; parts: MappedItem[] };
// 
// function groupItemsIntoLines(items: PdfTextItem[], pageHeight: number): Line[] {
//   const mapped: MappedItem[] = items.map(item => {
//     const [, , , , e, f] = item.transform;
//     const x = e;
//     const y = pageHeight - f; // flip PDF baseline (bottom origin) to canvas (top origin)
//     return { str: item.str, x, y, w: item.width, h: item.height || item.fontSize || 12 };
//   });
//   mapped.sort((a, b) => a.y - b.y || a.x - b.x);
// 
//   const lines: Line[] = [];
//   let cur: LineBuilder | null = null;
//   for (const t of mapped) {
//     if (cur && Math.abs(t.y - cur.yAnchor) <= Y_TOL) {
//       cur.parts.push(t);
//     } else {
//       if (cur) flushLine(cur, lines);
//       cur = { yAnchor: t.y, parts: [t] };
//     }
//   }
//   if (cur) flushLine(cur, lines);
//   return lines;
// }
// 
// function flushLine(cur: LineBuilder, out: Line[]): void {
//   cur.parts.sort((a, b) => a.x - b.x);
//   const text = cur.parts.map(p => p.str).join(' ');
//   const xMin = Math.min(...cur.parts.map(p => p.x));
//   const xMax = Math.max(...cur.parts.map(p => p.x + p.w));
//   const yMin = Math.min(...cur.parts.map(p => p.y));
//   const yMax = Math.max(...cur.parts.map(p => p.y + p.h));
//   const trimmed = text.trim();
//   const opt = trimmed.match(OPTION_RE);
//   out.push({
//     text: trimmed,
//     label: opt ? opt[2].toUpperCase() : undefined,
//     xMin,
//     yMin,
//     xMax,
//     yMax,
//   });
// }
// 
// /** Render a page canvas to a PNG Blob (used as the question image on accept). */
// function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
//   return new Promise(resolve => {
//     canvas.toBlob(b => resolve(b ?? new Blob()), 'image/png', quality);
//   });
// }
// 
// /** Export a base64 PNG preview (used only for the small UI thumbnail). */
// function canvasToDataUrl(canvas: HTMLCanvasElement): string {
//   return canvas.toDataURL('image/png');
// }
// 
// /** A rectangle in canvas pixels. */
// export interface Band {
//   xMin: number;
//   yMin: number;
//   xMax: number;
//   yMax: number;
// }
// 
// /**
//  * Split a rendered page canvas into one band per stacked question using vertical
//  * whitespace gaps. Analysis runs on a down-scaled grayscale copy so it stays cheap
//  * even for 60-page papers.
//  */
// function splitCanvasIntoBands(canvas: HTMLCanvasElement): Band[] {
//   const ANALYSIS_W = 240;
//   const aw = ANALYSIS_W;
//   const ah = Math.max(2, Math.round(ANALYSIS_W * (canvas.height / canvas.width)));
//   const ac = document.createElement('canvas');
//   ac.width = aw;
//   ac.height = ah;
//   const actx = ac.getContext('2d');
//   if (!actx) return [];
//   actx.drawImage(canvas, 0, 0, aw, ah);
//   const data = actx.getImageData(0, 0, aw, ah).data;
// 
//   const rowInk: boolean[] = new Array(ah);
//   const inkThreshold = Math.max(1, Math.round((aw * 0.015))); // ~1.5% ink pixels per row
//   for (let y = 0; y < ah; y++) {
//     let dark = 0;
//     const base = y * aw * 4;
//     for (let x = 0; x < aw; x++) {
//       const i = base + x * 4;
//       const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
//       if (lum < 230) dark++;
//     }
//     rowInk[y] = dark >= inkThreshold;
//   }
// 
//   let firstInk = -1;
//   let lastInk = -1;
//   for (let y = 0; y < ah; y++) {
//     if (rowInk[y]) {
//       if (firstInk < 0) firstInk = y;
//       lastInk = y;
//     }
//   }
//   if (firstInk < 0) return []; // fully blank page
// 
//   const scaleY = canvas.height / ah;
//   const minGap = Math.max(2, Math.round(ah * 0.01)); // ~1% height gap splits questions
//   const minBandHeight = Math.max(2, Math.round(ah * 0.02));
// 
//   const bands: Band[] = [];
//   let start = firstInk;
//   let gap = 0;
//   for (let y = firstInk; y <= lastInk; y++) {
//     if (rowInk[y]) {
//       if (gap >= minGap && y - 1 >= start) {
//         bands.push(toBand(start, y - 1));
//         start = y;
//       }
//       gap = 0;
//     } else {
//       gap++;
//     }
//   }
//   if (start <= lastInk) bands.push(toBand(start, lastInk));
// 
//   // Drop bands that are pure noise (too short to be a question).
//   return bands.filter(b => (b.yMax - b.yMin) >= minBandHeight * scaleY);
// 
//   function toBand(y0: number, y1: number): Band {
//     const pad = Math.max(0, Math.round(6 * scaleY));
//     return {
//       xMin: 0,
//       yMin: Math.max(0, Math.round(y0 * scaleY) - pad),
//       xMax: canvas.width,
//       yMax: Math.min(canvas.height, Math.round(y1 * scaleY) + pad),
//     };
//   }
// }
// 
// /** Crop a canvas region into a fresh canvas (data URL + blob). */
// async function cropCanvas(
//   canvas: HTMLCanvasElement,
//   band: Band,
// ): Promise<{ dataURL: string; blob: Blob }> {
//   const cw = band.xMax - band.xMin;
//   const ch = band.yMax - band.yMin;
//   const c = document.createElement('canvas');
//   c.width = cw;
//   c.height = ch;
//   const ctx = c.getContext('2d');
//   if (ctx) {
//     ctx.drawImage(canvas, band.xMin, band.yMin, cw, ch, 0, 0, cw, ch);
//   }
//   const dataURL = c.toDataURL('image/png');
//   // Reuse the same async toBlob path as canvasToBlob so image quality is
//   // consistent and we never hand-roll a base64 decode.
//   const blob = await canvasToBlob(c, 0.92);
//   return { dataURL, blob };
// }
// 
// /**
//  * Best-effort parse of plain (OCR'd) question text into a stem + option list.
//  * Reuses the same option marker grammar as the selectable-text parser.
//  */
// export function parseQuestionText(
//   text: string,
// ): { stem: string; options: string[]; correctAnswer: number } | null {
//   const lines = text
//     .split(/\r?\n/)
//     .map(l => l.trim())
//     .filter(Boolean);
//   if (!lines.length) return null;
// 
//   const stemLines: string[] = [];
//   const options: string[] = [];
//   for (const line of lines) {
//     const m = line.match(OPTION_RE);
//     if (m) {
//       options.push(m[4].trim());
//     } else if (options.length === 0) {
//       stemLines.push(line);
//     } else {
//       // Non-option line encountered after options — assume a new question;
//       // we only parse the first one.
//       break;
//     }
//   }
//   if (options.length < 2) return null;
//   return {
//     stem: stemLines.join('\n').trim(),
//     options,
//     correctAnswer: 0,
//   };
// }
// 
// /** Build an image-backed question (options A/B/C/D) from a page's content. */
// function buildImageQuestion(
//   pageNumber: number,
//   text: string,
//   pageImage: string,
//   pageBlob: Blob,
// ): ExtractedQuestion {
//   return {
//     pageNumber,
//     text: text || '',
//     options: [...DEFAULT_LETTERS],
//     correctAnswer: 0,
//     imageBlob: pageBlob,
//     pageImage,
//   };
// }
// 
// /**
//  * Detect regions on a rendered page canvas that contain visual content
//  * (diagrams, charts, figures) but little or no selectable text.
//  *
//  * Strategy:
//  * 1. Build a set of vertical "text rows" from known text item positions
//  * 2. Scan the canvas for dark-pixel density per row
//  * 3. Rows with significant ink but no overlapping text → diagram rows
//  * 4. Group consecutive diagram rows into rectangular bands
//  */
// function detectDiagramRegions(
//   canvas: HTMLCanvasElement,
//   textItems: PdfTextItem[],
//   pageHeight: number,
// ): Band[] {
//   const ANALYSIS_W = 240;
//   const aw = ANALYSIS_W;
//   const ah = Math.max(2, Math.round(ANALYSIS_W * (canvas.height / canvas.width)));
//   const ac = document.createElement('canvas');
//   ac.width = aw;
//   ac.height = ah;
//   const actx = ac.getContext('2d');
//   if (!actx) return [];
//   actx.drawImage(canvas, 0, 0, aw, ah);
//   const data = actx.getImageData(0, 0, aw, ah).data;
// 
//   // Map text items to analysis-space rows
//   const scaleY = ah / canvas.height;
//   const textRows = new Set<number>();
//   for (const item of textItems) {
//     const [, , , , , f] = item.transform;
//     const y = pageHeight - f;
//     const h = item.height || item.fontSize || 12;
//     const rowStart = Math.max(0, Math.floor(y * scaleY) - 1);
//     const rowEnd = Math.min(ah - 1, Math.ceil((y + h) * scaleY) + 1);
//     for (let r = rowStart; r <= rowEnd; r++) textRows.add(r);
//   }
// 
//   // Per-row ink density
//   const inkThreshold = Math.max(1, Math.round(aw * 0.015));
//   const rowInk: number[] = new Array(ah).fill(0);
//   for (let y = 0; y < ah; y++) {
//     const base = y * aw * 4;
//     for (let x = 0; x < aw; x++) {
//       const i = base + x * 4;
//       const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
//       if (lum < 230) rowInk[y]++;
//     }
//   }
// 
//   // Find rows with significant ink but NO text → diagram rows
//   const isDiagramRow = (y: number): boolean => {
//     if (textRows.has(y)) return false;
//     return rowInk[y] >= inkThreshold;
//   };
// 
//   // Group consecutive diagram rows into bands
//   const minDiagramHeight = Math.max(3, Math.round(ah * 0.03)); // at least 3% of page height
//   const bands: Band[] = [];
//   let start = -1;
//   for (let y = 0; y < ah; y++) {
//     if (isDiagramRow(y)) {
//       if (start < 0) start = y;
//     } else {
//       if (start >= 0 && y - start >= minDiagramHeight) {
//         bands.push(toBand(start, y - 1));
//       }
//       start = -1;
//     }
//   }
//   if (start >= 0 && ah - start >= minDiagramHeight) {
//     bands.push(toBand(start, ah - 1));
//   }
// 
//   return bands;
// 
//   function toBand(y0: number, y1: number): Band {
//     const pad = Math.max(0, Math.round(4 * (canvas.height / ah)));
//     return {
//       xMin: 0,
//       yMin: Math.max(0, Math.round(y0 * (canvas.height / ah)) - pad),
//       xMax: canvas.width,
//       yMax: Math.min(canvas.height, Math.round(y1 * (canvas.height / ah)) + pad),
//     };
//   }
// }
// 
// /**
//  * For a given diagram band, find the text question whose vertical range
//  * is closest (the question that the diagram belongs to).
//  */
// function findNearestQuestionIndex(
//   diagramBand: Band,
//   questionBands: { yMin: number; yMax: number }[],
// ): number {
//   if (questionBands.length === 0) return -1;
//   const diagramCenter = (diagramBand.yMin + diagramBand.yMax) / 2;
//   let bestIdx = 0;
//   let bestDist = Infinity;
//   for (let i = 0; i < questionBands.length; i++) {
//     const qb = questionBands[i];
//     // If diagram overlaps with question band, distance is 0
//     if (diagramBand.yMin <= qb.yMax && diagramBand.yMax >= qb.yMin) return i;
//     const dist = Math.min(
//       Math.abs(diagramCenter - (qb.yMin + qb.yMax) / 2),
//       Math.abs(diagramBand.yMin - qb.yMax),
//       Math.abs(diagramBand.yMax - qb.yMin),
//     );
//     if (dist < bestDist) {
//       bestDist = dist;
//       bestIdx = i;
//     }
//   }
//   return bestIdx;
// }
// 
// /** Parse a single page's lines into questions and push onto `out`. */
// function parsePage(
//   pageNum: number,
//   pageImage: string,
//   pageBlob: Blob,
//   lines: Line[],
//   out: ExtractedQuestion[],
//   diagramRegions: Array<{ band: Band; dataURL: string; blob: Blob }> = [],
// ): void {
//   if (lines.length === 0) {
//     // Pure image page — the whole page is one image question.
//     out.push(buildImageQuestion(pageNum, '', pageImage, pageBlob));
//     return;
//   }
// 
//   // Stem lines accumulated before the first option of a question.
//   let stem: Line[] = [];
//   // Options collected for the in-progress question.
//   let opts: Line[] = [];
// 
//   const flush = () => {
//     if (opts.length === 0) {
//       if (stem.length > 0) {
//         const stemText = stem.map(s => s.text).join('\n');
//         // Stem text present but no recognised options → image-backed question
//         // (options likely live inside the scanned image).
//         out.push(buildImageQuestion(pageNum, stemText, pageImage, pageBlob));
//       }
//       stem = [];
//       return;
//     }
//     const stemText = stem.map(s => s.text).join('\n').trim();
//     const options = opts.map(o => o.text.replace(OPTION_RE, '$4').trim());
//     const questionYMin = Math.min(
//       ...stem.concat(opts).map(line => line.yMin),
//     );
//     const questionYMax = Math.max(
//       ...stem.concat(opts).map(line => line.yMax),
//     );
//     const diagram = diagramRegions.find(({ band }) =>
//       band.yMin <= questionYMax && band.yMax >= questionYMin,
//     );
//     const imageQuestion = stemText === '' && options.length >= 3;
//     out.push({
//       pageNumber: pageNum,
//       text: stemText,
//       options,
//       correctAnswer: 0,
//       // Attach only the clean diagram crop when one overlaps this question.
//       // Text-only questions intentionally remain image-free.
//       imageBlob: diagram?.blob ?? (imageQuestion ? pageBlob : null),
//       pageImage: diagram?.dataURL ?? (imageQuestion ? pageImage : null),
//     });
//     stem = [];
//     opts = [];
//   };
// 
//   for (const line of lines) {
//     if (line.label) {
//       // Option line. A fresh 'A' while options are accumulating starts a new question.
//       if (opts.length > 0 && line.label === 'A') {
//         flush();
//       }
//       opts.push(line);
//     } else {
//       if (opts.length > 0) flush();
//       stem.push(line);
//     }
//   }
//   flush();
// }
// 
// export async function extractQuestionsFromFile(file: File): Promise<PdfExtractResult> {
//   const arrayBuffer = await file.arrayBuffer();
//   return extractQuestionsFromArrayBuffer(arrayBuffer);
// }
// 
// export async function extractQuestionsFromArrayBuffer(
//   arrayBuffer: ArrayBuffer,
// ): Promise<PdfExtractResult> {
//   // Lazy-load pdfjs so its (large) worker code stays out of the main bundle.
//   const pdfjs = await import('pdfjs-dist');
// 
//   if (!pdfjs.GlobalWorkerOptions.workerSrc) {
//     pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//       'pdfjs-dist/build/pdf.worker.min.mjs',
//       import.meta.url,
//     ).href;
//   }
// 
//   const loadingTask = pdfjs.getDocument({
//     data: new Uint8Array(arrayBuffer),
//   });
// 
//   const pdf = await loadingTask.promise;
//   const questions: ExtractedQuestion[] = [];
//   const pageImages: string[] = [];
//   const errors: string[] = [];
//   const totalPages = pdf.numPages;
//   const pageCap = Math.min(totalPages, MAX_PAGES);
//   if (totalPages > MAX_PAGES) {
//     errors.push(`File has ${totalPages} pages; only the first ${MAX_PAGES} were processed.`);
//   }
// 
//   for (let i = 1; i <= pageCap; i++) {
//     try {
//       const page = await pdf.getPage(i);
//       const viewport = page.getViewport({ scale: 1 });
//       const renderViewport = page.getViewport({ scale: RENDER_SCALE });
//       const canvas = document.createElement('canvas');
//       canvas.width = Math.ceil(renderViewport.width);
//       canvas.height = Math.ceil(renderViewport.height);
//       const ctx = canvas.getContext('2d');
//       if (!ctx) {
//         errors.push(`Page ${i}: canvas unavailable, skipped.`);
//         continue;
//       }
// 
//       await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
//       const pageImage = canvasToDataUrl(canvas);
//       const pageBlob = await canvasToBlob(canvas, 0.85);
//       pageImages.push(pageImage);
// 
//       const textContent = await page.getTextContent();
//       const items = (textContent.items as unknown as PdfTextItem[]).filter(
//         item => typeof item.str === 'string' && item.str.trim().length > 0,
//       );
// 
//       if (items.length === 0) {
//         // No extractable text — the page is image-backed (scanned / hand-written).
//         // Split the page into per-question bands on whitespace gaps so stacked
//         // hand-written questions become separate, croppable questions.
//         const bands = splitCanvasIntoBands(canvas);
//         if (bands.length === 0) {
//           // Entirely blank page; keep one cropped-to-content question.
//           bands.push({ xMin: 0, yMin: 0, xMax: canvas.width, yMax: canvas.height });
//         }
//         for (const band of bands) {
//           const cropped = await cropCanvas(canvas, band);
//           questions.push(
//             buildImageQuestion(i, '', cropped.dataURL, cropped.blob),
//           );
//         }
//         continue;
//       }
// 
//       const lines = groupItemsIntoLines(items, viewport.height);
//       const diagramBands = detectDiagramRegions(canvas, items, viewport.height);
//       const diagramRegions: Array<{ band: Band; dataURL: string; blob: Blob }> = [];
//       for (const band of diagramBands) {
//         const cropped = await cropCanvas(canvas, band);
//         diagramRegions.push({ band, dataURL: cropped.dataURL, blob: cropped.blob });
//       }
//       parsePage(i, pageImage, pageBlob, lines, questions, diagramRegions);
//     } catch (err) {
//       const msg = err instanceof Error ? err.message : String(err);
//       errors.push(`Page ${i}: ${msg}`);
//     }
//   }
// 
//   try {
//     loadingTask.destroy();
//   } catch {
//     /* ignore destroy errors */
//   }
// 
//   return { questions, pageCount: totalPages, pageImages, errors };
// }
// 
// /**
//  * Extract questions from a plain image (PNG/JPG/…) using the *same*
//  * band-split → crop → image-backed-question pipeline as a scanned PDF
//  * page. A bare image has no selectable text, so it always takes the
//  * image-backed path (whole-page / band crops, optionally completed with
//  * the on-device OCR toggle in the review screen). No new dependencies:
//  * the canvas analysis helpers above operate on any HTMLCanvasElement.
//  */
// export async function extractQuestionsFromImage(file: File): Promise<PdfExtractResult> {
//   // createImageBitmap decodes off the main thread and gives us natural pixels
//   // so band math (whitespace gaps, ink density) matches the PDF path. A File is a
//   // Blob, which createImageBitmap accepts directly — no need to materialize the
//   // full ArrayBuffer on the main thread.
//   const bitmap = await createImageBitmap(file);
//   const canvas = document.createElement('canvas');
//   canvas.width = bitmap.width;
//   canvas.height = bitmap.height;
//   const ctx = canvas.getContext('2d');
//   if (!ctx) {
//     bitmap.close();
//     throw new Error('Canvas unavailable for image extraction.');
//   }
//   ctx.drawImage(bitmap, 0, 0);
//   bitmap.close();
// 
//   const pageImage = canvasToDataUrl(canvas);
//   const pageImages: string[] = [pageImage];
// 
//   // No selectable text → fall back to whitespace band-splitting.
//   const bands = splitCanvasIntoBands(canvas);
//   const imageBands = bands.length
//     ? bands
//     : [{ xMin: 0, yMin: 0, xMax: canvas.width, yMax: canvas.height }];
// 
//   const questions: ExtractedQuestion[] = [];
//   for (const band of imageBands) {
//     const cropped = await cropCanvas(canvas, band);
//     questions.push(buildImageQuestion(1, '', cropped.dataURL, cropped.blob));
//   }
// 
//   return { questions, pageCount: 1, pageImages, errors: [] };
// }
//