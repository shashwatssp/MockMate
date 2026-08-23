/**
 * Unit tests for the dashboard AI insight helpers.
 *
 * Pure-logic cases run under the node environment. `@google/genai` is mocked so
 * no real Gemini call, key, or credit is ever used; `./supabase` is mocked so no
 * network/DB is touched.
 *
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import {
  buildClassInsightPrompt,
  buildStudentInsightPrompt,
  computeClassInsightData,
  computeStudentInsightData,
  explainClassInsight,
  explainStudentInsight,
  generateClassInsight,
  parseInsightJson,
  DASHBOARD_MAX_RETURN_CHARS,
  DASHBOARD_MAX_TOKENS,
  DASHBOARD_MODEL,
} from '../geminiDashboard';
import { supabase } from '../supabase';
import type { TestResult } from '../../types/exam.types';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}));
vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}));

const MockedGenAI = GoogleGenAI as unknown as Mock;

const mkResult = (
  pct: number,
  completedAt = '2026-08-23T08:00:00.000Z',
  answers: { questionId: string; selectedOption: number }[] = [],
): TestResult => ({
  testId: 't1',
  studentName: 'A',
  answers,
  score: pct,
  totalMarks: 10,
  totalQuestions: 10,
  correctAnswers: pct,
  incorrectAnswers: 0,
  unansweredQuestions: 0,
  percentage: pct,
  timeTaken: 600,
  completedAt: new Date(completedAt),
});

const mkChain = () => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
});

describe('constants', () => {
  it('targets gemini-3.6-flash with a capped token budget', () => {
    expect(DASHBOARD_MODEL).toBe('gemini-3.6-flash');
    expect(DASHBOARD_MAX_TOKENS).toBeLessThan(500);
    expect(DASHBOARD_MAX_RETURN_CHARS).toBeGreaterThan(0);
  });
});

describe('buildClassInsightPrompt', () => {
  it('includes attempt count, average, range and passing rate', () => {
    const prompt = buildClassInsightPrompt({
      attemptCount: 20,
      averagePercentage: 65.4,
      highestPercentage: 98,
      lowestPercentage: 12,
      passRate: 0.65,
      weakQuestionCount: 3,
      topWeakTopics: ['Algebra', 'Cells'],
    });
    expect(prompt).toContain('20 attempts');
    expect(prompt).toContain('65% average');
    expect(prompt).toContain('98%');
    expect(prompt).toContain('12%');
    expect(prompt).toContain('65% passing');
    expect(prompt).toContain('3 question(s)');
    expect(prompt).toContain('Algebra, Cells');
    expect(prompt).toContain('{"insight":');
  });

  it('omits the weak-topics sentence when there are none', () => {
    const prompt = buildClassInsightPrompt({
      attemptCount: 1,
      averagePercentage: 80,
      highestPercentage: 80,
      lowestPercentage: 80,
      passRate: 1,
      weakQuestionCount: 0,
      topWeakTopics: [],
    });
    expect(prompt).not.toContain('Weakest topics');
  });
});

describe('buildStudentInsightPrompt', () => {
  it('includes attempts, scores, batch percentile and trend', () => {
    const prompt = buildStudentInsightPrompt({
      attemptCount: 3,
      latestPercentage: 88,
      averagePercentage: 70,
      trend: 'improving',
      batchPercentile: 75,
      bestTopic: 'Functions',
      bestTopicAccuracy: 0.9,
    });
    expect(prompt).toContain('3 attempts');
    expect(prompt).toContain('88%');
    expect(prompt).toContain('75%');
    expect(prompt).toContain('Functions');
    expect(prompt).toContain('improving');
  });

  it('omits bestTopic / percentile when not provided', () => {
    const prompt = buildStudentInsightPrompt({
      attemptCount: 1,
      latestPercentage: 50,
      averagePercentage: 50,
      trend: 'steady',
    });
    expect(prompt).not.toContain('strongest topic');
    expect(prompt).not.toContain('rank better than');
  });
});

describe('parseInsightJson', () => {
  it('parses a clean JSON object', () => {
    expect(parseInsightJson('{"insight":"The class masters ratios but struggles with calculus."}'))
      .toBe('The class masters ratios but struggles with calculus.');
  });

  it('strips markdown fences', () => {
    expect(parseInsightJson('```json\n{"insight":"hi"}\n```')).toBe('hi');
  });

  it('extracts the first JSON object from surrounding prose', () => {
    expect(parseInsightJson('Here: {"insight":"hi"} thanks')).toBe('hi');
  });

  it('returns null for invalid JSON', () => {
    expect(parseInsightJson('{not json')).toBeNull();
  });

  it('returns null when insight is missing or non-string', () => {
    expect(parseInsightJson('{"foo":"bar"}')).toBeNull();
    expect(parseInsightJson('{"insight":123}')).toBeNull();
  });

  it('returns null for empty / null / undefined input', () => {
    expect(parseInsightJson('')).toBeNull();
    expect(parseInsightJson(null)).toBeNull();
    expect(parseInsightJson(undefined)).toBeNull();
  });

  it('truncates to the max return length', () => {
    const long = 'x'.repeat(DASHBOARD_MAX_RETURN_CHARS + 100);
    const parsed = parseInsightJson(`{"insight":"${long}"}`);
    expect(parsed).not.toBeNull();
    expect((parsed as string).length).toBe(DASHBOARD_MAX_RETURN_CHARS);
  });
});

describe('computeClassInsightData', () => {
  it('returns zeros for an empty result set', () => {
    expect(computeClassInsightData([])).toEqual({
      attemptCount: 0,
      averagePercentage: 0,
      highestPercentage: 0,
      lowestPercentage: 0,
      passRate: 0,
      weakQuestionCount: 0,
      topWeakTopics: [],
    });
  });

  it('computes aggregates and detects weak questions by topic', () => {
    const questions = [{
      id: 'q1',
      text: '2+2?',
      options: ['3', '4', '5'],
      correctAnswer: 1,
      topic: 'Math',
      subject: 'Arithmetic',
      year: '2024',
    }];
    const results = [
      mkResult(50, '2026-08-23T08:00:00.000Z', [{ questionId: 'q1', selectedOption: 0 }]),
      mkResult(50, '2026-08-23T08:05:00.000Z', [{ questionId: 'q1', selectedOption: 0 }]),
    ];
    const data = computeClassInsightData(results, questions, 50);
    expect(data.attemptCount).toBe(2);
    expect(data.averagePercentage).toBe(50);
    expect(data.highestPercentage).toBe(50);
    expect(data.lowestPercentage).toBe(50);
    expect(data.passRate).toBe(1); // both 50% >= 50
    expect(data.weakQuestionCount).toBe(1); // q1 wrong by 100% of attempts
    expect(data.topWeakTopics).toEqual(['Math']);
  });
});

describe('computeStudentInsightData', () => {
  it('classifies trend as improving / declining / steady', () => {
    const base = (pct: number, ms: string) => mkResult(pct, ms, []);
    const improving = computeStudentInsightData([base(60, '2026-08-23T08:00:00.000Z'), base(90, '2026-08-23T09:00:00.000Z')]);
    expect(improving.trend).toBe('improving');
    expect(improving.latestPercentage).toBe(90);

    const declining = computeStudentInsightData([base(70, '2026-08-23T08:00:00.000Z'), base(40, '2026-08-23T09:00:00.000Z')]);
    expect(declining.trend).toBe('declining');

    const steady = computeStudentInsightData([base(58, '2026-08-23T08:00:00.000Z'), base(60, '2026-08-23T09:00:00.000Z')]);
    expect(steady.trend).toBe('steady');
    expect(steady.averagePercentage).toBe(59);
  });

  it('returns zeros for an empty result set', () => {
    expect(computeStudentInsightData([])).toEqual({
      attemptCount: 0,
      latestPercentage: 0,
      averagePercentage: 0,
      trend: 'steady',
    });
  });
});

describe('generateClassInsight (fail-open)', () => {
  beforeEach(() => vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key'));
  afterEach(() => {
    vi.unstubAllEnvs();
    MockedGenAI.mockReset();
  });

  it('is fail-open when the API key is absent — no SDK is instantiated', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    const out = await generateClassInsight({
      attemptCount: 10, averagePercentage: 50, highestPercentage: 90, lowestPercentage: 10,
      passRate: 0.5, weakQuestionCount: 2, topWeakTopics: [],
    });
    expect(out).toBeNull();
    expect(MockedGenAI).not.toHaveBeenCalled();
  });

  it('returns null when the SDK call errors', async () => {
    MockedGenAI.mockImplementation(function () {
      return { models: { generateContent: vi.fn().mockRejectedValue(new Error('quota exhausted')) } };
    });
    const out = await generateClassInsight({
      attemptCount: 10, averagePercentage: 50, highestPercentage: 90, lowestPercentage: 10,
      passRate: 0.5, weakQuestionCount: 2, topWeakTopics: [],
    });
    expect(out).toBeNull();
  });

  it('parses and returns the insight on the happy path', async () => {
    MockedGenAI.mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: '{"insight":"Algebra needs more practice; the class is strong on geometry."}',
          }),
        },
      };
    });
    const out = await generateClassInsight({
      attemptCount: 12, averagePercentage: 65, highestPercentage: 92, lowestPercentage: 21,
      passRate: 0.58, weakQuestionCount: 4, topWeakTopics: ['Algebra'],
    });
    expect(out).toBe('Algebra needs more practice; the class is strong on geometry.');
    expect(MockedGenAI).toHaveBeenCalledTimes(1);
    expect(MockedGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });
});

describe('explainClassInsight (cache-aware)', () => {
  beforeEach(() => vi.stubEnv('VITE_GEMINI_API_KEY', ''));
  afterEach(() => { MockedGenAI.mockReset(); (supabase.from as Mock).mockReset(); });

  it('returns the cached insight and skips Gemini when the cache is fresh', async () => {
    const results = [
      mkResult(70, '2026-08-23T08:05:00.000Z'),
      mkResult(80, '2026-08-23T08:10:00.000Z'),
    ];
    const chain = mkChain();
    (chain.maybeSingle as Mock).mockResolvedValue({
      data: {
        insight: 'Cached class summary.',
        analyzed_result_count: 2,
        latest_result_completed_at: '2026-08-23T08:10:00.000Z',
      },
      error: null,
    });
    (supabase.from as Mock).mockReturnValue(chain);

    const out = await explainClassInsight('test-1', results, [], 50);
    expect(out).toBe('Cached class summary.');
    expect(MockedGenAI).not.toHaveBeenCalled();
    expect(chain.upsert as Mock).not.toHaveBeenCalled();
  });

  it('regenerates and upserts when the cache is stale (fewer analysed results)', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');
    const results = [
      mkResult(70, '2026-08-23T08:05:00.000Z'),
      mkResult(80, '2026-08-23T08:10:00.000Z'),
    ];
    const chain = mkChain();
    (chain.maybeSingle as Mock).mockResolvedValue({
      data: { insight: 'Stale', analyzed_result_count: 1, latest_result_completed_at: '2026-08-23T08:05:00.000Z' },
      error: null,
    });
    (supabase.from as Mock).mockReturnValue(chain);
    MockedGenAI.mockImplementation(function () {
      return { models: { generateContent: vi.fn().mockResolvedValue({ text: '{"insight":"Fresh insight"}' }) } };
    });

    const out = await explainClassInsight('test-1', results, [], 50);
    expect(out).toBe('Fresh insight');
    expect(chain.upsert as Mock).toHaveBeenCalledWith(
      expect.objectContaining({ test_id: 'test-1', insight: 'Fresh insight', analyzed_result_count: 2 }),
    );
  });

  it('does not upsert when generation fails (fail-open, no key)', async () => {
    const results = [mkResult(70, '2026-08-23T08:05:00.000Z')];
    const chain = mkChain();
    (chain.maybeSingle as Mock).mockResolvedValue({ data: null, error: null });
    (supabase.from as Mock).mockReturnValue(chain);

    const out = await explainClassInsight('test-1', results, [], 50);
    expect(out).toBeNull(); // no key -> null, and no row written
    expect(chain.upsert as Mock).not.toHaveBeenCalled();
  });
});

describe('explainStudentInsight (cache-aware)', () => {
  afterEach(() => { MockedGenAI.mockReset(); (supabase.from as Mock).mockReset(); });

  it('regenerates + stores a new nudge when the cache is missing', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');
    const results = [
      mkResult(60, '2026-08-23T08:00:00.000Z'),
      mkResult(82, '2026-08-23T09:00:00.000Z'),
    ];
    const chain = mkChain();
    (chain.maybeSingle as Mock).mockResolvedValue({ data: null, error: null });
    (supabase.from as Mock).mockReturnValue(chain);
    MockedGenAI.mockImplementation(function () {
      return { models: { generateContent: vi.fn().mockResolvedValue({ text: '{"insight":"Nice bounce-back on your latest attempt!"}' }) } };
    });

    const out = await explainStudentInsight('student-1', results, { batchPercentile: 70 });
    expect(out).toBe('Nice bounce-back on your latest attempt!');
    expect(chain.upsert as Mock).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 'student-1', insight: 'Nice bounce-back on your latest attempt!', analyzed_result_count: 2 }),
    );
  });
});
