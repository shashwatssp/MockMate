// QuestionDisplay.tsx - Question Display Component
import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Bookmark,
  Flag,
  Lightbulb,
  CheckCircle
} from 'lucide-react';
import type { Question } from '../../types/exam.types';

interface QuestionDisplayProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  selectedAnswer?: number;
  isBookmarked: boolean;
  onAnswerSelect: (option: number) => void;
  onBookmarkToggle: () => void;
  onNextQuestion: () => void;
  onPreviousQuestion: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

export const QuestionDisplay: React.FC<QuestionDisplayProps> = ({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  isBookmarked,
  onAnswerSelect,
  onBookmarkToggle,
  onNextQuestion,
  onPreviousQuestion,
  canGoNext,
  canGoPrevious
}) => {
  if (!question) {
    return (
      <div className="question-container">
        <div className="question-error">
          <p>Question not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="question-container">
      {/* Question Header */}
      <div className="question-header">
        <div className="question-meta">
          <div className="question-number">
            Question {questionIndex + 1} of {totalQuestions}
          </div>
          
          <div className="question-topic">
            <Flag size={16} />
            <span>{question.topic}</span>
          </div>
          
          {question.difficulty && (
            <div className={`difficulty-badge difficulty-${question.difficulty}`}>
              Level {question.difficulty}
            </div>
          )}
        </div>

        <div className="question-actions">
          <button
            onClick={onBookmarkToggle}
            className={`action-btn ${isBookmarked ? 'active' : ''}`}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark question'}
          >
            <Bookmark size={16} />
            {isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
        </div>
      </div>

      {/* Question Content */}
      <div className="question-content">
        <div className="question-text">
          <Lightbulb className="question-icon" />
          <p>{question.text}</p>
        </div>

        {/* Answer Options */}
        <div className="options-container">
          {question.options.map((option, index) => (
            <label
              key={index}
              className={`option-item ${selectedAnswer === index ? 'selected' : ''}`}
              onClick={() => onAnswerSelect(index)}
            >
              <div className="option-radio">
                {selectedAnswer === index && <CheckCircle size={16} />}
              </div>
              
              <div className="option-content">
                <div className="option-label">
                  {String.fromCharCode(65 + index)}.
                </div>
                <div className="option-text">
                  {option}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Question Info */}
        {(question.marks || question.negativeMarks) && (
          <div className="question-info">
            {question.marks && (
              <span className="marks-info positive">
                +{question.marks} mark{question.marks !== 1 ? 's' : ''}
              </span>
            )}
            {question.negativeMarks && (
              <span className="marks-info negative">
                -{question.negativeMarks} mark{question.negativeMarks !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Question Controls */}
      <div className="question-controls">
        <div className="control-group">
          <button
            onClick={onPreviousQuestion}
            disabled={!canGoPrevious}
            className="nav-btn"
            title="Previous question (Ctrl + Left Arrow)"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
        </div>

        <div className="question-indicator">
          <div className="indicator-text">
            {questionIndex + 1} / {totalQuestions}
          </div>
          <div className="progress-dots">
            {Array.from({ length: Math.min(totalQuestions, 10) }, (_, i) => {
              const dotIndex = Math.floor((i * totalQuestions) / 10);
              return (
                <div
                  key={i}
                  className={`progress-dot ${dotIndex <= questionIndex ? 'active' : ''}`}
                />
              );
            })}
          </div>
        </div>

        <div className="control-group">
          <button
            onClick={onNextQuestion}
            disabled={!canGoNext}
            className="nav-btn nav-btn-primary"
            title="Next question (Ctrl + Right Arrow)"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuestionDisplay;