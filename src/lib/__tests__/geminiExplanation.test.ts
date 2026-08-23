/**
 * Unit tests for the save-time explanation helper.
 *
 * Pure-logic cases run under the node environment (no jsdom) to keep the test
 * stack minimal. The `@google/genai` SDK is mocked so no real Gemini call, key,
 * or credit is ever used.
 *
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import {
  buildExplanationPrompt,
  EXPLANATION_MAX_RETURN_CHARS,
  EXPLANATION_MAX_TOKENS,
  generateQuestionExplanation,
  optionLetter,
  parseExplanationJson,
  toExplanationInput,
} from '../geminiExplanation';
import type { Question } from '../../types/exam.types';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}));

// The real module is a class; the mock above replaces it with a bare vi.fn().
// Cast for ergonomics inside the tests.
const MockedGenAI = GoogleGenAI as unknown as Mock;

const sample = {
  text: 'What is the capital of France?',
  options: ['London', 'Paris', 'Berlin', 'Madrid'],
  correctAnswer: 1,
  subject: 'Geography',
  topic: 'World capitals',
};

describe('optionLetter', () => {
  it('maps 0-25 to A-Z and wraps beyond Z', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(1)).toBe('B');
    expect(optionLetter(25)).toBe('Z');
    expect(optionLetter(26)).toBe('A');
    expect(optionLetter(51)).toBe('Z');
  });
});

describe('buildExplanationPrompt', () => {
  it('includes the stem, labelled options, subject, topic and correct letter', () => {
    const prompt = buildExplanationPrompt(sample);
    expect(prompt).toContain('What is the capital of France?');
    expect(prompt).toContain('A. London');
    expect(prompt).toContain('B. Paris');
    expect(prompt).toContain('C. Berlin');
    expect(prompt).toContain('Correct answer: B');
    expect(prompt).toContain('Subject: Geography');
    expect(prompt).toContain('Topic: World capitals');
  });

  it('omits subject/topic lines when absent', () => {
    const noMeta = {
      text: sample.text,
      options: sample.options,
      correctAnswer: sample.correctAnswer,
    };
    const prompt = buildExplanationPrompt(noMeta);
    expect(prompt).not.toContain('Subject:');
    expect(prompt).not.toContain('Topic:');
    expect(prompt).toContain('Correct answer: B');
  });
});

describe('parseExplanationJson', () => {
  it('parses a clean JSON object', () => {
    expect(parseExplanationJson('{"explanation":"A is right because it is the capital."}'))
      .toBe('A is right because it is the capital.');
  });

  it('strips markdown fences', () => {
    expect(parseExplanationJson('```json\n{"explanation":"hi"}\n```')).toBe('hi');
  });

  it('extracts the first JSON object from surrounding prose', () => {
    expect(parseExplanationJson('Here is the result: {"explanation":"hi"} thanks')).toBe('hi');
  });

  it('returns null for invalid JSON', () => {
    expect(parseExplanationJson('{not json')).toBeNull();
  });

  it('returns null when explanation is missing or non-string', () => {
    expect(parseExplanationJson('{"foo":"bar"}')).toBeNull();
    expect(parseExplanationJson('{"explanation":123}')).toBeNull();
  });

  it('returns null for empty / null / undefined input', () => {
    expect(parseExplanationJson('')).toBeNull();
    expect(parseExplanationJson(null)).toBeNull();
    expect(parseExplanationJson(undefined)).toBeNull();
  });

  it('truncates to the max return length', () => {
    const long = 'x'.repeat(EXPLANATION_MAX_RETURN_CHARS + 100);
    const parsed = parseExplanationJson(`{"explanation":"${long}"}`);
    expect(parsed).not.toBeNull();
    expect((parsed as string).length).toBe(EXPLANATION_MAX_RETURN_CHARS);
  });
});

describe('generateQuestionExplanation', () => {
  beforeEach(() => vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key'));
  afterEach(() => {
    vi.unstubAllEnvs();
    MockedGenAI.mockReset();
  });

  it('is fail-open when the API key is absent — no SDK is instantiated', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', ''); // empty → falsy
    const out = await generateQuestionExplanation(sample);
    expect(out).toBeNull();
    expect(MockedGenAI).not.toHaveBeenCalled();
  });

  it('returns null (and lets the question save) when the SDK call errors', async () => {
    MockedGenAI.mockImplementation(function () {
      return {
        models: { generateContent: vi.fn().mockRejectedValue(new Error('quota exhausted')) },
      };
    });
    const out = await generateQuestionExplanation(sample);
    expect(out).toBeNull();
  });

  it('parses and returns the explanation on the happy path', async () => {
    MockedGenAI.mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: '{"explanation":"Paris is the capital and largest city of France."}',
          }),
        },
      };
    });
    const out = await generateQuestionExplanation(sample);
    expect(out).toBe('Paris is the capital and largest city of France.');
    expect(MockedGenAI).toHaveBeenCalledTimes(1);
    expect(MockedGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('requests the documented model with a capped token budget', async () => {
    let capturedModel: unknown;
    let capturedMaxTokens: unknown;
    MockedGenAI.mockImplementation(function () {
      return {
        models: {
          generateContent: vi.fn().mockImplementation((cfg: { model?: unknown; config?: { maxOutputTokens?: unknown } }) => {
            capturedModel = cfg.model;
            capturedMaxTokens = cfg.config?.maxOutputTokens;
            return Promise.resolve({ text: '{"explanation":"x"}' });
          }),
        },
      };
    });
    await generateQuestionExplanation(sample);
    expect(capturedModel).toBe('gemini-3.6-flash');
    expect(capturedMaxTokens).toBe(EXPLANATION_MAX_TOKENS);
  });
});

describe('toExplanationInput', () => {
  it('projects a full Question into the explanation input shape', () => {
    const q: Question = {
      id: 'q1',
      text: '2+2?',
      options: ['3', '4', '5'],
      correctAnswer: 1,
      topic: 'Math',
      subject: 'Arithmetic',
      year: '2024',
      difficulty: 'easy',
      marks: 1,
      negativeMarks: 0,
      flagged: false,
    };
    const input = toExplanationInput(q);
    expect(input).toEqual({
      text: '2+2?',
      options: ['3', '4', '5'],
      correctAnswer: 1,
      topic: 'Math',
      subject: 'Arithmetic',
    });
  });
});
