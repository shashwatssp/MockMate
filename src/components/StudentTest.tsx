import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  User, 
  CheckCircle, 
  AlertTriangle, 
  ArrowLeft, 
  ArrowRight, 
  Send, 
  Eye,
  BookOpen,
  Target,
  Timer,
  FileText,
  ChevronLeft,
  ChevronRight,
  Flag,
  Award,
  Brain,
  Zap,
  BarChart3,
  Shield,
  Coffee,
  Lightbulb,
  Star,
  Activity
} from 'lucide-react';
import type { StudentAnswer, Test } from '../types';
import './StudentTest.css';

interface StudentTestProps {
  test: Test;
  studentName: string;
  onSubmitTest: (answers: StudentAnswer[]) => void;
}

export const StudentTest: React.FC<StudentTestProps> = ({ test, studentName, onSubmitTest }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<StudentAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState((test.timeLimit || test.duration || 30) * 60);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showReviewMode, setShowReviewMode] = useState(false);
  const [warningShown, setWarningShown] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleSubmitTest();
          return 0;
        }
        
        // Show warning at 5 minutes
        if (prev === 300 && !warningShown) {
          setWarningShown(true);
          // You could add a toast notification here
        }
        
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [warningShown]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getTimeStatus = () => {
    const totalTime = (test.timeLimit || test.duration || 30) * 60;
    const percentage = (timeLeft / totalTime) * 100;
    
    if (percentage > 50) return 'safe';
    if (percentage > 25) return 'warning';
    return 'critical';
  };

  const handleAnswerSelect = (questionId: string, selectedOption: number) => {
    setAnswers(prev => {
      const existingAnswer = prev.find(a => a.questionId === questionId);
      if (existingAnswer) {
        return prev.map(a => 
          a.questionId === questionId 
            ? { ...a, selectedOption } 
            : a
        );
      }
      return [...prev, { questionId, selectedOption }];
    });
  };

  const getSelectedAnswer = (questionId: string): number | undefined => {
    const answer = answers.find(a => a.questionId === questionId);
    return answer?.selectedOption;
  };

  const handleNext = () => {
    if (currentQuestion < test.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleQuestionJump = (index: number) => {
    setCurrentQuestion(index);
  };

  const handleSubmitTest = () => {
    onSubmitTest(answers);
  };

  const getAnsweredQuestionsCount = () => {
    return answers.length;
  };

  const getProgressPercentage = () => {
    return Math.round((getAnsweredQuestionsCount() / test.questions.length) * 100);
  };

  const currentQ = test.questions[currentQuestion];
  const selectedAnswer = getSelectedAnswer(currentQ.id);
  const timeStatus = getTimeStatus();
  const progressPercentage = getProgressPercentage();

  return (
    <div className={`student-test-wrapper ${isLoaded ? 'loaded' : ''}`}>
      {/* Floating Background Elements */}
      <div className="floating-bg-elements">
        <div className="bg-element bg-element-1"></div>
        <div className="bg-element bg-element-2"></div>
        <div className="bg-element bg-element-3"></div>
      </div>

      {/* Test Header */}
      <header className="test-header">
        <div className="header-content">
          <div className="header-main">
            <div className="test-info">
              <div className="test-brand">
                <div className="brand-icon">
                  <Brain className="icon" />
                </div>
                <div className="brand-text">
                  <h1 className="test-title">{test.name || test.title}</h1>
                  <p className="student-name">
                    <User className="student-icon" />
                    {studentName}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="header-stats">
              <div className={`timer-display ${timeStatus}`}>
                <div className="timer-icon-container">
                  <Timer className="timer-icon" />
                </div>
                <div className="timer-content">
                  <span className="timer-value">{formatTime(timeLeft)}</span>
                  <span className="timer-label">Time Left</span>
                </div>
                <div className="timer-pulse"></div>
              </div>
              
              <div className="progress-display">
                <div className="progress-icon-container">
                  <BarChart3 className="progress-icon" />
                </div>
                <div className="progress-content">
                  <span className="progress-value">{getAnsweredQuestionsCount()}/{test.questions.length}</span>
                  <span className="progress-label">Completed</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${progressPercentage}%` }}
              >
                <div className="progress-shine"></div>
              </div>
            </div>
            <span className="progress-percentage">{progressPercentage}%</span>
          </div>
        </div>
      </header>

      <main className="test-main">
        <div className="test-container">
          <div className="test-layout">
            {/* Question Navigation Sidebar */}
            <aside className="question-navigation">
              <div className="nav-header">
                <Target className="nav-icon" />
                <h3 className="nav-title">Question Navigator</h3>
              </div>
              
              <div className="nav-stats">
                <div className="nav-stat answered">
                  <CheckCircle className="stat-icon" />
                  <span className="stat-value">{getAnsweredQuestionsCount()}</span>
                  <span className="stat-label">Answered</span>
                </div>
                <div className="nav-stat remaining">
                  <Clock className="stat-icon" />
                  <span className="stat-value">{test.questions.length - getAnsweredQuestionsCount()}</span>
                  <span className="stat-label">Remaining</span>
                </div>
              </div>
              
              <div className="question-grid">
                {test.questions.map((_, index) => {
                  const isAnswered = answers.some(a => a.questionId === test.questions[index].id);
                  const isCurrent = index === currentQuestion;
                  
                  return (
                    <button
                      key={index}
                      onClick={() => handleQuestionJump(index)}
                      className={`question-nav-btn ${
                        isCurrent ? 'current' : 
                        isAnswered ? 'answered' : 'unanswered'
                      }`}
                      title={`Question ${index + 1} ${isAnswered ? '(Answered)' : '(Not answered)'}`}
                    >
                      <span className="btn-number">{index + 1}</span>
                      {isAnswered && <CheckCircle className="btn-check" />}
                      {isCurrent && <div className="current-indicator"></div>}
                    </button>
                  );
                })}
              </div>
              
              <div className="nav-actions">
                <button
                  onClick={() => setShowReviewMode(!showReviewMode)}
                  className="review-btn"
                  title="Review Mode"
                >
                  <Eye className="btn-icon" />
                  <span>Review</span>
                </button>
                
                <button
                  onClick={() => setShowSubmitDialog(true)}
                  className="submit-btn"
                  title="Submit Test"
                >
                  <Send className="btn-icon" />
                  <span>Submit Test</span>
                </button>
              </div>
            </aside>

            {/* Main Question Area */}
            <section className="question-section">
              <div className="question-container">
                {/* Question Header */}
                <div className="question-header">
                  <div className="question-meta">
                    <div className="question-number">
                      <FileText className="number-icon" />
                      <span>Question {currentQuestion + 1} of {test.questions.length}</span>
                    </div>
                    <div className="question-topic">
                      <Flag className="topic-icon" />
                      <span>{currentQ.topic}</span>
                    </div>
                  </div>
                  
                  <div className="question-status">
                    {selectedAnswer !== undefined ? (
                      <div className="status-badge answered">
                        <CheckCircle className="status-icon" />
                        <span>Answered</span>
                      </div>
                    ) : (
                      <div className="status-badge unanswered">
                        <AlertTriangle className="status-icon" />
                        <span>Not Answered</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Question Content */}
                <div className="question-content">
                  <div className="question-text">
                    <Lightbulb className="question-icon" />
                    <p>{currentQ.text}</p>
                  </div>

                  {/* Answer Options */}
                  <div className="answer-options">
                    {currentQ.options.map((option, index) => (
                      <label
                        key={index}
                        className={`answer-option ${selectedAnswer === index ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`question-${currentQ.id}`}
                          value={index}
                          checked={selectedAnswer === index}
                          onChange={() => handleAnswerSelect(currentQ.id, index)}
                          className="option-radio"
                        />
                        <div className="option-content">
                          <div className="option-indicator">
                            <span className="option-letter">
                              {String.fromCharCode(65 + index)}
                            </span>
                            {selectedAnswer === index && (
                              <div className="selection-check">
                                <CheckCircle className="check-icon" />
                              </div>
                            )}
                          </div>
                          <span className="option-text">{option}</span>
                        </div>
                        <div className="option-ripple"></div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Navigation Controls */}
                <div className="question-navigation-controls">
                  <button
                    onClick={handlePrevious}
                    disabled={currentQuestion === 0}
                    className="nav-btn previous"
                  >
                    <ChevronLeft className="btn-icon" />
                    <span>Previous</span>
                  </button>
                  
                  <div className="question-indicator">
                    <div className="indicator-dots">
                      {test.questions.map((_, index) => (
                        <div
                          key={index}
                          className={`dot ${index === currentQuestion ? 'active' : ''} ${
                            answers.some(a => a.questionId === test.questions[index].id) ? 'answered' : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <button
                    onClick={handleNext}
                    disabled={currentQuestion === test.questions.length - 1}
                    className="nav-btn next"
                  >
                    <span>Next</span>
                    <ChevronRight className="btn-icon" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Submit Confirmation Dialog */}
      {showSubmitDialog && (
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={() => setShowSubmitDialog(false)}></div>
          <div className="submit-modal">
            <div className="modal-header">
              <div className="modal-icon">
                <Send className="icon" />
              </div>
              <h3 className="modal-title">Submit Your Test?</h3>
              <p className="modal-subtitle">This action cannot be undone</p>
            </div>
            
            <div className="modal-content">
              <div className="submission-summary">
                <div className="summary-stats">
                  <div className="summary-stat completed">
                    <div className="stat-circle">
                      <CheckCircle className="stat-icon" />
                      <span className="stat-number">{getAnsweredQuestionsCount()}</span>
                    </div>
                    <span className="stat-label">Questions Answered</span>
                  </div>
                  
                  <div className="summary-stat pending">
                    <div className="stat-circle">
                      <AlertTriangle className="stat-icon" />
                      <span className="stat-number">{test.questions.length - getAnsweredQuestionsCount()}</span>
                    </div>
                    <span className="stat-label">Questions Remaining</span>
                  </div>
                  
                  <div className="summary-stat time">
                    <div className="stat-circle">
                      <Clock className="stat-icon" />
                      <span className="stat-number">{formatTime(timeLeft)}</span>
                    </div>
                    <span className="stat-label">Time Remaining</span>
                  </div>
                </div>
                
                {getAnsweredQuestionsCount() < test.questions.length && (
                  <div className="warning-message">
                    <Shield className="warning-icon" />
                    <p>
                      <strong>Important:</strong> You have {test.questions.length - getAnsweredQuestionsCount()} unanswered questions. 
                      These will be marked as incorrect.
                    </p>
                  </div>
                )}
                
                <div className="encouragement-message">
                  <Star className="encouragement-icon" />
                  <p>
                    Great job! You've completed {Math.round((getAnsweredQuestionsCount() / test.questions.length) * 100)}% of the test.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="modal-actions">
              <button
                onClick={() => setShowSubmitDialog(false)}
                className="modal-btn secondary"
              >
                <ArrowLeft className="btn-icon" />
                <span>Continue Test</span>
              </button>
              
              <button
                onClick={handleSubmitTest}
                className="modal-btn primary"
              >
                <Send className="btn-icon" />
                <span>Submit Test</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Warning Toast */}
      {timeLeft <= 300 && timeLeft > 60 && (
        <div className="time-warning-toast">
          <div className="toast-content">
            <Coffee className="toast-icon" />
            <div className="toast-text">
              <strong>5 minutes remaining!</strong>
              <p>Please review your answers</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentTest;
