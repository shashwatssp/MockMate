/**
 * Unit tests for the deterministic per-student shuffle helpers.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  createSeededRNG,
  makeShuffleSeed,
  seededShuffle,
  shuffleTestQuestions,
} from '../shuffle';

const SAMPLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('createSeededRNG', () => {
  it('produces values in [0, 1)', () => {
    const rng = createSeededRNG('test');
    for (let i = 0; i < 100; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = createSeededRNG('hello');
    const b = createSeededRNG('hello');
    for (let i = 0; i < 50; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRNG('hello');
    const b = createSeededRNG('world');
    let differ = false;
    for (let i = 0; i < 50; i += 1) {
      if (a() !== b()) differ = true;
    }
    expect(differ).toBe(true);
  });
});

describe('seededShuffle', () => {
  it('returns a new array (does not mutate input)', () => {
    const input = [...SAMPLE];
    const result = seededShuffle(input, 'seed');
    expect(result).not.toBe(input);
    expect(input).toEqual(SAMPLE);
  });

  it('is deterministic for the same seed — same student, same order', () => {
    const first = seededShuffle(SAMPLE, 'test-1::Alice');
    const second = seededShuffle(SAMPLE, 'test-1::Alice');
    expect(first).toEqual(second);
  });

  it('produces different orders for different students — anti-cheating', () => {
    const alice = seededShuffle(SAMPLE, 'test-1::Alice');
    const bob = seededShuffle(SAMPLE, 'test-1::Bob');
    expect(alice).not.toEqual(bob);
  });

  it('preserves all elements (just reordered)', () => {
    const shuffled = seededShuffle(SAMPLE, 'anything');
    expect(shuffled.sort((a, b) => a - b)).toEqual(SAMPLE);
  });

  it('handles empty and single-element arrays', () => {
    expect(seededShuffle([], 'seed')).toEqual([]);
    expect(seededShuffle([42], 'seed')).toEqual([42]);
  });

  it('does not return the original order for a sufficiently large array', () => {
    const shuffled = seededShuffle(SAMPLE, 'test::student');
    expect(shuffled).not.toEqual(SAMPLE);
  });
});

describe('makeShuffleSeed', () => {
  it('includes the delimiter to avoid collisions', () => {
    expect(makeShuffleSeed('abc', 'de')).not.toBe(makeShuffleSeed('ab', 'cde'));
  });
});

describe('shuffleTestQuestions', () => {
  const baseTest = {
    id: 'test-1',
    questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }],
    settings: { randomizeQuestions: true },
  };

  it('returns the test unchanged when randomizeQuestions is falsy', () => {
    const noShuffle = {
      id: 'test-1',
      questions: [{ id: 'q1' }, { id: 'q2' }],
      settings: { randomizeQuestions: false },
    };
    expect(shuffleTestQuestions(noShuffle, 'Alice')).toBe(noShuffle);
  });

  it('shuffles questions deterministically per student', () => {
    const alice1 = shuffleTestQuestions(baseTest, 'Alice');
    const alice2 = shuffleTestQuestions(baseTest, 'Alice');
    const bob = shuffleTestQuestions(baseTest, 'Bob');

    expect(alice1.questions.map((q) => q.id)).toEqual(
      alice2.questions.map((q) => q.id),
    );
    expect(alice1.questions).not.toEqual(bob.questions);
  });

  it('does not mutate the original test', () => {
    const original = {
      id: 'test-1',
      questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
      settings: { randomizeQuestions: true },
    };
    const shuffled = shuffleTestQuestions(original, 'Alice');
    expect(original.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(shuffled).not.toBe(original);
  });
});
