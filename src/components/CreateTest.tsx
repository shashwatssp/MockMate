import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  Home, 
  CheckCircle, 
  BookOpen, 
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  Loader2,
  Mic,
  MicOff,
  Zap,
  Star
} from 'lucide-react';
import { TestConfigSection } from './TestConfigSection';
import { QuestionSelectionSection } from './QuestionSelectionSection';
import { SelectedQuestionsSection } from './SelectedQuestionsSection';
import { VoiceModeModal } from './VoiceModeModal';
import { createTest, getQuestions } from '../lib/database';
import type { Question, Test } from '../types';
import './CreateTest.css';
import populateDatabase from '../scripts/populateQuestions';

interface CreateTestProps {
  onBackToDashboard: () => void;
  onCreateTest: (test: Test) => void;
}

type DifficultyLevel = 'easy' | 'medium' | 'hard';

// Question Storage Context
interface QuestionContextType {
  allQuestions: Question[];
  isLoading: boolean;
  error: string | null;
  refreshQuestions: () => Promise<void>;
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

export const CreateTest: React.FC<CreateTestProps> = ({ onBackToDashboard, onCreateTest }) => {
  
  // Basic test configuration state
  const [testName, setTestName] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [timeLimit, setTimeLimit] = useState(2);
  const [isCreating, setIsCreating] = useState(false);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(90);
  
  // Question storage state
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  
  // Voice mode state
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
    loadQuestions();
  }, []);

  // Load questions from Supabase and store them
  const loadQuestions = async () => {
    try {
      setQuestionsLoading(true);
      setQuestionsError(null);
      
      const questions = await getQuestions();
      setAllQuestions(questions);
    } catch (error) {
      setQuestionsError('Failed to load questions. Please try again.');
    } finally {
      setQuestionsLoading(false);
    }
  };

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

    recognition.onerror = (event: any) => {
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
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      
      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      
      if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key not found');
      }
      
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      
      // Use gemini-1.5-flash with generation config for JSON output
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      });

      const availableFilters = getAvailableFilters();

      const prompt = `
Extract test creation details from this voice input: "${transcript}"

You must return ONLY a valid JSON object with exactly these fields:
{
  "testName": "extracted test name or 'Sample Test' if not specified",
  "testDate": "extracted date in YYYY-MM-DD format or today's date",
  "testTime": "extracted time in HH:MM format or current time + 1 hour",
  "duration": 90,
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
- Duration should be a number (90 minutes default)
- Count should be a number (5 questions default)
- Difficulty must be exactly: "easy", "medium", or "hard"
- Subject and topic must match available options or use "General" as fallback
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const rawText = response.text();
      
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
      if (error.message.includes('404')) {
        alert('AI model not available. Please try again later.');
      } else if (error.message.includes('API key')) {
        alert('API configuration error. Please check your Gemini API key.');
      } else if (error.message.includes('quota') || error.message.includes('limit')) {
        alert('API quota exceeded. Please try again later.');
      } else {
        alert('Failed to process voice input. Please check your configuration.');
      }
    } finally {
      setIsProcessingVoice(false);
    }
  };

const applyVoiceData = async (data: any) => {
    // Set basic test details
    if (data.testName) {
      setTestName(data.testName);
    }
    if (data.testDate) {
      setStartDate(data.testDate);
    }
    if (data.testTime) {
      setStartTime(data.testTime);
    }
    if (data.duration) {
      setDuration(data.duration);
    }

    // Select questions based on criteria
    console.log('🔍 === QUESTION SELECTION PHASE ===');
    console.log('🔍 Total available questions:', allQuestions.length);
    console.log('🔍 Current selected questions:', selectedQuestions.length);
    console.log('🔍 Data.questions structure:', data.questions);
    console.log('🔍 Is data.questions an array?', Array.isArray(data.questions));
    
    let questionsToSelect: Question[] = [];

    if (data.questions && Array.isArray(data.questions)) {
      console.log('📋 Processing', data.questions.length, 'question criteria');
      
      for (let i = 0; i < data.questions.length; i++) {
        const criteria = data.questions[i];
        console.log(`\n🔍 === PROCESSING CRITERIA ${i + 1}/${data.questions.length} ===`);
        console.log('🔍 Criteria:', JSON.stringify(criteria, null, 2));
        
        console.log('🔍 Filtering questions...');
        console.log('   - Looking for subject:', criteria.subject || 'Any');
        console.log('   - Looking for topic:', criteria.topic || 'Any');
        console.log('   - Looking for difficulty:', criteria.difficulty || 'Any');
        console.log('   - Requested count:', criteria.count || 5);
        
        console.log('🔍 Starting question filtering process...');
        console.log('🔍 Available questions to filter:', allQuestions.length);
        
        const matchingQuestions = allQuestions.filter((q, questionIndex) => {
          console.log(`\n   🔍 Checking question ${questionIndex + 1}/${allQuestions.length} (ID: ${q.id})`);
          
          // Null-safe string comparisons with detailed logging
          const questionSubject = q.subject || '';
          const questionTopic = q.topic || '';
          const criteriaSubject = criteria.subject || '';
          const criteriaTopic = criteria.topic || '';
          
          console.log(`   📋 Question details:`);
          console.log(`      - Subject: "${questionSubject}"`);
          console.log(`      - Topic: "${questionTopic}"`);
          console.log(`      - Difficulty: "${getDifficulty(q)}"`);
          console.log(`      - Text preview: "${q.text?.substring(0, 30)}..."`);
          
          console.log(`   📋 Criteria to match:`);
          console.log(`      - Subject: "${criteriaSubject}"`);
          console.log(`      - Topic: "${criteriaTopic}"`);
          console.log(`      - Difficulty: "${criteria.difficulty}"`);
          
          // Relaxed subject matching - treat empty subjects as matching "General"
          const subjectMatch = !criteriaSubject || 
            criteriaSubject === 'General' ||
            questionSubject === '' ||  // Empty subject matches General
            questionSubject.toLowerCase().includes(criteriaSubject.toLowerCase());
          
          console.log(`   ✓ Subject match check:`);
          console.log(`      - No criteria subject: ${!criteriaSubject}`);
          console.log(`      - Is General: ${criteriaSubject === 'General'}`);
          console.log(`      - Question subject empty: ${questionSubject === ''}`);
          console.log(`      - Contains match: ${questionSubject.toLowerCase().includes(criteriaSubject.toLowerCase())}`);
          console.log(`      - Final subject match: ${subjectMatch}`);
            
          // Relaxed topic matching
          const topicMatch = !criteriaTopic || 
            criteriaTopic === 'General' ||
            criteriaTopic === '' ||
            criteriaTopic === null ||
            questionTopic.toLowerCase().includes(criteriaTopic.toLowerCase()) ||
            criteriaTopic.toLowerCase().includes(questionTopic.toLowerCase()); // Bidirectional matching
          
          console.log(`   ✓ Topic match check:`);
          console.log(`      - No criteria topic: ${!criteriaTopic}`);
          console.log(`      - Is General: ${criteriaTopic === 'General'}`);
          console.log(`      - Is empty string: ${criteriaTopic === ''}`);
          console.log(`      - Is null: ${criteriaTopic === null}`);
          console.log(`      - Forward match: ${questionTopic.toLowerCase().includes(criteriaTopic.toLowerCase())}`);
          console.log(`      - Reverse match: ${criteriaTopic.toLowerCase().includes(questionTopic.toLowerCase())}`);
          console.log(`      - Final topic match: ${topicMatch}`);
          
          // More flexible difficulty matching - if criteria asks for "easy" but no easy questions exist, 
          // allow medium, and if no medium, allow hard
          let difficultyMatch = !criteria.difficulty;
          
          if (criteria.difficulty) {
            const questionDifficulty = getDifficulty(q);
            const requestedDifficulty = criteria.difficulty.toLowerCase();
            
            if (requestedDifficulty === 'easy') {
              // For easy: accept easy first, then medium, then hard
              difficultyMatch = questionDifficulty === 'easy' || 
                              questionDifficulty === 'medium' || 
                              questionDifficulty === 'hard';
            } else if (requestedDifficulty === 'medium') {
              // For medium: accept medium first, then easy, then hard
              difficultyMatch = questionDifficulty === 'medium' || 
                              questionDifficulty === 'easy' || 
                              questionDifficulty === 'hard';
            } else if (requestedDifficulty === 'hard') {
              // For hard: accept hard first, then medium, then easy
              difficultyMatch = questionDifficulty === 'hard' || 
                              questionDifficulty === 'medium' || 
                              questionDifficulty === 'easy';
            } else {
              // Unknown difficulty, accept all
              difficultyMatch = true;
            }
          }
          
          console.log(`   ✓ Difficulty match check:`);
          console.log(`      - No criteria difficulty: ${!criteria.difficulty}`);
          console.log(`      - Question difficulty: ${getDifficulty(q)}`);
          console.log(`      - Criteria difficulty: ${criteria.difficulty?.toLowerCase()}`);
          console.log(`      - Final difficulty match: ${difficultyMatch}`);
          
          const matches = subjectMatch && topicMatch && difficultyMatch;
          
          console.log(`   🎯 FINAL MATCH RESULT: ${matches}`);
          console.log(`      - Subject: ${subjectMatch}`);
          console.log(`      - Topic: ${topicMatch}`);
          console.log(`      - Difficulty: ${difficultyMatch}`);
          
          if (matches) {
            console.log(`   ✅ Question ${q.id} MATCHES all criteria`);
          } else {
            console.log(`   ❌ Question ${q.id} does NOT match criteria`);
          }
          
          return matches;
        });

        console.log(`📊 FILTERING RESULTS FOR CRITERIA ${i + 1}:`);
        console.log(`📊 - Total questions checked: ${allQuestions.length}`);
        console.log(`📊 - Matching questions found: ${matchingQuestions.length}`);
        
        if (matchingQuestions.length === 0) {
          console.log('⚠️ No questions found for this criteria, trying more relaxed matching...');
          
          // Fallback: if no matches found, try topic-only matching (ignore subject and difficulty)
          const fallbackQuestions = allQuestions.filter(q => {
            const questionTopic = q.topic || '';
            const criteriaTopic = criteria.topic || '';
            
            return !criteriaTopic || 
                   criteriaTopic === 'General' ||
                   questionTopic.toLowerCase().includes(criteriaTopic.toLowerCase()) ||
                   criteriaTopic.toLowerCase().includes(questionTopic.toLowerCase());
          });
          
          console.log(`📊 Fallback matching found: ${fallbackQuestions.length} questions`);
          
          if (fallbackQuestions.length > 0) {
            const shuffled = shuffleArray(fallbackQuestions);
            const requestedCount = criteria.count || 5;
            const selected = shuffled.slice(0, requestedCount);
            questionsToSelect = [...questionsToSelect, ...selected];
            console.log(`✅ Used fallback selection: ${selected.length} questions`);
            continue;
          }
          
          console.log('⚠️ Even fallback matching failed, skipping criteria...');
          console.log('⚠️ Criteria that failed to match any questions:', criteria);
          continue;
        }
        
        // Log some sample matching questions
        console.log('📋 Sample matching questions:');
        matchingQuestions.slice(0, 3).forEach((q, idx) => {
          console.log(`   ${idx + 1}. ID: ${q.id} | Subject: "${q.subject}" | Topic: "${q.topic}" | Difficulty: "${getDifficulty(q)}" | Text: "${q.text?.substring(0, 30)}..."`);
        });

        // Shuffle and take requested count
        console.log('🔀 Shuffling matching questions...');
        const shuffled = shuffleArray(matchingQuestions);
        console.log('✅ Questions shuffled');
        
        const requestedCount = criteria.count || 5;
        const selected = shuffled.slice(0, requestedCount);
        console.log(`🎯 Selected ${selected.length} out of ${requestedCount} requested questions`);
        
        // Log selected questions
        console.log('📋 Selected questions for this criteria:');
        selected.forEach((q, idx) => {
          console.log(`   ${idx + 1}. ID: ${q.id} | Subject: "${q.subject}" | Topic: "${q.topic}" | Difficulty: "${getDifficulty(q)}"`);
        });
        
        questionsToSelect = [...questionsToSelect, ...selected];
        console.log(`📊 Total questions to select so far: ${questionsToSelect.length}`);
      }
    } else {
      console.log('⚠️ No valid question criteria provided, selecting random questions');
      console.log('⚠️ data.questions type:', typeof data.questions);
      console.log('⚠️ data.questions value:', data.questions);
      
      // Fallback: select 15 random questions if no criteria provided
      const shuffled = shuffleArray(allQuestions);
      questionsToSelect = shuffled.slice(0, 15);
      console.log(`📊 Selected ${questionsToSelect.length} random questions as fallback`);
    }

    // Final fallback: if still no questions selected, take random questions
    if (questionsToSelect.length === 0) {
      console.log('🚨 === EMERGENCY FALLBACK ===');
      console.log('🚨 No questions selected through any criteria, selecting random questions');
      const shuffled = shuffleArray(allQuestions);
      questionsToSelect = shuffled.slice(0, 15);
      console.log(`🚨 Emergency fallback: selected ${questionsToSelect.length} random questions`);
    }

    // Remove duplicates
    console.log('🔄 === REMOVING DUPLICATES ===');
    console.log('🔄 Questions before deduplication:', questionsToSelect.length);
    
    const uniqueQuestions = questionsToSelect.filter((q, index, self) => {
      const isDuplicate = index !== self.findIndex(sq => sq.id === q.id);
      if (isDuplicate) {
        console.log(`   🗑️ Removing duplicate question ID: ${q.id}`);
      }
      return !isDuplicate;
    });

    console.log('✅ Questions after deduplication:', uniqueQuestions.length);
    
    // Log final selection summary
    console.log('📊 === FINAL SELECTION SUMMARY ===');
    console.log('📊 Total unique questions selected:', uniqueQuestions.length);
    
    // Group by subject and topic for summary
    const summary = uniqueQuestions.reduce((acc, q) => {
      const subject = q.subject || 'Unknown';
      const topic = q.topic || 'Unknown';
      const difficulty = getDifficulty(q);
      
      if (!acc[subject]) acc[subject] = {};
      if (!acc[subject][topic]) acc[subject][topic] = { easy: 0, medium: 0, hard: 0 };
      acc[subject][topic][difficulty]++;
      
      return acc;
    }, {} as Record<string, Record<string, Record<string, number>>>);
    
    console.log('📊 Selection summary by subject/topic/difficulty:');
    Object.entries(summary).forEach(([subject, topics]) => {
      console.log(`   📚 ${subject}:`);
      Object.entries(topics).forEach(([topic, difficulties]) => {
        const total = Object.values(difficulties).reduce((sum, count) => sum + count, 0);
        console.log(`      📖 ${topic}: ${total} questions (Easy: ${difficulties.easy}, Medium: ${difficulties.medium}, Hard: ${difficulties.hard})`);
      });
    });
    
    setSelectedQuestions(uniqueQuestions);
    setShowVoiceModal(false);
    setVoiceTranscript('');
  };


  // Enhanced clean JSON response function
  const cleanJsonResponse = (text: string): string => {
    // Remove markdown code blocks
    let cleaned = text.replace(/``````\s*/g, '');
    
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
  const validateResponseData = (data: any) => {
    const validated = {
      testName: data.testName || 'Sample Test',
      testDate: data.testDate || new Date().toISOString().split('T')[0],
      testTime: data.testTime || new Date(Date.now() + 3600000).toTimeString().slice(0, 5),
      duration: typeof data.duration === 'number' ? data.duration : 90,
      questions: Array.isArray(data.questions) ? data.questions.map((q: any) => {
        return {
          subject: q.subject || 'General',
          topic: q.topic || 'General',
          count: typeof q.count === 'number' ? q.count : 5,
          difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'easy'
        };
      }) : [{
        subject: 'General',
        topic: 'General',
        count: 5,
        difficulty: 'easy'
      }]
    };
    
    return validated;
  };

  // Manual extraction fallback
  const extractDataManually = (transcript: string) => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    
    const extracted = {
      testName: extractTestName(transcript) || 'Voice Created Test',
      testDate: tomorrow.toISOString().split('T')[0],
      testTime: oneHourLater.toTimeString().slice(0, 5),
      duration: extractDuration(transcript) || 90,
      questions: [{
        subject: extractSubject(transcript) || 'General',
        topic: extractTopic(transcript) || 'General',
        count: extractQuestionCount(transcript) || 5,
        difficulty: extractDifficulty(transcript) || 'easy'
      }]
    };
    
    return extracted;
  };

  // Simple extraction functions
  const extractTestName = (text: string): string | null => {
    const patterns = [
      /test.{0,10}(?:called|named|titled)\s+(.+?)(?:\s|$)/i,
      /create.{0,10}test.{0,10}(.+?)(?:\s|$)/i,
      /(?:called|named)\s+(.+?)\s+test/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  };

  const extractDuration = (text: string): number | null => {
    const match = text.match(/(\d+)\s*(?:minute|min)/i);
    const result = match ? parseInt(match[1]) : null;
    return result;
  };

  const extractQuestionCount = (text: string): number | null => {
    const match = text.match(/(\d+)\s*(?:question|problem)/i);
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
        duration,
        timeLimit,
        settings: {
          randomizeQuestions,
          allowReview,
          showCorrectAnswers
        }
      };

      const result = await createTest(testData);
      
      if (result) {
        const createdTest: Test = {
          id: result.id,
          testKey: result.test_key,
          name: result.name,
          description: result.description || '',
          questions: result.questions,
          createdAt: new Date(result.created_at),
          startDate: new Date(result.start_date),
          duration: result.duration,
          timeLimit: result.time_limit,
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
  const estimatedDuration = selectedQuestions.length * timeLimit;
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
    refreshQuestions: loadQuestions
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
                  <Star className="feature-badge" />
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
              <div className="progress-step completed">
                <div className="step-circle">
                  <CheckCircle className="step-icon" />
                </div>
                <span className="step-label">Setup</span>
              </div>
              <div className="progress-connector active"></div>
              <div className="progress-step active">
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
            <TestConfigSection
              testName={testName}
              setTestName={setTestName}
              testDescription={testDescription}
              setTestDescription={setTestDescription}
              timeLimit={timeLimit}
              setTimeLimit={setTimeLimit}
              startDate={startDate}
              setStartDate={setStartDate}
              startTime={startTime}
              setStartTime={setStartTime}
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
          </div>

          {/* Floating Action Button */}
          {selectedQuestions.length > 0 && (
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
