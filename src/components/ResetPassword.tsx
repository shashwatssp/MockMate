import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  Save,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { handleAuthCallback, updatePassword } from '../lib/auth';
import './LoginPage.css';

interface ResetPasswordProps {
  onBack: () => void;
  onPasswordReset: () => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ onBack, onPasswordReset }) => {
  const [credentials, setCredentials] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExchanging, setIsExchanging] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // The recovery link carries a PKCE `code`; swap it for a session before allowing
  // the password change. Reuses the same callback handler as the magic-link flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await handleAuthCallback();
      } catch (exchangeError) {
        if (!cancelled) {
          setError(
            exchangeError instanceof Error
              ? `Unable to verify reset link: ${exchangeError.message}`
              : 'Unable to verify reset link. It may be expired or invalid.'
          );
        }
      } finally {
        if (!cancelled) setIsExchanging(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (credentials.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (credentials.password !== credentials.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      await updatePassword(credentials.password);
      onPasswordReset();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials({ ...credentials, [e.target.name]: e.target.value });
    setError('');
  };

  if (isExchanging) {
    return (
      <div className="login-wrapper">
        <div className="login-container">
          <div className="login-card visible" style={{ textAlign: 'center' }}>
            <div className="login-header">
              <div className="brand-container">
                <div className="brand-icon"><BookOpen className="icon" /></div>
                <h1 className="brand-title">Mock<span className="brand-highlight">Mate</span></h1>
              </div>
              <p className="welcome-subtitle">Verifying your reset link…</p>
            </div>
            <div style={{ padding: '16px 0' }}>
              <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              <div className="brand-icon"><BookOpen className="icon" /></div>
              <h1 className="brand-title">Mock<span className="brand-highlight">Mate</span></h1>
            </div>
            <div className="welcome-text">
              <h2 className="welcome-title">Set a New Password</h2>
              <p className="welcome-subtitle">Choose a strong password to secure your account.</p>
            </div>
            <div className="security-badge">
              <Shield className="security-icon" />
              <span>Secure Reset</span>
            </div>
          </div>

          {error && (
            <div className="error-message">
              <AlertCircle className="error-icon" />
              <span className="error-text">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                <Lock className="label-icon" />
                New Password
              </label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={credentials.password}
                  onChange={handleChange}
                  placeholder="Enter new password"
                  className="form-input"
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <div className="input-icon"><Lock className="icon" /></div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="toggle-icon" /> : <Eye className="toggle-icon" />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm" className="form-label">
                <Lock className="label-icon" />
                Confirm Password
              </label>
              <div className="input-wrapper">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  id="confirm"
                  name="confirm"
                  value={credentials.confirm}
                  onChange={handleChange}
                  placeholder="Confirm new password"
                  className="form-input"
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <div className="input-icon"><Lock className="icon" /></div>
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="password-toggle"
                  disabled={isLoading}
                >
                  {showConfirm ? <EyeOff className="toggle-icon" /> : <Eye className="toggle-icon" />}
                </button>
              </div>
            </div>

            <button type="submit" className={`submit-button ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  <span>Updating…</span>
                </>
              ) : (
                <>
                  <Save className="submit-icon" />
                  <span>Reset Password</span>
                </>
              )}
            </button>

            <div className="login-footer">
              <div className="security-note">
                <Shield className="security-note-icon" />
                <span>Your password will be updated immediately after confirmation.</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
