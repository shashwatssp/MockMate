// ExamInterface.tsx - Single source of truth exam UI with persistent RHW navigator.
import { useState } from 'react';
import { Brain, User, BarChart3, Menu, AlertTriangle, X, Minimize2, Maximize2 } from 'lucide-react';
import QuestionDisplay from './QuestionDisplay';
import QuestionNavigation from './QuestionNavigation';
import TimerDisplay from './TimerDisplay';
import type { Test, ExamSession, Question, StudentAnswer } from '../../types/exam.types';
import type { useExamState } from '../../hooks/useExamState';
import type { useExamTimer } from '../../hooks/useExamTimer';
import './styles.css';

type ExamStateHook = ReturnType<typeof useExamState>;
type ExamTimerHook = ReturnType<typeof useExamTimer>;

interface ExamInterfaceProps {
  test: Test;
  examSession: ExamSession;
  examState: ExamStateHook;
  examTimer: ExamTimerHook;
  onSubmitExam: () => void;
  onError?: (error: string) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const ExamInterface: React.FC<ExamInterfaceProps> = ({
  test,
  examSession,
  examState,
  examTimer,
  onSubmitExam,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const questions: Question[] = test.questions;
  const [showSidebar, setShowSidebar] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // ---- Single source of truth: everything is read from / written to examState ----
  const currentQuestionIndex = examState.currentQuestionIndex;
  const answers: StudentAnswer[] = examState.answers;
  const bookmarkedQuestions = examState.bookmarkedQuestions;
  const visitedQuestions = examState.visitedQuestions;

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers.find(
    (a) => a.questionId === currentQuestion?.id,
  );
  const selectedAnswer = currentAnswer?.selectedOption;
  const isBookmarked = !!currentQuestion && bookmarkedQuestions.has(currentQuestion.id);

  const totalQuestions = questions.length;
  const canGoNext = currentQuestionIndex < totalQuestions - 1;
  const canGoPrevious = currentQuestionIndex > 0;

  // Percentage progress (answered / total).
  const progressPercentage =
    totalQuestions === 0
      ? 0
      : Math.round(
          (answers.filter((a) => a.selectedOption !== -1).length / totalQuestions) * 100,
        );

  // ---- Answer / navigation handlers delegate to examState ----
  const handleAnswerSelect = (questionId: string, option: number) => {
    examState.updateAnswer(questionId, option);
    examState.markVisited(questionId);
  };

  const handleBookmarkToggle = () => {
    if (!currentQuestion) return;
    examState.toggleBookmark(currentQuestion.id);
  };

  const goToQuestion = (index: number) => {
    if (index < 0 || index >= totalQuestions) return;
    examState.setCurrentQuestion(index);
    examState.markVisited(questions[index].id);
  };

  const handleNextQuestion = () => {
    if (canGoNext) {
      const next = currentQuestionIndex + 1;
      examState.setCurrentQuestion(next);
      examState.markVisited(questions[next].id);
    }
  };

  const handlePreviousQuestion = () => {
    if (canGoPrevious) {
      const prev = currentQuestionIndex - 1;
      examState.setCurrentQuestion(prev);
      examState.markVisited(questions[prev].id);
    }
  };

  const unansweredCount = totalQuestions - answers.length;
  const markedCount = bookmarkedQuestions.size;

  const handleSidebarSelect = (index: number) => {
    goToQuestion(index);
    // On mobile, close the drawer after jumping.
    setShowSidebar(false);
  };

  const handleOpenSubmit = () => {
    setSubmitDialogOpen(true);
  };

  const handleConfirmSubmit = () => {
    setSubmitDialogOpen(false);
    setShowSidebar(false);
    onSubmitExam();
  };

  // Timer warnings surface as an in-screen toast (does NOT submit).
  const timerWarning =
    examTimer.warnings.oneMinute || examTimer.warnings.fiveMinutes;

  return (
    <div className="exam-active-screen">
      {/* ===== Header (always visible): brand + timer + progress + controls ==== */}
      <header className="exam-header">
        <div className="exam-header-content">
          <div className="exam-brand">
            <div className="exam-brand-icon">
              <Brain size={28} />
            </div>
            <div>
              <h1 className="exam-title">{test.title || test.name}</h1>
              <p className="exam-subtitle">
                <User size={14} /> {examSession.studentName}
              </p>
            </div>
          </div>

          <div className="exam-header-right">
            <TimerDisplay
              timeRemaining={examTimer.timeRemaining}
              totalTime={test.duration * 60}
              onWarning={() => {}}
            />
            <div className="progress-indicator">
              <BarChart3 size={20} className="progress-icon" />
              <div className="progress-content">
                <span className="progress-value">{progressPercentage}%</span>
                <span className="progress-label">Complete</span>
              </div>
            </div>

            {/* Mobile: open the question-navigation drawer */}
            <button
              type="button"
              className="nav-toggle-btn"
              onClick={() => setShowSidebar((s) => !s)}
              aria-label={showSidebar ? 'Close question navigation' : 'Open question navigation'}
              aria-expanded={showSidebar}
              aria-controls="question-navigation"
            >
              <Menu size={20} />
            </button>

            <button
              type="button"
              className="action-btn"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* ===== Time warning toast (non-blocking, dismissable) ==== */}
      {timerWarning && (
        <div className="time-warning-toast">
          <div className="toast-content">
            <AlertTriangle className="toast-icon" size={20} />
            <div className="toast-text">
              <strong>Hurry up!</strong>
              <p>{examTimer.timeRemaining} seconds remaining</p>
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => {}}
              aria-label="Dismiss warning"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ===== Two-area layout: LEFT = question, RIGHT = RHW navigator ==== */}
      <div className="exam-content">
        <main className="exam-main">
          <QuestionDisplay
            question={currentQuestion}
            questionIndex={currentQuestionIndex}
            totalQuestions={totalQuestions}
            selectedAnswer={selectedAnswer}
            isBookmarked={isBookmarked}
            onAnswerSelect={(option) =>
              handleAnswerSelect(currentQuestion.id, option)
            }
            onBookmarkToggle={handleBookmarkToggle}
            onNextQuestion={handleNextQuestion}
            onPreviousQuestion={handlePreviousQuestion}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
          />

          <div className="exam-controls-below">
            <div className="control-group">
              <span className="exam-meta">
                Unanswered: {unansweredCount} | Marked: {markedCount} |
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </span>
            </div>
            <div className="control-group">
              <button
                onClick={handlePreviousQuestion}
                disabled={!canGoPrevious}
                className="nav-btn"
                title="Previous question (Ctrl + Left Arrow)"
              >
                Previous
              </button>
              <button
                onClick={handleNextQuestion}
                disabled={!canGoNext}
                className="nav-btn nav-btn-primary"
                title="Next question (Ctrl + Right Arrow)"
              >
                Next
              </button>
              <button
                onClick={handleOpenSubmit}
                className="nav-btn nav-btn-primary"
                title="Submit exam"
              >
                Submit
              </button>
            </div>
          </div>
        </main>

        {/* ===== RHW Question Navigation Palette (persistent on desktop, =====
             drawer on mobile via the .open class) ===== */}
        <QuestionNavigation
          questions={questions}
          currentQuestionIndex={currentQuestionIndex}
          answers={answers}
          bookmarkedQuestions={bookmarkedQuestions}
          visitedQuestions={visitedQuestions}
          onQuestionSelect={handleSidebarSelect}
          isOpen={showSidebar}
        />

        {/* Mobile drawer overlay */}
        <div
          className={`sidebar-overlay${showSidebar ? ' active' : ''}`}
          onClick={() => setShowSidebar(false)}
          aria-hidden="true"
        />
      </div>

      {/* ===== Submit confirmation dialog ==== */}
      {submitDialogOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="modal-content exam-submit-dialog">
            <div className="modal-header">
              <div className="modal-icon">
                <AlertTriangle size={32} />
              </div>
              <h2 id="submit-title" className="modal-title">
                Submit Exam?
              </h2>
              <p className="modal-subtitle">
                You have answered {answers.length} of {totalQuestions} questions.
                Marked for review: {markedCount}. Unanswered: {unansweredCount}.
              </p>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Once submitted, you cannot change your answers. Make sure all
                questions are complete.
              </p>
              <div className="submission-summary">
                <div className="summary-stats">
                  <div className="summary-stat completed">
                    <div className="stat-circle">
                      <span className="stat-number">{answers.length}</span>
                    </div>
                    <div className="stat-label">Answered</div>
                  </div>
                  <div className="summary-stat pending">
                    <div className="stat-circle">
                      <span className="stat-number">{markedCount}</span>
                    </div>
                    <div className="stat-label">Marked</div>
                  </div>
                  <div className="summary-stat time">
                    <div className="stat-circle">
                      <span className="stat-time">{unansweredCount}</span>
                    </div>
                    <div className="stat-label">Unanswered</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions center">
              <button
                className="btn btn-secondary"
                onClick={() => setSubmitDialogOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-error" onClick={handleConfirmSubmit}>
                Submit Exam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamInterface;
