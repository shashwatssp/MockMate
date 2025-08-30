// ExamInterface.tsx - Main Exam Interface Component
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Brain, 
  User, 
  Clock, 
  BarChart3, 
  Menu, 
  Minimize, 
  Maximize, 
  X,
  Send,
  AlertTriangle,
  Shield
} from 'lucide-react';
import { QuestionNavigation } from './QuestionNavigation';
import { TimerDisplay } from './TimerDisplay';
import { QuestionDisplay } from './QuestionDisplay';
import { SubmitDialog } from './SubmitDialog';
import type { Test, ExamSession, StudentAnswer } from '../../types/exam.types';

interface ExamInterfaceProps {
  test: Test;
  examSession: ExamSession;
  examState: any;
  examTimer: any;
  onSubmitExam: (answers: StudentAnswer[]) => void;
  onError: (error: string) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const ExamInterface: React.FC<ExamInterfaceProps> = ({
  test,
  examSession,
  examState,
  examTimer,
  onSubmitExam,
  onError,
  isFullscreen,
  onToggleFullscreen
}) => {
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<StudentAnswer[]>([]);
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<Set<string>>(new Set());
  const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(new Set([test.questions[0]?.id]));
  const [showTimeWarning, setShowTimeWarning] = useState(false);

  // Handle answer selection
  const handleAnswerSelect = useCallback((questionId: string, selectedOption: number) => {
    setAnswers(prevAnswers => {
      const existingIndex = prevAnswers.findIndex(a => a.questionId === questionId);
      const newAnswer: StudentAnswer = {
        questionId,
        selectedOption,
        timeSpent: 0,
        isBookmarked: bookmarkedQuestions.has(questionId)
      };

      if (existingIndex >= 0) {
        const updated = [...prevAnswers];
        updated[existingIndex] = newAnswer;
        return updated;
      } else {
        return [...prevAnswers, newAnswer];
      }
    });
  }, [bookmarkedQuestions]);

  // Handle question navigation
  const handleQuestionNavigation = useCallback((questionIndex: number) => {
    if (questionIndex >= 0 && questionIndex < test.questions.length) {
      setCurrentQuestion(questionIndex);
      const questionId = test.questions[questionIndex].id;
      setVisitedQuestions(prev => new Set([...prev, questionId]));
    }
  }, [test.questions]);

  // Handle bookmark toggle
  const handleBookmarkToggle = useCallback((questionId: string) => {
    setBookmarkedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });

    // Update answer if exists
    setAnswers(prevAnswers => 
      prevAnswers.map(answer => 
        answer.questionId === questionId 
          ? { ...answer, isBookmarked: !bookmarkedQuestions.has(questionId) }
          : answer
      )
    );
  }, [bookmarkedQuestions]);

  // Handle next question
  const handleNextQuestion = useCallback(() => {
    if (currentQuestion < test.questions.length - 1) {
      handleQuestionNavigation(currentQuestion + 1);
    }
  }, [currentQuestion, test.questions.length, handleQuestionNavigation]);

  // Handle previous question
  const handlePreviousQuestion = useCallback(() => {
    if (currentQuestion > 0) {
      handleQuestionNavigation(currentQuestion - 1);
    }
  }, [currentQuestion, handleQuestionNavigation]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Prevent certain keys during exam
      if (['F12', 'F5', 'Tab'].includes(e.key)) {
        e.preventDefault();
      }

      // Navigation shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'ArrowRight':
            e.preventDefault();
            handleNextQuestion();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            handlePreviousQuestion();
            break;
          case 's':
            e.preventDefault();
            setShowSubmitDialog(true);
            break;
        }
      }

      // Number key navigation (1-9)
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey) {
        const questionIndex = parseInt(e.key) - 1;
        if (questionIndex < test.questions.length) {
          handleQuestionNavigation(questionIndex);
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleNextQuestion, handlePreviousQuestion, handleQuestionNavigation, test.questions.length]);

  // Handle time warnings
  useEffect(() => {
    const timeRemaining = examTimer.timeRemaining;
    
    if (timeRemaining <= 300 && timeRemaining > 0 && !showTimeWarning) { // 5 minutes
      setShowTimeWarning(true);
    }
    
    if (timeRemaining <= 0) {
      // Auto-submit when time expires
      handleExamSubmit();
    }
  }, [examTimer.timeRemaining, showTimeWarning]);

  // Handle exam submission
  const handleExamSubmit = useCallback(() => {
    onSubmitExam(answers);
  }, [answers, onSubmitExam]);

  // Prevent page refresh/navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave? Your exam progress will be lost.';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Calculate progress
  const answeredCount = answers.length;
  const progressPercentage = Math.round((answeredCount / test.questions.length) * 100);
  const currentQuestionData = test.questions[currentQuestion];
  const currentAnswer = answers.find(a => a.questionId === currentQuestionData?.id);

  return (
    <div className="exam-app">
      {/* Exam Header */}
      <header className="exam-header">
        <div className="exam-header-content">
          <div className="exam-brand">
            <div className="exam-brand-icon">
              <Brain size={24} />
            </div>
            <div>
              <h1 className="exam-title">{test.title || test.name}</h1>
              <p className="exam-subtitle">
                <User size={14} />
                {examSession.studentName}
              </p>
            </div>
          </div>

          <div className="exam-header-right">
            <TimerDisplay 
              timeRemaining={examTimer.timeRemaining}
              totalTime={test.timeLimit * 60}
              onWarning={setShowTimeWarning}
            />
            
            <div className="progress-indicator">
              <BarChart3 className="progress-icon" />
              <div className="progress-content">
                <span className="progress-value">{answeredCount}/{test.questions.length}</span>
                <span className="progress-label">Completed</span>
              </div>
            </div>

            <div className="header-controls">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="btn btn-secondary"
                title="Toggle Navigation"
              >
                <Menu size={20} />
              </button>
              
              <button
                onClick={onToggleFullscreen}
                className="btn btn-secondary"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Exam Content */}
      <div className="exam-content">
        {/* Sidebar */}
        {showSidebar && (
          <aside className="exam-sidebar">
            <QuestionNavigation
              questions={test.questions}
              currentQuestion={currentQuestion}
              answers={answers}
              bookmarkedQuestions={bookmarkedQuestions}
              visitedQuestions={visitedQuestions}
              onQuestionSelect={handleQuestionNavigation}
              onSubmitExam={() => setShowSubmitDialog(true)}
            />
          </aside>
        )}

        {/* Sidebar Overlay for Mobile */}
        {showSidebar && (
          <div 
            className={`sidebar-overlay ${showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Main Content */}
        <main className="exam-main">
          <QuestionDisplay
            question={currentQuestionData}
            questionIndex={currentQuestion}
            totalQuestions={test.questions.length}
            selectedAnswer={currentAnswer?.selectedOption}
            isBookmarked={bookmarkedQuestions.has(currentQuestionData?.id)}
            onAnswerSelect={(option) => handleAnswerSelect(currentQuestionData.id, option)}
            onBookmarkToggle={() => handleBookmarkToggle(currentQuestionData.id)}
            onNextQuestion={handleNextQuestion}
            onPreviousQuestion={handlePreviousQuestion}
            canGoNext={currentQuestion < test.questions.length - 1}
            canGoPrevious={currentQuestion > 0}
          />
        </main>
      </div>

      {/* Submit Dialog */}
      {showSubmitDialog && (
        <SubmitDialog
          totalQuestions={test.questions.length}
          answeredQuestions={answeredCount}
          unansweredQuestions={test.questions.length - answeredCount}
          timeRemaining={examTimer.timeRemaining}
          onConfirm={handleExamSubmit}
          onCancel={() => setShowSubmitDialog(false)}
        />
      )}

      {/* Time Warning Toast */}
      {showTimeWarning && examTimer.timeRemaining > 60 && examTimer.timeRemaining <= 300 && (
        <div className="time-warning-toast">
          <div className="toast-content">
            <AlertTriangle className="toast-icon" />
            <div className="toast-text">
              <strong>5 minutes remaining!</strong>
              <p>Please review your answers</p>
            </div>
            <button 
              onClick={() => setShowTimeWarning(false)}
              className="toast-close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Security Indicator */}
      <div className="security-indicator">
        <Shield size={16} />
        <span>Secure Session</span>
      </div>
    </div>
  );
};

export default ExamInterface;