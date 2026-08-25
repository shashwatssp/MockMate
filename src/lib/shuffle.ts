/**
 * Deterministic per-student question shuffle.
 *
 * Why a seeded RNG rather than Math.random(): each student must see questions
 * in a *stable* order across sessions so they can resume an in-progress attempt
 * without the navigation palette desyncing from their saved `currentQuestionIndex`.
 * Seeding with `testId + studentName` guarantees:
 *  - Student A and Student B get *different* orders (anti-cheating).
 *  - The same student always gets the same order on resume (consistency).
 */

/** A tiny 32-bit-hash-based PRNG (mulberry32) seeded from a string. */
export const createSeededRNG = (seed: string): (() => number) => {
  let h1 = 2166136261 >>> 0;
  let h2 = 2246822519 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    const char = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (char + 1), 16777619) >>> 0;
  }
  let state = (h1 ^ h2) >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 97) ^ (t | 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Fisher–Yates shuffle driven by a seeded RNG.
 * Does NOT mutate the input array — returns a shallow copy.
 */
export const seededShuffle = <T,>(array: T[], seed: string): T[] => {
  const rng = createSeededRNG(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    if (i !== j) {
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
  }
  return result;
};

/**
 * Build the deterministic seed for a given test + student pair.
 * Uses a delimiter so that testId "123" + student "4-567" can't collide with
 * testId "1234" + student "567".
 */
export const makeShuffleSeed = (testId: string, studentName: string): string =>
  `${testId}::${studentName.trim()}`;

/**
 * Returns a *new* `Test` whose `questions` array is deterministically shuffled
 * when `settings.randomizeQuestions` is truthy. The original test is untouched.
 */
// Generic over the caller's test shape so a fully-typed `Test` keeps its
// precise `Question[]` element type after the shuffle.
export const shuffleTestQuestions = <
  T extends { id: string; questions: unknown[]; settings?: { randomizeQuestions?: boolean } },
>(
  test: T,
  studentName: string,
): T => {
  if (!test.settings?.randomizeQuestions) return test;
  const seed = makeShuffleSeed(test.id, studentName);
  return {
    ...test,
    questions: seededShuffle(test.questions, seed),
  };
};
