/**
 * AI-integrated dashboard insights (Section C — DB-cached, lazy, on-demand).
 *
 * Two Supabase cache tables (see `supabase/migrations/20260823000000_dashboard_insights.sql`):
 *  - `test_class_insights(test_id, …)`      — teacher's class summary
 *  - `student_progress_insights(student_id, …)` — student's micro-nudge
 *
 * Each row records `analyzed_result_count` + `latest_result_completed_at` at
 * generation time. `explainClassInsight` / `explainStudentInsight` return the
 * cached insight when it still covers the current result set; otherwise they
 * make a SINGLE Gemini call, persist a fresh row, and return the new text.
 *
 * Fail-open (mirrors `geminiExplanation.ts`): if the API key is absent, quota
 * exhausts, or the call errors, the cache is left untouched and `null` is
 * returned — callers degrade to plain aggregates with no AI text.
 *
 * `@google/genai` is dynamically imported (like the voice-mode pattern in
 * `CreateTest.tsx`) so the SDK only loads when a key is actually present.
 */
import { supabase } from './supabase';
import type { Question, TestResult } from '../types/exam.types';
import { parseExplanationJson, toExplanationInput } from './geminiExplanation';
export { toExplanationInput };

export const DASHBOARD_MODEL = 'gemini-3.6-flash' as const;
export const DASHBOARD_MAX_TOKENS = 128; // 1–2 sentence summary
export const DASHBOARD_MAX_RETURN_CHARS = 320; // defensive cap on stored text
export const DASHBOARD_API_KEY_ENV = 'VITE_GEMINI_API_KEY';

const CLASS_TABLE = 'test_class_insights';
const STUDENT_TABLE = 'student_progress_insights';

/** How many milliseconds of drift we tolerate when comparing timestamps. */
const INSTANT_SLOP_MS = 1000;

function getApiKey(): string | undefined {
  const env = typeof import.meta !== 'undefined' ? (import.meta.env as Record<string, unknown> | undefined) : undefined;
  const key = env?.VITE_GEMINI_API_KEY;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

// ---------------------------------------------------------------------------
// Cache row shapes (snake_case as returned by Supabase).
// ---------------------------------------------------------------------------
interface CachedInsightRow {
  insight: string | null;
  analyzed_result_count: number | null;
  latest_result_completed_at: string | null;
}

const readCacheRow = async (table: string, keyCol: string, key: string): Promise<CachedInsightRow | null> => {
  const { data, error } = await supabase
    .from(table)
    .select('insight, analyzed_result_count, latest_result_completed_at')
    .eq(keyCol, key)
    .maybeSingle();
  if (error) {
    console.warn(`[geminiDashboard] cache read failed for ${table}.${keyCol}=${key}:`, error);
    return null;
  }
  return (data ?? null) as CachedInsightRow | null;
};

const writeCacheRow = async (table: string, keyCol: string, key: string, insight: string, count: number, latestISO: string | null) => {
  await supabase.from(table).upsert({
    [keyCol]: key,
    insight,
    analyzed_result_count: count,
    latest_result_completed_at: latestISO,
  });
};

/** True when the cached row covers `count` results finalized at `latestMs`. */
const cacheIsFresh = (row: CachedInsightRow | null, count: number, latestMs: number): boolean => {
  if (!row || !row.insight) return false; // null insight == "not yet answered" -> regenerate
  if ((row.analyzed_result_count ?? 0) < count) return false;
  if (latestMs === 0) return false;
  const rowMs = row.latest_result_completed_at ? new Date(row.latest_result_completed_at).getTime() : 0;
  return rowMs > 0 && Math.abs(rowMs - latestMs) < INSTANT_SLOP_MS;
};

const latestCompletedAtMs = (results: TestResult[]): number =>
  results.reduce((m, r) => (r.completedAt && r.completedAt.getTime() > m ? r.completedAt.getTime() : m), 0);

// ---------------------------------------------------------------------------
// Pure prompt / parse helpers (unit-tested, no IO).
// ---------------------------------------------------------------------------

export interface ClassInsightData {
  attemptCount: number;
  averagePercentage: number;
  highestPercentage: number;
  lowestPercentage: number;
  passRate: number; // 0..1
  weakQuestionCount: number;
  topWeakTopics: string[];
}

export interface StudentInsightData {
  attemptCount: number;
  latestPercentage: number;
  averagePercentage: number;
  trend: 'improving' | 'declining' | 'steady';
  batchPercentile?: number; // 0..100, this student vs batch
  bestTopic?: string;
  bestTopicAccuracy?: number;
}

/** Build the Gemini prompt for a 1-2 sentence class-wide summary. */
export function buildClassInsightPrompt(data: ClassInsightData): string {
  const avgPct = Math.round(data.averagePercentage);
  const passPct = Math.round(data.passRate * 100);
  const weak = data.weakQuestionCount;
  const topics = data.topWeakTopics.length
    ? ` Weakest topics: ${data.topWeakTopics.slice(0, 3).join(', ')}.`
    : '';
  return [
    'You are a concise exam tutor writing a teacher dashboard summary.',
    `Class performance across ${data.attemptCount} attempts: ${avgPct}% average, high ${data.highestPercentage}%, low ${data.lowestPercentage}%, ${passPct}% passing.`,
    `${weak} question(s) were missed by more than half the class.${topics}`,
    '',
    'Write ONE concise sentence (max 25 words) summarising where the class is strong and ONE actionable priority for the teacher. Be specific, no filler.',
    '',
    'Return ONLY valid JSON with a single field, no prose before/after:',
    '{"insight":"<the summary sentence>"}',
  ].join('\n');
}

/** Build the Gemini prompt for a student micro-nudge. */
export function buildStudentInsightPrompt(data: StudentInsightData): string {
  const parts = [
    'You are a friendly study coach writing a one-sentence nudge for a student dashboard.',
    `Student has taken ${data.attemptCount} attempts. Latest score ${data.latestPercentage}%, career average ${Math.round(data.averagePercentage)}%.`,
  ];
  if (data.batchPercentile !== undefined) parts.push(`They rank better than ${data.batchPercentile}% of their batch.`);
  if (data.bestTopic && data.bestTopicAccuracy !== undefined) {
    parts.push(`Their strongest topic is ${data.bestTopic} (${Math.round(data.bestTopicAccuracy * 100)}% accuracy).`);
  }
  parts.push(`Trend: ${data.trend}.`);
  return [
    ...parts,
    '',
    'Write ONE short encouraging sentence (max 20 words). No markdown, no list, just the sentence.',
    '',
    'Return ONLY valid JSON with a single field, no prose before/after:',
    '{"insight":"<the nudge sentence>"}',
  ].join('\n');
}

/** Extract + sanitize the `insight` string from a (possibly noisy) Gemini response. */
export function parseInsightJson(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let cleaned = raw.replace(/```(?:json)?/gi, '');
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  cleaned = cleaned.trim();
  if (!cleaned) return null;
  try {
    const parsed = JSON.parse(cleaned);
    const exp = parsed?.insight;
    if (typeof exp !== 'string') return null;
    return exp.trim().slice(0, DASHBOARD_MAX_RETURN_CHARS);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure data -> prompt-data computation (unit-tested, no IO).
// ---------------------------------------------------------------------------

export function computeClassInsightData(
  results: TestResult[],
  questions: Question[] = [],
  passingScore = 50,
): ClassInsightData {
  if (results.length === 0) {
    return {
      attemptCount: 0,
      averagePercentage: 0,
      highestPercentage: 0,
      lowestPercentage: 0,
      passRate: 0,
      weakQuestionCount: 0,
      topWeakTopics: [],
    };
  }
  const percentages = results.map(r => r.percentage);
  const sum = percentages.reduce((a, b) => a + b, 0);
  const questionsById = new Map(questions.map(q => [q.id, q]));

  const attemptsByQ = new Map<string, { total: number; wrong: number; topic: string }>();
  results.forEach(r => {
    r.answers.forEach(a => {
      const q = questionsById.get(a.questionId);
      const topic = q?.topic ?? '';
      const entry = attemptsByQ.get(a.questionId) ?? { total: 0, wrong: 0, topic };
      entry.total += 1;
      if (q && a.selectedOption !== q.correctAnswer) entry.wrong += 1;
      attemptsByQ.set(a.questionId, entry);
    });
  });

  const topicWrong = new Map<string, { total: number; wrong: number }>();
  for (const entry of attemptsByQ.values()) {
    if (!entry.topic) continue;
    const t = topicWrong.get(entry.topic) ?? { total: 0, wrong: 0 };
    t.total += entry.total;
    t.wrong += entry.wrong;
    topicWrong.set(entry.topic, t);
  }

  let weakCount = 0;
  for (const entry of attemptsByQ.values()) {
    if (entry.total > 0 && entry.wrong / entry.total > 0.5) weakCount += 1;
  }
  const topWeakTopics = [...topicWrong.entries()]
    .map(([t, e]) => ({ t, rate: e.total ? e.wrong / e.total : 0 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3)
    .map(x => x.t);

  return {
    attemptCount: results.length,
    averagePercentage: sum / results.length,
    highestPercentage: Math.max(...percentages),
    lowestPercentage: Math.min(...percentages),
    passRate: results.filter(r => r.percentage >= passingScore).length / results.length,
    weakQuestionCount: weakCount,
    topWeakTopics,
  };
}

export interface StudentInsightContext {
  batchPercentile?: number; // 0..100
  bestTopic?: string;
  bestTopicAccuracy?: number; // 0..1
}

export function computeStudentInsightData(
  results: TestResult[],
  context: StudentInsightContext = {},
): StudentInsightData {
  if (results.length === 0) {
    return {
      attemptCount: 0,
      latestPercentage: 0,
      averagePercentage: 0,
      trend: 'steady',
      ...context,
    };
  }
  const byDate = [...results].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  const latest = byDate[0];
  const secondLatest = byDate[1];
  const avg = results.reduce((s, r) => s + r.percentage, 0) / results.length;
  const delta = secondLatest ? latest.percentage - secondLatest.percentage : 0;
  const trend: StudentInsightData['trend'] = delta > 2 ? 'improving' : delta < -2 ? 'declining' : 'steady';
  return {
    attemptCount: results.length,
    latestPercentage: latest.percentage,
    averagePercentage: avg,
    trend,
    ...context,
  };
}

// ---------------------------------------------------------------------------
// Fail-open generation (mirror geminiExplanation.generateQuestionExplanation).
// ---------------------------------------------------------------------------

async function callGemini(prompt: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null; // no key -> no SDK import, no network call
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: DASHBOARD_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        maxOutputTokens: DASHBOARD_MAX_TOKENS,
        responseMimeType: 'application/json',
      },
    });
    return parseInsightJson(res?.text ?? '');
  } catch (err: unknown) {
    console.warn('[geminiDashboard] insight generation failed; falling back to aggregates:', err);
    return null;
  }
}

export const generateClassInsight = (data: ClassInsightData): Promise<string | null> =>
  callGemini(buildClassInsightPrompt(data));

export const generateStudentInsight = (data: StudentInsightData): Promise<string | null> =>
  callGemini(buildStudentInsightPrompt(data));

/**
 * Opt-in "regenerate a simpler explanation" for an ExplanationCard.
 * Reuses the rationale parser from `geminiExplanation` so the JSON contract
 * (`{"explanation":"..."}`) stays identical to the save-time generator.
 */
export const generateSimplerExplanation = async (q: {
  text: string;
  options: string[];
  correctAnswer: number;
  topic?: string;
  subject?: string;
}): Promise<string | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    const correctLetter = String.fromCharCode('A'.charCodeAt(0) + q.correctAnswer);
    const options = (q.options ?? []).map((opt, i) => `${String.fromCharCode('A'.charCodeAt(0) + i)}. ${opt ?? ''}`);
    const subject = q.subject ? `\nSubject: ${q.subject}` : '';
    const topic = q.topic ? `\nTopic: ${q.topic}` : '';
    const prompt = [
      'You are a friendly tutor explaining a multiple-choice answer to a student who is stuck.',
      'Explain why the correct answer is right in very simple words (as if to a younger learner), 2-3 short sentences. No jargon.',
      '',
      `Question: ${q.text ?? ''}`,
      subject,
      topic,
      '',
      'Options:',
      ...options,
      '',
      `Correct answer: ${correctLetter}`,
      '',
      'Return ONLY valid JSON with a single field, no prose before/after:',
      '{"explanation":"<the simpler rationale>"}',
    ].join('\n');

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: { temperature: 0.3, maxOutputTokens: 280, responseMimeType: 'application/json' },
    });
    return parseExplanationJson(res?.text ?? '');
  } catch (err: unknown) {
    console.warn('[geminiDashboard] simpler explanation generation failed:', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Cache-aware orchestrators (the entry points the UI calls).
// ---------------------------------------------------------------------------

/**
 * Force a fresh AI class insight regardless of cache (for the modal's
 * "regenerate" button that bypasses the lazy cache). The fresh result is
 * persisted via upsert so subsequent `explainClassInsight` calls resume from it.
 */
export async function regenerateClassInsight(
  testId: string,
  results: TestResult[],
  questions: Question[] = [],
  passingScore?: number,
): Promise<string | null> {
  if (!results.length) return null;
  const latestMs = latestCompletedAtMs(results);
  const latestISO = latestMs ? new Date(latestMs).toISOString() : null;
  const data = computeClassInsightData(results, questions, passingScore);
  const insight = await generateClassInsight(data);
  if (insight) {
    await writeCacheRow(CLASS_TABLE, 'test_id', testId, insight, results.length, latestISO);
  }
  return insight;
}

/**
 * Force a fresh AI micro-nudge for a student regardless of cache (opt-in
 * regenerate button on the dashboard nudge).
 */
export async function regenerateStudentInsight(
  studentId: string,
  results: TestResult[],
  context: StudentInsightContext = {},
): Promise<string | null> {
  if (!results.length) return null;
  const latestMs = latestCompletedAtMs(results);
  const latestISO = latestMs ? new Date(latestMs).toISOString() : null;
  const data = computeStudentInsightData(results, context);
  const insight = await generateStudentInsight(data);
  if (insight) {
    await writeCacheRow(STUDENT_TABLE, 'student_id', studentId, insight, results.length, latestISO);
  }
  return insight;
}

/**
 * Return a cached/fresh AI class insight for a test, making at most one Gemini
 * call. `results` MUST be the same set the modal renders (best-effort filtered to
 * non-practice attempts by the caller). Returns `null` if no key is configured
 * or generation fails — the UI then falls back to plain aggregates.
 */
export async function explainClassInsight(
  testId: string,
  results: TestResult[],
  questions: Question[] = [],
  passingScore?: number,
): Promise<string | null> {
  if (!results.length) return null;
  const latestMs = latestCompletedAtMs(results);
  const latestISO = latestMs ? new Date(latestMs).toISOString() : null;

  const cached = await readCacheRow(CLASS_TABLE, 'test_id', testId);
  if (cacheIsFresh(cached, results.length, latestMs)) return cached?.insight ?? null;

  const data = computeClassInsightData(results, questions, passingScore);
  const insight = await generateClassInsight(data);
  if (insight) {
    await writeCacheRow(CLASS_TABLE, 'test_id', testId, insight, results.length, latestISO);
  }
  return insight; // may be null (fail-open) — no row written on failure
}

/**
 * Return a cached/fresh AI micro-nudge for a student. `results` should be that
 * student's attempts (ordered or not — newest is derived here).
 */
export async function explainStudentInsight(
  studentId: string,
  results: TestResult[],
  context: StudentInsightContext = {},
): Promise<string | null> {
  if (!results.length) return null;
  const latestMs = latestCompletedAtMs(results);
  const latestISO = latestMs ? new Date(latestMs).toISOString() : null;

  const cached = await readCacheRow(STUDENT_TABLE, 'student_id', studentId);
  if (cacheIsFresh(cached, results.length, latestMs)) return cached?.insight ?? null;

  const data = computeStudentInsightData(results, context);
  const insight = await generateStudentInsight(data);
  if (insight) {
    await writeCacheRow(STUDENT_TABLE, 'student_id', studentId, insight, results.length, latestISO);
  }
  return insight;
}
