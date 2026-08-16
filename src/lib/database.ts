import { supabase } from './supabase'
import type { Question, Test, TestResult, TestSettings, TestResultInput } from '../types/exam.types'
import { normalizeQuestionKey, normalizeQuestionText } from './questionImport'

// Questions
export const insertQuestions = async (questions: Omit<Question, 'id'>[]) => {
  if (questions.length === 0) return []

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
    ...(q.marks !== undefined ? { marks: q.marks } : {}),
    ...(q.negativeMarks !== undefined ? { negative_marks: q.negativeMarks } : {})
  }))

  const { data, error } = await supabase
    .from('questions')
    .insert(questionsWithDifficulty)
    .select()

  if (error) {
    console.error('Error inserting questions:', error)
    throw error
  }
  return data
}

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
    marks: q.marks,
    negativeMarks: q.negative_marks
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
    marks: q.marks,
    negativeMarks: q.negative_marks
  })) as Question[]
}

// Keep your existing getQuestionsByTopic for backward compatibility
export const getQuestionsByTopic = async (topic: string) => {
  return getQuestionsByFilters({ topic })
}

// Tests (unchanged)
export const createTest = async (testData: Omit<Test, 'id' | 'createdAt'>) => {
  const { data, error } = await supabase
    .from('tests')
    .insert([{
      test_key: testData.testKey,
      name: testData.name,
      description: testData.description,
      questions: testData.questions,
      settings: testData.settings,
      start_date: testData.startDate?.toISOString(),
      duration: testData.duration,
      // Keep the legacy column synchronized for older database consumers.
      time_limit: testData.duration
    }])
    .select()

  if (error) {
    console.error('Error creating test:', error)
    throw error
  }
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
    description: data.description,
    questions: data.questions,
    settings,
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
  const { data, error } = await supabase
    .from('test_results')
    .insert([{
      test_id: result.testId,
      student_name: result.studentName,
      answers: result.answers,
      score: result.score,
      total_questions: result.totalQuestions
    }])
    .select()

  if (error) throw error
  return data[0]
}

export const hasStudentTakenTest = async (testId: string, studentName: string) => {
  const normalizedName = studentName.trim().toLocaleLowerCase();
  if (!testId || !normalizedName) return false;

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

export const getTestResults = async (testId: string) => {
  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('test_id', testId)
    .order('completed_at', { ascending: false })

  if (error) throw error

  return data.map(result => {
    const total = result.total_questions ?? 0;
    const score = result.score ?? 0;
    const answers = Array.isArray(result.answers) ? result.answers : [];
    const answered = answers.filter(answer => answer.selectedOption >= 0).length;
    const recordedQuestionTime = answers.reduce((sum, answer) => (
      sum + (Number.isFinite(answer.timeSpent) && answer.timeSpent > 0 ? answer.timeSpent : 0)
    ), 0);

    return {
      id: result.id,
      testId: result.test_id,
      studentName: result.student_name,
      answers,
      score,
      totalMarks: total,
      totalQuestions: total,
      correctAnswers: score,
      incorrectAnswers: Math.max(0, answered - score),
      unansweredQuestions: Math.max(0, total - answered),
      percentage: total ? Math.round((score / total) * 100) : 0,
      timeTaken: result.time_taken ?? recordedQuestionTime,
      completedAt: new Date(result.completed_at)
    } as TestResult;
  })
}

// Helper function
export const getDifficulty = (question: Omit<Question, 'id'>): string => {
  const textLength = question.text.length;
  const optionsCount = question.options.length;
  
  if (textLength < 50 && optionsCount <= 3) return 'easy';
  if (textLength > 100 || optionsCount >= 5) return 'hard';
  return 'medium';
}
