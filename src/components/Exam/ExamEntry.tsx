import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  Users, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  User,
  Timer,
  Target,
  Shield,
  Coffee,
  Monitor,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Award,
  Calendar,
  Globe,
  Zap
} from 'lucide-react';
import type { Test } from '../../types/exam.types';
import './ExamEntry.css';

interface ExamEntryProps {
  test: Test;
  onStartExam: (studentName: string) => void;
  onError: (error: string) => void;
  timeInfo?: {
    canEnter: boolean;
    timeUntilEntry: number;
    timeUntilStart: number;
    isTestActive: boolean;
    hasTestEnded: boolean;
  };
}

export const ExamEntry: React.FC<ExamEntryProps> = ({ 
  test, 
  onStartExam, 
  onError,
  timeInfo
}) => {
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [systemCheck, setSystemCheck] = useState({
    browser: true,
    connection: true,
    fullscreen: true,
    camera: false,
    microphone: false
  });

  useEffect(() => {
    // Update time every second
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Perform comprehensive system checks
    const checkSystem = async () => {
      const checks = {
        browser: 'requestFullscreen' in document.documentElement,
        connection: navigator.onLine,
        fullscreen: document.fullscreenEnabled || document.webkitFullscreenEnabled || false,
        camera: false,
        microphone: false
      };

      // Check for media devices if proctoring is enabled
      if (test.isProctored) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          checks.camera = devices.some(device => device.kind === 'videoinput');
          checks.microphone = devices.some(device => device.kind === 'audioinput');
        } catch (error) {
          console.warn('Media device check failed:', error);
        }
      }

      setSystemCheck(checks);
    };

    checkSystem();
    
    // Network status listeners
    const handleOnline = () => setSystemCheck(prev => ({ ...prev, connection: true }));
    const handleOffline = () => setSystemCheck(prev => ({ ...prev, connection: false }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [test.isProctored]);

  const handleStartExam = async () => {
    const trimmedName = studentName.trim();
    const trimmedEmail = studentEmail.trim();
    
    if (!trimmedName) {
      onError('Please enter your full name to start the exam.');
      return;
    }
    
    if (trimmedName.length < 2) {
      onError('Please enter a valid full name (minimum 2 characters).');
      return;
    }

    if (!trimmedEmail || !/\S+@\S+\.\S+/.test(trimmedEmail)) {
      onError('Please enter a valid email address.');
      return;
    }

    if (!agreedToTerms) {
      onError('Please agree to the terms and conditions to continue.');
      return;
    }

    // System requirement checks
    if (!systemCheck.connection) {
      onError('No internet connection detected. Please check your network and try again.');
      return;
    }

    if (test.isProctored && (!systemCheck.camera || !systemCheck.microphone)) {
      onError('Camera and microphone access required for proctored exams.');
      return;
    }

    setIsLoading(true);
    
    try {
      // Simulate validation and setup
      await new Promise(resolve => setTimeout(resolve, 2000));
      onStartExam(trimmedName);
    } catch (error) {
      onError('Failed to start exam. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && agreedToTerms) {
      handleStartExam();
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDifficulty = () => {
    const questionsPerMinute = test.questions.length / test.timeLimit;
    if (questionsPerMinute > 2) return { level: 'Hard', color: 'difficulty-hard' };
    if (questionsPerMinute > 1) return { level: 'Medium', color: 'difficulty-medium' };
    return { level: 'Easy', color: 'difficulty-easy' };
  };

  const difficulty = calculateDifficulty();

  return (
    <div className="exam-entry-screen">
      {/* Background Elements */}
      <div className="entry-background">
        <div className="bg-gradient"></div>
        <div className="bg-pattern"></div>
        <div className="floating-elements">
          <div className="float-element float-1"></div>
          <div className="float-element float-2"></div>
          <div className="float-element float-3"></div>
        </div>
      </div>

      <div className="entry-container">
        {/* Left Panel - Test Information */}
        <div className="entry-info-panel">
          <div className="info-header">
            <div className="platform-brand">
              <div className="brand-icon">
                <BookOpen size={28} />
              </div>
              <div className="brand-text">
                <h1 className="brand-title">Mock Mate</h1>
                <p className="brand-subtitle">Smart Testing Platform</p>
              </div>
            </div>
            <div className="live-time">
              <Clock size={16} />
              <span>{formatDateTime(currentTime)}</span>
            </div>
          </div>

          <div className="test-overview">
            <div className="test-header">
              <h2 className="test-title">{test.title || test.name}</h2>
              <div className={`difficulty-badge ${difficulty.color}`}>
                <Target size={16} />
                {difficulty.level}
              </div>
            </div>
            
            {test.description && (
              <p className="test-description">{test.description}</p>
            )}

            <div className="test-stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <FileText size={20} />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{test.questions.length}</span>
                  <span className="stat-label">Questions</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Timer size={20} />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{test.timeLimit}</span>
                  <span className="stat-label">Minutes</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Award size={20} />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{test.passingScore || 70}%</span>
                  <span className="stat-label">Pass Mark</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Users size={20} />
                </div>
                <div className="stat-content">
                  <span className="stat-value">{test.maxAttempts || 1}</span>
                  <span className="stat-label">Attempts</span>
                </div>
              </div>
            </div>

            <div className="test-features">
              <h3 className="features-title">Exam Features</h3>
              <div className="features-list">
                <div className="feature-item">
                  <CheckCircle2 size={16} />
                  <span>Auto-save answers</span>
                </div>
                {test.allowReview && (
                  <div className="feature-item">
                    <CheckCircle2 size={16} />
                    <span>Review & modify answers</span>
                  </div>
                )}
                <div className="feature-item">
                  <CheckCircle2 size={16} />
                  <span>Question bookmarking</span>
                </div>
                <div className="feature-item">
                  <CheckCircle2 size={16} />
                  <span>Progress tracking</span>
                </div>
                {test.isProctored && (
                  <div className="feature-item">
                    <Shield size={16} />
                    <span>AI Proctoring enabled</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* System Check */}
          <div className="system-check">
            <h3 className="check-title">System Status</h3>
            <div className="check-grid">
              <div className={`check-item ${systemCheck.connection ? 'check-pass' : 'check-fail'}`}>
                {systemCheck.connection ? <Wifi size={16} /> : <WifiOff size={16} />}
                <span>Internet Connection</span>
                {systemCheck.connection ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              </div>
              
              <div className={`check-item ${systemCheck.browser ? 'check-pass' : 'check-fail'}`}>
                <Monitor size={16} />
                <span>Browser Compatible</span>
                {systemCheck.browser ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              </div>
              
              <div className={`check-item ${systemCheck.fullscreen ? 'check-pass' : 'check-fail'}`}>
                <Globe size={16} />
                <span>Fullscreen Support</span>
                {systemCheck.fullscreen ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              </div>

              {test.isProctored && (
                <>
                  <div className={`check-item ${systemCheck.camera ? 'check-pass' : 'check-fail'}`}>
                    <Monitor size={16} />
                    <span>Camera Access</span>
                    {systemCheck.camera ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  </div>
                  
                  <div className={`check-item ${systemCheck.microphone ? 'check-pass' : 'check-fail'}`}>
                    <Coffee size={16} />
                    <span>Microphone Access</span>
                    {systemCheck.microphone ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Entry Form */}
        <div className="entry-form-panel">
          <div className="form-header">
            <div className="form-icon">
              <User size={24} />
            </div>
            <h2 className="form-title">Enter Exam Details</h2>
            <p className="form-subtitle">Please provide your information to begin</p>
          </div>

          <div className="entry-form">
            <div className="form-group">
              <label className="form-label">
                <User size={16} />
                Full Name *
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                onKeyPress={handleKeyPress}
                className="form-input"
                placeholder="Enter your full name as per ID"
                required
                disabled={isLoading}
                autoComplete="name"
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Globe size={16} />
                Email Address *
              </label>
              <input
                type="email"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                className="form-input"
                placeholder="Enter your email address"
                required
                disabled={isLoading}
                autoComplete="email"
                maxLength={100}
              />
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="checkbox-input"
                  disabled={isLoading}
                />
                <span className="checkbox-custom"></span>
                <span className="checkbox-text">
                  I agree to the <button type="button" className="link-button" onClick={() => setShowInstructions(!showInstructions)}>terms and conditions</button> and exam guidelines
                </span>
              </label>
            </div>

            {showInstructions && (
              <div className="instructions-panel">
                <h4>Exam Instructions & Guidelines</h4>
                <ul>
                  <li>Ensure stable internet connection throughout the exam</li>
                  <li>Do not refresh the page or close the browser tab</li>
                  <li>Use fullscreen mode for better experience</li>
                  <li>Each question must be answered within the time limit</li>
                  {test.allowReview && <li>You can review and modify answers before final submission</li>}
                  {test.isProctored && <li>AI monitoring is active - avoid suspicious behavior</li>}
                  <li>Contact support immediately if you face technical issues</li>
                </ul>
              </div>
            )}

            <button
              onClick={handleStartExam}
              disabled={isLoading || !studentName.trim() || !studentEmail.trim() || !systemCheck.connection || !agreedToTerms}
              className={`btn btn-primary btn-start ${isLoading ? 'loading' : ''}`}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  <span>Initializing Exam...</span>
                </>
              ) : (
                <>
                  <Zap size={20} />
                  <span>Start Exam Now</span>
                </>
              )}
            </button>

            <div className="security-notice">
              <Shield size={16} />
              <span>Your session is encrypted and secure</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamEntry;
