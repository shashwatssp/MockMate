import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Target, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Award, 
  Star, 
  TrendingUp, 
  BarChart3, 
  RefreshCw, 
  Download, 
  Share2, 
  User, 
  Calendar, 
  Clock, 
  BookOpen, 
  Zap, 
  Brain, 
  Medal, 
  Sparkles,
  Activity,
  PieChart,
  ArrowUp,
  ArrowDown,
  Minus,
  Flag,
  Eye,
  Coffee
} from 'lucide-react';
import type { StudentAnswer, Test } from '../types';
import './TestResult.css';

interface TestResultProps {
  test: Test;
  studentName: string;
  answers: StudentAnswer[];
  score: number;
  onRetakeTest?: () => void;
}

export const TestResult: React.FC<TestResultProps> = ({ 
  test, 
  studentName, 
  answers, 
  score, 
  onRetakeTest 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);

  useEffect(() => {
    setIsLoaded(true);
    
    // Animate the score counting
    const timer1 = setTimeout(() => setAnimationStep(1), 500);
    const timer2 = setTimeout(() => setAnimationStep(2), 1000);
    const timer3 = setTimeout(() => setAnimationStep(3), 1500);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const percentage = Math.round((score / test.questions.length) * 100);
  
  const getGrade = (percentage: number) => {
    if (percentage >= 90) return { 
      grade: 'A+', 
      style: 'excellent',
      message: 'Outstanding Performance!',
      color: '#10b981',
      emoji: '🏆'
    };
    if (percentage >= 80) return { 
      grade: 'A', 
      style: 'excellent',
      message: 'Excellent Work!',
      color: '#10b981',
      emoji: '🎉'
    };
    if (percentage >= 70) return { 
      grade: 'B', 
      style: 'good',
      message: 'Good Job!',
      color: '#3b82f6',
      emoji: '👍'
    };
    if (percentage >= 60) return { 
      grade: 'C', 
      style: 'average',
      message: 'Average Performance',
      color: '#f59e0b',
      emoji: '😊'
    };
    if (percentage >= 50) return { 
      grade: 'D', 
      style: 'below-average',
      message: 'Keep Practicing!',
      color: '#f97316',
      emoji: '📚'
    };
    return { 
      grade: 'F', 
      style: 'poor',
      message: 'Need More Practice',
      color: '#ef4444',
      emoji: '💪'
    };
  };

  const gradeInfo = getGrade(percentage);

  const getAnswerStatus = (question: any, questionIndex: number) => {
    const studentAnswer = answers.find(a => a.questionId === question.id);
    const isCorrect = studentAnswer?.selectedOption === question.correctAnswer;
    const wasAnswered = studentAnswer !== undefined;

    return {
      isCorrect,
      wasAnswered,
      studentAnswerIndex: studentAnswer?.selectedOption,
      correctAnswerIndex: question.correctAnswer
    };
  };

  const getTopicStats = () => {
    const topicStats: { [topic: string]: { correct: number; total: number } } = {};
    
    test.questions.forEach(question => {
      if (!topicStats[question.topic]) {
        topicStats[question.topic] = { correct: 0, total: 0 };
      }
      topicStats[question.topic].total++;
      
      const studentAnswer = answers.find(a => a.questionId === question.id);
      if (studentAnswer?.selectedOption === question.correctAnswer) {
        topicStats[question.topic].correct++;
      }
    });

    return topicStats;
  };

  const getPerformanceInsights = () => {
    const topicStats = getTopicStats();
    const insights = [];
    
    const bestTopic = Object.entries(topicStats).reduce((best, [topic, stats]) => {
      const percentage = (stats.correct / stats.total) * 100;
      const bestPercentage = (best.stats.correct / best.stats.total) * 100;
      return percentage > bestPercentage ? { topic, stats } : best;
    }, { topic: '', stats: { correct: 0, total: 1 } });
    
    const worstTopic = Object.entries(topicStats).reduce((worst, [topic, stats]) => {
      const percentage = (stats.correct / stats.total) * 100;
      const worstPercentage = (worst.stats.correct / worst.stats.total) * 100;
      return percentage < worstPercentage ? { topic, stats } : worst;
    }, { topic: '', stats: { correct: 1, total: 1 } });

    if (bestTopic.topic) {
      const bestPercentage = Math.round((bestTopic.stats.correct / bestTopic.stats.total) * 100);
      insights.push({
        type: 'strength',
        icon: TrendingUp,
        title: 'Strongest Area',
        description: `${bestTopic.topic} (${bestPercentage}%)`
      });
    }

    if (worstTopic.topic && worstTopic.topic !== bestTopic.topic) {
      const worstPercentage = Math.round((worstTopic.stats.correct / worstTopic.stats.total) * 100);
      insights.push({
        type: 'improvement',
        icon: Target,
        title: 'Area for Improvement',
        description: `${worstTopic.topic} (${worstPercentage}%)`
      });
    }

    return insights;
  };

  const topicStats = getTopicStats();
  const performanceInsights = getPerformanceInsights();
  const totalAnswered = answers.length;
  const totalUnanswered = test.questions.length - totalAnswered;

  return (
    <div className={`test-result-wrapper ${isLoaded ? 'loaded' : ''}`}>
      {/* Floating Background Elements */}
      <div className="floating-bg-elements">
        <div className="bg-element bg-element-1"></div>
        <div className="bg-element bg-element-2"></div>
        <div className="bg-element bg-element-3"></div>
        <div className="bg-celebration">
          {percentage >= 70 && [...Array(20)].map((_, i) => (
            <div key={i} className={`confetti confetti-${i % 5}`}></div>
          ))}
        </div>
      </div>

      {/* Results Header */}
      <header className="result-header">
        <div className="header-container">
          <div className="result-celebration">
            <div className="celebration-icon">
              <div className="icon-container">
                <Trophy className="trophy-icon" />
                <div className="icon-glow"></div>
              </div>
              <div className="celebration-rings">
                <div className="ring ring-1"></div>
                <div className="ring ring-2"></div>
                <div className="ring ring-3"></div>
              </div>
            </div>
            
            <div className="result-emoji">
              <span className="emoji">{gradeInfo.emoji}</span>
              <div className="emoji-bounce"></div>
            </div>
          </div>

          <div className="result-content">
            <div className="result-title">
              <h1>Test Completed!</h1>
              <p className="result-subtitle">
                Congratulations, <strong>{studentName}</strong>!
              </p>
            </div>

            <div className="result-grade">
              <div className={`grade-display ${gradeInfo.style}`}>
                <div className="grade-circle">
                  <span className="grade-letter">{gradeInfo.grade}</span>
                  <div className="grade-percentage">{percentage}%</div>
                </div>
                <div className="grade-message">
                  <Medal className="message-icon" />
                  <span>{gradeInfo.message}</span>
                </div>
              </div>
            </div>

            <div className="result-stats">
              <div className={`stat-item ${animationStep >= 1 ? 'animate' : ''}`}>
                <div className="stat-icon correct">
                  <CheckCircle className="icon" />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{score}</span>
                  <span className="stat-label">Correct</span>
                </div>
              </div>

              <div className={`stat-item ${animationStep >= 2 ? 'animate' : ''}`}>
                <div className="stat-icon total">
                  <BookOpen className="icon" />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{test.questions.length}</span>
                  <span className="stat-label">Total</span>
                </div>
              </div>

              <div className={`stat-item ${animationStep >= 3 ? 'animate' : ''}`}>
                <div className="stat-icon accuracy">
                  <Target className="icon" />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{percentage}%</span>
                  <span className="stat-label">Accuracy</span>
                </div>
              </div>

              {totalUnanswered > 0 && (
                <div className="stat-item animate">
                  <div className="stat-icon unanswered">
                    <AlertTriangle className="icon" />
                  </div>
                  <div className="stat-content">
                    <span className="stat-value">{totalUnanswered}</span>
                    <span className="stat-label">Skipped</span>
                  </div>
                </div>
              )}
            </div>

            <div className="result-actions">
              {onRetakeTest && (
                <button onClick={onRetakeTest} className="action-btn primary">
                  <RefreshCw className="btn-icon" />
                  <span>Retake Test</span>
                </button>
              )}
              
              <button 
                onClick={() => setShowDetailedResults(!showDetailedResults)}
                className="action-btn secondary"
              >
                <Eye className="btn-icon" />
                <span>{showDetailedResults ? 'Hide' : 'View'} Details</span>
              </button>
              
              <button className="action-btn tertiary">
                <Share2 className="btn-icon" />
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="result-main">
        <div className="main-container">
          {/* Performance Overview */}
          <section className="performance-overview">
            <div className="overview-header">
              <Activity className="section-icon" />
              <h2 className="section-title">Performance Overview</h2>
            </div>
            
            <div className="overview-grid">
              <div className="overview-card summary">
                <div className="card-header">
                  <PieChart className="card-icon" />
                  <h3>Summary</h3>
                </div>
                <div className="card-content">
                  <div className="summary-chart">
                    <div className="chart-container">
                      <svg className="pie-chart" width="120" height="120" viewBox="0 0 42 42">
                        <circle 
                          cx="21" 
                          cy="21" 
                          r="15.915" 
                          fill="transparent" 
                          stroke="var(--gray-200)" 
                          strokeWidth="3"
                        />
                        <circle 
                          cx="21" 
                          cy="21" 
                          r="15.915" 
                          fill="transparent" 
                          stroke={gradeInfo.color}
                          strokeWidth="3"
                          strokeDasharray={`${percentage} ${100 - percentage}`}
                          strokeDashoffset="25"
                          className="pie-chart-fill"
                        />
                      </svg>
                      <div className="chart-center">
                        <span className="chart-percentage">{percentage}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="summary-details">
                    <div className="detail-item">
                      <div className="detail-dot correct"></div>
                      <span>Correct: {score}</span>
                    </div>
                    <div className="detail-item">
                      <div className="detail-dot incorrect"></div>
                      <span>Incorrect: {totalAnswered - score}</span>
                    </div>
                    {totalUnanswered > 0 && (
                      <div className="detail-item">
                        <div className="detail-dot unanswered"></div>
                        <span>Skipped: {totalUnanswered}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="overview-card insights">
                <div className="card-header">
                  <Brain className="card-icon" />
                  <h3>Insights</h3>
                </div>
                <div className="card-content">
                  <div className="insights-list">
                    {performanceInsights.map((insight, index) => (
                      <div key={index} className={`insight-item ${insight.type}`}>
                        <div className="insight-icon">
                          <insight.icon className="icon" />
                        </div>
                        <div className="insight-content">
                          <span className="insight-title">{insight.title}</span>
                          <span className="insight-description">{insight.description}</span>
                        </div>
                      </div>
                    ))}
                    
                    <div className="insight-item timing">
                      <div className="insight-icon">
                        <Clock className="icon" />
                      </div>
                      <div className="insight-content">
                        <span className="insight-title">Completion Rate</span>
                        <span className="insight-description">
                          {Math.round((totalAnswered / test.questions.length) * 100)}% answered
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overview-card topics">
                <div className="card-header">
                  <BarChart3 className="card-icon" />
                  <h3>Topic Performance</h3>
                </div>
                <div className="card-content">
                  <div className="topic-performance">
                    {Object.entries(topicStats).map(([topic, stats]) => {
                      const topicPercentage = Math.round((stats.correct / stats.total) * 100);
                      const getTopicStatus = (percentage: number) => {
                        if (percentage >= 80) return 'excellent';
                        if (percentage >= 60) return 'good';
                        if (percentage >= 40) return 'average';
                        return 'poor';
                      };
                      
                      return (
                        <div key={topic} className="topic-bar">
                          <div className="topic-header">
                            <span className="topic-name">{topic}</span>
                            <span className="topic-score">{stats.correct}/{stats.total}</span>
                          </div>
                          <div className="progress-container">
                            <div className="progress-track">
                              <div 
                                className={`progress-fill ${getTopicStatus(topicPercentage)}`}
                                style={{ width: `${topicPercentage}%` }}
                              >
                                <div className="progress-shine"></div>
                              </div>
                            </div>
                            <span className="progress-percentage">{topicPercentage}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Detailed Results */}
          {showDetailedResults && (
            <section className="detailed-results">
              <div className="results-header">
                <Flag className="section-icon" />
                <h2 className="section-title">Question by Question Review</h2>
              </div>
              
              <div className="questions-list">
                {test.questions.map((question, index) => {
                  const answerStatus = getAnswerStatus(question, index);
                  
                  return (
                    <div key={question.id} className="question-result">
                      <div className="question-header">
                        <div className="question-meta">
                          <span className="question-number">Q{index + 1}</span>
                          <span className="question-topic">{question.topic}</span>
                        </div>
                        
                        <div className={`result-status ${
                          answerStatus.isCorrect ? 'correct' : 
                          answerStatus.wasAnswered ? 'incorrect' : 'skipped'
                        }`}>
                          {answerStatus.isCorrect ? (
                            <>
                              <CheckCircle className="status-icon" />
                              <span>Correct</span>
                            </>
                          ) : answerStatus.wasAnswered ? (
                            <>
                              <XCircle className="status-icon" />
                              <span>Incorrect</span>
                            </>
                          ) : (
                            <>
                              <Minus className="status-icon" />
                              <span>Skipped</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="question-content">
                        <h3 className="question-text">{question.text}</h3>
                        
                        <div className="answer-options">
                          {question.options.map((option, optionIndex) => {
                            const isCorrectAnswer = optionIndex === question.correctAnswer;
                            const isStudentAnswer = optionIndex === answerStatus.studentAnswerIndex;
                            
                            let optionClass = 'option-item';
                            if (isCorrectAnswer) {
                              optionClass += ' correct-answer';
                            }
                            if (isStudentAnswer && !isCorrectAnswer) {
                              optionClass += ' student-answer incorrect';
                            }
                            if (isStudentAnswer && isCorrectAnswer) {
                              optionClass += ' student-answer correct';
                            }
                            
                            return (
                              <div key={optionIndex} className={optionClass}>
                                <div className="option-content">
                                  <span className="option-letter">
                                    {String.fromCharCode(65 + optionIndex)}
                                  </span>
                                  <span className="option-text">{option}</span>
                                </div>
                                
                                <div className="option-indicators">
                                  {isStudentAnswer && (
                                    <span className="student-indicator">
                                      Your Answer
                                    </span>
                                  )}
                                  {isCorrectAnswer && (
                                    <CheckCircle className="correct-indicator" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Motivational Footer */}
          <section className="motivation-section">
            <div className="motivation-card">
              <div className="motivation-icon">
                <Sparkles className="icon" />
              </div>
              <div className="motivation-content">
                <h3 className="motivation-title">
                  {percentage >= 90 ? "Exceptional Work!" :
                   percentage >= 70 ? "Great Progress!" :
                   percentage >= 50 ? "Keep Going!" :
                   "Every Step Counts!"}
                </h3>
                <p className="motivation-text">
                  {percentage >= 90 ? "You've demonstrated mastery of this material. Your dedication to learning shows!" :
                   percentage >= 70 ? "You're on the right track! Your understanding of the material is solid." :
                   percentage >= 50 ? "You're making progress! Review the areas that need work and try again." :
                   "Don't give up! Every attempt brings you closer to mastery. Keep practicing!"}
                </p>
                
                {percentage < 70 && (
                  <div className="study-tips">
                    <Coffee className="tips-icon" />
                    <div className="tips-content">
                      <strong>Study Tips:</strong>
                      <ul>
                        <li>Review the topics where you scored lower</li>
                        <li>Practice with similar questions</li>
                        <li>Take breaks and study in focused sessions</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default TestResult;
