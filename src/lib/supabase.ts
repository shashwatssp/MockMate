import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!

// EXPORT the supabase client - this was missing!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for better TypeScript support
export type Database = {
  public: {
    Tables: {
      tests: {
        Row: {
          id: string
          test_key: string
          name: string
          description: string | null
          questions: Question[]
          settings: TestSettings
          created_at: string
          start_date: string | null
          duration: number
          time_limit: number
        }
        Insert: {
          id?: string
          test_key: string
          name: string
          description?: string | null
          questions: Question[]
          settings: TestSettings
          created_at?: string
          start_date?: string | null
          duration: number
          time_limit: number
        }
        Update: {
          id?: string
          test_key?: string
          name?: string
          description?: string | null
          questions?: Question[]
          settings?: TestSettings
          created_at?: string
          start_date?: string | null
          duration?: number
          time_limit?: number
        }
      }
      questions: {
        Row: {
          id: string
          text: string
          options: string[]
          correct_answer: number
          topic: string
          difficulty: 'easy' | 'medium' | 'hard'
          created_at: string
        }
        Insert: {
          id?: string
          text: string
          options: string[]
          correct_answer: number
          topic: string
          difficulty?: 'easy' | 'medium' | 'hard'
          created_at?: string
        }
        Update: {
          id?: string
          text?: string
          options?: string[]
          correct_answer?: number
          topic?: string
          difficulty?: 'easy' | 'medium' | 'hard'
          created_at?: string
        }
      }
      test_results: {
        Row: {
          id: string
          test_id: string
          student_name: string
          answers: StudentAnswer[]
          score: number
          total_questions: number
          completed_at: string
        }
        Insert: {
          id?: string
          test_id: string
          student_name: string
          answers: StudentAnswer[]
          score: number
          total_questions: number
          completed_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          student_name?: string
          answers?: StudentAnswer[]
          score?: number
          total_questions?: number
          completed_at?: string
        }
      }
    }
  }
}

// Your existing interfaces
export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  topic: string;
}

export interface TestSettings {
  randomizeQuestions: boolean;
  allowReview: boolean;
  showCorrectAnswers: boolean;
}

export interface StudentAnswer {
  questionId: string;
  selectedOption: number;
}
