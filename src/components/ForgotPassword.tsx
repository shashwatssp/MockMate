import React, { useState } from 'react';
import {
  BookOpen,
  Mail,
  ArrowLeft,
  Send,
  Shield,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { resetPassword } from '../lib/auth';
import './LoginPage.css';

interface ForgotPasswordProps {
  onBack: () => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setIsLoading(true);
    setError('');
    setMessage('');
    try {
      await resetPassword(email);
      setMessage('If an account exists for that email, a password reset link has been sent.');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-background">
        <div className="login-gradient"></div>
        <div className="floating-elements">
          <div className="floating-shape shape-1"></div>
          <div className="floating-shape shape-2"></div>
          <div className="floating-shape shape-3"></div>
          <div className="floating-shape shape-4"></div>
          <div className="floating-shape shape-5"></div>
        </div>
      </div>

      <div className="login-container">
        <button onClick={onBack} className="back-button">
          <ArrowLeft className="back-icon" />
          <span className="back-text">Back to Home</span>
        </button>

        <div className="login-card visible">
          <div className="login-header">
            <div className="brand-container">
              <div className="brand-icon">
                <BookOpen className="icon" />
              </div>
              <h1 className="brand-title">
                Mock<span className="brand-highlight">Mate</span>
              </h1>
            </div>

            <div className="welcome-text">
              <h2 className="welcome-title">Forgot Password?</h2>
              <p className="welcome-subtitle">
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>

            <div className="security-badge">
              <Shield className="security-icon" />
              <span>Secure Reset</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                <Mail className="label-icon" />
                Email Address
              </label>
              <div className="input-wrapper">
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                    setMessage('');
                  }}
                  placeholder="you@example.com"
                  className="form-input"
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
                <div className="input-icon">
                  <Mail className="icon" />
                </div>
              </div>
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle className="error-icon" />
                <span className="error-text">{error}</span>
              </div>
            )}

            {message && (
              <div className="success-message">
                <CheckCircle className="success-icon" />
                <span className="success-text">{message}</span>
              </div>
            )}

            <button type="submit" className={`submit-button ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Send className="submit-icon" />
                  <span>Send Reset Link</span>
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <div className="security-note">
              <Shield className="security-note-icon" />
              <span>Check your inbox (and spam folder) for the reset link.</span>
            </div>
          </div>
        </div>

        <div className="features-preview visible">
          <h3 className="features-title">Why Choose MockMate?</h3>
          <div className="features-list">
            <div className="feature-item">
              <div className="feature-icon primary">
                <BookOpen className="icon" />
              </div>
              <div className="feature-content">
                <h4 className="feature-name">Easy Test Creation</h4>
                <p className="feature-description">Create tests in minutes</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon success">
                <CheckCircle className="icon" />
              </div>
              <div className="feature-content">
                <h4 className="feature-name">Real-time Results</h4>
                <p className="feature-description">Instant performance insights</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon warning">
                <Shield className="icon" />
              </div>
              <div className="feature-content">
                <h4 className="feature-name">Secure Account</h4>
                <p className="feature-description">Protected by design</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
