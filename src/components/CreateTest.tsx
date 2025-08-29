import React, { useState, useEffect } from 'react';
import { 
  Home, 
  CheckCircle, 
  BookOpen, 
  Clock, 
  Users, 
  Eye,
  EyeOff,
  Target,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Loader2
} from 'lucide-react';
import { TestConfigSection } from './TestConfigSection';
import { QuestionSelectionSection } from './QuestionSelectionSection';
// Remove the dummyQuestions import - we'll get from Supabase instead
// import { dummyQuestions } from '../data/dummyQuestions';
import { createTest, getQuestions } from '../lib/database';
import type { Question, Test } from '../types';
import './CreateTest.css';

interface CreateTestProps {
  onBackToDashboard: () => void;
  onCreateTest: (test: Test) => void;
}

type DifficultyLevel = 'easy' | 'medium' | 'hard';

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
  
  // New state for questions from Supabase
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoaded(true);
    loadQuestions();
  }, []);

  // Load questions from Supabase
  const loadQuestions = async () => {
    try {
      setQuestionsLoading(true);
      setQuestionsError(null);
      const questions = await getQuestions();
      setAvailableQuestions(questions);
    } catch (error) {
      console.error('Error loading questions:', error);
      setQuestionsError('Failed to load questions. Please try again.');
    } finally {
      setQuestionsLoading(false);
    }
  };

  const getDifficulty = (question: Question): DifficultyLevel => {
    const textLength = question.text.length;
    const optionsCount = question.options.length;
    
    if (textLength < 50 && optionsCount <= 3) return 'easy';
    if (textLength > 100 || optionsCount >= 5) return 'hard';
    return 'medium';
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
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

      // Prepare test data for Supabase
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

      // Create test in Supabase
      const result = await createTest(testData);
      
      if (result) {
        // Create Test object for local state
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
      console.error('Error creating test:', error);
      alert(`Failed to create test: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const getSelectedQuestionsByTopic = () => {
    const topicCounts = selectedQuestions.reduce((acc, question) => {
      acc[question.topic] = (acc[question.topic] || 0) + 1;
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

  // Show loading state if questions are loading
  if (questionsLoading) {
    return (

        <div className="loading-container">
          <Loader2 className="loading-spinner" />
          <h2>Loading Questions...</h2>
          <p>Please wait while we fetch your data</p>
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
                onClick={() => setShowPreview(!showPreview)}
                className="action-btn secondary"
              >
                {showPreview ? <EyeOff className="btn-icon" /> : <Eye className="btn-icon" />}
                <span className="btn-text">{showPreview ? 'Hide' : 'Preview'}</span>
              </button>
              
              <button
                onClick={onBackToDashboard}
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

          <QuestionSelectionSection
            selectedQuestions={selectedQuestions}
            setSelectedQuestions={setSelectedQuestions}
            dummyQuestions={availableQuestions} // Use questions from Supabase
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
              onClick={handleCreateTest}
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
    </div>
  );
};

export default CreateTest;
