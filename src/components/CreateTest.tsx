import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { 
  Home, 
  CheckCircle, 
  BookOpen, 
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Loader2,
  Mic
} from 'lucide-react';
import { FileText } from 'lucide-react';
import { TestConfigSection } from './TestConfigSection';
import { QuestionSelectionSection } from './QuestionSelectionSection';
import { SelectedQuestionsSection } from './SelectedQuestionsSection';
import { VoiceModeModal } from './VoiceModeModal';
import { createTest, getPaginatedQuestions, getBatchesForTeacher, assignTestToBatches } from '../lib/database';
import type { Question, Test } from '../types/exam.types';
import type { BatchRow } from '../lib/database';
import { getTeacherSession } from '../lib/localAuth';
import './CreateTest.css';

interface CreateTestProps {
  onBackToDashboard: () => void;
  onImportPdf: () => void;
  onCreateTest: (test: Test) => void;
}

type DifficultyLevel = 'easy' | 'medium' | 'hard';

interface VoiceQuestionCriteria {
  subject: string;
  topic: string;
  count: number;
  difficulty: DifficultyLevel;
}

interface VoiceData {
  testName: string;
  testDate: string;
  testTime: string;
  duration: number;
  questions: VoiceQuestionCriteria[];
}

// Question Storage Context
interface QuestionContextType {
  allQuestions: Question[];
 isLoading: boolean;
  error: string | null;
  refreshQuestions: () => Promise<void>;
  loadPage: (params: { offset?: number; search?: string }) => Promise<void>;
  pageSize: number;
  pageOffset: number;
  hasMore: boolean;
  totalCount: number;
  isFetching: boolean;
}

const QuestionContext = createContext<QuestionContextType | null>(null);

export const useQuestions = () => {
  const context = useContext(QuestionContext);
  if (!context) {
    throw new Error('useQuestions must be used within QuestionProvider');
  }
  return context;
};

// Generate 4-letter random key function
const generateTestKey = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
};

export const CreateTest: React.FC<CreateTestProps> = ({ onBackToDashboard, onImportPdf, onCreateTest }) => {
  
  // Basic test configuration state
  const [testName, setTestName] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // Wizard paging: Setup (name/date/batches) -> Questions (pick from bank).
  // Splits the single long scroll into two focused steps; child components and
  // their DB/voice logic are untouched.
  const [createStep, setCreateStep] = useState<'setup' | 'questions'>('setup');
  const [teacherBatches, setTeacherBatches] = useState<BatchRow[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [duration, setDuration] = useState(90);
  
  // Question storage state
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [pageOffset, setPageOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const firstLoadRef = useRef(true);
  const pageSize = 15;
  
  // Voice mode state
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // Page through (or search) the question bank 15 at a time instead of
  // fetching every question up front.
  const loadPage = useCallback(async ({ offset = 0, search = '' }: { offset?: number; search?: string } = {}) => {
    const isInitial = firstLoadRef.current && offset === 0 && !search;
    if (isInitial) {
      firstLoadRef.current = false;
      setQuestionsLoading(true);
    } else {
      setIsFetching(true);
    }
    setQuestionsError(null);
    try {
      const result = await getPaginatedQuestions({ limit: pageSize, offset, search });
      setAllQuestions(result.questions);
      setTotalCount(result.count);
      setHasMore(result.hasMore);
      setPageOffset(offset);
    } catch {
      setQuestionsError('Failed to load questions. Please try again.');
    } finally {
      if (isInitial) setQuestionsLoading(false);
      setIsFetching(false);
    }
  }, []);

  const loadQuestions = () => loadPage({ offset: 0 });

  // Load the first page of questions when the screen mounts.
  useEffect(() => {
    setIsLoaded(true);
    void loadPage({ offset: 0 });
  }, [loadPage]);

  // Load the teacher's batches so a test can be assigned at creation time.
  useEffect(() => {
    (async () => {
      try {
        const teacher = getTeacherSession();
        if (teacher) setTeacherBatches(await getBatchesForTeacher());
      } catch {
        /* non-blocking */
      }
    })();
  }, []);

  // Get available filter options for AI context
  const getAvailableFilters = () => {
    const subjects = [...new Set(allQuestions.map(q => {
      const subject = q.subject || 'General';
      return subject;
    }).filter(Boolean))];
    
    const topics = [...new Set(allQuestions.map(q => {
      const topic = q.topic || 'General';
      return topic;
    }).filter(Boolean))];
    
    return { subjects, topics };
  };

  const getDifficulty = (question: Question): DifficultyLevel => {
    if (question.difficulty) {
      const diff = question.difficulty.toLowerCase();
      
      if (diff === 'easy' || diff === 'medium' || diff === 'hard') {
        return diff as DifficultyLevel;
      }
    }
    
    // Fallback to text-based difficulty calculation
    const textLength = question.text?.length || 0;
    const optionsCount = question.options?.length || 0;
    
    let calculatedDifficulty: DifficultyLevel;
    
    if (textLength < 50 && optionsCount <= 3) {
      calculatedDifficulty = 'easy';
    } else if (textLength > 100 || optionsCount >= 5) {
      calculatedDifficulty = 'hard';
    } else {
      calculatedDifficulty = 'medium';
    }
    
    return calculatedDifficulty;
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Voice recognition setup
  const startVoiceRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript('');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setVoiceTranscript(prev => prev + ' ' + finalTranscript);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      alert('Speech recognition error. Please try again.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    return recognition;
  };

  // Process voice input with Gemini AI
  const processVoiceInput = async (transcript: string) => {
    if (!transcript.trim()) {
      return;
    }

    setIsProcessingVoice(true);

    try {
      let GoogleGenAI: any;
      try {
        ({ GoogleGenAI } = await import('@google/genai'));
      } catch {
        alert('Voice processing is unavailable. The @google/genai package is not installed. Please enter details manually.');
        setIsProcessingVoice(false);
        return;
      }

      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

      if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key not found');
      }

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      
      // gemini-3.6-flash with a JSON-output generation config (passed inline
      // to generateContent below).

      const availableFilters = getAvailableFilters();

      const prompt = `
Extract test creation details from this voice input: "${transcript}"

You must return ONLY a valid JSON object with exactly these fields:
{
  "testName": "extracted test name or 'Sample Test' if not specified",
  "testDate": "extracted date in YYYY-MM-DD format or today's date",
  "testTime": "extracted time in HH:MM format or current time + 1 hour",
  "duration": 90,
  "questionCount": 5,
  "questions": [
    {
      "subject": "subject name from available subjects",
      "topic": "topic name from available topics", 
      "count": 5,
      "difficulty": "easy"
    }
  ]
}

Available subjects: ${JSON.stringify(availableFilters.subjects)}
Available topics: ${JSON.stringify(availableFilters.topics)}

Rules:
- Return ONLY valid JSON
- No explanatory text before or after
- Use reasonable defaults for missing information
- Duration should be a number between 8 and 180 minutes (90 minutes default)
- Count should be a number between 1 and 180 (5 questions default)
- questionCount should preserve an explicit total such as 90
- Difficulty must be exactly: "easy", "medium", or "hard"
- Subject and topic must match available options or use "General" as fallback
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        },
      });
      const rawText = response.text;
      
      try {
        // Clean the response to extract JSON
        const cleanedText = cleanJsonResponse(rawText);
        const parsedData = JSON.parse(cleanedText);
        
        // Validate the parsed data structure
        const validatedData = validateResponseData(parsedData);
        
        await applyVoiceData(validatedData);
        
      } catch (parseError) {
        // Try manual extraction as fallback
        try {
          const fallbackData = extractDataManually(transcript);
          await applyVoiceData(fallbackData);
        } catch (fallbackError) {
          alert('Failed to process voice input. Please try again or enter details manually.');
        }
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('404')) {
        alert('AI model not available. Please try again later.');
      } else if (errMsg.includes('API key')) {
        alert('AI configuration error. Please check your Gemini API key.');
      } else if (errMsg.includes('quota') || errMsg.includes('limit')) {
        alert('API quota exceeded. Please try again later.');
      } else {
        alert('Failed to process voice input. Please check your configuration.');
      }
    } finally {
      setIsProcessingVoice(false);
    }
  };

const applyVoiceData = async (data: VoiceData) => {
    setTestName(data.testName);
    setStartDate(data.testDate);
    setStartTime(data.testTime);
    setDuration(data.duration);

    if (!allQuestions.length) throw new Error('No questions are available for voice selection yet.');

    const selected: Question[] = [];
    const selectedIds = new Set<string>();
    const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
    let target = 0;

    for (const criteria of data.questions) {
      const count = Math.min(180, Math.max(1, Math.round(criteria.count)));
      target += count;
      const subject = normalize(criteria.subject);
      const topic = normalize(criteria.topic);
      const difficulty = normalize(criteria.difficulty);
      const matches = (question: Question, includeDifficulty: boolean) => {
        const questionSubject = normalize(question.subject);
        const questionTopic = normalize(question.topic);
        const questionDifficulty = normalize(getDifficulty(question));
        const subjectMatches = !subject || subject === 'general' || !questionSubject || questionSubject.includes(subject) || subject.includes(questionSubject);
        const topicMatches = !topic || topic === 'general' || !questionTopic || questionTopic.includes(topic) || topic.includes(questionTopic);
        const difficultyMatches = !includeDifficulty || !difficulty || difficulty === 'any' || questionDifficulty === difficulty;
        return subjectMatches && topicMatches && difficultyMatches;
      };
      const exact = allQuestions.filter(q => matches(q, true));
      const candidates = exact.length ? exact : allQuestions.filter(q => matches(q, false));
      for (const question of shuffleArray(candidates.length ? candidates : allQuestions)) {
        if (selectedIds.has(question.id)) continue;
        selectedIds.add(question.id);
        selected.push(question);
        if (selected.length >= target) break;
      }
    }

    if (!selected.length) {
      selected.push(...shuffleArray(allQuestions).slice(0, Math.min(5, allQuestions.length)));
    }
    if (selected.length < target) {
      const requestedSubjects = new Set(
        data.questions
          .map((criteria) => normalize(criteria.subject))
          .filter((subject) => subject && subject !== 'general'),
      );
      const fallbackPool = allQuestions.filter((question) => {
        if (!requestedSubjects.size) return true;
        return requestedSubjects.has(normalize(question.subject));
      });
      for (const question of shuffleArray(fallbackPool)) {
        if (selectedIds.has(question.id)) continue;
        selectedIds.add(question.id);
        selected.push(question);
        if (selected.length >= target) break;
      }
    }
    if (selected.length < target) {
      throw new Error(`Only ${selected.length} eligible questions are available; requested ${target}.`);
    }
    setSelectedQuestions(selected);
    setShowVoiceModal(false);
    setVoiceTranscript('');
  };

  // Enhanced clean JSON response function
  const cleanJsonResponse = (text: string): string => {
    // Remove markdown code fences while preserving the JSON payload.
    let cleaned = text.replace(/```(?:json)?/gi, '');
    
    // Remove any text before the first {
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) {
      cleaned = cleaned.substring(firstBrace);
    }
    
    // Remove any text after the last }
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > 0) {
      cleaned = cleaned.substring(0, lastBrace + 1);
    }
    
    // Remove any trailing text or whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
  };

  // Enhanced validate response data
  const validateResponseData = (data: any): VoiceData => {
    const requestedCount = Number(data?.questionCount ?? data?.count ?? data?.numberOfQuestions);
    const duration = Number.isFinite(Number(data?.duration))
      ? Math.min(180, Math.max(8, Math.round(Number(data.duration))))
      : 90;
    const testDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data?.testDate || ''))
      ? String(data.testDate)
      : new Date().toISOString().split('T')[0];
    const testTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(data?.testTime || ''))
      ? String(data.testTime)
      : new Date(Date.now() + 3600000).toTimeString().slice(0, 5);
    const questionCriteria = Array.isArray(data?.questions) && data.questions.length > 0
      ? data.questions
      : [{ subject: 'General', topic: 'General', difficulty: 'easy' }];
    const questions = questionCriteria.map((q: any) => {
        const useRequestedTotal = Number.isFinite(requestedCount)
          && questionCriteria.length === 1
          && (!Number.isFinite(Number(q?.count)) || Number(q.count) === 5);
        const count = useRequestedTotal
          ? Math.min(180, Math.max(1, Math.round(requestedCount)))
          : Number.isFinite(Number(q?.count))
          ? Math.min(180, Math.max(1, Math.round(Number(q.count))))
          : 5;
        return {
          subject: String(q?.subject || 'General').trim() || 'General',
          topic: String(q?.topic || 'General').trim() || 'General',
          count,
          difficulty: ['easy', 'medium', 'hard'].includes(q?.difficulty)
            ? q.difficulty
            : 'easy'
        };
      });

    return {
      testName: String(data?.testName || 'Sample Test').trim() || 'Sample Test',
      testDate,
      testTime,
      duration,
      questions
    };
  };

  // Manual extraction fallback
  const extractDataManually = (transcript: string): VoiceData => {
    const now = new Date();
    const extracted = {
      testName: extractTestName(transcript) || 'Voice Created Test',
      testDate: extractDate(transcript, now),
      testTime: extractTime(transcript, now),
      duration: extractDuration(transcript) || 90,
      questions: [{
        subject: extractSubject(transcript) || 'General',
        topic: extractTopic(transcript) || 'General',
        count: extractQuestionCount(transcript) || 5,
        difficulty: extractDifficulty(transcript) || 'easy'
      }]
    };
    
    return validateResponseData(extracted);
  };

  // Simple extraction functions
  const extractTestName = (text: string): string | null => {
    const patterns = [
      /(?:test|quiz)\s+(?:called|named|titled)\s+["']?(.+?)["']?(?:\s+(?:on|at|for|with|\d+\s+minutes?)\b|$)/i,
      /(?:called|named|titled)\s+["']?(.+?)["']?\s+(?:test|quiz)\b/i,
      /create\s+(?:a\s+)?(?:test|quiz)\s+(?:about|on|for)\s+["']?(.+?)["']?(?:\s+(?:on|at|for|with)\b|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().replace(/[.,!?]+$/, '');
      }
    }
    return null;
  };

  const extractDate = (text: string, now: Date): string => {
    const normalized = text.toLowerCase();
    const explicitDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (explicitDate) return explicitDate[1];
    if (normalized.includes('today')) return now.toISOString().split('T')[0];
    const date = new Date(now);
    if (normalized.includes('tomorrow')) date.setDate(date.getDate() + 1);
    else date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  };

  const extractTime = (text: string, now: Date): string => {
    const match = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (match) {
      let hour = Number(match[1]);
      const minute = Number(match[2] || 0);
      const meridiem = match[3].toLowerCase();
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    return new Date(now.getTime() + 60 * 60 * 1000).toTimeString().slice(0, 5);
  };

  const extractDuration = (text: string): number | null => {
    const range = text.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*(?:minute|min)/i);
    if (range) return Number(range[2]);
    const match = text.match(/(\d+)\s*(?:minute|min)/i);
    const result = match ? parseInt(match[1]) : null;
    return result;
  };

  const extractQuestionCount = (text: string): number | null => {
    const match = text.match(/(?:create|make|generate)?\s*(\d+)\s*(?:question|problem)/i);
    const result = match ? parseInt(match[1]) : null;
    return result;
  };

  const extractSubject = (text: string): string | null => {
    const availableSubjects = getAvailableFilters().subjects;
    for (const subject of availableSubjects) {
      if (subject && text.toLowerCase().includes(subject.toLowerCase())) {
        return subject;
      }
    }
    return null;
  };

  const extractTopic = (text: string): string | null => {
    const availableTopics = getAvailableFilters().topics;
    for (const topic of availableTopics) {
      if (topic && text.toLowerCase().includes(topic.toLowerCase())) {
        return topic;
      }
    }
    return null;
  };

  const extractDifficulty = (text: string): string | null => {
    if (text.toLowerCase().includes('hard') || text.toLowerCase().includes('difficult')) {
      return 'hard';
    }
    if (text.toLowerCase().includes('medium') || text.toLowerCase().includes('moderate')) {
      return 'medium';
    }
    if (text.toLowerCase().includes('easy') || text.toLowerCase().includes('simple')) {
      return 'easy';
    }
    return null;
  };

  const handleCreateTest = async () => {
    if (!testName.trim() || selectedQuestions.length === 0) {
      alert('Please enter a test name and select at least one question.');
      return;
    }

    if (!startDate || !startTime) {
      alert('Please select start date and time for the test.');
      return;
    }

    setIsCreating(true);
    
    try {
      const testKey = generateTestKey();

      const testData = {
        testKey,
        name: testName.trim(),
        description: testDescription.trim(),
        questions: randomizeQuestions ? shuffleArray([...selectedQuestions]) : selectedQuestions,
        startDate: new Date(`${startDate}T${startTime}`),
        endTime: endTime ? new Date(endTime) : undefined,
        duration,
        timeLimit: duration,
        settings: {
          randomizeQuestions,
          allowReview,
          showCorrectAnswers
        }
      };

      const result = await createTest(testData);
      
      if (result) {
        if (selectedBatchIds.length) {
          try {
            await assignTestToBatches(result.id, selectedBatchIds);
          } catch (assignError) {
            console.warn('Assign to batches failed:', assignError);
          }
        }
        const createdTest: Test = {
          id: result.id,
          testKey: result.test_key,
          name: result.name,
          description: result.description || '',
          questions: result.questions,
          createdAt: new Date(result.created_at),
          startDate: new Date(result.start_date),
          duration: result.duration ?? result.time_limit,
          timeLimit: result.duration ?? result.time_limit,
          settings: result.settings
        };

        alert(`Test created successfully! Test Key: ${result.test_key}`);
        onCreateTest(createdTest);
        
        // Reset form
        setTestName('');
        setTestDescription('');
        setSelectedQuestions([]);
        setStartDate('');
        setStartTime('');
        
        onBackToDashboard();
      }

    } catch (error) {
      alert(`Failed to create test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const getSelectedQuestionsByTopic = () => {
    const topicCounts = selectedQuestions.reduce((acc, question) => {
      const topic = question.topic || 'Unknown Topic';
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return topicCounts;
  };

  const selectedTopicCounts = getSelectedQuestionsByTopic();
  const estimatedDuration = duration;
  const averageDifficulty = selectedQuestions.length > 0 
    ? Math.round(selectedQuestions.reduce((sum, q) => {
        const difficultyScore = { easy: 1, medium: 2, hard: 3 }[getDifficulty(q)];
        return sum + difficultyScore;
      }, 0) / selectedQuestions.length)
    : 0;

  // Question context value
  const questionContextValue: QuestionContextType = {
    allQuestions,
    isLoading: questionsLoading,
    error: questionsError,
    refreshQuestions: loadQuestions,
    loadPage,
    pageSize,
    pageOffset,
    hasMore,
    totalCount,
    isFetching,
  };

  // Show loading state if questions are loading
  if (questionsLoading) {
    return (
      <div className="create-test-wrapper">
        <div className="loading-container">
          <Loader2 className="loading-spinner" />
          <h2>Loading Questions...</h2>
          <p>Please wait while we fetch your data</p>
        </div>
      </div>
    );
  }

  // Show error state if questions failed to load
  if (questionsError) {
    return (
      <div className="create-test-wrapper">
        <div className="error-container">
          <p className="error-message">{questionsError}</p>
          <button onClick={loadQuestions} className="retry-btn">
            Retry Loading Questions
          </button>
          <button onClick={onBackToDashboard} className="back-btn">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <QuestionContext.Provider value={questionContextValue}>
      <div className="create-test-wrapper">
        {/* Enhanced Header */}
        <header className="create-test-header">
          <div className="header-content">
            <div className="header-main">
              <div className="header-brand">
                <div className="brand-icon">
                  <BookOpen className="icon" />
                </div>
                <div className="brand-text">
                  <h1 className="brand-title">Create New Test</h1>
                  <p className="brand-subtitle">Build engaging assessments</p>
                </div>
              </div>
              
              <div className="header-actions">
                <button
                  onClick={() => {
                    setShowVoiceModal(true);
                  }}
                  className="action-btn voice-mode-btn"
                  title="Voice Mode - Create test by speaking"
                >
                  <Mic className="btn-icon" />
                  <span className="btn-text">Voice Mode</span>
                </button>

                <button
                  onClick={() => {
                    setShowPreview(!showPreview);
                  }}
                  className="action-btn secondary"
                >
                  {showPreview ? <EyeOff className="btn-icon" /> : <Eye className="btn-icon" />}
                  <span className="btn-text">{showPreview ? 'Hide' : 'Preview'}</span>
                </button>
                
                <button
                  onClick={onImportPdf}
                  className="action-btn"
                  title="Import questions from a PDF"
                >
                  <FileText className="btn-icon" />
                  <span className="btn-text">Import PDF</span>
                </button>

                <button
                  onClick={() => {
                    onBackToDashboard();
                  }}
                  className="action-btn primary"
                >
                  <Home className="btn-icon" />
                  <span className="btn-text">Dashboard</span>
                </button>
              </div>
            </div>
            
            <div className="progress-indicator">
              <div
                className={`progress-step ${createStep === 'questions' ? 'completed' : 'active'}`}
              >
                <div className="step-circle">
                  {createStep === 'questions' ? <CheckCircle className="step-icon" /> : '1'}
                </div>
                <span className="step-label">Setup</span>
              </div>
              <div
                className={`progress-connector ${createStep === 'questions' ? 'active' : ''}`}
              ></div>
              <div className={`progress-step ${createStep === 'questions' ? 'active' : ''}`}>
                <div className="step-circle">2</div>
                <span className="step-label">Questions</span>
              </div>
              <div className="progress-connector"></div>
              <div className="progress-step">
                <div className="step-circle">3</div>
                <span className="step-label">Review</span>
              </div>
            </div>
          </div>
        </header>

        <main className="create-test-main">
          <div className="main-content">
            {createStep === 'setup' && (
              <>
                <TestConfigSection
                  testName={testName}
                  setTestName={setTestName}
                  testDescription={testDescription}
                  setTestDescription={setTestDescription}
                  startDate={startDate}
                  setStartDate={setStartDate}
                  startTime={startTime}
                  setStartTime={setStartTime}
                  endTime={endTime}
                  setEndTime={setEndTime}
                  duration={duration}
                  setDuration={setDuration}
                  randomizeQuestions={randomizeQuestions}
                  setRandomizeQuestions={setRandomizeQuestions}
                  allowReview={allowReview}
                  setAllowReview={setAllowReview}
                  showCorrectAnswers={showCorrectAnswers}
                  setShowCorrectAnswers={setShowCorrectAnswers}
                  selectedTopicCounts={selectedTopicCounts}
                  estimatedDuration={estimatedDuration}
                  averageDifficulty={averageDifficulty}
                  selectedQuestionsCount={selectedQuestions.length}
                  isLoaded={isLoaded}
                />

                <section style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <h2 style={{ marginTop: 0, fontSize: 16 }}>Assign to batches (optional)</h2>
                  <p style={{ fontSize: 12, color: '#64748b' }}>Share this test with one or more of your batches. Students in those batches must be approved to access it.</p>
                  {teacherBatches.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No batches yet. Create one in /batches to assign this test.</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {teacherBatches.map(b => {
                        const on = selectedBatchIds.includes(b.id);
                        return (
                          <button key={b.id} type="button"
                            onClick={() => setSelectedBatchIds(on ? selectedBatchIds.filter(x => x !== b.id) : [...selectedBatchIds, b.id])}
                            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + (on ? '#2563eb' : '#cbd5e1'), background: on ? '#eff6ff' : 'transparent', cursor: 'pointer', fontSize: 12 }}>
                            {b.name} ({b.code})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <div className="wizard-cta">
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={() => setCreateStep('questions')}
                    disabled={!testName.trim() || !startDate || !startTime}
                  >
                    <ArrowRight size={16} /> Next: select questions
                  </button>
                </div>
              </>
            )}

            {createStep === 'questions' && (
              <>

                {/* Selected Questions Section */}
                <SelectedQuestionsSection
                  selectedQuestions={selectedQuestions}
                  setSelectedQuestions={setSelectedQuestions}
                  getDifficulty={getDifficulty}
                  isLoaded={isLoaded}
                />

                <QuestionSelectionSection
                  selectedQuestions={selectedQuestions}
                  setSelectedQuestions={setSelectedQuestions}
                  getDifficulty={getDifficulty}
                  isLoaded={isLoaded}
                />

                <div className="wizard-cta">
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={() => setCreateStep('setup')}
                  >
                    <ArrowLeft size={16} /> Back to setup
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Floating Action Button — Review step (only after questions chosen) */}
          {createStep === 'questions' && selectedQuestions.length > 0 && (
            <div className="floating-action-container">
              <div className="fab-summary">
                <div className="summary-stats">
                  <div className="summary-stat">
                    <span className="stat-value">{selectedQuestions.length}</span>
                    <span className="stat-label">Questions</span>
                  </div>
                  <div className="summary-stat">
                    <span className="stat-value">{estimatedDuration}</span>
                    <span className="stat-label">Minutes</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => {
                  handleCreateTest();
                }}
                disabled={!testName.trim() || isCreating || !startDate || !startTime}
                className={`create-test-fab ${isCreating ? 'creating' : ''}`}
              >
                {isCreating ? (
                  <div className="fab-content creating">
                    <div className="loading-spinner"></div>
                    <span>Creating...</span>
                  </div>
                ) : (
                  <div className="fab-content">
                    <Sparkles className="fab-icon" />
                    <span className="fab-text">Create Test</span>
                    <ArrowRight className="fab-arrow" />
                  </div>
                )}
              </button>
            </div>
          )}
        </main>

        {/* Voice Mode Modal */}
        {showVoiceModal && (
          <VoiceModeModal
            isOpen={showVoiceModal}
            onClose={() => {
              setShowVoiceModal(false);
              setVoiceTranscript('');
            }}
            isListening={isListening}
            transcript={voiceTranscript}
            isProcessing={isProcessingVoice}
            onStartRecording={() => {
              return startVoiceRecognition();
            }}
            onStopRecording={(recognition) => {
              if (recognition) {
                recognition.stop();
              }
              setIsListening(false);
            }}
            onProcessTranscript={() => {
              processVoiceInput(voiceTranscript);
            }}
          />
        )}
      </div>
    </QuestionContext.Provider>
  );
};

export default CreateTest;
