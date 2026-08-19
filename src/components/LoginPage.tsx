import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Shield,
  Sparkles,
  Copy,
  CheckCircle,
  Info,
  User,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { teacherSignIn } from '../lib/auth';
import { toast } from 'react-hot-toast';
import './LoginPage.css';

interface LoginPageProps {
  onLogin: () => void;
  onBack: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onBack }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [copiedCredential, setCopiedCredential] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      await teacherSignIn('1234', 'Testing');
      toast.success('Signed in as demo teacher');
      onLogin();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Demo sign-in failed');
    } finally {
      setDemoLoading(false);
    }
  };

  const copyCredential = async (type: 'id' | 'password', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCredential(type);
      setTimeout(() => setCopiedCredential(null), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      console.log(`${type}: ${value}`);
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLoading) return;
    setFormLoading(true);
    try {
      await teacherSignIn(username, password);
      toast.success('Signed in successfully');
      onLogin();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
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

        {/* Login Card */}
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
              <h2 className="welcome-title">Welcome Back!</h2>
              <p className="welcome-subtitle">
                Sign in with your email to continue creating tests
              </p>
            </div>

            <div className="security-badge">
              <Shield className="security-icon" />
              <span>Secure Login</span>
            </div>
          </div>

          {/* Local Teacher Sign-In Form */}
          <form className="teacher-login-form" onSubmit={handleLocalLogin}>
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
                  placeholder="Enter your teacher ID"
                  autoComplete="username"
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
                  placeholder="Enter your password"
                  autoComplete="current-password"
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

            <button type="submit" className="submit-button" disabled={formLoading}>
              {formLoading ? (
                <div className="loading-spinner"></div>
              ) : (
                <User className="submit-icon" />
              )}
              <span>{formLoading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          </form>

          {/* Demo Credentials Section */}
          <div className="demo-section">
            <div className="demo-header">
              <Info className="demo-info-icon" />
              <h3 className="demo-title">Demo Credentials</h3>
            </div>

            <div className="demo-content">
              <p className="demo-description">
                Use your existing demo teacher account to explore MockMate offline:
              </p>

              <div className="credentials-grid">
                <div className="credential-item">
                  <div className="credential-label">Teacher ID:</div>
                  <div className="credential-value">
                    <code className="credential-code">1234</code>
                    <button
                      onClick={() => copyCredential('id', '1234')}
                      className="copy-button"
                      title="Copy ID"
                    >
                      {copiedCredential === 'id' ? (
                        <CheckCircle className="copy-icon success" />
                      ) : (
                        <Copy className="copy-icon" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="credential-item">
                  <div className="credential-label">Password:</div>
                  <div className="credential-value">
                    <code className="credential-code">Testing</code>
                    <button
                      onClick={() => copyCredential('password', 'Testing')}
                      className="copy-button"
                      title="Copy Password"
                    >
                      {copiedCredential === 'password' ? (
                        <CheckCircle className="copy-icon success" />
                      ) : (
                        <Copy className="copy-icon" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleDemoLogin}
                className="auto-fill-button"
                disabled={demoLoading}
              >
                {demoLoading ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <Sparkles className="fill-icon" />
                )}
                <span>
                  {demoLoading ? 'Signing in...' : 'Use demo teacher (offline)'}
                </span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="login-footer">
            <div className="footer-links">
              <Link to="/signup" className="footer-link">Sign up as teacher</Link>
              <span className="link-divider">·</span>
              <span className="student-note">
                Sign in with your email, or use the demo teacher account below.
              </span>
            </div>

            <div className="security-note">
              <Shield className="security-note-icon" />
              <span>Your data is encrypted and secure</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
