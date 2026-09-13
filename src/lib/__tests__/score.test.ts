import { describe, it, expect } from 'vitest';
import {
  scoreQuestions,
  resolvePassingScore,
  computeGrade,
  computeVerdict,
  DEFAULT_PASSING_SCORE,
} from '../score';
import type { Question, StudentAnswer } from '../../types/exam.types';

const mkQuestion = (overrides: Partial<Question> & { id: string }): Question => ({
  text: 'q',
  options: ['a', 'b', 'c', 'd'],
  correctAnswer: 1,
  topic: 'T',
  subject: 'S',
  year: '2026',
  ...overrides,
});

const answer = (questionId: string, selectedOption: number): StudentAnswer => ({
  questionId,
  selectedOption,
});

describe('scoreQuestions', () => {
  it('scores a fully correct attempt with default marks', () => {
    const qs = [mkQuestion({ id: 'q1' }), mkQuestion({ id: 'q2' })];
    const result = scoreQuestions(qs, [answer('q1', 1), answer('q2', 1)]);
    expect(result.score).toBe(2);
    expect(result.totalMarks).toBe(2);
    expect(result.percentage).toBe(100);
    expect(result.correctAnswers).toBe(2);
    expect(result.incorrectAnswers).toBe(0);
    expect(result.unansweredQuestions).toBe(0);
  });

  it('applies negative marks on wrong answers', () => {
    const qs = [mkQuestion({ id: 'q1', marks: 2, negativeMarks: 1 })];
    const result = scoreQuestions(qs, [answer('q1', 0)]);
    expect(result.score).toBe(-1);
    expect(result.incorrectAnswers).toBe(1);
  });

  it('counts unanswered (selectedOption < 0) without penalty', () => {
    const qs = [mkQuestion({ id: 'q1' })];
    const result = scoreQuestions(qs, [answer('q1', -1)]);
    expect(result.unansweredQuestions).toBe(1);
    expect(result.score).toBe(0);
  });

  it('returns 0% when totalMarks is zero', () => {
    const result = scoreQuestions([], []);
    expect(result.percentage).toBe(0);
  });
});

describe('resolvePassingScore', () => {
  it('defaults to 70 when unset', () => {
    expect(resolvePassingScore(undefined)).toBe(DEFAULT_PASSING_SCORE);
    expect(resolvePassingScore(null)).toBe(DEFAULT_PASSING_SCORE);
  });

  it('honors an explicit pass mark', () => {
    expect(resolvePassingScore(50)).toBe(50);
    expect(resolvePassingScore(0)).toBe(0); // explicit pass-everything
  });

  it('falls back to default for non-finite values', () => {
    expect(resolvePassingScore(Number.NaN)).toBe(DEFAULT_PASSING_SCORE);
  });
});

describe('computeGrade', () => {
  it.each([
    [90, 'A+'],
    [89.9, 'A'],
    [80, 'A'],
    [70, 'B'],
    [60, 'C'],
    [50, 'D'],
    [49, 'F'],
  ])('maps %p to %p', (pct, grade) => {
    expect(computeGrade(pct)).toBe(grade);
  });
});

describe('computeVerdict', () => {
  it('passes at exactly the pass mark', () => {
    expect(computeVerdict(70, 70).passed).toBe(true);
  });

  it('fails one point below the pass mark', () => {
    expect(computeVerdict(69, 70).passed).toBe(false);
  });

  it('uses the default pass mark when none is set', () => {
    expect(computeVerdict(69).passed).toBe(false);
    expect(computeVerdict(70).passed).toBe(true);
  });

  it('always returns a letter grade', () => {
    expect(computeVerdict(55, 70).grade).toBe('D');
  });
});
