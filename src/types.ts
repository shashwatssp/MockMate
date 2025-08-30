export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  topic: string;
  subject: string;
  difficulty: string;
  year: string;
}

export interface Test {
  id: string;
  testKey: string; 
  name: string;
  description: string;
  questions: Question[];
  createdAt: Date;
  startDate: Date; 
  duration: number;
  timeLimit: number;
  settings: {
    randomizeQuestions: boolean;
    allowReview: boolean;
    showCorrectAnswers: boolean;
  };
}


export interface StudentAnswer {
  questionId: string;
  selectedOption: number;
}

export interface TestResult {
  testId: string;
  studentName: string;
  answers: StudentAnswer[];
  score: number;
  totalQuestions: number;
  completedAt: Date;
}

export interface User {
  id: string;
  role: 'teacher' | 'student';
}