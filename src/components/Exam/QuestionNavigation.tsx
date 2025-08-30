// QuestionNavigation.tsx - Question Navigation Sidebar Component
import React from 'react';
import { 
  Target, 
  CheckCircle, 
  Clock, 
  Send, 
  Bookmark, 
  Flag,
  Eye,
  BarChart3
} from 'lucide-react';
import type { Question, StudentAnswer } from '../../types/exam.types';

interface QuestionNavigationProps {
  questions: Question[];
  currentQuestion: number;
  answers: StudentAnswer[];
  bookmarkedQuestions: Set<string>;
  visitedQuestions: Set<string>;
  onQuestionSelect: (questionIndex: number) => void;
  onSubmitExam: () => void;
}

export const QuestionNavigation: React.FC<QuestionNavigationProps> = ({
  questions,
  currentQuestion,
  answers,
  bookmarkedQuestions,
  visitedQuestions,
  onQuestionSelect,
  onSubmitExam
}) => {
  const answeredCount = answers.length;
  const bookmarkedCount = bookmarkedQuestions.size;
  const visitedCount = visitedQuestions.size;
  const unansweredCount = questions.length - answeredCount;

  const getQuestionStatus = (question: Question, index: number) => {
    const isAnswered = answers.some(a => a.questionId === question.id);
    const isBookmarked = bookmarkedQuestions.has(question.id);
    const isVisited = visitedQuestions.has(question.id);
    const isCurrent = index === currentQuestion;

    return {
      isAnswered,
      isBookmarked,
      isVisited,
      isCurrent
    };
  };

  const getQuestionButtonClass = (status: any) => {
    let baseClass = 'question-btn';
    
    if (status.isCurrent) {
      baseClass += ' current';
    } else if (status.isAnswered) {
      baseClass += ' answered';
    } else if (status.isBookmarked) {
      baseClass += ' bookmarked';
    } else if (status.isVisited) {
      baseClass += ' visited';
    }
    
    return baseClass;
  };

  // Group questions by topic for better organization
  const questionsByTopic = questions.reduce((acc, question, index) => {
    if (!acc[question.topic]) {
      acc[question.topic] = [];
    }
    acc[question.topic].push({ question, index });
    return acc;
  }, {} as Record<string, Array<{ question: Question; index: number }>>);

  return (
    <div className="question-nav">
      {/* Header */}
      <div className="nav-header">
        <h2 className="nav-title">
          <Target size={20} />
          Question Navigator
        </h2>
        <p className="nav-subtitle">Click on any question to navigate</p>
      </div>

      {/* Statistics */}
      <div className="nav-stats">
        <div className="nav-stat answered">
          <CheckCircle className="nav-stat-icon" />
          <span className="nav-stat-value">{answeredCount}</span>
          <span className="nav-stat-label">Answered</span>
        </div>
        
        <div className="nav-stat remaining">
          <Clock className="nav-stat-icon" />
          <span className="nav-stat-value">{unansweredCount}</span>
          <span className="nav-stat-label">Remaining</span>
        </div>
        
        {bookmarkedCount > 0 && (
          <div className="nav-stat bookmarked">
            <Bookmark className="nav-stat-icon" />
            <span className="nav-stat-value">{bookmarkedCount}</span>
            <span className="nav-stat-label">Bookmarked</span>
          </div>
        )}
      </div>

      {/* Question Palette */}
      <div className="question-palette">
        <div className="palette-header">
          <h3 className="palette-title">
            <BarChart3 size={16} />
            All Questions
          </h3>
        </div>
        
        <div className="question-grid">
          {questions.map((question, index) => {
            const status = getQuestionStatus(question, index);
            
            return (
              <button
                key={question.id}
                onClick={() => onQuestionSelect(index)}
                className={getQuestionButtonClass(status)}
                title={`Question ${index + 1}${status.isAnswered ? ' (Answered)' : ''}${status.isBookmarked ? ' (Bookmarked)' : ''}`}
                aria-label={`Question ${index + 1}${status.isCurrent ? ' - Current' : ''}`}
              >
                <span className="question-number">{index + 1}</span>
                
                {status.isAnswered && (
                  <div className="status-indicator answered">
                    <CheckCircle size={12} />
                  </div>
                )}
                
                {status.isBookmarked && (
                  <div className="status-indicator bookmarked">
                    <Bookmark size={12} />
                  </div>
                )}
                
                {status.isCurrent && (
                  <div className="current-indicator" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic-wise Breakdown */}
      <div className="topic-breakdown">
        <h3 className="breakdown-title">
          <Flag size={16} />
          Topic Progress
        </h3>
        
        <div className="topic-list">
          {Object.entries(questionsByTopic).map(([topic, topicQuestions]) => {
            const topicAnsweredCount = topicQuestions.filter(({ question }) => 
              answers.some(a => a.questionId === question.id)
            ).length;
            const topicPercentage = Math.round((topicAnsweredCount / topicQuestions.length) * 100);
            
            return (
              <div key={topic} className="topic-item">
                <div className="topic-header">
                  <span className="topic-name">{topic}</span>
                  <span className="topic-count">{topicAnsweredCount}/{topicQuestions.length}</span>
                </div>
                
                <div className="topic-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${topicPercentage}%` }}
                    />
                  </div>
                  <span className="progress-percentage">{topicPercentage}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="status-legend">
        <h4 className="legend-title">Status Legend</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-indicator current"></div>
            <span>Current</span>
          </div>
          
          <div className="legend-item">
            <div className="legend-indicator answered"></div>
            <span>Answered</span>
          </div>
          
          <div className="legend-item">
            <div className="legend-indicator bookmarked"></div>
            <span>Bookmarked</span>
          </div>
          
          <div className="legend-item">
            <div className="legend-indicator visited"></div>
            <span>Visited</span>
          </div>
          
          <div className="legend-item">
            <div className="legend-indicator unanswered"></div>
            <span>Not Visited</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button
          onClick={() => {
            // Find first unanswered question
            const firstUnanswered = questions.findIndex(q => 
              !answers.some(a => a.questionId === q.id)
            );
            if (firstUnanswered !== -1) {
              onQuestionSelect(firstUnanswered);
            }
          }}
          className="action-btn secondary"
          disabled={answeredCount === questions.length}
        >
          <Eye size={16} />
          <span>Next Unanswered</span>
        </button>
        
        <button
          onClick={() => {
            // Find first bookmarked question
            const firstBookmarked = questions.findIndex(q => 
              bookmarkedQuestions.has(q.id)
            );
            if (firstBookmarked !== -1) {
              onQuestionSelect(firstBookmarked);
            }
          }}
          className="action-btn secondary"
          disabled={bookmarkedCount === 0}
        >
          <Bookmark size={16} />
          <span>Review Bookmarked</span>
        </button>
      </div>

      {/* Submit Button */}
      <div className="submit-section">
        <button
          onClick={onSubmitExam}
          className="btn btn-primary btn-full submit-btn"
        >
          <Send size={20} />
          <span>Submit Exam</span>
        </button>
        
        <p className="submit-warning">
          Make sure you have reviewed all your answers before submitting.
        </p>
      </div>
    </div>
  );
};

export default QuestionNavigation;