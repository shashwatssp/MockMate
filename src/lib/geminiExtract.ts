// === OLD geminiExtract.ts implementation (commented out, preserved for reuse) ===
// The LLM/Gemini parsing code is disabled. All exports re-routed to the
// new spatial-extraction pipeline (spatialExtract.ts) which implements the
// PyMuPDF reference architecture in pure browser TypeScript (pdfjs-dist).
// To re-enable the Gemini path later, restore this file from git and uncomment.

export type { GeminiQuestion, GeminiExtractProgress } from './spatialExtract';
export { extractQuestionsWithGemini } from './spatialExtract';

// /**
//  * AI-powered question extraction using Gemini 3 Flash.
//  *
//  * This module bridges the on-device (pdfjs + tesseract) extraction in
//  * `pdfExtract.ts` with the Gemini API. It reuses pdfjs to render PDF
//  * pages (or decodes bare images) into base64 PNG data parts, then sends
//  * each to `gemini-3.6-flash` with a structured prompt that returns a
//  * JSON array of questions.
//  *
//  * The teacher still reviews and edits every extracted question before
//  * it enters the question bank — this is an extraction assistant, not
//  * a fully automated pipeline.
//  */
// 
// export interface GeminiQuestion {
//   text: string;
//   options: string[];
//   correctAnswer: number;
//   subject: string;
//   topic: string;
//   marks: number;
//   /** True only when this question requires a visual diagram/figure. */
//   hasDiagram: boolean;
//   /** Normalized bounding box (0–1) of the diagram within the source page image, when hasDiagram is true. */
//   diagramBbox?: { x: number; y: number; width: number; height: number };
//   /** Base64 data URL of the clean cropped diagram (only for hasDiagram questions). */
//   imageData?: string;
//   imageMimeType?: string;
//   /** Base64 data URL of the full source page/image (for reference / uncrop in review). */
//   pageImageData?: string;
// }
// 
// export interface GeminiExtractProgress {
//   status: 'processing' | 'complete' | 'error';
//   currentPage?: number;
//   totalPages?: number;
//   message?: string;
//   error?: string;
// }
// 
// const GEMINI_MODEL = 'gemini-3.6-flash';
// const MAX_PAGES = 60;
// // Lower render scale for Gemini — it does OCR well at modest resolution,
// // and smaller images mean fewer tokens / cheaper, faster calls.
// const RENDER_SCALE = 1.5;
// 
// const EXTRACT_PROMPT = `You are an expert exam question extraction assistant. Extract ALL questions from this exam paper page image.
// 
// For each question, identify:
// 1. The question text (stem) - the actual question being asked
// 2. The answer options (A, B, C, D, etc.) in order as they appear
// 3. The correct answer - determine from answer key, asterisk (*) markings, bold/underlined options, or context. If uncertain, default to 0 (first option).
// 4. Subject - if visible (e.g., Physics, Chemistry, Math), otherwise "General"
// 5. Topic - if visible (e.g., Mechanics, Algebra), otherwise "General"
// 6. Marks - per question if visible, otherwise 1
// 7. hasDiagram - true only when a diagram, chart, graph, geometry figure, circuit,
//    molecule, or other visual is part of this specific question. Do not mark
//    true for decorative page artwork or when the question is fully text-based.
// 
// Return ONLY valid JSON in this exact format:
// {"questions":[{"text":"question stem","options":["option A","option B","option C","option D"],"correctAnswer":0,"subject":"General","topic":"General","marks":1,"hasDiagram":false,"diagramBbox":{"x":0.1,"y":0.3,"width":0.8,"height":0.4}}]}
// 
// When hasDiagram is true, include diagramBbox (the diagram region as fractions of the full image: x, y, width, height — all 0–1). When hasDiagram is false, omit diagramBbox.
// 
// If no questions are found on this page, return {"questions":[]}.
// Do NOT include any text, markdown, or explanations outside the JSON.`;
// 
// // ─── PDF rendering (reuses pdfjs-dist, lazy-loaded like pdfExtract.ts) ───
// 
// /** Lazily load pdfjs-dist so its worker stays out of the main bundle. */
// async function getPdfjs() {
//   const pdfjs = await import('pdfjs-dist');
//   if (!pdfjs.GlobalWorkerOptions.workerSrc) {
//     pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//       'pdfjs-dist/build/pdf.worker.min.mjs',
//       import.meta.url,
//     ).href;
//   }
//   return pdfjs;
// }
// 
// /** Split a data URL like `data:image/png;base64,…` into raw parts. */
// function splitDataUrl(dataUrl: string): { base64: string; mimeType: string } {
//   const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.]+);base64,(.*)$/);
//   if (!match) throw new Error('Invalid data URL');
//   return { base64: match[2], mimeType: match[1] };
// }
// 
// /** Crop a rectangular region (in canvas pixels) out of a canvas and return a data URL. */
// function cropCanvasRegion(
//   canvas: HTMLCanvasElement,
//   bbox: { x: number; y: number; width: number; height: number },
// ): string {
//   const x0 = Math.max(0, Math.round(bbox.x * canvas.width));
//   const y0 = Math.max(0, Math.round(bbox.y * canvas.height));
//   const cw = Math.min(canvas.width - x0, Math.max(1, Math.round(bbox.width * canvas.width)));
//   const ch = Math.min(canvas.height - y0, Math.max(1, Math.round(bbox.height * canvas.height)));
//   const c = document.createElement('canvas');
//   c.width = cw;
//   c.height = ch;
//   const ctx = c.getContext('2d');
//   if (ctx) {
//     ctx.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
//   }
//   return c.toDataURL('image/png');
// }
// 
// /** Render a single PDF page to a PNG data URL + raw base64 for Gemini. */
// async function renderPageToImage(
//   pdf: any,
//   pageNum: number,
// ): Promise<{ dataUrl: string; base64: string; mimeType: string; canvas: HTMLCanvasElement }> {
//   const page = await pdf.getPage(pageNum);
//   const viewport = page.getViewport({ scale: RENDER_SCALE });
//   const canvas = document.createElement('canvas');
//   canvas.width = Math.ceil(viewport.width);
//   canvas.height = Math.ceil(viewport.height);
//   const ctx = canvas.getContext('2d');
//   if (!ctx) throw new Error(`Page ${pageNum}: canvas context unavailable`);
//   await page.render({ canvasContext: ctx, viewport }).promise;
//   const dataUrl = canvas.toDataURL('image/png');
//   const { base64, mimeType } = splitDataUrl(dataUrl);
//   return { dataUrl, base64, mimeType, canvas };
// }
// 
// /** Convert an image File to a data URL via the FileReader API (off-main-thread decode). */
// function imageFileToDataUrl(file: File): Promise<string> {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.onload = () => resolve(reader.result as string);
//     reader.onerror = () => reject(new Error('Failed to read image file'));
//     reader.readAsDataURL(file);
//   });
// }
// 
// /** Decode a data URL into an offscreen HTMLCanvasElement (for cropping diagrams). */
// function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
//   return new Promise((resolve, reject) => {
//     const img = new Image();
//     img.onload = () => {
//       const canvas = document.createElement('canvas');
//       canvas.width = img.naturalWidth;
//       canvas.height = img.naturalHeight;
//       const ctx = canvas.getContext('2d');
//       if (ctx) ctx.drawImage(img, 0, 0);
//       resolve(canvas);
//     };
//     img.onerror = () => reject(new Error('Failed to decode image for canvas'));
//     img.src = dataUrl;
//   });
// }
// 
// // ─── Gemini API interaction ───
// 
// /** Strip markdown code fences so JSON.parse doesn't choke on Gemini's output. */
// function cleanGeminiJson(text: string): string {
//   let cleaned = text.replace(/```(?:json)?/gi, '');
//   const firstBrace = cleaned.indexOf('{');
//   if (firstBrace > 0) cleaned = cleaned.substring(firstBrace);
//   const lastBrace = cleaned.lastIndexOf('}');
//   if (lastBrace > 0) cleaned = cleaned.substring(0, lastBrace + 1);
//   return cleaned.trim();
// }
// 
// /** Normalise whatever Gemini returns into a validated GeminiQuestion array. */
// function normalizeGeminiQuestions(raw: unknown): GeminiQuestion[] {
//   let arr: unknown[] = [];
//   if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
//     arr = (raw as Record<string, unknown>).questions ?? [];
//   } else if (Array.isArray(raw)) {
//     arr = raw;
//   }
// 
//   return arr
//     .map((q): GeminiQuestion | null => {
//       if (!q || typeof q !== 'object') return null;
//       const obj = q as Record<string, unknown>;
//       const text = String(obj.text || '').trim();
//       const options = Array.isArray(obj.options)
//         ? obj.options.map(o => String(o).trim()).filter(Boolean)
//         : [];
//       if (!text || options.length < 2) return null;
//       const correct =
//         typeof obj.correctAnswer === 'number'
//           ? obj.correctAnswer
//           : typeof obj.correct_answer === 'number'
//             ? obj.correct_answer
//             : 0;
//       // Parse diagramBbox (fractions 0–1) from either camelCase or snake_case key.
//       const bboxRaw = (obj.diagramBbox ?? obj.diagram_bbox) as
//         | { x: number; y: number; width: number; height: number }
//         | undefined;
//       let diagramBbox: GeminiQuestion['diagramBbox'] | undefined;
//       if (
//         bboxRaw && typeof bboxRaw === 'object' &&
//         typeof bboxRaw.x === 'number' && typeof bboxRaw.y === 'number' &&
//         typeof bboxRaw.width === 'number' && typeof bboxRaw.height === 'number'
//       ) {
//         diagramBbox = {
//           x: Math.max(0, Math.min(1, bboxRaw.x)),
//           y: Math.max(0, Math.min(1, bboxRaw.y)),
//           width: Math.max(0, Math.min(1, bboxRaw.width)),
//           height: Math.max(0, Math.min(1, bboxRaw.height)),
//         };
//       }
//       return {
//         text,
//         options,
//         correctAnswer: Math.max(0, Math.min(correct, options.length - 1)),
//         subject: String(obj.subject || 'General').trim() || 'General',
//         topic: String(obj.topic || 'General').trim() || 'General',
//         marks:
//           typeof obj.marks === 'number' && obj.marks > 0 ? obj.marks : 1,
//         hasDiagram: obj.hasDiagram === true || obj.has_diagram === true,
//         diagramBbox,
//       };
//     })
//     .filter((q): q is GeminiQuestion => q !== null);
// }
// 
// /**
//  * Send a single base64-encoded image to Gemini and parse the question JSON.
//  *
//  * When a `sourceCanvas` is provided, questions flagged `hasDiagram` are given a
//  * clean crop of the diagram region (using the `diagramBbox` Gemini returns) as
//  * their `imageData`, rather than the full page image. The full page image is
//  * always retained as `pageImageData` so the review screen can offer an
//  * "uncrop" / restore-original action.
//  */
// async function geminiExtractFromImage(
//   base64: string,
//   mimeType: string,
//   pageNum: number,
//   dataUrl?: string,
//   sourceCanvas?: HTMLCanvasElement,
//   onProgress?: (progress: GeminiExtractProgress) => void,
// ): Promise<GeminiQuestion[]> {
//   let GoogleGenAI: any;
//   try {
//     ({ GoogleGenAI } = await import('@google/genai'));
//   } catch {
//     throw new Error(
//       '@google/genai package is not installed. Run `npm install @google/genai`.',
//     );
//   }
// 
//   const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
//   if (!apiKey) {
//     throw new Error(
//       'VITE_GEMINI_API_KEY is not set. Add it to your .env.local file.',
//     );
//   }
// 
//   const ai = new GoogleGenAI({ apiKey });
// 
//   try {
//     onProgress?.({
//       status: 'processing',
//       currentPage: pageNum,
//       message: `Sending page ${pageNum} to Gemini…`,
//     });
// 
//     const response = await ai.models.generateContent({
//       model: GEMINI_MODEL,
//       contents: [
//         {
//           inlineData: {
//             data: base64,
//             mimeType,
//           },
//         },
//         { text: EXTRACT_PROMPT },
//       ],
//       config: {
//         responseMimeType: 'application/json',
//         temperature: 0.1,
//         topP: 0.9,
//         maxOutputTokens: 8192,
//       },
//     });
// 
//     const rawText = typeof response.text === 'string' ? response.text : '';
//     const cleaned = cleanGeminiJson(rawText);
// 
//     let parsed: unknown;
//     try {
//       parsed = JSON.parse(cleaned);
//     } catch {
//       // Broader extraction fallback
//       const start = cleaned.indexOf('{');
//       const end = cleaned.lastIndexOf('}');
//       if (start >= 0 && end > start) {
//         parsed = JSON.parse(cleaned.slice(start, end + 1));
//       } else {
//         parsed = { questions: [] };
//       }
//     }
// 
//     const questions = normalizeGeminiQuestions(parsed);
// 
//     // Attach images: for hasDiagram questions, crop the clean diagram from the
//     // source canvas (using Gemini's diagramBbox). For questions without a usable
//     // bbox or canvas, fall back to the full page image. Text-only questions
//     // intentionally stay image-free.
//     if (questions.length > 0) {
//       questions.forEach(q => {
//         if (!q.hasDiagram) return;
//         // Always retain the full page image for uncrop / reference.
//         if (dataUrl) q.pageImageData = dataUrl;
//         if (sourceCanvas && q.diagramBbox) {
//           q.imageData = cropCanvasRegion(sourceCanvas, q.diagramBbox);
//         } else if (dataUrl) {
//           // Fallback: full page image when Gemini did not return a bbox.
//           q.imageData = dataUrl;
//         }
//         q.imageMimeType = 'image/png';
//       });
//     }
// 
//     onProgress?.({
//       status: 'processing',
//       currentPage: pageNum,
//       message: `Extracted ${questions.length} question(s) from page ${pageNum}.`,
//     });
// 
//     return questions;
//   } catch (err: unknown) {
//     const msg = err instanceof Error ? err.message : String(err);
//     console.error(`Gemini extraction failed for page ${pageNum}:`, err);
//     onProgress?.({
//       status: 'error',
//       currentPage: pageNum,
//       error: `Gemini error: ${msg}`,
//     });
//     return [];
//   }
// }
// 
// // ─── Public API ───
// 
// /**
//  * Extract questions from a PDF or image file using Gemini 3 Flash.
//  *
//  * PDF pages are rendered to PNG images via pdfjs-dist (lazy-loaded, same as
//  * the on-device path in `pdfExtract.ts`) and sent to Gemini one page at a time.
//  * Bare images (PNG, JPG, etc.) are converted to base64 and sent directly.
//  *
//  * @param file       A PDF or image File to extract questions from.
//  * @param onProgress Optional callback receiving progress / status updates.
//  * @returns          Array of `GeminiQuestion` ready for the one-by-one review.
//  */
// export async function extractQuestionsWithGemini(
//   file: File,
//   onProgress?: (progress: GeminiExtractProgress) => void,
// ): Promise<GeminiQuestion[]> {
//   onProgress?.({ status: 'processing', message: 'Starting AI extraction…' });
// 
//   const allQuestions: GeminiQuestion[] = [];
//   const isImage = file.type.startsWith('image/');
// 
//   if (isImage) {
//     const dataUrl = await imageFileToDataUrl(file);
//     const { base64, mimeType } = splitDataUrl(dataUrl);
//     onProgress?.({
//       status: 'processing',
//       currentPage: 1,
//       totalPages: 1,
//       message: 'Processing image with Gemini…',
//     });
//     // Build a canvas from the image so diagram regions can be cropped.
//     const sourceCanvas = await dataUrlToCanvas(dataUrl);
//     const questions = await geminiExtractFromImage(
//       base64,
//       mimeType,
//       1,
//       dataUrl,
//       sourceCanvas,
//       onProgress,
//     );
//     allQuestions.push(...questions);
//   } else {
//     // PDF path: render each page to an image and send to Gemini
//     const arrayBuffer = await file.arrayBuffer();
//     const pdfjs = await getPdfjs();
//     const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
//     const pdf = await loadingTask.promise;
//     const totalPages = Math.min(pdf.numPages, MAX_PAGES);
// 
//     onProgress?.({
//       status: 'processing',
//       currentPage: 0,
//       totalPages: pdf.numPages,
//       message: `Processing ${pdf.numPages} page(s)…`,
//     });
// 
//     for (let i = 1; i <= totalPages; i++) {
//       try {
//         onProgress?.({
//           status: 'processing',
//           currentPage: i,
//           totalPages: pdf.numPages,
//           message: `Analyzing page ${i} of ${pdf.numPages}…`,
//         });
//         const { dataUrl, base64, mimeType, canvas } = await renderPageToImage(pdf, i);
//         const questions = await geminiExtractFromImage(
//           base64,
//           mimeType,
//           i,
//           dataUrl,
//           canvas,
//           onProgress,
//         );
//         allQuestions.push(...questions);
//       } catch (err: unknown) {
//         const msg = err instanceof Error ? err.message : String(err);
//         onProgress?.({
//           status: 'processing',
//           currentPage: i,
//           totalPages: pdf.numPages,
//           message: `Page ${i}: ${msg} (skipping)`,
//         });
//         console.error(`Page ${i} failed:`, err);
//       }
//     }
// 
//     try {
//       loadingTask.destroy();
//     } catch {
//       /* ignore */
//     }
//   }
// 
//   onProgress?.({
//     status: 'complete',
//     message: `Extracted ${allQuestions.length} question(s).`,
//   });
//   return allQuestions;
// }
//