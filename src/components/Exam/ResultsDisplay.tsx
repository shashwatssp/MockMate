// ResultsDisplay.tsx - Results Display Component
import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Target,
  CheckCircle,
  XCircle,
  Minus,
  BarChart3,
  Clock,
  User,
  Download,
  Share2,
  RefreshCw,
  Star,
  TrendingUp,
  Award,
  BookOpen
} from 'lucide-react';
import type { Test, TestResult } from '../../types/exam.types';

interface ResultsDisplayProps {
  test: Test;
  result: TestResult;
  onRetakeExam?: () => void;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  test,
  result,
  onRetakeExam
}) => {
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setAnimationStep(1), 500);
    const timer2 = setTimeout(() => setAnimationStep(2), 1000);
    const timer3 = setTimeout(() => setAnimationStep(3), 1500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const getGradeInfo = (percentage: number) => {
    if (percentage >= 90) return {
      grade: 'A+',
      status: 'excellent',
      message: 'Outstanding Performance!',
      color: 'var(--success-green)'
    };
    if (percentage >= 80) return {
      grade: 'A',
      status: 'excellent',
      message: 'Excellent Work!',
      color: 'var(--success-green)'
    };
    if (percentage >= 70) return {
      grade: 'B',
      status: 'good',
      message: 'Good Performance!',
      color: 'var(--primary-blue)'
    };
    if (percentage >= 60) return {
      grade: 'C',
      status: 'average',
      message: 'Average Performance',
      color: 'var(--warning-orange)'
    };
    if (percentage >= 50) return {
      grade: 'D',
      status: 'below-average',
      message: 'Needs Improvement',
      color: 'var(--warning-orange)'
    };
    return {
      grade: 'F',
      status: 'poor',
      message: 'Requires More Practice',
      color: 'var(--error-red)'
    };
  };

  const gradeInfo = getGradeInfo(result.percentage);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="results-screen">
      <div className="results-container">
        {/* Results Header */}
        <div className="results-header">
          <div className="results-icon">
            <Trophy size={48} />
          </div>
          <h1 className="results-title">Test Complete!</h1>
          <p className="results-subtitle">
            Congratulations, <strong>{result.studentName}</strong>!
          </p>
        </div>

        {/* Grade Display */}
        <div className="grade-display">
          <div className="grade-circle" style={{ borderColor: gradeInfo.color }}>
            <span className="grade-letter" style={{ color: gradeInfo.color }}>
              {gradeInfo.grade}
            </span>
          </div>
          <div className="grade-text" style={{ color: gradeInfo.color }}>
            {gradeInfo.message}
          </div>
        </div>

        {/* Score Display */}
        <div className="score-display">
          <div className={`score-item ${animationStep >= 1 ? 'animate' : ''}`}>
            <CheckCircle className="score-icon correct" />
            <span className="score-value">{result.correctAnswers}</span>
            <span className="score-label">Correct</span>
          </div>

          <div className={`score-item ${animationStep >= 2 ? 'animate' : ''}`}>
            <XCircle className="score-icon incorrect" />
            <span className="score-value">{result.incorrectAnswers}</span>
            <span className="score-label">Incorrect</span>
          </div>

          <div className={`score-item ${animationStep >= 3 ? 'animate' : ''}`}>
            <Target className="score-icon accuracy" />
            <span className="score-value">{result.percentage}%</span>
            <span className="score-label">Accuracy</span>
          </div>

          {result.unansweredQuestions > 0 && (
            <div className="score-item animate">
              <Minus className="score-icon unanswered" />
              <span className="score-value">{result.unansweredQuestions}</span>
              <span className="score-label">Skipped</span>
            </div>
          )}
        </div>

        {/* Performance Summary */}
        <div className="performance-summary">
          <div className="summary-item">
            <BookOpen className="summary-icon" />
            <div className="summary-content">
              <span className="summary-label">Total Questions</span>
              <span className="summary-value">{result.totalQuestions}</span>
            </div>
          </div>

          <div className="summary-item">
            <Clock className="summary-icon" />
            <div className="summary-content">
              <span className="summary-label">Time Taken</span>
              <span className="summary-value">{formatTime(result.timeTaken)}</span>
            </div>
          </div>

          <div className="summary-item">
            <Star className="summary-icon" />
            <div className="summary-content">
              <span className="summary-label">Final Score</span>
              <span className="summary-value">{result.score}/{result.totalQuestions}</span>
            </div>
          </div>
        </div>

        {/* Topic-wise Analysis */}
        {result.topicWiseScore && (
          <div className="topic-analysis">
            <h2 className="analysis-title">
              <BarChart3 size={20} />
              Topic Performance
            </h2>

            <div className="topic-list">
              {Object.entries(result.topicWiseScore).map(([topic, stats]) => {
                const percentage = Math.round((stats.correct / stats.total) * 100);
                const getPerformanceClass = (perc: number) => {
                  if (perc >= 80) return 'excellent';
                  if (perc >= 60) return 'good';
                  if (perc >= 40) return 'average';
                  return 'poor';
                };

                return (
                  <div key={topic} className="topic-item">
                    <div className="topic-header">
                      <span className="topic-name">{topic}</span>
                      <span className="topic-score">{stats.correct}/{stats.total}</span>
                    </div>

                    <div className="topic-progress">
                      <div className="progress-bar">
                        <div
                          className={`progress-fill ${getPerformanceClass(percentage)}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="topic-percentage">{percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Performance Insights */}
        <div className="performance-insights">
          <h3>Performance Insights</h3>
          <div className="insights-grid">
            {result.percentage >= 80 && (
              <div className="insight-item strength">
                <TrendingUp className="insight-icon" />
                <div className="insight-content">
                  <strong>Strong Performance</strong>
                  <p>You demonstrated excellent understanding of the material.</p>
                </div>
              </div>
            )}

            {result.percentage >= 60 && result.percentage < 80 && (
              <div className="insight-item good">
                <Award className="insight-icon" />
                <div className="insight-content">
                  <strong>Good Foundation</strong>
                  <p>Solid understanding with room for improvement in some areas.</p>
                </div>
              </div>
            )}

            {result.percentage < 60 && (
              <div className="insight-item improvement">
                <Target className="insight-icon" />
                <div className="insight-content">
                  <strong>Areas to Focus</strong>
                  <p>Consider reviewing the material and practicing more questions.</p>
                </div>
              </div>
            )}

            <div className="insight-item time">
              <Clock className="insight-icon" />
              <div className="insight-content">
                <strong>Time Management</strong>
                <p>
                  {result.timeTaken < (test.timeLimit * 60 * 0.75)
                    ? "You completed the test efficiently with time to spare."
                    : "You used most of the allocated time effectively."
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="results-actions">
          <button
            onClick={() => setShowDetailedResults(!showDetailedResults)}
            className="btn btn-secondary"
          >
            <BarChart3 size={16} />
            {showDetailedResults ? 'Hide' : 'View'} Detailed Results
          </button>

          <button className="btn btn-secondary">
            <Download size={16} />
            Download Report
          </button>

          <button className="btn btn-secondary">
            <Share2 size={16} />
            Share Results
          </button>

          {onRetakeExam && (
            <button onClick={onRetakeExam} className="btn btn-primary">
              <RefreshCw size={16} />
              Retake Test
            </button>
          )}
        </div>

        {/* Detailed Results */}
        {showDetailedResults && (
          <div className="detailed-results">
            <h3>Question-by-Question Analysis</h3>
            <div className="results-table">
              <div className="table-header">
                <span>Question</span>
                <span>Topic</span>
                <span>Your Answer</span>
                <span>Correct Answer</span>
                <span>Result</span>
              </div>

              {test.questions.map((question, index) => {
                const studentAnswer = result.answers.find(a => a.questionId === question.id);
                const isCorrect = studentAnswer?.selectedOption === question.correctAnswer;
                const wasAnswered = studentAnswer !== undefined;

                return (
                  <div key={question.id} className="table-row">
                    <span className="question-num">Q{index + 1}</span>
                    <span className="question-topic">{question.topic}</span>
                    <span className="student-answer">
                      {wasAnswered 
                        ? String.fromCharCode(65 + studentAnswer.selectedOption)
                        : 'Not Answered'
                      }
                    </span>
                    <span className="correct-answer">
                      {String.fromCharCode(65 + question.correctAnswer)}
                    </span>
                    <span className={`result-status ${
                      isCorrect ? 'correct' : wasAnswered ? 'incorrect' : 'skipped'
                    }`}>
                      {isCorrect ? (
                        <CheckCircle size={16} />
                      ) : wasAnswered ? (
                        <XCircle size={16} />
                      ) : (
                        <Minus size={16} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Message */}
        <div className="results-footer">
          <p>
            {result.percentage >= 80 
              ? "Outstanding work! Keep up the excellent performance."
              : result.percentage >= 60
              ? "Good effort! Continue practicing to improve further."
              : "Keep practicing! Every attempt helps you learn and grow."
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;