import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ExamEntry } from './ExamEntry';
import { ExamInterface } from './ExamInterface';
import { ResultsDisplay } from './ResultsDisplay';
import { LoadingScreen } from './LoadingScreen';
import { ErrorScreen } from './ErrorScreen';
import { useExamState } from '../../hooks/useExamState';
import { useExamTimer } from '../../hooks/useExamTimer';
import { getTestByKey, saveTestResult } from '../../lib/database'; // Import your database functions
import type { Test, ExamPhase, ExamSession, TestResult } from '../../types/exam.types';
import { Clock, Shield, AlertTriangle, RefreshCw, Home } from 'lucide-react';
import './styles.css';

interface ExamWrapperProps {
  testCode?: string;
  initialTest?: Test;
}

type ExamState = 'loading' | 'entry' | 'active' | 'results' | 'invalid' | 'too-early';

interface TimeInfo {
  canEnter: boolean;
  timeUntilEntry: number;
  timeUntilStart: number;
  isTestActive: boolean;
  hasTestEnded: boolean;
}

export const ExamWrapper: React.FC<ExamWrapperProps> = ({ 
  testCode: propTestCode, 
  initialTest 
}) => {
  // Get testCode from URL params if not provided as prop
  const { testCode: urlTestCode } = useParams<{ testCode: string }>();
  const testCode = propTestCode || urlTestCode;

  const [currentPhase, setCurrentPhase] = useState<ExamState>('loading');
  const [test, setTest] = useState<Test | null>(initialTest || null);
  const [studentName, setStudentName] = useState<string>('');
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const examState = useExamState();
  const examTimer = useExamTimer();

  // Update time every second for real-time countdown
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate time-based access logic
  const timeInfo = useMemo((): TimeInfo => {
    if (!test?.startDate) {
      return {
        canEnter: true,
        timeUntilEntry: 0,
        timeUntilStart: 0,
        isTestActive: true,
        hasTestEnded: false
      };
    }

    const testStart = new Date(test.startDate);
    const entryWindow = new Date(testStart.getTime() - 5 * 60 * 1000); // 5 minutes before
    const testEnd = test.endDate ? new Date(test.endDate) : null;

    const timeUntilEntry = Math.max(0, entryWindow.getTime() - currentTime.getTime());
    const timeUntilStart = Math.max(0, testStart.getTime() - currentTime.getTime());
    const canEnter = currentTime >= entryWindow && currentTime <= testStart;
    const isTestActive = currentTime >= testStart && (!testEnd || currentTime <= testEnd);
    const hasTestEnded = testEnd ? currentTime > testEnd : false;

    return {
      canEnter,
      timeUntilEntry,
      timeUntilStart,
      isTestActive,
      hasTestEnded
    };
  }, [test, currentTime]);

  // Initialize exam data - fetch from API
  useEffect(() => {
    if (testCode && !initialTest) {
      loadTest(testCode.toUpperCase());
    } else if (initialTest) {
      setTest(initialTest);
      setCurrentPhase('entry');
    } else {
      setError('No test code provided. Please use a valid test link.');
      setCurrentPhase('invalid');
    }
  }, [testCode, initialTest]);

  const loadTest = async (code: string) => {
    // Enhanced validation with better error messages
    if (!code) {
      setError('No test code provided. Please use a valid test link.');
      setCurrentPhase('invalid');
      return;
    }

    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setError('Invalid test code format. Test codes must be exactly 4 characters (letters and numbers only).');
      setCurrentPhase('invalid');
      return;
    }

    try {
      setCurrentPhase('loading');
      
      // Fetch actual test data from API
      const testData = await getTestByKey(code);
      
      if (!testData) {
        setError('Test not found. Please verify your test code with your instructor.');
        setCurrentPhase('invalid');
        return;
      }

      setTest(testData);
      
      // Determine initial state based on time
      if (testData.startDate) {
        const testStart = new Date(testData.startDate);
        const entryWindow = new Date(testStart.getTime() - 5 * 60 * 1000);
        const testEnd = testData.endDate ? new Date(testData.endDate) : null;
        
        const now = new Date();
        
        if (testEnd && now > testEnd) {
          setError('This test has already ended.');
          setCurrentPhase('invalid');
          return;
        }
        
        if (now < entryWindow) {
          setCurrentPhase('too-early');
          return;
        }
        
        if (now >= entryWindow && now <= testStart) {
          setCurrentPhase('entry');
          return;
        }
      }
      
      setCurrentPhase('entry');
    } catch (err) {
      console.error('Error loading test:', err);
      setError('Unable to connect to the test server. Please check your internet connection and try again.');
      setCurrentPhase('invalid');
    }
  };

  // Auto-transition from too-early to entry when time window opens
  useEffect(() => {
    if (currentPhase === 'too-early' && test && timeInfo.canEnter) {
      setCurrentPhase('entry');
    }
  }, [currentPhase, test, timeInfo.canEnter]);

  // Handle fullscreen mode
  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn('Fullscreen not supported or denied');
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('Failed to exit fullscreen');
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle student entry
  const handleStudentEntry = async (name: string) => {
    if (!test) return;

    try {
      setStudentName(name.trim());
      
      // Initialize exam session
      const session: ExamSession = {
        test,
        studentName: name.trim(),
        startTime: new Date(),
        state: {
          currentQuestionIndex: 0,
          answers: [],
          timeRemaining: test.timeLimit * 60, // Convert to seconds
          isSubmitted: false,
          bookmarkedQuestions: new Set(),
          visitedQuestions: new Set([test.questions[0]?.id].filter(Boolean)),
          reviewMode: false
        },
        settings: {
          showTimer: true,
          showProgress: true,
          allowNavigation: true,
          confirmSubmit: true
        }
      };

      setExamSession(session);
      examState.initialize(session.state);
      examTimer.start(session.state.timeRemaining);
      
      // Enter fullscreen for better exam experience
      await enterFullscreen();
      
      setCurrentPhase('active');
    } catch (err) {
      setError('Failed to start exam. Please try again.');
    }
  };

  // Handle exam submission
  const handleExamSubmission = async (finalAnswers: any[]) => {
    if (!test || !examSession) return;

    try {
      setCurrentPhase('loading');
      
      // Calculate results
      const result = calculateResults(test, finalAnswers, studentName);
      
      // Save result to database
      const savedResult = await saveTestResult({
        testId: test.id,
        studentName: studentName.trim(),
        answers: finalAnswers,
        score: result.correctAnswers,
        totalQuestions: test.questions.length
      });
      
      const finalResult = {
        ...result,
        completedAt: new Date(savedResult.completed_at)
      };
      
      setTestResult(finalResult);
      examTimer.stop();
      
      // Exit fullscreen
      await exitFullscreen();
      
      setCurrentPhase('results');
    } catch (err) {
      console.error('Error saving test result:', err);
      setError('Failed to submit exam. Your answers have been saved locally. Please try again or contact support.');
      setCurrentPhase('active');
    }
  };

  // Handle exam timeout
  useEffect(() => {
    if (examTimer.timeRemaining <= 0 && currentPhase === 'active') {
      // Auto-submit when time expires
      handleExamSubmission(examState.answers);
    }
  }, [examTimer.timeRemaining, currentPhase]);

  // Calculate exam results
  const calculateResults = (test: Test, answers: any[], studentName: string): TestResult => {
    let correctAnswers = 0;
    let incorrectAnswers = 0;
    let unansweredQuestions = 0;

    const topicWiseScore: { [topic: string]: { correct: number; total: number } } = {};

    test.questions.forEach(question => {
      // Initialize topic tracking
      if (!topicWiseScore[question.topic]) {
        topicWiseScore[question.topic] = { correct: 0, total: 0 };
      }
      topicWiseScore[question.topic].total++;

      // Check answer
      const studentAnswer = answers.find(a => a.questionId === question.id);
      
      if (studentAnswer === undefined) {
        unansweredQuestions++;
      } else if (studentAnswer.selectedOption === question.correctAnswer) {
        correctAnswers++;
        topicWiseScore[question.topic].correct++;
      } else {
        incorrectAnswers++;
      }
    });

    const percentage = Math.round((correctAnswers / test.questions.length) * 100);
    const timeTaken = (test.timeLimit * 60) - examTimer.timeRemaining;

    return {
      testId: test.id,
      studentName,
      answers,
      score: correctAnswers,
      totalQuestions: test.questions.length,
      correctAnswers,
      incorrectAnswers,
      unansweredQuestions,
      percentage,
      timeTaken,
      completedAt: new Date(),
      topicWiseScore
    };
  };

  const handleRetry = () => {
    setError('');
    if (testCode) {
      loadTest(testCode.toUpperCase());
    }
  };

  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Render appropriate component based on current phase
  const renderCurrentPhase = () => {
    switch (currentPhase) {
      case 'loading':
        return (
          <LoadingScreen 
            message="Loading your exam..."
            submessage="Please wait while we fetch the questions from the server"
          />
        );

      case 'too-early':
        return test ? (
          <div className="too-early-screen">
            <div className="too-early-content">
              <div className="clock-animation">
                <Clock />
              </div>
              
              <h1 className="too-early-title">Test Registration Opens Soon</h1>
              <p className="too-early-subtitle">
                You can enter your details <strong>5 minutes</strong> before the test begins
              </p>
              
              <div className="time-display">
                <div className="time-card">
                  <div className="time-label">Registration opens in</div>
                  <div className="time-value">{formatTime(timeInfo.timeUntilEntry)}</div>
                </div>
                
                <div className="time-card">
                  <div className="time-label">Test starts in</div>
                  <div className="time-value">{formatTime(timeInfo.timeUntilStart)}</div>
                </div>
              </div>
              
              <div className="test-info">
                <h3>{test.title}</h3>
                <div className="test-details">
                  <span className="detail">
                    <Shield />
                    {test.questions.length} Questions
                  </span>
                  <span className="detail">
                    <Clock />
                    {test.timeLimit ? `${test.timeLimit} minutes` : 'No time limit'}
                  </span>
                </div>
              </div>
              
              <button onClick={handleRetry} className="btn-secondary refresh-btn">
                <RefreshCw />
                Refresh
              </button>
            </div>
          </div>
        ) : null;

      case 'entry':
        return test ? (
          <ExamEntry
            test={test}
            onStartExam={handleStudentEntry}
            onError={(error) => {
              setError(error);
              setCurrentPhase('invalid');
            }}
            timeInfo={timeInfo}
          />
        ) : null;

      case 'active':
        return (test && examSession) ? (
          <ExamInterface
            test={test}
            examSession={examSession}
            examState={examState}
            examTimer={examTimer}
            onSubmitExam={handleExamSubmission}
            onError={(error) => {
              setError(error);
            }}
            isFullscreen={isFullscreen}
            onToggleFullscreen={isFullscreen ? exitFullscreen : enterFullscreen}
          />
        ) : null;

      case 'results':
        return (test && testResult) ? (
          <ResultsDisplay
            test={test}
            result={testResult}
            onRetakeExam={() => {
              setCurrentPhase('entry');
              setTestResult(null);
              setExamSession(null);
              examState.reset();
              examTimer.reset();
            }}
          />
        ) : null;

      case 'invalid':
      default:
        return (
          <ErrorScreen
            title="Exam Unavailable"
            message={error || "The requested exam could not be loaded."}
            onRetry={handleRetry}
            onGoHome={() => {
              window.location.href = '/';
            }}
          />
        );
    }
  };

  return (
    <div className="exam-app">
      {renderCurrentPhase()}
    </div>
  );
};

export default ExamWrapper;
