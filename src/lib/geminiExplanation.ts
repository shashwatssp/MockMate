/**
 * Save-time AI explanation generator for questions.
 *
 * When a teacher saves a question (PDF import review "Accept & next" or the
 * manual Create Question form), we generate a short rationale — "why the
 * correct option is right, and why the others are wrong" — using
 * `gemini-3.6-flash` and persist it to `Question.explanation` (new nullable DB
 * column). The rationale is then surfaced on the student's results/report-card
 * view.
 *
 * Design constraints (per product decision):
 *  - **Default-on**: every saved question gets an explanation attempt.
 *  - **Non-blocking / fail-open**: if the API key is absent, quota is exhausted,
 *    or the call errors, the question is still saved — `explanation` is simply
 *    left null. We never throw out of the save path.
 *  - **Single-call, correct-only**: one generation per question at save time;
 *    no per-attempt / per-student regeneration.
 *  - **Zero bundle impact**: `@google/genai` is dynamically imported (mirrors
 *    the voice-mode pattern in `CreateTest.tsx`) so the heavy SDK only loads
 *    when a key is actually present.
 */

import type { Question } from '../types/exam.types';

/** Minimal, stable input shape so the helper is decoupled from the full
 *  `Question` type and trivially testable in isolation. */
export interface ExplanationInput {
  text: string;
  options: string[];
  correctAnswer: number;
  topic?: string;
  subject?: string;
}

export const EXPLANATION_MODEL = 'gemini-3.6-flash';
export const EXPLANATION_MAX_TOKENS = 280; // ~60 words of rationale
export const EXPLANATION_MAX_RETURN_CHARS = 500; // defensive cap on stored text

/** Convert a 0-based option index to its letter label (A, B, C, …). */
export function optionLetter(index: number): string {
  const base = 'A'.charCodeAt(0);
  const letter = String.fromCharCode(base + index);
  return letter >= 'A' && letter <= 'Z' ? letter : String.fromCharCode(base + (index % 26));
}

/**
 * Build the Gemini prompt for generating a question explanation.
 *
 * Returns a string (pure function — no IO) so it can be unit-tested and so the
 * exact prompt is visible/reviewable.
 */
export function buildExplanationPrompt(q: ExplanationInput): string {
  const correctLetter = optionLetter(q.correctAnswer);
  const options = (q.options ?? []).map(
    (opt, i) => `${optionLetter(i)}. ${opt ?? ''}`,
  );
  const subject = q.subject ? `\nSubject: ${q.subject}` : '';
  const topic = q.topic ? `\nTopic: ${q.topic}` : '';

  return [
    'You are a concise exam tutor. For the multiple-choice question below, write',
    'a 1-3 sentence rationale (max 60 words) explaining why the correct answer is',
    'right and why each of the other options is wrong. Keep it student-friendly.',
    '',
    `Question: ${q.text ?? ''}`,
    ...(subject ? [subject] : []),
    ...(topic ? [topic] : []),
    '',
    'Options:',
    ...options,
    '',
    `Correct answer: ${correctLetter}`,
    '',
    'Return ONLY valid JSON with a single field, no prose before/after:',
    '{"explanation":"<the rationale text>"}',
    `{"explanation":"<why ${correctLetter} is correct and the other options are wrong>"}`,
  ].join('\n');
}

/**
 * Extract + sanitize the explanation string from a (possibly noisy) Gemini
 * response. Strips markdown fences, locates the first `{ ... }` object,
 * parses it, and reads `explanation`. Caps length defensively.
 *
 * Pure — no IO. Returns `null` for anything unparseable or non-string.
 */
export function parseExplanationJson(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let cleaned = raw.replace(/```(?:json)?/gi, '');

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  // Keep only the outermost `{...}` span so surrounding prose or trailing text
  // ("thanks") doesn't break JSON.parse. If there's no opening brace, leave the
  // string as-is so JSON.parse fails safely → null.
  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }

  cleaned = cleaned.trim();
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned);
    const exp = parsed?.explanation;
    if (typeof exp !== 'string') return null;
    return exp.trim().slice(0, EXPLANATION_MAX_RETURN_CHARS);
  } catch {
    return null;
  }
}

/**
 * Generate an explanation for a single question via Gemini.
 *
 * **Fail-open**: returns `null` (never throws) when:
 *  - `VITE_GEMINI_API_KEY` is unset/empty (no SDK import happens at all),
 *  - the SDK fails to load,
 *  - the network/quota call errors,
 *  - the response can't be parsed.
 *
 * Callers can `await generateQuestionExplanation(q)` inline in a save handler
 * without worrying about breaking the save — a `null` result simply means the
 * question is saved without an explanation.
 */
export async function generateQuestionExplanation(
  q: ExplanationInput,
): Promise<string | null> {
  const apiKey: string | undefined =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, unknown> | undefined)?.VITE_GEMINI_API_KEY as
          | string
          | undefined
      : undefined;

  // No key → no network call, no SDK weight in the bundle.
  if (!apiKey) return null;

  try {
    // Lazy import mirrors the voice-mode pattern; keeps the SDK out of the
    // initial bundle and makes this trivially mockable in tests.
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: EXPLANATION_MODEL,
      contents: buildExplanationPrompt(q),
      config: {
        temperature: 0.2,
        maxOutputTokens: EXPLANATION_MAX_TOKENS,
        responseMimeType: 'application/json',
      },
    });
    const explanation = parseExplanationJson(res?.text ?? '');
    return explanation;
  } catch (err: unknown) {
    // Non-blocking: the caller (save handler) proceeds regardless.
    console.warn('[geminiExplanation] explanation generation failed; question still saved:', err);
    return null;
  }
}

/** Convenience adapter: accept a full `Question` and return the input shape. */
export const toExplanationInput = (q: Pick<Question, 'text' | 'options' | 'correctAnswer' | 'topic' | 'subject'>): ExplanationInput => ({
  text: q.text,
  options: q.options,
  correctAnswer: q.correctAnswer,
  topic: q.topic,
  subject: q.subject,
});
