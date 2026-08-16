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
