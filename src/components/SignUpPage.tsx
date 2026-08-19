import React, { useState, useEffect } from 'react';
import { SignUp } from '@clerk/react';
import { ArrowLeft, BookOpen, Shield, Info, User, Lock, Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import './LoginPage.css';
import { teacherSignUp } from '../lib/auth';
import { toast } from 'react-hot-toast';

interface SignUpPageProps {
  onBack: () => void;
}

/**
 * Teacher sign-up via Clerk.
 *
 * Sets `unsafeMetadata.role = 'teacher'` so the AuthBridge can recognise the
 * user.  After a successful sign-up the teacher is redirected to `/login`.
 */
export const SignUpPage: React.FC<SignUpPageProps> = ({ onBack }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleLocalSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLoading) return;
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setFormLoading(true);
    try {
      await teacherSignUp(username, password, name);
      toast.success('Account created successfully');
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setFormLoading(false);
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
        {/* Back Button */}
        <button onClick={onBack} className="back-button">
          <ArrowLeft className="back-icon" />
          <span className="back-text">Back to Home</span>
        </button>

        {/* Sign Up Card */}
        <div className={`login-card ${isVisible ? 'visible' : ''}`}>
          {/* Header Section */}
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
              <h2 className="welcome-title">Create Your Account</h2>
              <p className="welcome-subtitle">
                Sign up with your email to start creating tests
              </p>
            </div>

            <div className="security-badge">
              <Shield className="security-icon" />
              <span>Secure Sign Up</span>
            </div>
          </div>

          {/* Local Teacher Sign-Up Form */}
          <form className="teacher-login-form" onSubmit={handleLocalSignUp}>
            <div className="form-group">
              <label htmlFor="username" className="form-label">Teacher ID</label>
              <div className="input-wrapper">
                <User className="input-icon" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="form-input"
                  placeholder="Choose a teacher ID"
                  autoComplete="username"
                  disabled={formLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="name" className="form-label">Full Name</label>
              <div className="input-wrapper">
                <User className="input-icon" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                  placeholder="Jane Doe"
                  disabled={formLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <div className="input-wrapper">
                <Lock className="input-icon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  placeholder="At least 6 characters"
                  minLength={6}
                  autoComplete="new-password"
                  disabled={formLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="toggle-icon" />
                  ) : (
                    <Eye className="toggle-icon" />
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">Confirm Password</label>
              <div className="input-wrapper">
                <Lock className="input-icon" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-input"
                  placeholder="Re-enter your password"
                  minLength={6}
                  autoComplete="new-password"
                  disabled={formLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="password-toggle"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="toggle-icon" />
                  ) : (
                    <Eye className="toggle-icon" />
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="submit-button" disabled={formLoading}>
              {formLoading ? (
                <div className="loading-spinner"></div>
              ) : (
                <User className="submit-icon" />
              )}
              <span>{formLoading ? 'Creating account...' : 'Create Account'}</span>
            </button>
          </form>

          {/* Footer */}
          <div className="login-footer">
            <div className="footer-links">
              <Link to="/login" className="footer-link">Back to Sign In</Link>
              <span className="link-divider">·</span>
              <span className="student-note">
                By signing up, you become a teacher on MockMate.
                No emails are sent for account creation.
              </span>
            </div>

            <div className="security-note">
              <Shield className="security-note-icon" />
              <span>Your data is secure and private</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
