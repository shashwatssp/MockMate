import React from 'react';
import type { StudentAnswer, Test } from '../types';

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
  const percentage = Math.round((score / test.questions.length) * 100);
  
  const getGrade = (percentage: number) => {
    if (percentage >= 90) return { grade: 'A+', style: 'status-correct' };
    if (percentage >= 80) return { grade: 'A', style: 'status-correct' };
    if (percentage >= 70) return { grade: 'B', style: 'status-correct' };
    if (percentage >= 60) return { grade: 'C', style: 'status-warning' };
    if (percentage >= 50) return { grade: 'D', style: 'status-warning' };
    return { grade: 'F', style: 'status-incorrect' };
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

  return (
    <div className="results-container">
      {/* Results Header */}
      <div className="results-header fade-in">
        <div className="text-6xl mb-4">
          {percentage >= 70 ? '🎉' : percentage >= 50 ? '😊' : '😔'}
        </div>
        <h1>Test Completed!</h1>
        <p style={{ 
          fontSize: '1.125rem',
          color: 'var(--gray-600)',
          marginBottom: 'var(--spacing-xl)'
        }}>
          Great job, <strong>{studentName}</strong>!
        </p>
        
        <div className="results-score">
          <div className="score-item">
            <div className="score-number" style={{ color: 'var(--primary-blue)' }}>
              {score}
            </div>
            <div className="score-label">Correct Answers</div>
          </div>
          <div className="score-item">
            <div className="score-number" style={{ color: 'var(--gray-800)' }}>
              {test.questions.length}
            </div>
            <div className="score-label">Total Questions</div>
          </div>
          <div className="score-item">
            <div className="score-number" style={{ color: '#8b5cf6' }}>
              {percentage}%
            </div>
            <div className="score-label">Score</div>
          </div>
          <div className="score-item">
            <div className={`score-number ${gradeInfo.style}`}>
              {gradeInfo.grade}
            </div>
            <div className="score-label">Grade</div>
          </div>
        </div>

        <div className={`grade-badge ${gradeInfo.style}`}>
          {percentage >= 90 ? 'Excellent Work!' :
           percentage >= 70 ? 'Good Job!' :
           percentage >= 50 ? 'Keep Practicing!' :
           'Need More Practice'}
        </div>

        {onRetakeTest && (
          <div className="flex justify-center" style={{ marginTop: 'var(--spacing-lg)' }}>
            <button
              onClick={onRetakeTest}
              className="btn btn-primary"
            >
              Retake Test
            </button>
          </div>
        )}
      </div>

      {/* Detailed Results */}
      <div className="detailed-results">
        <div className="card p-6">
          <h2 className="mb-6">Detailed Results</h2>
          
          <div className="space-y-6">
            {test.questions.map((question, index) => {
              const answerStatus = getAnswerStatus(question, index);
              
              return (
                <div 
                  key={question.id} 
                  className={`result-question ${
                    answerStatus.isCorrect ? 'correct' : 
                    answerStatus.wasAnswered ? 'incorrect' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <span className="text-lg font-medium mr-3">
                        {index + 1}.
                      </span>
                      <span 
                        className="px-2 py-1 rounded-md text-xs mr-3"
                        style={{ 
                          backgroundColor: 'var(--gray-100)',
                          color: 'var(--gray-700)'
                        }}
                      >
                        {question.topic}
                      </span>
                      <div className={`result-status ${
                        answerStatus.isCorrect ? 'status-correct' : 
                        answerStatus.wasAnswered ? 'status-incorrect' : 'status-warning'
                      }`}>
                        {answerStatus.isCorrect ? '✓ Correct' : 
                         answerStatus.wasAnswered ? '✗ Incorrect' : '- Not Answered'}
                      </div>
                    </div>
                  </div>

                  <h3 className="text-lg mb-4">{question.text}</h3>

                  <div className="space-y-2">
                    {question.options.map((option, optionIndex) => {
                      const isCorrectAnswer = optionIndex === question.correctAnswer;
                      const isStudentAnswer = optionIndex === answerStatus.studentAnswerIndex;
                      
                      let optionStyle = {
                        padding: 'var(--spacing-md)',
                        border: '2px solid',
                        borderRadius: 'var(--radius-md)',
                        borderColor: 'var(--gray-200)',
                        backgroundColor: 'var(--gray-50)',
                        color: 'var(--gray-700)'
                      };

                      if (isCorrectAnswer) {
                        optionStyle = {
                          ...optionStyle,
                          borderColor: 'var(--secondary-green)',
                          backgroundColor: 'rgb(5 150 105 / 0.1)',
                          color: 'var(--secondary-green)'
                        };
                      } else if (isStudentAnswer && !isCorrectAnswer) {
                        optionStyle = {
                          ...optionStyle,
                          borderColor: 'var(--accent-red)',
                          backgroundColor: 'rgb(220 38 38 / 0.1)',
                          color: 'var(--accent-red)'
                        };
                      }

                      return (
                        <div key={optionIndex} style={optionStyle}>
                          <div className="flex items-center justify-between">
                            <span>
                              <strong>{String.fromCharCode(65 + optionIndex)}.</strong> {option}
                            </span>
                            <div className="flex items-center gap-2">
                              {isStudentAnswer && (
                                <span 
                                  className="text-xs px-2 py-1 rounded"
                                  style={{ 
                                    backgroundColor: 'rgb(37 99 235 / 0.1)',
                                    color: 'var(--primary-blue)'
                                  }}
                                >
                                  Your Answer
                                </span>
                              )}
                              {isCorrectAnswer && (
                                <span style={{ 
                                  color: 'var(--secondary-green)',
                                  fontWeight: 'bold'
                                }}>
                                  ✓
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="performance-chart">
        <h2 className="mb-6">Performance by Topic</h2>
        
        <div className="topic-performance">
          {(() => {
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

            return Object.entries(topicStats).map(([topic, stats]) => {
              const topicPercentage = Math.round((stats.correct / stats.total) * 100);
              
              return (
                <div key={topic} className="topic-bar">
                  <div className="topic-name">{topic}</div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ 
                        width: `${topicPercentage}%`,
                        backgroundColor: topicPercentage >= 70 ? 'var(--secondary-green)' :
                                       topicPercentage >= 50 ? 'var(--accent-yellow)' :
                                       'var(--accent-red)'
                      }}
                    ></div>
                  </div>
                  <span className="text-sm" style={{ color: 'var(--gray-600)' }}>
                    {stats.correct}/{stats.total} ({topicPercentage}%)
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
};

export default TestResult;
