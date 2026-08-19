// Canonical domain model for MockMate (single source of truth).
// This file is the only place `Test`, `Question`, `StudentAnswer`,
// `StudentAnswer`, `ExamState`, `ExamSession` and `TestResult` are defined.
// All other modules must import these types from here.

/** Visibility / behaviour toggles persisted inside the JSON `settings` column. */
export interface TestSettings {
  randomizeQuestions?: boolean;
  allowReview?: boolean;
  showCorrectAnswers?: boolean;
  isProctored?: boolean;
  maxAttempts?: number;
  passingScore?: number;
  endDate?: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  text: string;
  options: string[];
  /** Index of the correct option. */
  correctAnswer: number;
  topic: string;
  subject: string;
  year: string;
  difficulty?: Difficulty;
  /** Marks carried by the question (defaults to 1). */
  marks?: number;
  /** Negative marking per wrong answer (0 = disabled). */
  negativeMarks?: number;
  /** Optional image URL for image-backed questions (stored on the public `questions` bucket). */
  imageUrl?: string;
}

export interface StudentAnswer {
  questionId: string;
  selectedOption: number;
  timeSpent?: number;
  isBookmarked?: boolean;
  isVisited?: boolean;
  status?: 'not-visited' | 'answered' | 'unanswered' | 'flagged';
}

/** Mutable data shape held by `useExamState` (mirrors the `ExamSession.state` payload). */
export interface ExamState {
  currentQuestionIndex: number;
  answers: StudentAnswer[];
  timeRemaining: number;
  isSubmitted: boolean;
  bookmarkedQuestions: Set<string>;
  visitedQuestions: Set<string>;
  reviewMode: boolean;
}

export interface ExamSettings {
  showTimer: boolean;
  showProgress: boolean;
  allowNavigation: boolean;
  confirmSubmit: boolean;
}

export interface ExamSession {
  test: Test;
  studentName: string;
  startTime: Date;
  state: ExamState;
  settings: ExamSettings;
}

export type ExamPhase = 'loading' | 'entry' | 'instructions' | 'active' | 'paused' | 'submitted' | 'results';

export interface TestResult {
  id?: string;
  /** Practice attempts are shown to the student but never persisted for teacher statistics. */
  isPractice?: boolean;
  testId: string;
  studentName: string;
  studentEmail?: string;
  studentId?: string;
  batchId?: string;
  answers: StudentAnswer[];
  score: number;
  totalMarks?: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unansweredQuestions: number;
  percentage: number;
  timeTaken: number;
  completedAt: Date;
  topicWiseScore?: { [topic: string]: { correct: number; total: number } };
  grade?: string;
  passed?: boolean;
}

/** Subset persisted by `saveTestResult` (no DB-generated fields). */
export type TestResultInput = Pick<
  TestResult,
  'testId' | 'studentName' | 'answers' | 'score' | 'totalQuestions'
  | 'studentId' | 'batchId' | 'studentEmail'
> & {
  timeTaken?: number;
};

export interface Test {
  id: string;
  testKey: string;
  name: string;
  title?: string;
  description?: string;
  questions: Question[];
  createdAt: Date;
  startDate?: Date;
  endDate?: Date;
  /** Explicit wall-clock end time. When set, students can no longer access the test once it has passed. */
  endTime?: Date;
  duration: number;
  timeLimit: number;
  settings: TestSettings;
  allowReview?: boolean;
  maxAttempts?: number;
  passingScore?: number;
  isProctored?: boolean;
  instructions?: string;
}
