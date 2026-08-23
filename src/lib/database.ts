import { supabase, callRpc } from './supabase'
import type { Question, Difficulty, Test, TestResult, TestSettings, TestResultInput, StudentAnswer } from '../types/exam.types'
import { normalizeQuestionKey, normalizeQuestionText } from './questionImport'
import { scoreQuestions } from './score'
import {
  assignCompetitionRanks,
  getBatchByCode as getLocalBatchByCode,
  getBatchById as getLocalBatchById,
  getBatchesForTeacher as getLocalBatchesForTeacher,
  getBatchesForTest as getLocalBatchesForTest,
  getLocalResultsForBatchTest,
  getLocalResultsForStudent,
  getLocalResultsForTest,
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

/**
 * Row shape returned by the `questions` table (snake_case, as read over REST).
 * Pure mapping helpers below are shared between inserts and selects so the
 * explanation field is threaded in exactly one place. See
 * src/lib/__tests__/database.mappers.test.ts.
 */
export interface DbQuestionRow {
  id?: string | null;
  text: string;
  options: unknown[];
  correct_answer: number;
  topic?: string | null;
  subject?: string | null;
  year?: string | null;
  difficulty?: string | null;
  image_url?: string | null;
  explanation?: string | null;
  ingested_by?: string | null;
  created_at?: string;
}

/**
 * Map a raw DB row (snake_case) into the app's `Question` type (camelCase).
 * Null values become `undefined` so the optional fields stay type-clean.
 */
export const rowToQuestion = (q: { [k: string]: unknown }): Question => ({
  id: typeof q.id === 'string' ? q.id : undefined,
  text: typeof q.text === 'string' ? q.text : '',
  options: Array.isArray(q.options) ? (q.options as string[]) : [],
  correctAnswer:
    typeof q.correct_answer === 'number'
      ? q.correct_answer
      : Number(q.correct_answer) || 0,
  topic: typeof q.topic === 'string' ? q.topic : undefined,
  subject: typeof q.subject === 'string' ? q.subject : undefined,
  year: typeof q.year === 'string' ? q.year : undefined,
  difficulty:
    typeof q.difficulty === 'string' ? (q.difficulty as Difficulty) : undefined,
  imageUrl: typeof q.image_url === 'string' ? q.image_url : undefined,
  explanation:
    typeof q.explanation === 'string' ? q.explanation : undefined,
});

/**
 * Map an app-side `Question` (camelCase, without `id`) into the snake_case row
 * shape expected by the `questions` table + `app_insert_questions` RPC.
 * `explanation` is only included when present, so saves without one stay
 * backward-compatible (the REST fallback inserts NULL — the old behaviour).
 */
export const questionToRow = (
  q: Pick<
    Question,
    | 'text'
    | 'options'
    | 'correctAnswer'
    | 'topic'
    | 'subject'
    | 'year'
    | 'difficulty'
    | 'imageUrl'
    | 'explanation'
  >,
): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    text: q.text,
    options: q.options,
    correct_answer: q.correctAnswer,
    topic: q.topic,
    subject: q.subject,
    year: q.year,
    difficulty: q.difficulty ?? getDifficulty(q),
  };
  if (q.imageUrl) row.image_url = q.imageUrl;
  if (q.explanation) row.explanation = q.explanation;
  return row;
};

// Questions
export const insertQuestions = async (questions: Omit<Question, 'id'>[]): Promise<Question[]> => {
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

  const questionsWithDifficulty = newQuestions.map(q => questionToRow(q));

  // Preferred path: route through the SECURITY DEFINER RPC app_insert_questions.
  // It resolves the teacher from the session token and sets `ingested_by`
  // server-side, bypassing the anonymous RLS policy that rejects non-null
  // `ingested_by` on raw REST inserts (HTTP 42501).
  const token = getTeacherToken();
  let insertedViaRpc = false;
  if (token) {
    try {
      await callRpc('app_insert_questions', {
        p_token: token,
        p_questions: questionsWithDifficulty,
      });
      insertedViaRpc = true;
    } catch (e) {
      console.warn('app_insert_questions RPC failed, falling back to shared insert:', e);
    }
  }

  // Fallback (and default for anonymous imports): insert with `ingested_by`
  // set to NULL — the "shared with every teacher" path that the existing RLS
  // policy on `questions` permits for the anon role (proven by live test:
  // HTTP 201).
  const withIds = (questions: Array<Omit<Question, 'id'> & { id?: string }>): Question[] =>
    questions as Question[];

  if (!insertedViaRpc) {
    const { data, error } = await supabase
      .from('questions')
      .insert(questionsWithDifficulty.map(q => ({ ...q, ingested_by: null })))
      .select()

    if (error) {
      console.error('Error inserting questions:', error)
      throw error
    }
    // Normalize the raw snake_case rows so every caller gets the camelCase
    // Question shape (with ids) regardless of which insert path ran.
    return (data ?? []).map(row => rowToQuestion(row as Record<string, unknown>));
  }

  // The RPC doesn't echo the inserted rows back — resolve the saved ids by
  // exact text so callers (e.g. background explanation/image enrichment) can
  // backfill the right bank row. Best-effort: on failure we still return the
  // questions, just without ids.
  try {
    const { data: savedRows, error: lookupError } = await supabase
      .from('questions')
      .select('*')
      .in('text', newQuestions.map(q => q.text));
    if (lookupError || !savedRows?.length) return withIds(newQuestions);
    const rowByExactText = new Map<string, Record<string, unknown>>();
    for (const row of savedRows as Record<string, unknown>[]) {
      const key = typeof row.text === 'string' ? row.text : '';
      if (!rowByExactText.has(key)) rowByExactText.set(key, row);
    }
    return withIds(newQuestions.map(question => {
      const row = rowByExactText.get(question.text);
      return row ? rowToQuestion(row) : question;
    }));
  } catch (lookupError) {
    console.warn('Unable to resolve inserted question ids:', lookupError);
    return withIds(newQuestions);
  }
}

/** Look up a question's DB id by its (unique) text content. */
export const findQuestionIdByText = async (text: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('questions')
    .select('id')
    .eq('text', text)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id ?? null;
};

/** Backfill a generated explanation onto a saved question (fire-and-forget after save).
 * Resolves the teacher token when present; for anonymous sessions the REST path is
 * used best-effort. Never throws — failures are logged and silently ignored. */
export const updateQuestionExplanation = async (questionId: string, explanation: string): Promise<void> => {
  const token = getTeacherToken();
  if (token) {
    try {
      await callRpc('app_update_question', {
        p_token: token,
        p_question_id: questionId,
        p_updates: { explanation },
      });
      return;
    } catch (err) {
      console.warn('[updateQuestionExplanation] RPC failed, trying REST fallback:', err);
    }
  }
  // REST fallback for anon role (best-effort; will 401/403 if RLS blocks).
  const { error } = await supabase
    .from('questions')
    .update({ explanation } as Record<string, unknown>)
    .eq('id', questionId);
  if (error) {
    console.warn('[updateQuestionExplanation] REST update failed:', error);
  }
};

/** Backfill an uploaded image URL onto a saved question (fire-and-forget after save).
 * Mirrors `updateQuestionExplanation`: RPC preferred, REST fallback, never throws. */
export const updateQuestionImage = async (questionId: string, imageUrl: string): Promise<void> => {
  const token = getTeacherToken();
  if (token) {
    try {
      await callRpc('app_update_question', {
        p_token: token,
        p_question_id: questionId,
        p_updates: { image_url: imageUrl },
      });
      return;
    } catch (err) {
      console.warn('[updateQuestionImage] RPC failed, trying REST fallback:', err);
    }
  }
  // REST fallback for anon role (best-effort; will 401/403 if RLS blocks).
  const { error } = await supabase
    .from('questions')
    .update({ image_url: imageUrl } as Record<string, unknown>)
    .eq('id', questionId);
  if (error) {
    console.warn('[updateQuestionImage] REST update failed:', error);
  }
};

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
  return data.map(q => rowToQuestion(q)) as Question[]
}

/** Generates a 4-letter random test key (e.g. "A3F9"). */
export const generateTestKey = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i += 1) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
};

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

  return data.map(q => rowToQuestion(q)) as Question[]
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

  const questions = (data ?? []).map(q => rowToQuestion(q)) as Question[];

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

/** `test_results.time_taken` is an integer column — a fractional value
 *  (e.g. 24.456s from wall-clock math) makes EVERY insert fail with
 *  `22P02 invalid input syntax for type integer`. Coerce to whole seconds
 *  here so the attempt is always savable. */
const toWholeSeconds = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
};

/** Persist an attempt to `test_results`, retrying with progressively fewer
 *  identity columns. Core columns are always valid (no FK dependencies);
 *  student_id/batch_id carry FKs to students/batches and app-side session ids
 *  are not guaranteed to exist there — a bad value must degrade attribution,
 *  never lose the attempt. Returns the inserted row, or null if all variants
 *  failed. */
const insertResultRowToSupabase = async (
  result: TestResultInput,
): Promise<Record<string, unknown> | null> => {
  const roundedTimeTaken = toWholeSeconds(result.timeTaken);
  const coreRow = {
    test_id: result.testId,
    student_name: result.studentName,
    answers: result.answers,
    score: result.score,
    total_questions: result.totalQuestions,
    ...(roundedTimeTaken != null ? { time_taken: roundedTimeTaken } : {}),
  };
  const insertVariants: Array<{ label: string; row: Record<string, unknown> }> = [
    {
      label: 'with identity',
      row: {
        ...coreRow,
        ...(result.studentId ? { student_id: result.studentId } : {}),
        ...(result.batchId ? { batch_id: result.batchId } : {}),
        ...(result.studentEmail ? { student_email: result.studentEmail } : {}),
      },
    },
    {
      // Retry without student_id — the likeliest FK offender (session id not
      // present in public.students). Email still attributes the attempt.
      label: 'without student_id',
      row: {
        ...coreRow,
        ...(result.batchId ? { batch_id: result.batchId } : {}),
        ...(result.studentEmail ? { student_email: result.studentEmail } : {}),
      },
    },
    {
      // Final fallback: core columns only (same shape legacy rows had).
      label: 'core only',
      row: coreRow,
    },
  ];

  for (const variant of insertVariants) {
    const { data, error } = await supabase
      .from('test_results')
      .insert([variant.row])
      .select();
    if (!error && data?.length) return data[0];
    if (error) {
      console.warn(
        `[insertResultRowToSupabase] insert failed (${variant.label}); trying next fallback:`,
        error.message,
      );
    }
  }
  return null;
};

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

  const saved = await insertResultRowToSupabase(result);
  if (saved) return saved;

  // Persistence failed entirely — keep the historical behaviour: surface the
  // local row so the exam flow completes (syncPendingLocalResults will retry
  // the upload later from this student's dashboard).
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
};

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

// ---------------------------------------------------------------------------
// Test results — Supabase `test_results` is the source of truth for persisted
// attempts. Every device writes there on submit (saveTestResult), so teacher
// analytics, batch results and leaderboards read from the DB instead of the
// reviewing browser's localStorage. localStorage rows are merged in as a
// fallback for attempts that never reached the DB. Scoring stays client-side
// via scoreQuestions (per the current architecture).
// ---------------------------------------------------------------------------

/** Raw `test_results` row shape (snake_case) as returned over REST. */
interface SupabaseResultRow {
  id: string;
  test_id: string;
  student_id?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  batch_id?: string | null;
  answers?: unknown;
  score?: number | null;
  total_questions?: number | null;
  time_taken?: number | null;
  completed_at?: string;
}

/** Fetch every persisted attempt for a test, newest first. */
const fetchSupabaseResultsForTest = async (testId: string): Promise<SupabaseResultRow[]> => {
  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('test_id', testId)
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupabaseResultRow[];
};

/** Normalized identity keys for deduping attempts across stores. */
const resultIdentityKeys = (parts: {
  studentId?: string | null;
  studentEmail?: string | null;
  studentName?: string | null;
}): string[] => {
  const normalize = (value?: string | null) => String(value ?? '').trim().toLowerCase();
  return Array.from(new Set(
    [parts.studentId, parts.studentEmail, parts.studentName]
      .map(normalize)
      .filter(Boolean),
  ));
};

/** True when two attempt rows plausibly describe the same submission: they
 *  share a student identity AND completed within a small window (the local row
 *  is the same attempt that was persisted, written seconds apart). */
const COMPLETION_MATCH_WINDOW_MS = 15_000;
const isSameAttempt = (
  a: { studentId?: string | null; studentEmail?: string | null; studentName?: string | null; completedAt: string | Date },
  b: { studentId?: string | null; studentEmail?: string | null; studentName?: string | null; completedAt: string | Date },
): boolean => {
  const keysA = resultIdentityKeys(a);
  const keysB = new Set(resultIdentityKeys(b));
  if (!keysA.some(key => keysB.has(key))) return false;
  const timeA = new Date(a.completedAt).getTime();
  const timeB = new Date(b.completedAt).getTime();
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return false;
  return Math.abs(timeA - timeB) <= COMPLETION_MATCH_WINDOW_MS;
};

/** Score one attempt against the test's questions (client-side scoring) and
 *  map it into the app's TestResult shape. Works for both raw Supabase rows
 *  (pre-normalized) and local rows. */
const mapAttemptToTestResult = (
  attempt: {
    id: string;
    testId: string;
    studentName?: string | null;
    studentId?: string | null;
    batchId?: string | null;
    studentEmail?: string | null;
    answers: unknown;
    timeTaken?: number | null;
    completedAt: string | Date;
  },
  testQuestions: Question[],
): TestResult => {
  const answers = Array.isArray(attempt.answers) ? (attempt.answers as StudentAnswer[]) : [];
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
    0,
  );

  return {
    id: attempt.id,
    testId: attempt.testId,
    studentName: attempt.studentName ?? 'Student',
    ...(attempt.studentId ? { studentId: attempt.studentId } : {}),
    ...(attempt.batchId ? { batchId: attempt.batchId } : {}),
    ...(attempt.studentEmail ? { studentEmail: attempt.studentEmail } : {}),
    answers,
    score: scored.score,
    totalMarks: scored.totalMarks,
    totalQuestions: testQuestions.length,
    correctAnswers: scored.correctAnswers,
    incorrectAnswers: scored.incorrectAnswers,
    unansweredQuestions: scored.unansweredQuestions,
    percentage: scored.percentage,
    timeTaken: attempt.timeTaken ?? recordedQuestionTime,
    completedAt: new Date(attempt.completedAt),
    isPractice: false,
  } as TestResult;
};

export const getTestResults = async (testId: string) => {
  // Fetch the test instance so we can read the per-question marks assigned at
  // test creation. Bank questions no longer carry marks, so the total must be
  // derived from the test's own questions JSONB.
  const test = await getTestById(testId);
  const testQuestions: Question[] = (test?.questions ?? []) as Question[];

  const rows = await fetchSupabaseResultsForTest(testId);
  return rows.map(row =>
    mapAttemptToTestResult(
      {
        id: row.id,
        testId: row.test_id,
        studentName: row.student_name,
        studentId: row.student_id ?? undefined,
        batchId: row.batch_id ?? undefined,
        studentEmail: row.student_email ?? undefined,
        answers: row.answers,
        timeTaken: row.time_taken,
        completedAt: row.completed_at ?? new Date().toISOString(),
      },
      testQuestions,
    ),
  );
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

/** Re-export local results lookup so callers (e.g. Dashboard) can merge
 * local-only attempt counts with Supabase results when needed. */
export { getLocalResultsForTest };

const mapRowToTest = (test: Record<string, unknown>): Test => {
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
  // Rank from the DB-backed merged result set (Supabase rows + local-only
  // fallback). Scoring happens client-side via scoreQuestions inside
  // getBatchResults.
  const results = await getBatchResults(testId, batchId);

  // One entry per student — keep each student's best attempt.
  const bestByStudent = new Map<string, BatchLeaderboardEntry>();
  for (const result of results) {
    const identityKey =
      resultIdentityKeys({
        studentId: result.studentId,
        studentEmail: result.studentEmail,
        studentName: result.studentName,
      })[0] ?? result.id;
    const entry: BatchLeaderboardEntry = {
      rank: 0,
      percentile: 0,
      studentId: result.studentId ?? result.studentEmail ?? result.studentName ?? result.id,
      email: result.studentEmail ?? result.studentName ?? '',
      username: result.studentEmail ?? result.studentName ?? '',
      name: result.studentName ?? null,
      score: result.score,
      totalMarks: result.totalMarks ?? 0,
      percentage: result.percentage,
      completedAt: result.completedAt.toISOString(),
    };
    const existing = bestByStudent.get(identityKey);
    if (!existing || entry.percentage > existing.percentage) {
      bestByStudent.set(identityKey, entry);
    }
  }

  const entries = Array.from(bestByStudent.values()).sort((a, b) =>
    b.percentage - a.percentage ||
    a.completedAt.localeCompare(b.completedAt),
  );

  // Competition ranking: equal percentages share the same rank (1,1,3…).
  // Percentile is rank-derived so it reflects standing among peers, never the
  // raw score (a 25% score must not read as "25th percentile"). Shared helper
  // with localAuth.localBatchLeaderboard so both paths stay in lockstep.
  return assignCompetitionRanks(entries);
};

export const getBatchResults = async (testId: string, batchId: string) => {
  const test = await getTestById(testId);
  const testQuestions: Question[] = (test?.questions ?? []) as Question[];

  // 1) Persisted attempts from Supabase — visible to every browser (teacher
  //    included), not just the device the student used.
  let dbRows: SupabaseResultRow[] = [];
  try {
    dbRows = await fetchSupabaseResultsForTest(testId);
  } catch (error) {
    console.warn('Unable to load persisted test results; falling back to local results:', error);
  }

  // When the test is assigned to batches, scope the view to this batch.
  // Rows without a batch_id are kept so direct-link attempts never vanish
  // from the teacher's view (conservative: prefer extra rows over missing).
  const batchScoped = await isTestBatchScoped(testId);
  const dbResults = dbRows
    .filter(row => !batchScoped || !row.batch_id || row.batch_id === batchId)
    .map(row =>
      mapAttemptToTestResult(
        {
          id: row.id,
          testId: row.test_id,
          studentName: row.student_name,
          studentId: row.student_id ?? undefined,
          batchId: row.batch_id ?? undefined,
          studentEmail: row.student_email ?? undefined,
          answers: row.answers,
          timeTaken: row.time_taken,
          completedAt: row.completed_at ?? new Date().toISOString(),
        },
        testQuestions,
      ),
    );

  // 2) Merge device-local rows that never made it to the DB (offline saves,
  //    legacy demo data). A local row already represented by a persisted row
  //    (same identity + ~same completion time) is dropped — the DB row wins.
  const localRows = await getLocalResultsForBatchTest(testId, batchId).catch(() => []);
  const localResults = localRows
    .filter(localRow => !dbRows.some(dbRow => isSameAttempt(
      {
        studentId: localRow.studentId,
        studentEmail: localRow.studentEmail,
        studentName: localRow.studentName,
        completedAt: localRow.completedAt,
      },
      {
        studentId: dbRow.student_id,
        studentEmail: dbRow.student_email,
        studentName: dbRow.student_name,
        completedAt: dbRow.completed_at ?? '',
      },
    )))
    .map(row =>
      mapAttemptToTestResult(
        {
          id: row.id,
          testId: row.testId,
          studentName: row.studentName,
          studentId: row.studentId,
          batchId: row.batchId ?? undefined,
          studentEmail: row.studentEmail,
          answers: row.answers,
          timeTaken: row.timeTaken,
          completedAt: row.completedAt,
        },
        testQuestions,
      ),
    );

  return [...dbResults, ...localResults];
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
export interface StudentResultsHints {
  /** Student's email — matches rows saved before student_id was recorded. */
  studentEmail?: string | null;
  /** Student's display name — last-resort match for legacy rows. */
  studentName?: string | null;
}

/** Backfill attempts that were saved on-device but never reached `test_results`
 *  (offline submissions, historical FK failures). Called best-effort when a
 *  student opens their dashboard; skips tests that already have any persisted
 *  row for this student so repeat loads never duplicate rows. Returns the
 *  number of newly persisted attempts. */
export const syncPendingLocalResults = async (
  studentId: string,
  hints: StudentResultsHints = {},
): Promise<number> => {
  try {
    const [localRows, dbRows] = await Promise.all([
      getLocalResultsForStudent(studentId),
      fetchSupabaseResultsForStudent(studentId, hints),
    ]);
    const persistedTests = new Set(dbRows.map(row => row.test_id));
    let synced = 0;
    for (const row of localRows) {
      if (!row.testId || persistedTests.has(row.testId)) continue;
      const saved = await insertResultRowToSupabase({
        testId: row.testId,
        studentName: row.studentName,
        answers: Array.isArray(row.answers) ? (row.answers as StudentAnswer[]) : [],
        score: row.score,
        totalQuestions: row.totalQuestions,
        timeTaken: row.timeTaken,
        ...(studentId ? { studentId } : {}),
        ...(row.batchId ? { batchId: row.batchId } : {}),
        ...(row.studentEmail ? { studentEmail: row.studentEmail } : {}),
      });
      if (saved) {
        persistedTests.add(row.testId);
        synced += 1;
      }
    }
    if (synced > 0) {
      console.info(`[syncPendingLocalResults] uploaded ${synced} previously-local attempt(s)`);
    }
    return synced;
  } catch (error) {
    console.warn('[syncPendingLocalResults] best-effort sync failed:', error);
    return 0;
  }
};

/** Fetch persisted attempts for a student from every device: by student_id,
 *  plus best-effort email/name matches for rows saved without a student_id. */
const fetchSupabaseResultsForStudent = async (
  studentId: string,
  hints: StudentResultsHints,
): Promise<SupabaseResultRow[]> => {
  const empty = { data: [] as SupabaseResultRow[], error: null };
  const batches = await Promise.all([
    studentId
      ? supabase.from('test_results').select('*').eq('student_id', studentId)
      : Promise.resolve(empty),
    hints.studentEmail
      ? supabase.from('test_results').select('*').ilike('student_email', hints.studentEmail)
      : Promise.resolve(empty),
    hints.studentName
      ? supabase.from('test_results').select('*').ilike('student_name', hints.studentName)
      : Promise.resolve(empty),
  ]);
  const merged = new Map<string, SupabaseResultRow>();
  for (const batch of batches) {
    if (batch.error) {
      console.warn('Unable to load persisted student results:', batch.error);
      continue;
    }
    for (const row of (batch.data ?? []) as SupabaseResultRow[]) {
      merged.set(row.id, row);
    }
  }
  return Array.from(merged.values()).sort((a, b) =>
    String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')),
  );
};

export const getStudentResults = async (
  studentId: string,
  hints: StudentResultsHints = {},
): Promise<TestResult[]> => {
  const mapAll = async (
    attempts: Array<{
      id: string;
      testId: string;
      studentName?: string | null;
      studentId?: string | null;
      batchId?: string | null;
      studentEmail?: string | null;
      answers: unknown;
      timeTaken?: number | null;
      completedAt: string;
    }>,
  ): Promise<TestResult[]> => {
    const out: TestResult[] = [];
    for (const attempt of attempts) {
      const test = await getTestById(attempt.testId);
      const questions: Question[] = (test?.questions ?? []) as Question[];
      out.push(mapAttemptToTestResult(attempt, questions));
    }
    return out;
  };

  const localRows = await getLocalResultsForStudent(studentId).catch(() => []);
  let dbRows: SupabaseResultRow[] = [];
  try {
    dbRows = await fetchSupabaseResultsForStudent(studentId, hints);
  } catch (error) {
    console.warn('Unable to load persisted student results; using local results only:', error);
  }

  // Persisted attempts (source of truth)…
  const dbResults = await mapAll(dbRows.map(row => ({
    id: row.id,
    testId: row.test_id,
    studentName: row.student_name,
    studentId: row.student_id ?? studentId,
    batchId: row.batch_id ?? undefined,
    studentEmail: row.student_email ?? undefined,
    answers: row.answers,
    timeTaken: row.time_taken,
    completedAt: row.completed_at ?? new Date().toISOString(),
  })));

  // …then local-only attempts that were never persisted (offline saves /
  // legacy data), deduped conservatively against the persisted rows.
  const localResults = await mapAll(localRows
    .filter(localRow => !dbRows.some(dbRow => isSameAttempt(
      {
        studentId: localRow.studentId,
        studentEmail: localRow.studentEmail,
        studentName: localRow.studentName,
        completedAt: localRow.completedAt,
      },
      {
        studentId: dbRow.student_id,
        studentEmail: dbRow.student_email,
        studentName: dbRow.student_name,
        completedAt: dbRow.completed_at ?? '',
      },
    )))
    .map(row => ({
      id: row.id,
      testId: row.testId,
      studentName: row.studentName,
      studentId: row.studentId,
      batchId: row.batchId ?? undefined,
      studentEmail: row.studentEmail,
      answers: row.answers,
      timeTaken: row.timeTaken,
      completedAt: row.completedAt,
    })));

  // Collapse to ONE result per test (latest attempt wins). Repeat submissions
  // (re-takes, retries, dev re-runs) previously inflated "Tests attempted"
  // above the number of assigned tests.
  const latestByTest = new Map<string, TestResult>();
  for (const result of [...dbResults, ...localResults].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime(),
  )) {
    latestByTest.set(result.testId, result);
  }
  return Array.from(latestByTest.values()).sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  );
};
