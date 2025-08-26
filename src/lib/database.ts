import { supabase } from './supabase'
import type { Question, Test, TestResult, User } from '../types'

// Questions
export default supabase;
export const insertQuestions = async (questions: Omit<Question, 'id'>[]) => {
  const questionsWithDifficulty = questions.map(q => ({
    text: q.text,
    options: q.options,
    correct_answer: q.correctAnswer,
    topic: q.topic,
    difficulty: getDifficulty(q) as 'easy' | 'medium' | 'hard'
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
    topic: q.topic
  })) as Question[]
}

export const getQuestionsByTopic = async (topic: string) => {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('topic', topic)
    .order('created_at', { ascending: false })

  if (error) throw error

  return data.map(q => ({
    id: q.id,
    text: q.text,
    options: q.options,
    correctAnswer: q.correct_answer,
    topic: q.topic
  })) as Question[]
}

// Tests
export const createTest = async (testData: Omit<Test, 'id' | 'createdAt'>) => {
  const { data, error } = await supabase
    .from('tests')
    .insert([{
      test_key: testData.testKey,
      name: testData.name,
      description: testData.description,
      questions: testData.questions,
      settings: testData.settings,
      start_date: testData.startDate.toISOString(),
      duration: testData.duration,
      time_limit: testData.timeLimit
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

  return {
    id: data.id,
    testKey: data.test_key,
    name: data.name,
    description: data.description,
    questions: data.questions,
    settings: data.settings,
    createdAt: new Date(data.created_at),
    startDate: new Date(data.start_date),
    duration: data.duration,
    timeLimit: data.time_limit
  } as Test
}

export const getAllTests = async () => {
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return data.map(test => ({
    id: test.id,
    testKey: test.test_key,
    name: test.name,
    description: test.description,
    questions: test.questions,
    settings: test.settings,
    createdAt: new Date(test.created_at),
    startDate: new Date(test.start_date),
    duration: test.duration,
    timeLimit: test.time_limit
  })) as Test[]
}

// Test Results
export const saveTestResult = async (result: Omit<TestResult, 'completedAt'>) => {
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

export const getTestResults = async (testId: string) => {
  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('test_id', testId)
    .order('completed_at', { ascending: false })

  if (error) throw error

  return data.map(result => ({
    testId: result.test_id,
    studentName: result.student_name,
    answers: result.answers,
    score: result.score,
    totalQuestions: result.total_questions,
    completedAt: new Date(result.completed_at)
  })) as TestResult[]
}

// Helper function - NOW EXPORTED
export const getDifficulty = (question: Omit<Question, 'id'>): string => {
  const textLength = question.text.length;
  const optionsCount = question.options.length;
  
  if (textLength < 50 && optionsCount <= 3) return 'easy';
  if (textLength > 100 || optionsCount >= 5) return 'hard';
  return 'medium';
}
