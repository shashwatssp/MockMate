import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import StudentEntry from './StudentEntry';
import StudentTest from './StudentTest';
import TestResult from './TestResult';
import { getTestByKey, saveTestResult } from '../lib/database';
import type { Test, StudentAnswer, TestResult as TestResultType } from '../types';
import { BookOpen, Loader, AlertTriangle, RefreshCw, Home, Clock, Shield } from 'lucide-react';
import './StudentTestWrapperOld.css';

type StudentTestState = 'loading' | 'waiting' | 'entry' | 'testing' | 'completed' | 'invalid' | 'too-early';

interface TimeInfo {
  canEnter: boolean;
  timeUntilEntry: number;
  timeUntilStart: number;
  isTestActive: boolean;
  hasTestEnded: boolean;
}

export const StudentTestWrapperOld: React.FC = () => {
  const { testCode } = useParams<{ testCode: string }>();
  const [state, setState] = useState<StudentTestState>('loading');
  const [test, setTest] = useState<Test | null>(null);
  const [studentName, setStudentName] = useState('');
  const [testResult, setTestResult] = useState<TestResultType | null>(null);
  const [error, setError] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());

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

  useEffect(() => {
    if (testCode) {
      loadTest(testCode.toUpperCase());
    } else {
      setState('invalid');
    }
  }, [testCode]);

  const loadTest = async (code: string) => {
    // Enhanced validation with better error messages
    if (!code) {
      setError('No test code provided. Please use a valid test link.');
      setState('invalid');
      return;
    }

    if (!/^[A-Z0-9]{4}$/.test(code)) {
      setError('Invalid test code format. Test codes must be exactly 4 characters (letters and numbers only).');
      setState('invalid');
      return;
    }

    try {
      setState('loading');
      const testData = await getTestByKey(code);
      
      if (!testData) {
        setError('Test not found. Please verify your test code with your instructor.');
        setState('invalid');
        return;
      }

      setTest(testData);
      
      // Determine initial state based on time
      if (testData.startDate) {
        const { canEnter, hasTestEnded, timeUntilEntry } = timeInfo;
        
        if (hasTestEnded) {
          setError('This test has already ended.');
          setState('invalid');
          return;
        }
        
        if (timeUntilEntry > 0) {
          setState('too-early');
          return;
        }
        
        if (canEnter) {
          setState('entry');
          return;
        }
      }
      
      setState('entry');
    } catch (error) {
      console.error('Error loading test:', error);
      setError('Unable to connect to the test server. Please check your internet connection and try again.');
      setState('invalid');
    }
  };

  // Auto-transition from too-early to entry when time window opens
  useEffect(() => {
    if (state === 'too-early' && test && timeInfo.canEnter) {
      setState('entry');
    }
  }, [state, test, timeInfo.canEnter]);

  const handleStudentEntry = (name: string) => {
    setStudentName(name.trim());
    setState('testing');
  };

  const handleTestSubmit = async (answers: StudentAnswer[]) => {
    if (!test) return;

    try {
      // Calculate score with detailed analytics
      let correctAnswers = 0;
      const detailedAnswers = answers.map(answer => {
        const question = test.questions.find(q => q.id === answer.questionId);
        const isCorrect = question && question.correctAnswer === answer.selectedOption;
        if (isCorrect) correctAnswers++;
        
        return {
          ...answer,
          isCorrect,
          correctAnswer: question?.correctAnswer
        };
      });

      const result: Omit<TestResultType, 'completedAt'> = {
        testId: test.id,
        studentName: studentName.trim(),
        answers,
        score: correctAnswers,
        totalQuestions: test.questions.length
      };

      setState('loading'); // Show loading while saving
      const savedResult = await saveTestResult(result);
      
      setTestResult({
        ...result,
        completedAt: new Date(savedResult.completed_at)
      });
      
      setState('completed');
    } catch (error) {
      console.error('Error saving test result:', error);
      setError('Failed to submit your test. Your answers are saved locally. Please try again or contact support.');
      // Don't change state - let them retry submission
    }
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

  // Enhanced Loading Screen
  if (state === 'loading') {
    return (
      <div className="student-test-wrapper">
        <div className="loading-screen">
          <div className="loading-content">
            <div className="loading-animation">
              <div className="book-icon">
                <BookOpen />
              </div>
              <div className="spinner">
                <Loader />
              </div>
            </div>
            
            <h2 className="loading-title">Loading Your Test</h2>
            <p className="loading-subtitle">Please wait while we prepare everything for you...</p>
            
            <div className="loading-steps">
              <div className="step active">
                <div className="step-indicator"></div>
                <span>Verifying test code</span>
              </div>
              <div className="step">
                <div className="step-indicator"></div>
                <span>Loading questions</span>
              </div>
              <div className="step">
                <div className="step-indicator"></div>
                <span>Preparing interface</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Too Early Screen with Live Countdown
  if (state === 'too-early' && test) {
    return (
      <div className="student-test-wrapper">
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
            
            <div className="waiting-tips">
              <h4>While you wait:</h4>
              <ul>
                <li>Ensure you have a stable internet connection</li>
                <li>Close unnecessary browser tabs</li>
                <li>Have a pen and paper ready if needed</li>
                <li>Find a quiet, well-lit place</li>
              </ul>
            </div>
            
            <button 
              onClick={handleRetry} 
              className="btn-secondary refresh-btn"
            >
              <RefreshCw />
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Enhanced Invalid/Error Screen
  if (state === 'invalid') {
    return (
      <div className="student-test-wrapper">
        <div className="invalid-screen">
          <div className="invalid-content">
            <div className="error-icon">
              <AlertTriangle />
            </div>
            
            <h1 className="error-title">Unable to Load Test</h1>
            <p className="error-message">{error}</p>
            
            <div className="troubleshooting">
              <h3>Troubleshooting Steps:</h3>
              <div className="troubleshooting-grid">
                <div className="troubleshooting-item">
                  <div className="item-number">1</div>
                  <div>
                    <strong>Check your test code</strong>
                    <p>Ensure it's exactly 4 characters with no extra spaces</p>
                  </div>
                </div>
                <div className="troubleshooting-item">
                  <div className="item-number">2</div>
                  <div>
                    <strong>Verify the time</strong>
                    <p>Make sure the test hasn't started or ended</p>
                  </div>
                </div>
                <div className="troubleshooting-item">
                  <div className="item-number">3</div>
                  <div>
                    <strong>Check your connection</strong>
                    <p>Ensure you have a stable internet connection</p>
                  </div>
                </div>
                <div className="troubleshooting-item">
                  <div className="item-number">4</div>
                  <div>
                    <strong>Contact support</strong>
                    <p>Reach out to your instructor for assistance</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="action-buttons">
              <button 
                onClick={handleRetry}
                className="btn-primary retry-btn"
              >
                <RefreshCw />
                Try Again
              </button>
              
              <button 
                onClick={() => window.location.href = '/'}
                className="btn-secondary home-btn"
              >
                <Home />
                Go Home
              </button>
            </div>
            
            <div className="help-text">
              <p>
                <strong>Still having trouble?</strong> 
                Save this error message and contact your instructor: <code>{error}</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Component Renders
  if (state === 'entry' && test) {
    return (
      <div className="student-test-wrapper">
        <StudentEntry 
          test={test}
          onStartTest={handleStudentEntry}
          timeInfo={timeInfo}
        />
      </div>
    );
  }

  if (state === 'testing' && test) {
    return (
      <div className="student-test-wrapper">
        <StudentTest 
          test={test}
          studentName={studentName}
          onSubmitTest={handleTestSubmit}
        />
      </div>
    );
  }

  if (state === 'completed' && testResult && test) {
    return (
      <div className="student-test-wrapper">
        <TestResult 
          test={test}
          studentName={testResult.studentName}
          answers={testResult.answers}
          score={testResult.score}
        />
      </div>
    );
  }

  // Fallback error state
  return (
    <div className="student-test-wrapper">
      <div className="fallback-error">
        <AlertTriangle />
        <h2>Unexpected Error</h2>
        <p>Something went wrong. Please refresh the page or contact support.</p>
        <button onClick={handleRetry} className="btn-primary">
          <RefreshCw />
          Refresh Page
        </button>
      </div>
    </div>
  );
};

export default StudentTestWrapperOld;
