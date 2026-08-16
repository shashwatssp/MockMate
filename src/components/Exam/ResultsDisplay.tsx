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
  Download,
  Share2,
  RefreshCw,
  Star,
  TrendingUp,
  Award,
  BookOpen
} from 'lucide-react';
import { jsPDF } from 'jspdf';
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
  const [actionMessage, setActionMessage] = useState('');

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

  const buildReport = () => {
    const topicLines = Object.entries(result.topicWiseScore || {})
      .map(([topic, stats]) => {
        const percentage = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
        return `- ${topic}: ${stats.correct}/${stats.total} (${percentage}%)`;
      });
    const questionLines = test.questions.map((question, index) => {
      const studentAnswer = result.answers.find(answer => answer.questionId === question.id);
      const wasAnswered = studentAnswer && studentAnswer.selectedOption >= 0;
      const selected = wasAnswered
        ? String.fromCharCode(65 + studentAnswer.selectedOption)
        : 'Not answered';
      const correct = String.fromCharCode(65 + question.correctAnswer);
      const outcome = wasAnswered && studentAnswer.selectedOption === question.correctAnswer
        ? 'Correct'
        : wasAnswered
          ? 'Incorrect'
          : 'Skipped';
      return `${index + 1}. ${outcome} | Topic: ${question.topic} | Your answer: ${selected} | Correct answer: ${correct}`;
    });

    return [
      'MockMate Test Report',
      `Test: ${test.title || test.name}`,
      `Student: ${result.studentName}`,
      `Mode: ${result.isPractice ? 'Practice (not stored in teacher statistics)' : 'Official attempt'}`,
      `Completed: ${result.completedAt.toLocaleString()}`,
      '',
      `Score: ${result.score}/${result.totalQuestions}`,
      `Accuracy: ${result.percentage}%`,
      `Correct: ${result.correctAnswers}`,
      `Incorrect: ${result.incorrectAnswers}`,
      `Skipped: ${result.unansweredQuestions}`,
      `Time taken: ${formatTime(result.timeTaken)}`,
      '',
      'Topic performance:',
      ...(topicLines.length ? topicLines : ['- No topic data']),
      '',
      'Question review:',
      ...questionLines
    ].join('\n');
  };

  const handleDownloadReport = () => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      const contentWidth = pageWidth - margin * 2;
      let cursorY = 42;

      const addPageIfNeeded = (height: number) => {
        if (cursorY + height <= pageHeight - margin) return;
        doc.addPage();
        cursorY = margin;
      };

      const drawText = (text: string, x: number, y: number, width: number, size = 10) => {
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, width);
        doc.text(lines, x, y);
        return lines.length * (size + 4);
      };

      const displayName = test.title || test.name || 'MockMate Test';
      const safeFileName = displayName
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'mockmate-test';

      doc.setFillColor(30, 58, 138);
      doc.roundedRect(0, 0, pageWidth, 116, 0, 0, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(25);
      doc.text('MockMate', margin, 52);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text('Student performance report', margin, 75);
      doc.setFontSize(10);
      doc.text(result.isPractice ? 'PRACTICE ATTEMPT' : 'OFFICIAL ATTEMPT', pageWidth - margin, 52, { align: 'right' });
      doc.text(result.completedAt.toLocaleDateString(), pageWidth - margin, 75, { align: 'right' });
      cursorY = 148;

      doc.setTextColor(22, 35, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      cursorY += drawText(displayName, margin, cursorY, contentWidth, 18);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      cursorY += 8;
      cursorY += drawText(`Student: ${result.studentName}  •  Completed: ${result.completedAt.toLocaleString()}`, margin, cursorY, contentWidth, 10);
      cursorY += 22;

      const cards = [
        { label: 'SCORE', value: `${result.score}/${result.totalQuestions}`, color: [30, 58, 138] },
        { label: 'ACCURACY', value: `${result.percentage}%`, color: [5, 150, 105] },
        { label: 'TIME TAKEN', value: formatTime(result.timeTaken), color: [217, 119, 6] }
      ];
      const cardGap = 10;
      const cardWidth = (contentWidth - cardGap * 2) / 3;
      cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + cardGap);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, cursorY, cardWidth, 66, 8, 8, 'F');
        doc.setFillColor(card.color[0], card.color[1], card.color[2]);
        doc.roundedRect(x, cursorY, 5, 66, 3, 3, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(card.label, x + 16, cursorY + 20);
        doc.setTextColor(22, 35, 59);
        doc.setFontSize(15);
        doc.text(card.value, x + 16, cursorY + 45);
      });
      cursorY += 94;

      if (result.isPractice) {
        doc.setFillColor(255, 248, 225);
        doc.setTextColor(138, 90, 0);
        doc.roundedRect(margin, cursorY, contentWidth, 36, 7, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Practice mode: this attempt is not included in teacher statistics.', margin + 12, cursorY + 23);
        cursorY += 56;
      }

      const sectionHeading = (heading: string) => {
        addPageIfNeeded(36);
        doc.setTextColor(30, 58, 138);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text(heading, margin, cursorY);
        cursorY += 24;
      };

      sectionHeading('Topic performance');
      const topicEntries = Object.entries(result.topicWiseScore || {});
      if (topicEntries.length === 0) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        cursorY += drawText('No topic data available.', margin, cursorY, contentWidth, 10);
      } else {
        topicEntries.forEach(([topic, stats]) => {
          addPageIfNeeded(34);
          const percentage = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
          doc.setTextColor(36, 51, 77);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(topic, margin, cursorY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(`${stats.correct}/${stats.total}  (${percentage}%)`, pageWidth - margin, cursorY, { align: 'right' });
          cursorY += 8;
          doc.setFillColor(226, 232, 240);
          doc.roundedRect(margin, cursorY, contentWidth, 6, 3, 3, 'F');
          doc.setFillColor(5, 150, 105);
          doc.roundedRect(margin, cursorY, contentWidth * (percentage / 100), 6, 3, 3, 'F');
          cursorY += 20;
        });
      }

      sectionHeading('Question review');
      test.questions.forEach((question, index) => {
        const studentAnswer = result.answers.find(answer => answer.questionId === question.id);
        const wasAnswered = studentAnswer !== undefined && studentAnswer.selectedOption >= 0;
        const outcome = !wasAnswered
          ? 'Skipped'
          : studentAnswer.selectedOption === question.correctAnswer
            ? 'Correct'
            : 'Incorrect';
        const outcomeColor = outcome === 'Correct'
          ? [5, 150, 105]
          : outcome === 'Incorrect'
            ? [220, 38, 38]
            : [100, 116, 139];
        const questionText = `${index + 1}. ${question.text}`;
        const detailText = `Result: ${outcome}  •  Your answer: ${wasAnswered ? String.fromCharCode(65 + studentAnswer.selectedOption) : 'Not answered'}  •  Correct answer: ${String.fromCharCode(65 + question.correctAnswer)}  •  Topic: ${question.topic || 'Unspecified'}`;
        const questionLines = doc.splitTextToSize(questionText, contentWidth - 24);
        const detailLines = doc.splitTextToSize(detailText, contentWidth - 24);
        const questionHeight = questionLines.length * 14 + 11;
        const detailHeight = detailLines.length * 13;
        addPageIfNeeded(questionHeight + detailHeight + 16);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, cursorY - 13, contentWidth, questionHeight + detailHeight + 12, 7, 7, 'F');
        doc.setTextColor(36, 51, 77);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(questionLines, margin + 12, cursorY);
        cursorY += questionLines.length * 14;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(outcomeColor[0], outcomeColor[1], outcomeColor[2]);
        doc.setFontSize(9);
        doc.text(detailLines, margin + 12, cursorY + 2);
        cursorY += detailHeight;
        cursorY += 16;
      });

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.text('Generated by MockMate', margin, pageHeight - 20);
      doc.save(`${safeFileName}-report.pdf`);
      setActionMessage('PDF report downloaded.');
    } catch (error) {
      console.error('Failed to generate PDF report:', error);
      setActionMessage('The PDF could not be generated. Try sharing the report instead.');
    }
  };

  const handleShareResults = async () => {
    const text = buildReport();
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: `${test.title || test.name} report`,
          text
        });
        setActionMessage('Report shared.');
        return;
      }

      await navigator.clipboard.writeText(text);
      setActionMessage('Report copied. Paste it wherever you want to share it.');
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        setActionMessage('Sharing is unavailable. Download the report instead.');
      }
    }
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

        {result.isPractice && (
          <div className="practice-mode-notice" role="status">
            Practice Mode: this attempt is not stored in the teacher dashboard statistics.
          </div>
        )}

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
                  {result.timeTaken < ((test.duration || test.timeLimit) * 60 * 0.75)
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

          <button onClick={handleDownloadReport} className="btn btn-secondary">
            <Download size={16} />
            Download PDF Report
          </button>
          <button onClick={() => { void handleShareResults(); }} className="btn btn-secondary">
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

        {actionMessage && (
          <p className="results-action-message" role="status">
            {actionMessage}
          </p>
        )}

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
                const wasAnswered = studentAnswer !== undefined && studentAnswer.selectedOption >= 0;

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