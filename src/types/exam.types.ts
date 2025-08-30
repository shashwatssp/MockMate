export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  topic: string;
  difficulty?: 1 | 2 | 3;
  marks?: number;
  negativeMarks?: number;
  explanation?: string;
}

export interface Test {
  id: string;
  name: string;
  title?: string;
  description?: string;
  questions: Question[];
  timeLimit: number; // in minutes
  duration?: number; // alternative field
  startDate?: string;
  endDate?: string;
  instructions?: string[];
  allowReview?: boolean;
  showResults?: boolean;
  randomizeQuestions?: boolean;
  maxAttempts?: number;
}

export interface StudentAnswer {
  questionId: string;
  selectedOption: number;
  timeSpent?: number;
  isBookmarked?: boolean;
  isReviewed?: boolean;
}

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

export interface TestResult {
  testId: string;
  studentName: string;
  answers: StudentAnswer[];
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unansweredQuestions: number;
  percentage: number;
  timeTaken: number;
  completedAt: Date;
  topicWiseScore?: { [topic: string]: { correct: number; total: number } };
}

export interface ExamSession {
  test: Test;
  studentName: string;
  startTime: Date;
  state: ExamState;
  settings: ExamSettings;
}

export interface NavigationState {
  currentSection: 'entry' | 'instructions' | 'exam' | 'review' | 'results';
  canNavigate: boolean;
  showWarnings: boolean;
}

export interface TimerState {
  timeRemaining: number;
  isRunning: boolean;
  warnings: {
    fifteenMinutes: boolean;
    fiveMinutes: boolean;
    oneMinute: boolean;
  };
}

export interface QuestionStatus {
  answered: boolean;
  bookmarked: boolean;
  visited: boolean;
  current: boolean;
  reviewPending?: boolean;
}

export type ExamPhase = 'loading' | 'entry' | 'instructions' | 'active' | 'paused' | 'submitted' | 'results';
export type QuestionType = 'single-choice' | 'multiple-choice' | 'numerical' | 'comprehension';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface ExamConfig {
  enableBookmarks: boolean;
  enableReview: boolean;
  showQuestionPalette: boolean;
  autoSubmit: boolean;
  warningTimeouts: number[]; // in seconds
  maxIdleTime?: number; // in minutes
}

export interface Analytics {
  questionWiseTime: { [questionId: string]: number };
  topicWisePerformance: { [topic: string]: { correct: number; total: number; avgTime: number } };
  difficultyWisePerformance: { [difficulty: string]: { correct: number; total: number } };
  timeDistribution: number[];
  totalActiveTime: number;
}

export interface ExamError {
  code: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

// Utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;