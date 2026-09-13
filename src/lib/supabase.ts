import { createClient } from '@supabase/supabase-js'
import { toErrorMessage, isMissingRpcError } from './errors';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!

// EXPORT the supabase client - this was missing!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Call a PostgREST RPC (app_signin, app_signup, app_session, app_signout, ...).
// Supabase edge functions are invoked via `supabase.rpc(name, { p_* args })`;
// any error is thrown so callers can handle it uniformly.
//
// IMPORTANT: the thrown value is ALWAYS a real `Error`. Supabase returns a
// plain PostgrestError object which some catch sites stringified — producing
// the infamous "[object Object]" in the UI. Wrap here once, so every caller
// gets a `.message` it can show a human.
export class RpcError extends Error {
  code?: string;
  constructor(rpcName: string, original: unknown) {
    super(toErrorMessage(original, `RPC ${rpcName} failed`));
    this.name = 'RpcError';
    const code = (original as { code?: unknown } | null)?.code;
    if (typeof code === 'string') this.code = code;
    if (isMissingRpcError(original)) {
      this.message =
        `Backend function ${rpcName} is not deployed on the server. ` +
        'Run the latest files from supabase/migrations/ in the Supabase SQL editor, then retry.';
    }
  }
}

export const callRpc = async <T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new RpcError(name, error)
  return data as T
}

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
          end_date: string | null
          duration: number
          time_limit: number
          created_by: string | null
          instructions: string | null
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
          end_date?: string | null
          duration: number
          time_limit: number
          created_by?: string | null
          instructions?: string | null
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
          end_date?: string | null
          duration?: number
          time_limit?: number
          created_by?: string | null
          instructions?: string | null
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
          subject: string | null
          year: string | null
          image_url: string | null
          ingested_by: string | null
        }
        Insert: {
          id?: string
          text: string
          options: string[]
          correct_answer: number
          topic: string
          difficulty?: 'easy' | 'medium' | 'hard'
          created_at?: string
          subject?: string | null
          year?: string | null
          image_url?: string | null
          ingested_by?: string | null
        }
        Update: {
          id?: string
          text?: string
          options?: string[]
          correct_answer?: number
          topic?: string
          difficulty?: 'easy' | 'medium' | 'hard'
          created_at?: string
          subject?: string | null
          year?: string | null
          image_url?: string | null
          ingested_by?: string | null
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
          time_taken: number | null
          student_id: string | null
          batch_id: string | null
          student_email: string | null
        }
        Insert: {
          id?: string
          test_id: string
          student_name: string
          answers: StudentAnswer[]
          score: number
          total_questions: number
          completed_at?: string
          time_taken?: number | null
          student_id?: string | null
          batch_id?: string | null
          student_email?: string | null
        }
        Update: {
          id?: string
          test_id?: string
          student_name?: string
          answers?: StudentAnswer[]
          score?: number
          total_questions?: number
          completed_at?: string
          time_taken?: number | null
          student_id?: string | null
          batch_id?: string | null
          student_email?: string | null
        }
      }
      batches: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          teacher_id: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          teacher_id: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          teacher_id?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      students: {
        Row: {
          id: string
          email: string
          name: string | null
          batch_id: string | null
          is_approved: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          batch_id?: string | null
          is_approved?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          batch_id?: string | null
          is_approved?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      batch_enrollments: {
        Row: {
          id: string
          email: string
          batch_id: string
          student_id: string | null
          status: 'pending' | 'approved' | 'rejected'
          requested_at: string
          reviewed_by: string | null
          reviewed_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          email: string
          batch_id: string
          student_id?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          requested_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          email?: string
          batch_id?: string
          student_id?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          requested_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          notes?: string | null
        }
      }
      test_batches: {
        Row: {
          test_id: string
          batch_id: string
          created_at: string
        }
        Insert: {
          test_id: string
          batch_id: string
          created_at?: string
        }
        Update: {
          test_id?: string
          batch_id?: string
          created_at?: string
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
