import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ExamEntry } from './ExamEntry';
import { ExamInterface } from './ExamInterface';
import { ResultsDisplay } from './ResultsDisplay';
import { LoadingScreen } from './LoadingScreen';
import { ErrorScreen } from './ErrorScreen';
import { useExamState } from '../../hooks/useExamState';
import { useExamTimer } from '../../hooks/useExamTimer';
import { getTestByKey, hasStudentTakenTest, saveTestResult } from '../../lib/database';
import { scoreQuestions } from '../../lib/score'; // Import your database functions
import type { Test, ExamSession, TestResult, StudentAnswer } from '../../types/exam.types';
import { Clock, Shield, RefreshCw } from 'lucide-react';
import './styles.css';

interface ExamWrapperProps {
  testCode?: string;
  initialTest?: Test;
}

type ExamState = 'loading' | 'entry' | 'active' | 'results' | 'invalid' | 'too-early' | 'expired';

type PersistedExamSnapshot = {
  phase: 'entry' | 'active' | 'results';
  test: Test;
  studentName: string;
  startTime: string;
  isPracticeMode?: boolean;
  state?: {
    currentQuestionIndex: number;
    answers: ExamSession['state']['answers'];
    timeRemaining: number;
    isSubmitted: boolean;
    bookmarkedQuestions: string[];
    visitedQuestions: string[];
    reviewMode: boolean;
  };
  deadline?: number;
  result?: TestResult;
};

const getExamSnapshotKey = (testCode?: string) =>
  testCode ? `mockmate.exam.${testCode.toUpperCase()}` : '';

const getAttemptMarkerKey = (testCode: string | undefined, studentName: string) =>
  testCode
    ? `mockmate.completed.${testCode.toUpperCase()}.${studentName.trim().toLocaleLowerCase()}`
    : '';

const readExamSnapshot = (testCode?: string): PersistedExamSnapshot | null => {
  const key = getExamSnapshotKey(testCode);
  if (!key) return null;

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as PersistedExamSnapshot) : null;
  } catch {
    return null;
  }
};

const writeExamSnapshot = (testCode: string | undefined, snapshot: PersistedExamSnapshot) => {
  const key = getExamSnapshotKey(testCode);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Persistence is best-effort; the in-memory exam must continue to work.
  }
};

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
  const location = useLocation();
  const navigate = useNavigate();

  const [currentPhase, setCurrentPhase] = useState<ExamState>('loading');
  const [test, setTest] = useState<Test | null>(initialTest || null);
  const [studentName, setStudentName] = useState<string>('');
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [error, setError] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [windowClosed, setWindowClosed] = useState(false);

  const examState = useExamState();
  const examTimer = useExamTimer();
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const deadlineRef = useRef<number | null>(null);

  const isMobileDevice = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 768px)').matches ||
      navigator.maxTouchPoints > 0 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  const navigateToPhase = useCallback((phase: 'entry' | 'active' | 'results') => {
    setCurrentPhase(phase);
    if (!testCode) return;
    const route = `/exam/${testCode.toUpperCase()}/${phase === 'active' ? 'test' : phase}`;
    if (location.pathname !== route) {
      navigate(route, { replace: true });
    }
  }, [location.pathname, navigate, testCode]);

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
      navigateToPhase('entry');
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

      // Once the wall-clock window has closed the test can no longer be taken
      // for credit — but it remains available in Practice Mode (results are
      // not persisted). This runs before any snapshot restore so a stale
      // in-progress session cannot be resumed past the cut-off.
      const now = new Date();
      const testEnd = testData.endTime
        ? new Date(testData.endTime)
        : testData.endDate
          ? new Date(testData.endDate)
          : null;
      if (testEnd && now > testEnd) {
        window.localStorage.removeItem(getExamSnapshotKey(code));
        setWindowClosed(true);
        navigateToPhase('entry');
        return;
      }

      const saved = readExamSnapshot(code);
      if (saved && saved.test?.id === testData.id) {
        if (saved.phase === 'results' && saved.result && location.pathname.endsWith('/results')) {
          setStudentName(saved.studentName);
          setIsPracticeMode(saved.result.isPractice ?? false);
          setTestResult({
            ...saved.result,
            completedAt: new Date(saved.result.completedAt),
          });
          navigateToPhase('results');
          return;
        }

        if (saved.phase === 'active' && saved.state && saved.deadline) {
          const remaining = Math.max(0, Math.ceil((saved.deadline - Date.now()) / 1000));
          if (remaining > 0) {
            const restoredSession: ExamSession = {
              test: testData,
              studentName: saved.studentName,
              startTime: new Date(saved.startTime),
              state: {
                currentQuestionIndex: saved.state.currentQuestionIndex,
                answers: saved.state.answers,
                timeRemaining: remaining,
                isSubmitted: saved.state.isSubmitted,
                bookmarkedQuestions: new Set(saved.state.bookmarkedQuestions),
                visitedQuestions: new Set(saved.state.visitedQuestions),
                reviewMode: saved.state.reviewMode,
              },
              settings: {
                showTimer: true,
                showProgress: true,
                allowNavigation: true,
                confirmSubmit: true,
              },
            };
            setStudentName(saved.studentName);
            setIsPracticeMode(saved.isPracticeMode ?? false);
            setExamSession(restoredSession);
            examState.initialize(restoredSession.state);
            examTimer.start(remaining);
            deadlineRef.current = saved.deadline;
            navigateToPhase('active');
            return;
          }

          window.localStorage.removeItem(getExamSnapshotKey(code));
        }

        if (saved.phase === 'entry') {
          navigateToPhase('entry');
          return;
        }
      }

      // A direct active/results URL without a valid saved session starts safely
      // at entry rather than rendering a blank or partially initialized screen.
      if (location.pathname.endsWith('/test') || location.pathname.endsWith('/results')) {
        navigateToPhase('entry');
        return;
      }

      // Determine initial state based on time. The expired case is handled above
      // (before snapshot restore); here we enforce the pre-start entry window.
      if (testData.startDate) {
        const testStart = new Date(testData.startDate);
        const entryWindow = new Date(testStart.getTime() - 5 * 60 * 1000);

        const now = new Date();

        if (now < entryWindow) {
          setCurrentPhase('too-early');
          return;
        }

        if (now >= entryWindow && now <= testStart) {
          navigateToPhase('entry');
          return;
        }
      }

      navigateToPhase('entry');
    } catch (err) {
      console.error('Error loading test:', err);
      setError('Unable to connect to the test server. Please check your internet connection and try again.');
      setCurrentPhase('invalid');
    }
  };

  // Auto-transition from too-early to entry when time window opens
  useEffect(() => {
    if (currentPhase === 'too-early' && test && timeInfo.canEnter) {
      navigateToPhase('entry');
    }
  }, [currentPhase, navigateToPhase, test, timeInfo.canEnter]);

  // Handle fullscreen mode
  const enterFullscreen = async () => {
    try {
      // Mobile browsers show a native fullscreen-exit banner that can cover
      // the fixed exam controls. Keep mobile in normal browser layout.
      if (isMobileDevice()) {
        setIsFullscreen(false);
        return;
      }
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      console.warn('Fullscreen not supported or denied');
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
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

  useEffect(() => {
    if (
      currentPhase !== 'active' ||
      !test ||
      !examSession ||
      !testCode ||
      deadlineRef.current === null
    ) {
      return;
    }

    writeExamSnapshot(testCode, {
      phase: 'active',
      test,
      studentName: examSession.studentName,
      isPracticeMode,
      startTime: examSession.startTime.toISOString(),
      deadline: deadlineRef.current,
      state: {
        currentQuestionIndex: examState.currentQuestionIndex,
        answers: examState.answers,
        timeRemaining: examTimer.timeRemaining,
        isSubmitted: examState.isSubmitted,
        bookmarkedQuestions: [...examState.bookmarkedQuestions],
        visitedQuestions: [...examState.visitedQuestions],
        reviewMode: examState.reviewMode,
      },
    });
  }, [
    currentPhase,
    examSession,
    examState.answers,
    examState.bookmarkedQuestions,
    examState.currentQuestionIndex,
    examState.isSubmitted,
    examState.reviewMode,
    examState.visitedQuestions,
    examTimer.timeRemaining,
    isPracticeMode,
    test,
    testCode,
  ]);

  useEffect(() => {
    if (currentPhase !== 'results' || !test || !testResult || !testCode) return;

    writeExamSnapshot(testCode, {
      phase: 'results',
      test,
      studentName: testResult.studentName,
      startTime: examSession?.startTime.toISOString() || new Date().toISOString(),
      result: testResult,
    });
  }, [currentPhase, examSession, test, testCode, testResult]);

  // Handle student entry
  const handleStudentEntry = async (name: string) => {
    if (!test) return;

    try {
      setStudentName(name.trim());
      const attemptMarker = getAttemptMarkerKey(testCode, name);
      // A test past its window is only available in Practice Mode.
      const practiceMode = Boolean(
        windowClosed ||
        (attemptMarker && window.localStorage.getItem(attemptMarker)) ||
        await hasStudentTakenTest(test.id, name)
      );
      setIsPracticeMode(practiceMode);
      setTestResult(null);
      
      // Initialize exam session
      const session: ExamSession = {
        test,
        studentName: name.trim(),
        startTime: new Date(),
        state: {
          currentQuestionIndex: 0,
          answers: [],
          timeRemaining: (test.duration || test.timeLimit || 90) * 60,
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
      deadlineRef.current = Date.now() + session.state.timeRemaining * 1000;
      writeExamSnapshot(testCode, {
        phase: 'active',
        test,
        studentName: session.studentName,
        isPracticeMode: practiceMode,
        startTime: session.startTime.toISOString(),
        deadline: deadlineRef.current,
        state: {
          ...session.state,
          bookmarkedQuestions: [...session.state.bookmarkedQuestions],
          visitedQuestions: [...session.state.visitedQuestions],
        },
      });
      
      // Enter fullscreen for better exam experience
      await enterFullscreen();
      
      navigateToPhase('active');
    } catch {
      setError('Failed to start exam. Please try again.');
    }
  };

  // Handle exam submission
  const handleExamSubmission = async (finalAnswers: StudentAnswer[]) => {
    if (!test || !examSession) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      setCurrentPhase('loading');
      
      // Calculate results
      const result = calculateResults(test, finalAnswers, studentName);
      
      const finalResult = {
        ...result,
        isPractice: isPracticeMode,
        completedAt: result.completedAt
      };

      if (!isPracticeMode) {
        const savedResult = await saveTestResult({
          testId: test.id,
          studentName: studentName.trim(),
          answers: finalAnswers,
          score: result.score,
          totalQuestions: test.questions.length,
          timeTaken: result.timeTaken
        });
        finalResult.completedAt = new Date(savedResult.completed_at);
        const attemptMarker = getAttemptMarkerKey(testCode, studentName);
        if (attemptMarker) {
          window.localStorage.setItem(attemptMarker, '1');
        }
      }
      
      setTestResult(finalResult);
      examTimer.stop();
      
      // Exit fullscreen
      await exitFullscreen();
      
      navigateToPhase('results');
    } catch (err) {
      console.error('Error saving test result:', err);
      setError('Failed to submit exam. Your answers have been saved locally. Please try again or contact support.');
      setCurrentPhase('active');
    } finally {
      submittingRef.current = false;
    }
  };

  // Single, guarded no-arg entry point for manual + auto submission.
  const submitExam = useCallback((finalAnswers?: StudentAnswer[]) => {
    void handleExamSubmission(finalAnswers || examState.answers);
  }, [examState.answers]);

  // Handle exam timeout - single auto-submit owner, guarded against re-fire.
  useEffect(() => {
    if (
      examTimer.timeRemaining <= 0 &&
      currentPhase === 'active' &&
      !autoSubmittedRef.current
    ) {
      autoSubmittedRef.current = true;
      void handleExamSubmission(examState.answers);
    }
  }, [examTimer.timeRemaining, currentPhase, examState.answers]);

  // Auto-submit if the wall-clock test end time is reached while a student is
  // actively taking the exam. Practice-mode runs (e.g. after the window closed)
  // are exempt so students can review without an instant kill-switch.
  useEffect(() => {
    if (
      currentPhase === 'active' &&
      !isPracticeMode &&
      test?.endTime &&
      Date.now() > new Date(test.endTime).getTime() &&
      !autoSubmittedRef.current
    ) {
      autoSubmittedRef.current = true;
      void submitExam();
    }
  }, [currentPhase, test, submitExam, currentTime, isPracticeMode]);

  // Calculate exam results
  const calculateResults = (test: Test, answers: StudentAnswer[], studentName: string): TestResult => {
    const scored = scoreQuestions(test.questions, answers);

    const topicWiseScore: { [topic: string]: { correct: number; total: number } } = {};
    test.questions.forEach(question => {
      if (!topicWiseScore[question.topic]) {
        topicWiseScore[question.topic] = { correct: 0, total: 0 };
      }
      topicWiseScore[question.topic].total++;
      const studentAnswer = answers.find(a => a.questionId === question.id);
      if (
        studentAnswer !== undefined &&
        studentAnswer.selectedOption >= 0 &&
        studentAnswer.selectedOption === question.correctAnswer
      ) {
        topicWiseScore[question.topic].correct++;
      }
    });

    const percentage = scored.percentage;
    const timeTaken = ((test.duration || test.timeLimit || 90) * 60) - examTimer.timeRemaining;

    return {
      testId: test.id,
      studentName,
      answers,
      score: scored.score,
      totalMarks: scored.totalMarks,
      totalQuestions: test.questions.length,
      correctAnswers: scored.correctAnswers,
      incorrectAnswers: scored.incorrectAnswers,
      unansweredQuestions: scored.unansweredQuestions,
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
                    {test.duration ? `${test.duration} minutes` : 'No time limit'}
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
            onSubmitExam={submitExam}
            isPracticeMode={isPracticeMode}
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
              window.localStorage.removeItem(getExamSnapshotKey(testCode));
              deadlineRef.current = null;
              autoSubmittedRef.current = false;
              setIsPracticeMode(false);
              navigateToPhase('entry');
              setTestResult(null);
              setExamSession(null);
              examState.reset();
              examTimer.reset();
            }}
          />
        ) : null;

      case 'expired':
        return test ? (
          <div className="test-expired-screen" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="test-expired-content" style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
              <div className="expired-icon" style={{ fontSize: 48, marginBottom: 16 }}><Clock size={48} /></div>
              <h1 className="expired-title">Test Expired</h1>
              <p className="expired-subtitle">
                Sorry, the window for this test has closed. This test is no longer accessible and cannot be taken.
              </p>
              {test.endTime ? (
                <p className="expired-time" style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>
                  Ended on {new Date(test.endTime).toLocaleString()}
                </p>
              ) : null}
              <button
                onClick={() => { window.location.href = '/'; }}
                className="btn-secondary"
                style={{ marginTop: 16 }}
              >
                Back to Home
              </button>
            </div>
          </div>
        ) : (
          <ErrorScreen
            title="Exam Unavailable"
            message={error || "The requested exam could not be loaded."}
            onRetry={handleRetry}
            onGoHome={() => {
              window.location.href = '/';
            }}
          />
        );
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
