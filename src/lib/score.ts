import type { Question, StudentAnswer } from '../types/exam.types';

/**
 * Marks scored on a single test attempt.
 */
export interface ScoreResult {
  score: number;
  totalMarks: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unansweredQuestions: number;
  percentage: number;
}

/** Default pass mark (%). Single source of truth — every surface (exam entry,
 *  results, analytics, saved-row mapping) must resolve the pass mark through
 *  `resolvePassingScore` so a 70-vs-50 default can never diverge again. */
export const DEFAULT_PASSING_SCORE = 70;

/** Resolve a test's pass mark. `null`/`undefined`/non-finite → default (70).
 *  An explicit 0 is honored (a pass-everything test is a valid config). */
export const resolvePassingScore = (passingScore?: number | null): number =>
  typeof passingScore === 'number' && Number.isFinite(passingScore)
    ? passingScore
    : DEFAULT_PASSING_SCORE;

/** Letter grade from a percentage (same bands the results screen has always
 *  shown): A+ ≥ 90, A ≥ 80, B ≥ 70, C ≥ 60, D ≥ 50, F < 50. */
export const computeGrade = (percentage: number): string => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
};

/** Pass/fail verdict for an attempt against the test's pass mark.
 *  Populated on every `TestResult` (live + persisted paths) so students are
 *  always told whether they passed. */
export const computeVerdict = (
  percentage: number,
  passingScore?: number | null,
): { passed: boolean; grade: string } => ({
  passed: percentage >= resolvePassingScore(passingScore),
  grade: computeGrade(percentage),
});

/**
 * Marks-aware scorer shared by the live exam result path
 * (`ExamWrapper.calculateResults`) and the persisted-results path
 * (`database.getTestResults`).
 *
 * Per-question `marks` / `negativeMarks` live on the test instance
 * (the `tests.questions` JSONB), never on the shared question bank. When a
 * question has no explicit marks they default to `1` / `0`, which makes a
 * default-marks test score identically to the previous count-based logic — so
 * tests created before per-question marks existed are unaffected.
 */
export const scoreQuestions = (
  questions: Question[],
  answers: StudentAnswer[]
): ScoreResult => {
  const answerByQuestion = new Map<string, StudentAnswer>();
  answers.forEach(answer => {
    if (!answerByQuestion.has(answer.questionId)) {
      answerByQuestion.set(answer.questionId, answer);
    }
  });

  let score = 0;
  let totalMarks = 0;
  let correctAnswers = 0;
  let incorrectAnswers = 0;
  let unansweredQuestions = 0;

  questions.forEach(question => {
    const marks = question.marks ?? 1;
    const negativeMarks = question.negativeMarks ?? 0;
    totalMarks += marks;

    const answer = answerByQuestion.get(question.id);
    if (answer === undefined || answer.selectedOption < 0) {
      unansweredQuestions += 1;
    } else if (answer.selectedOption === question.correctAnswer) {
      correctAnswers += 1;
      score += marks;
    } else {
      incorrectAnswers += 1;
      score -= negativeMarks;
    }
  });

  const percentage = totalMarks > 0
    ? Math.round((score / totalMarks) * 100)
    : 0;

  return {
    score,
    totalMarks,
    correctAnswers,
    incorrectAnswers,
    unansweredQuestions,
    percentage
  };
};
