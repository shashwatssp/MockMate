import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle,
  Clock3,
  Crown,
  Eye,
  Medal,
  Users,
  X,
  XCircle,
  MinusCircle
} from 'lucide-react';
import { QuestionImage } from './QuestionImage';
import type { Question, Test, TestResult } from '../types/exam.types';
import './Dashboard.css';

type InsightsMode = 'preview' | 'analytics';
type QuestionMetric = 'difficult' | 'unattempted' | 'wrong' | 'correct' | 'time';

interface TestInsightsModalProps {
  test: Test;
  mode: InsightsMode;
  results: TestResult[];
  isLoading: boolean;
  error: string | null;
  onModeChange: (mode: InsightsMode) => void;
  onClose: () => void;
  onRetry: () => void;
}

interface QuestionInsight {
  question: Question;
  index: number;
  correct: number;
  wrong: number;
  unattempted: number;
  totalTime: number;
  timedResponses: number;
}

const formatSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

const getAnswer = (result: TestResult, questionId: string) =>
  result.answers.find(answer => answer.questionId === questionId);

export const TestInsightsModal: React.FC<TestInsightsModalProps> = ({
  test,
  mode,
  results,
  isLoading,
  error,
  onModeChange,
  onClose,
  onRetry
}) => {
  const [questionMetric, setQuestionMetric] = useState<QuestionMetric>('difficult');

  const questionInsights = useMemo<QuestionInsight[]>(() => (
    test.questions.map((question, index) => {
      let correct = 0;
      let wrong = 0;
      let unattempted = 0;
      let totalTime = 0;
      let timedResponses = 0;

      results.forEach(result => {
        const answer = getAnswer(result, question.id);
        const answered = answer && answer.selectedOption >= 0;
        if (!answered) {
          unattempted += 1;
        } else if (answer.selectedOption === question.correctAnswer) {
          correct += 1;
        } else {
          wrong += 1;
        }

        const timeSpent = answer?.timeSpent;
        if (answer && typeof timeSpent === 'number' && Number.isFinite(timeSpent) && timeSpent > 0) {
          totalTime += timeSpent;
          timedResponses += 1;
        }
      });

      return { question, index, correct, wrong, unattempted, totalTime, timedResponses };
    })
  ), [results, test.questions]);

  const rankedResults = useMemo(() => (
    [...results].sort((a, b) =>
      b.percentage - a.percentage ||
      b.score - a.score ||
      a.timeTaken - b.timeTaken
    )
  ), [results]);

  const averagePercentage = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.percentage, 0) / results.length)
    : 0;
  const averageTime = results.length
    ? results.reduce((sum, result) => sum + result.timeTaken, 0) / results.length
    : 0;
  const highestScore = results.length ? Math.max(...results.map(result => result.percentage)) : 0;
  const lowestScore = results.length ? Math.min(...results.map(result => result.percentage)) : 0;

  const sortedQuestionInsights = useMemo(() => {
    const sorted = [...questionInsights];
    const metricValue = (insight: QuestionInsight) => {
      switch (questionMetric) {
        case 'unattempted': return insight.unattempted;
        case 'wrong': return insight.wrong;
        case 'correct': return insight.correct;
        case 'time': return insight.timedResponses ? insight.totalTime / insight.timedResponses : 0;
        default: return insight.wrong + insight.unattempted;
      }
    };
    return sorted.sort((a, b) => metricValue(b) - metricValue(a));
  }, [questionInsights, questionMetric]);

  const metricLabels: Record<QuestionMetric, string> = {
    difficult: 'Most difficult',
    unattempted: 'Most unattempted',
    wrong: 'Most wrong',
    correct: 'Most correct',
    time: 'Most time taken'
  };

  return (
    <div className="insights-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="insights-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="insights-modal-title"
        onClick={event => event.stopPropagation()}
      >
        <header className="insights-modal-header">
          <div>
            <span className="insights-modal-kicker">{mode === 'preview' ? 'Question preview' : 'Test analytics'}</span>
            <h2 id="insights-modal-title">{test.title || test.name}</h2>
            <p>{test.questions.length} questions · {test.duration || test.timeLimit} minutes · Code {test.testKey}</p>
          </div>
          <button type="button" className="insights-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="insights-mode-tabs" role="tablist" aria-label="Test details">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preview'}
            className={mode === 'preview' ? 'active' : ''}
            onClick={() => onModeChange('preview')}
          >
            <Eye size={16} /> Preview questions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'analytics'}
            className={mode === 'analytics' ? 'active' : ''}
            onClick={() => onModeChange('analytics')}
          >
            <BarChart3 size={16} /> Analytics
          </button>
        </div>

        <div className="insights-modal-body">
          {mode === 'preview' ? (
            <div className="preview-question-list">
              {test.questions.map((question, index) => (
                <article className="preview-question-card" key={question.id}>
                  <div className="preview-question-heading">
                    <span>Q{index + 1}</span>
                    <div className="preview-tags">
                      <span>{question.subject || 'General'}</span>
                      <span>{question.topic || 'Unspecified'}</span>
                      {question.year && <span>{question.year}</span>}
                      {question.difficulty && <span>{question.difficulty}</span>}
                    </div>
                  </div>
                  <QuestionImage question={question} maxHeight={160} />
                  <h3>{question.text}</h3>
                  <div className="preview-options">
                    {question.options.map((option, optionIndex) => (
                      <div
                        key={`${question.id}-${optionIndex}`}
                        className={optionIndex === question.correctAnswer ? 'correct' : ''}
                      >
                        <span>{String.fromCharCode(65 + optionIndex)}</span>
                        <p>{option}</p>
                        {optionIndex === question.correctAnswer && <CheckCircle size={16} />}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <>
              {isLoading ? (
                <div className="insights-empty-state">
                  <BarChart3 className="insights-loading-icon" />
                  <p>Loading student performance…</p>
                </div>
              ) : error ? (
                <div className="insights-empty-state error">
                  <XCircle className="insights-loading-icon" />
                  <p>{error}</p>
                  <button type="button" className="analytics-retry-btn" onClick={onRetry}>Retry</button>
                </div>
              ) : (
                <>
                  <div className="analytics-summary-grid">
                    <div><Users size={18} /><strong>{results.length}</strong><span>Students</span></div>
                    <div><BarChart3 size={18} /><strong>{averagePercentage}%</strong><span>Average score</span></div>
                    <div><Crown size={18} /><strong>{highestScore}%</strong><span>Highest score</span></div>
                    <div><Clock3 size={18} /><strong>{formatSeconds(averageTime)}</strong><span>Average time</span></div>
                  </div>

                  {results.length === 0 ? (
                    <div className="insights-empty-state">
                      <Users className="insights-loading-icon" />
                      <p>No official student attempts yet. Practice attempts are not included.</p>
                    </div>
                  ) : (
                    <>
                      <section className="analytics-section">
                        <div className="analytics-section-heading">
                          <div>
                            <span className="insights-modal-kicker">Student performance</span>
                            <h3>Student ranking</h3>
                          </div>
                          <span className="analytics-range">Range: {lowestScore}%–{highestScore}%</span>
                        </div>
                        <div className="analytics-table-wrap">
                          <table className="analytics-table">
                            <thead>
                              <tr><th>Rank</th><th>Student</th><th>Score</th><th>Accuracy</th><th>Time</th></tr>
                            </thead>
                            <tbody>
                              {rankedResults.map((result, index) => (
                                <tr key={result.id || `${result.studentName}-${index}`}>
                                  <td><span className={`rank-badge rank-${index + 1}`}>{index < 3 ? <Medal size={14} /> : index + 1}</span></td>
                                  <td>{result.studentName}</td>
<td>{result.score}/{result.totalMarks ?? result.totalQuestions}</td>
                                  <td>{result.percentage}%</td>
                                  <td>{formatSeconds(result.timeTaken)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section className="analytics-section">
                        <div className="analytics-section-heading">
                          <div>
                            <span className="insights-modal-kicker">Question performance</span>
                            <h3>Where students need help</h3>
                          </div>
                          <select value={questionMetric} onChange={event => setQuestionMetric(event.target.value as QuestionMetric)}>
                            {Object.entries(metricLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="question-analytics-list">
                          {sortedQuestionInsights.map(insight => {
                            const averageQuestionTime = insight.timedResponses
                              ? insight.totalTime / insight.timedResponses
                              : 0;
                            return (
                              <article className="question-analytics-card" key={insight.question.id}>
                                <div className="question-analytics-number">Q{insight.index + 1}</div>
                                <div className="question-analytics-content">
                                  <h4>{insight.question.text}</h4>
                                  <div className="question-analytics-tags">
                                    <span>{insight.question.subject || 'General'}</span>
                                    <span>{insight.question.topic || 'Unspecified'}</span>
                                  </div>
                                  <div className="question-analytics-stats">
                                    <span className="correct"><CheckCircle size={14} /> {insight.correct} correct</span>
                                    <span className="wrong"><XCircle size={14} /> {insight.wrong} wrong</span>
                                    <span className="unattempted"><MinusCircle size={14} /> {insight.unattempted} unattempted</span>
                                    <span className="time"><Clock3 size={14} /> {formatSeconds(averageQuestionTime)} avg</span>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default TestInsightsModal;
