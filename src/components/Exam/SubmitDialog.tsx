// SubmitDialog.tsx - Submit Confirmation Dialog
import React from 'react';
import { Send, AlertTriangle, CheckCircle, Clock, ArrowLeft } from 'lucide-react';

interface SubmitDialogProps {
  totalQuestions: number;
  answeredQuestions: number;
  unansweredQuestions: number;
  timeRemaining: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SubmitDialog: React.FC<SubmitDialogProps> = ({
  totalQuestions,
  answeredQuestions,
  unansweredQuestions,
  timeRemaining,
  onConfirm,
  onCancel
}) => {
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  };

  const completionPercentage = Math.round((answeredQuestions / totalQuestions) * 100);

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-icon">
            <Send size={32} />
          </div>
          <h2 className="modal-title">Submit Your Exam?</h2>
          <p className="modal-subtitle">This action cannot be undone</p>
        </div>

        <div className="modal-body">
          {/* Completion Summary */}
          <div className="submission-summary">
            <div className="summary-stats">
              <div className="summary-stat completed">
                <div className="stat-circle">
                  <CheckCircle className="stat-icon" />
                  <span className="stat-number">{answeredQuestions}</span>
                </div>
                <span className="stat-label">Answered</span>
              </div>

              <div className="summary-stat pending">
                <div className="stat-circle">
                  <AlertTriangle className="stat-icon" />
                  <span className="stat-number">{unansweredQuestions}</span>
                </div>
                <span className="stat-label">Unanswered</span>
              </div>

              <div className="summary-stat time">
                <div className="stat-circle">
                  <Clock className="stat-icon" />
                  <span className="stat-time">{formatTime(timeRemaining)}</span>
                </div>
                <span className="stat-label">Time Left</span>
              </div>
            </div>

            <div className="completion-progress">
              <div className="progress-header">
                <span>Completion Progress</span>
                <span className="progress-percentage">{completionPercentage}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>

            {/* Warnings */}
            {unansweredQuestions > 0 && (
              <div className="warning-message">
                <AlertTriangle className="warning-icon" />
                <div className="warning-content">
                  <strong>Important:</strong>
                  <p>
                    You have {unansweredQuestions} unanswered question{unansweredQuestions !== 1 ? 's' : ''}. 
                    {' '}These will be marked as incorrect in your final score.
                  </p>
                </div>
              </div>
            )}

            {timeRemaining > 1800 && ( // More than 30 minutes left
              <div className="info-message">
                <Clock className="info-icon" />
                <div className="info-content">
                  <strong>Time Remaining:</strong>
                  <p>
                    You still have {formatTime(timeRemaining)} left. 
                    Consider reviewing your answers before submitting.
                  </p>
                </div>
              </div>
            )}

            {completionPercentage === 100 && (
              <div className="success-message">
                <CheckCircle className="success-icon" />
                <div className="success-content">
                  <strong>Well Done!</strong>
                  <p>You have answered all questions. Ready to submit?</p>
                </div>
              </div>
            )}
          </div>

          <div className="submit-checklist">
            <h4>Before you submit:</h4>
            <ul>
              <li>Have you reviewed all your answers?</li>
              <li>Are you satisfied with your responses?</li>
              <li>Have you answered all questions you intended to?</li>
              <li>Do you want to use remaining time for review?</li>
            </ul>
          </div>
        </div>

        <div className="modal-actions">
          <button
            onClick={onCancel}
            className="btn btn-secondary"
          >
            <ArrowLeft size={16} />
            Continue Exam
          </button>

          <button
            onClick={onConfirm}
            className="btn btn-primary"
          >
            <Send size={16} />
            Submit Exam
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmitDialog;