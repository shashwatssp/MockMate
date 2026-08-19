import { supabase, callRpc } from './supabase'
import type { Question, Test, TestResult, TestSettings, TestResultInput, StudentAnswer } from '../types/exam.types'
import { normalizeQuestionKey, normalizeQuestionText } from './questionImport'
import { scoreQuestions } from './score'
import {
  getBatchByCode as getLocalBatchByCode,
  getBatchById as getLocalBatchById,
  getBatchesForTeacher as getLocalBatchesForTeacher,
  getBatchesForTest as getLocalBatchesForTest,
  getLocalResultsForBatchTest,
  getLocalResultsForStudent,
  getPendingEnrollments as getLocalPendingEnrollments,
  getStudentsInBatch as getLocalStudentsInBatch,
  getTeacherSession,
  getTeacherToken,
  clearStudentSession,
  getStudentToken,
  getStudentSession,
  setStudentSession,
  getTestIdsForBatch as getLocalTestIdsForBatch,
  hasLocalStudentTakenTest,
  isTestBatchScoped as isLocalTestBatchScoped,
  localBatchLeaderboard,
  removeStudentFromBatch as removeLocalStudentFromBatch,
  saveLocalTestResult,
  generateBatchCode,
  ensureLocalDirectory,
} from './localAuth'
import type { BatchLeaderboardEntry, BatchRow, EnrollmentRow, StudentIdentity, StudentRow } from './localAuth'
export type { BatchLeaderboardEntry, BatchRow, EnrollmentRow, StudentIdentity, StudentRow } from './localAuth'
export { generateBatchCode, ensureLocalDirectory }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supabase `batches.teacher_id` is a uuid column, but local auth teacher ids
 * look like `teacher-<uuid>` (or `teacher-demo-1234`). Convert any local id to
 * a deterministic, valid UUID so batch data can live purely in Supabase.
 */
export const toTeacherUuid = (teacherId: string): string => {
  if (UUID_PATTERN.test(teacherId)) return teacherId.toLowerCase();
  const stripped = teacherId.replace(/^(teacher|student)-/i, '');
  if (UUID_PATTERN.test(stripped)) return stripped.toLowerCase();
  // Deterministic 128-bit hash → UUID v4-shaped value for any other string.
  let h1 = 2166136261;
  let h2 = 2246822519;
  for (let i = 0; i < teacherId.length; i += 1) {
    h1 ^= teacherId.charCodeAt(i);
    h1 = Math.imul(h1, 16777619);
    h2 ^= teacherId.charCodeAt(i) + 1;
    h2 = Math.imul(h2, 16777619);
  }
  let state = (h1 >>> 0) ^ (h2 >>> 0);
  const bytes: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    state = (Math.imul(state ^ (state >>> 15), 1 | state) + (state ^ 0x61c88647)) >>> 0;
    bytes.push(state & 0xff);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// Questions
export const insertQuestions = async (questions: Omit<Question, 'id'>[]) => {
  if (questions.length === 0) return []

  // De-duplicate by normalized text — don't re-insert questions that already
  // exist in the bank.
  const incomingByKey = new Map<string, Omit<Question, 'id'>>()
  questions.forEach(question => {
    const key = normalizeQuestionKey(normalizeQuestionText(question.text))
    if (key && !incomingByKey.has(key)) {
      incomingByKey.set(key, question)
    }
  })

  const { data: existingQuestions, error: existingError } = await supabase
    .from('questions')
    .select('text')

  if (existingError) {
    console.error('Error checking existing questions:', existingError)
    throw existingError
  }

  const existingKeys = new Set(
    (existingQuestions || [])
      .map(question => normalizeQuestionKey(normalizeQuestionText(question.text)))
      .filter(Boolean)
  )
  const newQuestions = [...incomingByKey.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .map(([, question]) => question)

  if (newQuestions.length === 0) return []

  const questionsWithDifficulty = newQuestions.map(q => ({
    text: q.text,
    options: q.options,
    correct_answer: q.correctAnswer,
    topic: q.topic,
    subject: q.subject,        
    year: q.year,              
    difficulty: q.difficulty ?? getDifficulty(q) as 'easy' | 'medium' | 'hard',
    ...(q.imageUrl ? { image_url: q.imageUrl } : {})
  }))

  // Preferred path: route through the SECURITY DEFINER RPC app_insert_questions.
  // It resolves the teacher from the session token and sets `ingested_by`
  // server-side, bypassing the anonymous RLS policy that rejects non-null
  // `ingested_by` on raw REST inserts (HTTP 42501).
  const token = getTeacherToken();
  if (token) {
    try {
      await callRpc('app_insert_questions', {
        p_token: token,
        p_questions: questionsWithDifficulty,
      });
      return newQuestions;
    } catch (e) {
      console.warn('app_insert_questions RPC failed, falling back to shared insert:', e);
    }
  }

  // Fallback (and default for anonymous imports): insert with `ingested_by`
  // set to NULL — the "shared with every teacher" path that the existing RLS
  // policy on `questions` permits for the anon role (proven by live test:
  // HTTP 201).
  const { data, error } = await supabase
    .from('questions')
    .insert(questionsWithDifficulty.map(q => ({ ...q, ingested_by: null })))
    .select()

  if (error) {
    console.error('Error inserting questions:', error)
    throw error
  }
  return data
}

/** Upload a question image to the public `questions` storage bucket and return its public URL. */
export const uploadQuestionImage = async (file: File): Promise<string> => {
  if (!file) throw new Error('No file provided');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `questions/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('questions').upload(path, file, {
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('questions').getPublicUrl(path);
  return data?.publicUrl ?? '';
};

export const getQuestions = async () => {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching questions:', error)
    throw error
  }

  // Transform to match your Question interface
  return data.map(q => ({
    id: q.id,
    text: q.text,
    options: q.options,
    correctAnswer: q.correct_answer,
    topic: q.topic,
    subject: q.subject,        
    year: q.year,              
    difficulty: q.difficulty,
    imageUrl: q.image_url
  })) as Question[]
}

/** Return the question-bank size without downloading every question row. */
export const getQuestionCount = async () => {
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })

  if (error) {
    console.error('Error counting questions:', error)
    throw error
  }

  return count ?? 0
}

export const getQuestionsByFilters = async (filters: {
  subject?: string;
  topic?: string;
  year?: string;
  difficulty?: string;
}) => {
  let query = supabase.from('questions').select('*')

  if (filters.subject) {
    query = query.eq('subject', filters.subject)
  }
  if (filters.topic) {
    query = query.eq('topic', filters.topic)
  }
  if (filters.year) {
    query = query.eq('year', filters.year)
  }
  if (filters.difficulty) {
    query = query.eq('difficulty', filters.difficulty)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error

  return data.map(q => ({
    id: q.id,
    text: q.text,
    options: q.options,
    correctAnswer: q.correct_answer,
    topic: q.topic,
    subject: q.subject,       
    year: q.year,             
    difficulty: q.difficulty,
    imageUrl: q.image_url
  })) as Question[]
}

// Keep your existing getQuestionsByTopic for backward compatibility
export const getQuestionsByTopic = async (topic: string) => {
  return getQuestionsByFilters({ topic })
}

/** Paginated, searchable page through the question bank.
 *
 * The Create Test screen uses this instead of `getQuestions()` so we never pull
 * the entire bank into memory — teachers page through (or search) 15 questions
 * at a time, which stays snappy even with hundreds of stored questions. */
export interface PaginatedQuestionsResult {
  questions: Question[];
  count: number;
  hasMore: boolean;
}

export const getPaginatedQuestions = async ({
  limit = 15,
  offset = 0,
  search,
}: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<PaginatedQuestionsResult> => {
  const trimmed = (search || '').trim().replace(/,/g, ' ');
  let query = supabase
    .from('questions')
    .select('*', { count: 'exact', head: false })
    .order('created_at', { ascending: false });

  if (trimmed) {
    const pattern = `%${trimmed}%`;
    query = query.or(
      `text.ilike.${pattern},subject.ilike.${pattern},topic.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching paginated questions:', error);
    throw error;
  }

  const questions = (data ?? []).map(q => ({
    id: q.id,
    text: q.text,
    options: q.options,
    correctAnswer: q.correct_answer,
    topic: q.topic,
    subject: q.subject,
    year: q.year,
    imageUrl: q.image_url,
  })) as Question[];

  const total = count ?? 0;
  return {
    questions,
    count: total,
    hasMore: offset + questions.length < total,
  };
};

// Tests (unchanged)
const TEST_OWNERS_KEY = 'mockmate.local.test_owners';

const readTestOwners = (): Record<string, string> => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(TEST_OWNERS_KEY) : null;
    return raw ? JSON.parse(raw) as Record<string, string> : {};
  } catch {
    return {};
  }
};

const rememberTestOwner = (testId: string, teacherId: string) => {
  try {
    const owners = readTestOwners();
    owners[testId] = teacherId;
    window.localStorage.setItem(TEST_OWNERS_KEY, JSON.stringify(owners));
  } catch {
    /* ignore */
  }
};

export const getOwnedTestIds = (teacherId: string): string[] =>
  Object.entries(readTestOwners())
    .filter(([, ownerId]) => ownerId === teacherId)
    .map(([testId]) => testId);

export const createTest = async (testData: Omit<Test, 'id' | 'createdAt'>) => {
  const teacher = getTeacherSession();

  const { data, error } = await supabase
    .from('tests')
    .insert([{
      test_key: testData.testKey,
      created_by: teacher?.id ?? null,
      name: testData.name,
      description: testData.description,
      questions: testData.questions,
      settings: testData.settings,
      start_date: testData.startDate?.toISOString(),
      end_date: testData.endTime?.toISOString(),
      duration: testData.duration,
      // Keep the legacy column synchronized for older database consumers.
      time_limit: testData.duration
    }])
    .select()

  if (error) {
    // Local teacher ids are not auth.users UUIDs. Retry without created_by so
    // test creation still works for demo / local accounts.
    const { data: fallback, error: fallbackError } = await supabase
      .from('tests')
      .insert([{
        test_key: testData.testKey,
        created_by: null,
        name: testData.name,
        description: testData.description,
        questions: testData.questions,
        settings: testData.settings,
        start_date: testData.startDate?.toISOString(),
        end_date: testData.endTime?.toISOString(),
        duration: testData.duration,
        time_limit: testData.duration
      }])
      .select()
    if (fallbackError) {
      console.error('Error creating test:', fallbackError)
      throw fallbackError
    }
    if (teacher && fallback?.[0]?.id) rememberTestOwner(fallback[0].id, teacher.id)
    return fallback[0]
  }
  if (teacher && data?.[0]?.id) rememberTestOwner(data[0].id, teacher.id)
  return data[0]
}

export const getTestByKey = async (testKey: string) => {
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .eq('test_key', testKey)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Test not found
    }
    throw error
  }

  const settings = (data.settings ?? {}) as TestSettings;

  return {
    id: data.id,
    testKey: data.test_key,
    name: data.name,
    description: data.description || undefined,
    questions: data.questions,
    settings,
    endTime: data.end_date ? new Date(data.end_date) : undefined,
    createdAt: new Date(data.created_at),
    startDate: new Date(data.start_date),
    endDate: settings.endDate ? new Date(settings.endDate) : undefined,
    duration: data.duration ?? data.time_limit ?? 90,
    timeLimit: data.duration ?? data.time_limit ?? 90,
    allowReview: settings.allowReview ?? true,
    maxAttempts: settings.maxAttempts ?? 1,
    passingScore: settings.passingScore ?? 70,
    isProctored: settings.isProctored ?? false,
    instructions: data.instructions
  } as Test
}

export const getAllTests = async () => {
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return data.map(test => {
    const settings = (test.settings ?? {}) as TestSettings;

    return {
      id: test.id,
      testKey: test.test_key,
      name: test.name,
      description: test.description,
      questions: test.questions,
      settings,
      endTime: test.end_date ? new Date(test.end_date) : undefined,
      createdAt: new Date(test.created_at),
      startDate: new Date(test.start_date),
      endDate: settings.endDate ? new Date(settings.endDate) : undefined,
      duration: test.duration ?? test.time_limit ?? 90,
      timeLimit: test.duration ?? test.time_limit ?? 90,
      allowReview: settings.allowReview ?? true,
      maxAttempts: settings.maxAttempts ?? 1,
      passingScore: settings.passingScore ?? 70,
      isProctored: settings.isProctored ?? false,
      instructions: test.instructions
    } as Test;
  })
}

// Test Results (unchanged)
export const saveTestResult = async (result: TestResultInput) => {
  const local = await saveLocalTestResult({
    testId: result.testId,
    studentId: result.studentId || result.studentName,
    studentUsername: result.studentEmail || result.studentName,
    studentName: result.studentName,
    studentEmail: result.studentEmail || result.studentName,
    batchId: result.batchId ?? null,
    answers: result.answers,
    score: result.score,
    totalQuestions: result.totalQuestions,
    timeTaken: result.timeTaken,
  });

  const { data, error } = await supabase
    .from('test_results')
    .insert([{
      test_id: result.testId,
      student_name: result.studentName,
      answers: result.answers,
      score: result.score,
      total_questions: result.totalQuestions,
      ...(result.timeTaken != null ? { time_taken: result.timeTaken } : {}),
      ...(result.studentId ? { student_id: result.studentId } : {}),
      ...(result.batchId ? { batch_id: result.batchId } : {}),
      ...(result.studentEmail ? { student_email: result.studentEmail } : {}),
    }])
    .select()

  if (error) {
    return {
      id: local.id,
      test_id: local.testId,
      student_name: local.studentName,
      student_id: local.studentId,
      batch_id: local.batchId,
      student_email: local.studentEmail,
      answers: local.answers,
      score: local.score,
      total_questions: local.totalQuestions,
      time_taken: local.timeTaken,
      completed_at: local.completedAt,
    };
  }
  return data[0]
}

export const hasStudentTakenTest = async (testId: string, studentName: string) => {
  const normalizedName = studentName.trim().toLocaleLowerCase();
  if (!testId || !normalizedName) return false;

  if (await hasLocalStudentTakenTest(testId, studentName)) return true;

  const { data, error } = await supabase
    .from('test_results')
    .select('student_name')
    .eq('test_id', testId);

  if (error) {
    console.warn('Unable to check previous test attempts:', error);
    return false;
  }

  return (data || []).some(row =>
    String(row.student_name || '').trim().toLocaleLowerCase() === normalizedName
  );
}

export const getTestById = async (testId: string) => {
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .eq('id', testId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const settings = (data.settings ?? {}) as TestSettings;

  return {
    id: data.id,
    testKey: data.test_key,
    name: data.name,
    description: data.description || undefined,
    questions: data.questions,
    settings,
    endTime: data.end_date ? new Date(data.end_date) : undefined,
    createdAt: new Date(data.created_at),
    startDate: new Date(data.start_date),
    endDate: settings.endDate ? new Date(settings.endDate) : undefined,
    duration: data.duration ?? data.time_limit ?? 90,
    timeLimit: data.duration ?? data.time_limit ?? 90,
    allowReview: settings.allowReview ?? true,
    maxAttempts: settings.maxAttempts ?? 1,
    passingScore: settings.passingScore ?? 70,
    isProctored: settings.isProctored ?? false,
    instructions: data.instructions
  } as Test;
};

export const getTestResults = async (testId: string) => {
  // Fetch the test instance so we can read the per-question marks assigned at
  // test creation. Bank questions no longer carry marks, so the total must be
  // derived from the test's own questions JSONB.
  const test = await getTestById(testId);
  const testQuestions: Question[] = (test?.questions ?? []) as Question[];

  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('test_id', testId)
    .order('completed_at', { ascending: false });

  if (error) throw error;

  return data.map(result => {
    const answers = Array.isArray(result.answers)
      ? (result.answers as StudentAnswer[])
      : [];
    const scored = scoreQuestions(testQuestions, answers);
    const recordedQuestionTime = answers.reduce(
      (sum, answer) => {
        const timeSpent = answer.timeSpent;
        return sum + (
          typeof timeSpent === 'number' &&
          Number.isFinite(timeSpent) &&
          timeSpent > 0
            ? timeSpent
            : 0
        );
      },
      0
    );

    return {
      id: result.id,
      testId: result.test_id,
      studentName: result.student_name,
      answers,
      score: scored.score,
      totalMarks: scored.totalMarks,
      totalQuestions: testQuestions.length,
      correctAnswers: scored.correctAnswers,
      incorrectAnswers: scored.incorrectAnswers,
      unansweredQuestions: scored.unansweredQuestions,
      percentage: scored.percentage,
      timeTaken: result.time_taken ?? recordedQuestionTime,
      completedAt: new Date(result.completed_at)
    } as TestResult;
  });
};

// Helper function
export const getDifficulty = (question: Omit<Question, 'id'>): string => {
  const textLength = question.text.length;
  const optionsCount = question.options.length;
  
  if (textLength < 50 && optionsCount <= 3) return 'easy';
  if (textLength > 100 || optionsCount >= 5) return 'hard';
  return 'medium';
}

// ---------------------------------------------------------------------------
// Batch system — Supabase is the source of truth for batch operations.
// (localStorage is still used for in-progress test answers and the local
//  auth session store, but batch membership is persisted in the database.)
// ---------------------------------------------------------------------------

const getTestIdsForBatchSupabase = async (batchId: string): Promise<string[]> => {
  // `test_batches` is not anonymously readable (anon REST returns `[]`), so the
  // join must go through the SECURITY DEFINER `app_test_ids_for_batch` RPC,
  // which resolves the actor from p_token.
  const token = getTeacherToken() || getStudentToken();
  if (!token) return getLocalTestIdsForBatch(batchId);
  return callRpc<string[]>('app_test_ids_for_batch', { p_batch_id: batchId, p_token: token }) ?? [];
};

/**
 * Push a legacy localStorage batch into Supabase so every browser (teacher +
 * students) sees the same batch codes. This is a one-way migration: batch data
 * lives in Supabase, never in localStorage.
 */
const upsertBatchToSupabase = async (batch: BatchRow): Promise<BatchRow | null> => {
  const { data: existing, error } = await supabase
    .from('batches')
    .select('*')
    .eq('code', batch.code)
    .maybeSingle();
  if (existing) return existing as unknown as BatchRow;
  if (error && error.code !== 'PGRST116') {
    console.warn('Error checking batch before migration:', error);
  }
  const now = new Date().toISOString();
  const { data, error: insertError } = await supabase
    .from('batches')
    .insert([{
      code: batch.code,
      name: batch.name,
      description: batch.description,
      teacher_id: toTeacherUuid(batch.teacher_id),
      is_active: batch.is_active,
      created_at: batch.created_at,
      updated_at: batch.updated_at || now,
    }])
    .select()
    .single();
  if (insertError) {
    console.warn('Error migrating batch to Supabase:', insertError);
    return null;
  }
  return data as unknown as BatchRow;
};

export const getBatchByCode = async (code: string): Promise<BatchRow | null> => {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('code', normalized)
    .eq('is_active', true)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.warn('Error fetching batch by code:', error);
  }
  if (data) return data as unknown as BatchRow;
  // Legacy localStorage fallback — migrate the batch to Supabase so students
  // in other browsers can join with the same code.
  const localBatch = getLocalBatchByCode(code);
  if (localBatch) {
    const migrated = await upsertBatchToSupabase(localBatch);
    return migrated ?? localBatch;
  }
  return null;
};

export const getBatchById = async (id: string): Promise<BatchRow> => {
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (data) return data as unknown as BatchRow;
  if (error && error.code !== 'PGRST116') {
    console.warn('Error fetching batch by id:', error);
  }
  // Legacy localStorage fallback — migrate to Supabase if found.
  try {
    const localBatch = await getLocalBatchById(id);
    const migrated = await upsertBatchToSupabase(localBatch);
    return migrated ?? localBatch;
  } catch {
    throw new Error('Batch not found');
  }
};

export const createBatch = async ({
  name,
  description,
}: {
  name: string;
  description?: string;
}): Promise<BatchRow> => {
  if (!name.trim()) throw new Error('Batch name is required.');
  const token = getTeacherToken();
  if (!token) throw new Error('Not authenticated.');

  // `app_create_batch` is a SECURITY DEFINER RPC: the server generates the
  // unique batch `code` and resolves `teacher_id` from the session token,
  // bypassing the RLS policy that rejected raw REST inserts (HTTP 42501).
  return callRpc<BatchRow>('app_create_batch', {
    p_token: token,
    p_name: name.trim(),
    p_description: description?.trim() || null,
  });
};

export const getBatchesForTeacher = async (): Promise<BatchRow[]> => {
  const token = getTeacherToken();
  if (!token) return getLocalBatchesForTeacher('');
  // `app_teacher_batches` (SECURITY DEFINER) resolves the teacher from the
  // token and returns only that teacher's rows — no RLS 42501.
  return callRpc<BatchRow[]>('app_teacher_batches', { p_token: token });
};

interface AppUserRow {
  id: string;
  username: string;
  name: string | null;
  email?: string;
  batchId?: string | null;
  isApproved?: boolean;
  pendingBatchCode?: string | null;
}

/**
 * Resolve the student's identity + enrollment state from Supabase via the
 * `app_session` RPC (security-definer; works with the anon key + session
 * token). Falls back to the cached identity on a network/auth hiccup so the
 * student isn't locked out.
 */
export const getStudentProfile = async (): Promise<StudentIdentity | null> => {
  const token = getStudentToken();
  if (!token) {
    return getStudentSession() ?? null;
  }
  try {
    const user = await callRpc<AppUserRow>('app_session', { p_token: token });
    if (!user) {
      clearStudentSession();
      return null;
    }
    const identity: StudentIdentity = {
      id: user.id,
      username: user.username,
      email: user.email ?? user.username ?? '',
      name: user.name,
      batchId: user.batchId ?? null,
      isApproved: Boolean(user.isApproved),
      pendingBatchCode: user.pendingBatchCode ?? null,
    };
    setStudentSession(identity);
    return identity;
  } catch {
    return getStudentSession() ?? null;
  }
};

interface EnrollmentResult {
  id?: string;
  status: string;
  batch_id?: string;
  username?: string;
  student_id?: string;
  email?: string;
  name?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  requested_at?: string;
  notes?: string | null;
}

export const createBatchEnrollment = async ({
  username,
  email,
  batchCode,
}: {
  username?: string;
  email?: string;
  batchCode: string;
}): Promise<EnrollmentResult> => {
  const code = batchCode.trim().toUpperCase();

  // Student-initiated join: a signed-in student adds themselves via
  // `app_join_batch` (SECURITY DEFINER; resolves student from p_token).
  const studentToken = getStudentToken();
  if (studentToken) {
    return callRpc<EnrollmentResult>('app_join_batch', {
      p_code: code,
      p_token: studentToken,
    });
  }

  // Teacher-initiated invite by email: resolved from the teacher session token.
  const teacherToken = getTeacherToken();
  if (!teacherToken) throw new Error('Not authenticated');
  const emailValue = (email || username || '').trim().toLowerCase();
  if (!emailValue) throw new Error('Email is required');
  const batch = await getBatchByCode(code);
  if (!batch) throw new Error('Invalid batch code');
  // `app_enroll_email` is auto-approved (no pending tab for teacher invites).
  return callRpc<EnrollmentResult>('app_enroll_email', {
    p_batch_id: batch.id,
    p_email: emailValue,
    p_token: teacherToken,
  });
};

export const getPendingEnrollments = async (batchId: string): Promise<EnrollmentRow[]> => {
  const token = getTeacherToken();
  if (!token) return getLocalPendingEnrollments(batchId);
  return callRpc<EnrollmentRow[]>('app_pending_enrollments', {
    p_batch_id: batchId,
    p_token: token,
  });
};

export const getStudentsInBatch = async (batchId: string): Promise<StudentRow[]> => {
  const token = getTeacherToken();
  if (!token) return getLocalStudentsInBatch(batchId);
  const data =
    await callRpc<Array<Record<string, unknown>>>('app_batch_students', {
      p_batch_id: batchId,
      p_token: token,
    });
  return (data ?? []).map((row) => ({
    id: String(row.id ?? row.student_id ?? ''),
    username: String(row.username ?? row.email ?? ''),
    email: String(row.email ?? ''),
    name: row.name ?? null,
    batch_id: row.batch_id ?? null,
    is_approved: Boolean(row.is_approved ?? true),
    created_at: String(row.created_at ?? row.updated_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  })) as unknown as StudentRow[];
};

interface TestBatchLink {
  test_id: string;
  batch_id: string;
  created_at?: string;
}

export const approveBatchEnrollment = async (enrollmentId: string): Promise<EnrollmentResult> => {
  const token = getTeacherToken();
  if (!token) throw new Error('Not authenticated');
  return callRpc<EnrollmentResult>('app_approve_enrollment', {
    p_enrollment_id: enrollmentId,
    p_token: token,
  });
};

export const rejectBatchEnrollment = async (enrollmentId: string): Promise<EnrollmentResult> => {
  const token = getTeacherToken();
  if (!token) throw new Error('Not authenticated');
  return callRpc<EnrollmentResult>('app_reject_enrollment', {
    p_enrollment_id: enrollmentId,
    p_token: token,
  });
};

export const moveStudent = async (studentId: string, toBatchId: string): Promise<EnrollmentResult> => {
  const token = getTeacherToken();
  if (!token) throw new Error('Not authenticated');
  return callRpc<EnrollmentResult>('app_move_student', {
    p_student_id: studentId,
    p_to_batch_id: toBatchId,
    p_token: token,
  });
};

export const removeStudentFromBatch = async (studentId: string): Promise<StudentRow | null> => {
  const token = getTeacherToken();
  if (!token) return removeLocalStudentFromBatch(studentId);
  await callRpc('app_remove_student', {
    p_student_id: studentId,
    p_token: token,
  });
  return null;
};

export const assignTestToBatches = async (testId: string, batchIds: string[]): Promise<TestBatchLink[]> => {
  const token = getTeacherToken();
  if (!token) throw new Error('Not authenticated');
  const uniqueIds = Array.from(new Set(batchIds));
  if (uniqueIds.length === 0) return [];
  return callRpc<TestBatchLink[]>('app_set_test_batches', {
    p_test_id: testId,
    p_batch_ids: uniqueIds,
    p_token: token,
  });
};
export const updateTestBatches = assignTestToBatches;
export const getBatchesForTest = async (testId: string): Promise<BatchRow[]> => {
  // `test_batches` is not anonymously readable, so resolve linked batches via
  // the `app_batches_for_test` SECURITY DEFINER RPC (returns full BatchRow[]).
  const token = getTeacherToken() || getStudentToken();
  if (!token) return getLocalBatchesForTest(testId);
  return callRpc<BatchRow[]>('app_batches_for_test', { p_test_id: testId, p_token: token });
};

const mapRowToTest = (test: Record<string, any>): Test => {
  const settings = (test.settings ?? {}) as TestSettings;
  return {
    id: test.id,
    testKey: test.test_key,
    name: test.name,
    title: test.name,
    description: test.description || undefined,
    questions: test.questions || [],
    settings,
    endTime: test.end_date ? new Date(test.end_date) : undefined,
    createdAt: new Date(test.created_at),
    startDate: test.start_date ? new Date(test.start_date) : undefined,
    endDate: settings.endDate ? new Date(settings.endDate) : undefined,
    duration: test.duration ?? test.time_limit ?? 90,
    timeLimit: test.duration ?? test.time_limit ?? 90,
    allowReview: settings.allowReview ?? true,
    maxAttempts: settings.maxAttempts ?? 1,
    passingScore: settings.passingScore ?? 70,
    isProctored: settings.isProctored ?? false,
    instructions: test.instructions,
  } as Test;
};

export const getTestsForBatch = async (batchId: string) => {
  const testIds = await getTestIdsForBatchSupabase(batchId);
  if (testIds.length === 0) return [] as Test[];
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .in('id', testIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRowToTest);
};

export const batchLeaderboard = async (testId: string, batchId: string): Promise<BatchLeaderboardEntry[]> => {
  const test = await getTestById(testId);
  const questions: Question[] = (test?.questions ?? []) as Question[];
  return localBatchLeaderboard(testId, batchId, (answers) =>
    scoreQuestions(questions, Array.isArray(answers) ? answers as StudentAnswer[] : []),
  );
};

export const getBatchResults = async (testId: string, batchId: string) => {
  const test = await getTestById(testId);
  const testQuestions: Question[] = (test?.questions ?? []) as Question[];
  const rows = await getLocalResultsForBatchTest(testId, batchId);

  return rows.map(result => {
    const answers = Array.isArray(result.answers) ? (result.answers as StudentAnswer[]) : [];
    const scored = scoreQuestions(testQuestions, answers);
    const recordedQuestionTime = answers.reduce(
      (sum, answer) => {
        const timeSpent = answer.timeSpent;
        return sum + (typeof timeSpent === 'number' && Number.isFinite(timeSpent) && timeSpent > 0 ? timeSpent : 0);
      },
      0,
    );
    return {
      id: result.id,
      testId: result.testId,
      studentName: result.studentName,
      studentId: result.studentId,
      batchId: result.batchId,
      studentEmail: result.studentEmail,
      answers,
      score: scored.score,
      totalMarks: scored.totalMarks,
      totalQuestions: testQuestions.length,
      correctAnswers: scored.correctAnswers,
      incorrectAnswers: scored.incorrectAnswers,
      unansweredQuestions: scored.unansweredQuestions,
      percentage: scored.percentage,
      timeTaken: result.timeTaken ?? recordedQuestionTime,
      completedAt: new Date(result.completedAt),
    } as TestResult;
  });
};

export const isTestBatchScoped = async (testId: string): Promise<boolean> => {
  // `app_test_is_batch_scoped` is a public existence check (no token needed) and
  // avoids the anon-REST read of the RLS-gated `test_batches` table that returns
  // `[]` for the anonymous role.
  try {
    return Boolean(await callRpc<boolean>('app_test_is_batch_scoped', { p_test_id: testId }));
  } catch {
    return isLocalTestBatchScoped(testId);
  }
};
export const setTestBatches = assignTestToBatches;
export const getStudentResults = async (studentId: string) => {
  const rows = await getLocalResultsForStudent(studentId);
  const out: TestResult[] = [];
  for (const row of rows) {
    const test = await getTestById(row.testId);
    const questions: Question[] = (test?.questions ?? []) as Question[];
    const answers = Array.isArray(row.answers) ? (row.answers as StudentAnswer[]) : [];
    const scored = scoreQuestions(questions, answers);
    out.push({
      id: row.id,
      testId: row.testId,
      studentName: row.studentName,
      studentId: row.studentId,
      batchId: row.batchId ?? undefined,
      studentEmail: row.studentEmail,
      answers,
      score: scored.score,
      totalMarks: scored.totalMarks,
      totalQuestions: questions.length,
      correctAnswers: scored.correctAnswers,
      incorrectAnswers: scored.incorrectAnswers,
      unansweredQuestions: scored.unansweredQuestions,
      percentage: scored.percentage,
      timeTaken: row.timeTaken ?? 0,
      completedAt: new Date(row.completedAt),
      isPractice: false,
    } as TestResult);
  }
  return out;
};
