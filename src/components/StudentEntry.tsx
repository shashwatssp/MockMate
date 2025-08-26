import React, { useState } from 'react';
import type { Test } from '../types';
import './StudentEntry.css';

interface StudentEntryProps {
  test: Test;
  onStartTest: (studentName: string) => void;
}

export const StudentEntry: React.FC<StudentEntryProps> = ({ test, onStartTest }) => {
  const [studentName, setStudentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleStartTest = async () => {
    if (!studentName.trim()) {
      alert('Please enter your name to start the test.');
      return;
    }
    setIsLoading(true);
    // Simulate loading for better UX
    setTimeout(() => {
      onStartTest(studentName.trim());
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="student-entry-container">
      <div className="background-decoration">
        <div className="floating-shape shape-1"></div>
        <div className="floating-shape shape-2"></div>
        <div className="floating-shape shape-3"></div>
      </div>
      
      <div className="entry-card">
        {/* Brand Header */}
        <div className="brand-header">
          <div className="brand-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </div>
          <h1 className="brand-title">MockMate Everywhere</h1>
          <p className="brand-subtitle">Your Gateway to Success</p>
        </div>

        {/* Test Information Card */}
        <div className="test-info-card">
          <div className="test-header">
            <h2 className="test-name">{test.name}</h2>
            <div className="test-badge">Ready</div>
          </div>
          
          <div className="test-details">
            <div className="detail-item">
              <div className="detail-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                </svg>
              </div>
              <span className="detail-text">{test.questions.length} Questions</span>
            </div>
            
            <div className="detail-item">
              <div className="detail-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/>
                </svg>
              </div>
              <span className="detail-text">{test.duration || test.timeLimit} Minutes</span>
            </div>
            
            <div className="detail-item">
              <div className="detail-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z"/>
                </svg>
              </div>
              <span className="detail-text">Multiple Choice</span>
            </div>
          </div>
        </div>

        {/* Student Input Section */}
        <div className="input-section">
          <label className="input-label">
            Enter Your Full Name
          </label>
          <div className="input-wrapper">
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleStartTest()}
              className="student-input"
              placeholder="John Doe"
              required
            />
            <div className="input-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Instructions Panel */}
        <div className="instructions-panel">
          <div className="instructions-header">
            <div className="warning-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12,2L13.09,8.26L22,9L13.09,9.74L12,16L10.91,9.74L2,9L10.91,8.26L12,2Z"/>
              </svg>
            </div>
            <h3>Important Instructions</h3>
          </div>
          <ul className="instructions-list">
            <li>Read each question carefully before answering</li>
            <li>Select only one answer per question</li>
            <li>You can review and change answers anytime</li>
            <li>Submit before the timer runs out</li>
          </ul>
        </div>

        {/* Action Button */}
        <button
          onClick={handleStartTest}
          disabled={isLoading}
          className={`start-button ${isLoading ? 'loading' : ''}`}
        >
          {isLoading ? (
            <>
              <div className="loading-spinner"></div>
              Preparing Test...
            </>
          ) : (
            <>
              <svg className="button-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
              </svg>
              Start Your Test
            </>
          )}
        </button>

        {/* Footer */}
        <div className="footer-message">
          <p>✨ Believe in yourself and do your best! ✨</p>
        </div>
      </div>
    </div>
  );
};

export default StudentEntry;
