import type { Difficulty, Question } from '../types/exam.types';

export interface QuestionImportIssue {
  row: number;
  message: string;
}

export interface QuestionImportResult {
  questions: Omit<Question, 'id'>[];
  issues: QuestionImportIssue[];
  duplicateCount: number;
}

export const normalizeQuestionText = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

export const normalizeQuestionKey = (value: string): string =>
  value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();

const normalizeDifficulty = (value: unknown): Difficulty => {
  const difficulty = normalizeQuestionText(value).toLocaleLowerCase();
  if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
    return difficulty;
  }
  return 'medium';
};

const normalizeCorrectAnswer = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= 0 && value <= 3) return value;
    if (value === 4) return 3;
    return null;
  }

  const answer = normalizeQuestionText(value).toLocaleUpperCase();
  if (/^[A-D]$/.test(answer)) return answer.charCodeAt(0) - 65;
  if (/^[0-4]$/.test(answer)) {
    const numericAnswer = Number(answer);
    if (numericAnswer >= 0 && numericAnswer <= 3) return numericAnswer;
    if (numericAnswer === 4) return 3;
  }
  return null;
};

const getAnswerValue = (source: Record<string, unknown>): unknown =>
  source.correctAnswer ??
  source.correct_answer ??
  source.correctAnswerIndex ??
  source.correct_answer_index ??
  source.correctOption ??
  source.correct_option ??
  source.answer;

const getOptionValues = (source: Record<string, unknown>): unknown[] | null => {
  const options = source.options ?? source.choices ?? source.answers;
  return Array.isArray(options) ? options : null;
};

const getRootQuestions = (payload: unknown): unknown[] | null => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray((payload as { questions?: unknown }).questions)) {
    return (payload as { questions: unknown[] }).questions;
  }
  return null;
};

/**
 * Validate and normalize an uploaded question JSON document.
 *
 * Supported root shapes:
 * - `Question[]`
 * - `{ "questions": Question[] }`
 *
 * `correctAnswer` and `correctAnswerIndex` use zero-based indexes (0–3).
 * Letter answers (A–D) and `4` are also accepted as one-based formats.
 */
export const validateQuestionImport = (
  payload: unknown,
  existingQuestions: Question[] = [],
): QuestionImportResult => {
  const rows = getRootQuestions(payload);
  if (!rows) {
    return {
      questions: [],
      issues: [{ row: 0, message: 'The JSON root must be an array or an object with a questions array.' }],
      duplicateCount: 0
    };
  }

  const existingKeys = new Set(existingQuestions.map(question => normalizeQuestionKey(question.text)));
  const importedKeys = new Set<string>();
  const questions: Omit<Question, 'id'>[] = [];
  const issues: QuestionImportIssue[] = [];
  let duplicateCount = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push({ row: rowNumber, message: 'Question must be a JSON object.' });
      return;
    }

    const source = row as Record<string, unknown>;
    const text = normalizeQuestionText(source.text ?? source.question ?? source.questionText);
    const options = getOptionValues(source)?.map(normalizeQuestionText) ?? null;
    const correctAnswer = normalizeCorrectAnswer(getAnswerValue(source));

    if (!text) {
      issues.push({ row: rowNumber, message: 'Question text is required.' });
      return;
    }
    if (!options || options.length !== 4 || options.some(option => !option)) {
      issues.push({ row: rowNumber, message: 'Exactly four non-empty options are required.' });
      return;
    }
    if (correctAnswer === null) {
      issues.push({
        row: rowNumber,
        message: 'A valid correct answer is required (0–3, 4, or A–D).'
      });
      return;
    }

    const key = normalizeQuestionKey(text);
    if (existingKeys.has(key) || importedKeys.has(key)) {
      duplicateCount += 1;
      return;
    }

    importedKeys.add(key);
    const marks = Number(source.marks);
    const negativeMarks = Number(source.negativeMarks ?? source.negative_marks);
    questions.push({
      text,
      options,
      correctAnswer,
      subject: normalizeQuestionText(source.subject) || 'General',
      topic: normalizeQuestionText(source.topic) || 'Unspecified',
      year: normalizeQuestionText(source.year) || 'Unspecified',
      difficulty: normalizeDifficulty(source.difficulty),
      ...(Number.isFinite(marks) && marks >= 0 ? { marks } : {}),
      ...(Number.isFinite(negativeMarks) && negativeMarks >= 0 ? { negativeMarks } : {})
    });
  });

  return { questions, issues, duplicateCount };
};
