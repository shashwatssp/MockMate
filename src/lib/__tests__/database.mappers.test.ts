/**
 * Pure-logic unit tests for the question row <-> Question mappers.
 *
 * Node environment — no jsdom needed (we never touch the DOM here). The
 * `database.ts` module is loaded only so the mappers can be exercised in
 * isolation; the supabase client (constructed from env vars at import time) and
 * the heavy auth helpers are stubbed away.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import type { Question } from '../../types/exam.types';
import { getDifficulty, questionToRow, rowToQuestion } from '../database';

vi.mock('../supabase');
vi.mock('../localAuth');
vi.mock('../questionImport');

const base = (over: Partial<Omit<Question, 'id'>> = {}): Omit<Question, 'id'> => ({
  text: 'a question stem that is neither too short nor too long at all',
  options: ['a', 'b', 'c', 'd'],
  correctAnswer: 0,
  topic: 't',
  subject: 's',
  year: '2024',
  ...over,
});

describe('rowToQuestion', () => {
  it('maps a snake_case DB row to Question, including explanation', () => {
    expect(
      rowToQuestion({
        id: 'abc',
        text: '2+2?',
        options: ['3', '4'],
        correct_answer: 1,
        difficulty: 'easy',
        image_url: 'https://img/x.png',
        explanation: 'because',
        created_at: '2024-01-01',
      }),
    ).toEqual({
      id: 'abc',
      text: '2+2?',
      options: ['3', '4'],
      correctAnswer: 1,
      difficulty: 'easy',
      imageUrl: 'https://img/x.png',
      explanation: 'because',
      topic: 'General',
      subject: 'General',
      year: '',
      flagged: undefined,
      flagReason: undefined,
      marks: undefined,
      negativeMarks: undefined,
    });
  });

  it('coerces optional columns to undefined and required columns to safe defaults', () => {
    const q = rowToQuestion({
      text: 'hi',
      options: [],
      correct_answer: 0,
      explanation: null,
      image_url: null,
    });
    expect(q.explanation).toBeUndefined();
    expect(q.imageUrl).toBeUndefined();
    // Required fields fall back to safe defaults ('' for id), per the
    // documented mapper contract — never undefined.
    expect(q.id).toBe('');
    expect(q.text).toBe('hi');
  });

  it('defends against a non-number correct_answer', () => {
    expect(rowToQuestion({ text: 'x', options: [], correct_answer: '2' }).correctAnswer).toBe(2);
    expect(rowToQuestion({ text: 'x', options: [], correct_answer: undefined }).correctAnswer).toBe(0);
  });
});

describe('questionToRow', () => {
  it('includes explanation only when present', () => {
    const withExp = questionToRow(base({ text: 'q', options: ['a', 'b'], correctAnswer: 0, explanation: 'why' }));
    expect(withExp).toHaveProperty('explanation', 'why');
    const without = questionToRow(base({ text: 'q', options: ['a', 'b'], correctAnswer: 0 }));
    expect(without).not.toHaveProperty('explanation');
  });

  it('includes image_url only when imageUrl is present', () => {
    const withImg = questionToRow(base({ text: 'q', options: ['a'], correctAnswer: 0, imageUrl: 'u' }));
    expect(withImg).toHaveProperty('image_url', 'u');
    const without = questionToRow(base({ text: 'q', options: ['a'], correctAnswer: 0 }));
    expect(without).not.toHaveProperty('image_url');
  });

  it('round-trips explanation through rowToQuestion', () => {
    const round = rowToQuestion(
      questionToRow(base({ text: 'q', options: ['a', 'b'], correctAnswer: 1, explanation: 'hello' })),
    );
    expect(round.explanation).toBe('hello');
    expect(round.correctAnswer).toBe(1);
  });

  it('defaults difficulty via getDifficulty when none provided', () => {
    const row = questionToRow(base({ text: 'short stem', options: ['a', 'b', 'c'], correctAnswer: 0 }));
    expect(row.difficulty).toBe('easy');
  });
});

describe('getDifficulty', () => {
  it('classifies easy/medium/hard from text length and option count', () => {
    expect(getDifficulty(base({ text: 'short q', options: ['a', 'b', 'c'] }))).toBe('easy');
    expect(
      getDifficulty(base({ text: 'x'.repeat(150), options: ['a', 'b', 'c', 'd', 'e'] })),
    ).toBe('hard');
    expect(
      getDifficulty(base({ text: 'a medium length question stem here', options: ['a', 'b', 'c', 'd'] })),
    ).toBe('medium');
  });
});
