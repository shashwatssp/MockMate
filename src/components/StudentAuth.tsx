import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { studentSignIn, studentSignUp } from '../lib/auth';
import { getStudentProfile, createBatchEnrollment } from '../lib/database';
import type { StudentIdentity } from '../lib/database';
import { User, Lock, KeyRound, BookOpen, LogIn, Eye, EyeOff, ArrowLeft, Shield, Mail } from 'lucide-react';
import './LoginPage.css';

interface Props {
  onBack?: () => void;
  onAuthenticated: (identity: StudentIdentity) => void;
}

export const StudentAuth: React.FC<Props> = ({ onBack, onAuthenticated }) => {
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>(
    location.pathname.includes('/register') ? 'register' : 'login'
  );

  // Keep mode in sync if the URL changes after a navigation within the student flow
  useEffect(() => {
    const newMode = location.pathname.includes('/register') ? 'register' : 'login';
    setMode(newMode);
  }, [location.pathname]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [awaiting, setAwaiting] = useState<{ email: string; batchCode: string } | null>(null);
  const [joinBatchCode, setJoinBatchCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'register') {
        const trimmedEmail = email.trim();
        const trimmedName = name.trim();
        if (!trimmedEmail || !trimmedName || !password) {
          throw new Error('Email, full name, and password are required');
        }
        if (password.length < 6) throw new Error('Password must be at least 6 characters');
        const code = batchCode.trim() ? batchCode.trim().toUpperCase() : undefined;
        await studentSignUp(trimmedEmail, password, trimmedName, code);
        toast.success('Registration successful! Please sign in');
        setMode('login');
        setEmail('');
        setName('');
        setPassword('');
        setBatchCode('');
      } else {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) throw new Error('Email and password are required');
        const identity = await studentSignIn(trimmedEmail, password);
        const profile = await getStudentProfile() ?? identity;
        if (!profile.isApproved) {
          setAwaiting({ email: profile.email, batchCode: profile.pendingBatchCode ?? 'pending' });
          return;
        }
        onAuthenticated(profile);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinBatchCode.trim() || !awaiting) return;
    setJoinLoading(true);
    try {
      const code = joinBatchCode.trim().toUpperCase();
      const enrollment = await createBatchEnrollment({ email: awaiting.email, batchCode: code });
      if (enrollment) {
        setAwaiting({ email: awaiting.email, batchCode: code });
        setJoinBatchCode('');
        toast.success(`Added to batch ${code}. A teacher will approve your account.`);
      } else {
        toast.error('Could not join batch. Please check the batch code.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join batch');
    } finally {
      setJoinLoading(false);
    }
  };

  if (awaiting) {
    const hasBatch = awaiting.batchCode !== 'pending';
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
        <button onClick={() => { setAwaiting(null); setMode('login'); setJoinBatchCode(''); }} className="back-button">
            <ArrowLeft className="back-icon" />
            <span className="back-text">Back to login</span>
          </button>
          <div className="login-card visible">
            <div className="login-header">
              <div className="brand-container">
                <div className="brand-icon"><BookOpen className="icon" /></div>
                <h1 className="brand-title">Mock<span className="brand-highlight">Mate</span></h1>
              </div>
              <div className="welcome-text">
                {hasBatch ? (
                  <>
                    <h2 className="welcome-title">Awaiting Approval</h2>
                    <p className="welcome-subtitle">
                    {awaiting.email} has been added to batch <strong>{awaiting.batchCode}</strong>. A teacher will approve
                      your account before you can access your dashboard and take tests.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="welcome-title">Account Created</h2>
                    <p className="welcome-subtitle">
                      {awaiting.email}, your account has been created. You can join a batch by entering a batch code below, or wait for your teacher to add you by email.
                    </p>
                    <form onSubmit={handleJoinBatch} className="login-form" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">
                          <KeyRound className="label-icon" />
                          Join a batch
                        </label>
                        <div className="input-wrapper">
                          <input
                            type="text"
                            value={joinBatchCode}
                            onChange={e => setJoinBatchCode(e.target.value)}
                            placeholder="Enter batch code (e.g. AB12C3)"
                            maxLength={6}
                            className="form-input"
                            disabled={joinLoading}
                            autoComplete="off"
                          />
                          <div className="input-icon">
                            <KeyRound className="icon" />
                          </div>
                        </div>
                      </div>
                      <button
                        type="submit"
                        className={`submit-button ${joinLoading ? 'loading' : ''}`}
                        disabled={joinLoading || !joinBatchCode.trim()}
                      >
                        {joinLoading ? (
                          <><div className="loading-spinner"></div><span>Joining…</span></>
                        ) : (
                          <><LogIn className="submit-icon" /><span>Join Batch</span></>
                        )}
                      </button>
                    </form>
                    <p className="welcome-subtitle" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
                      No batch code yet? Your teacher can add you by email, or share code <strong>DEMO01</strong> for the demo batch.
                    </p>
                  </>
                )}
              </div>
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
        {onBack ? (
          <button onClick={onBack} className="back-button">
            <ArrowLeft className="back-icon" />
            <span className="back-text">Back to Home</span>
          </button>
        ) : null}
        <div className="login-card visible">
          <div className="login-header">
            <div className="brand-container">
              <div className="brand-icon"><BookOpen className="icon" /></div>
              <h1 className="brand-title">Mock<span className="brand-highlight">Mate</span></h1>
            </div>
            <div className="welcome-text">
              <h2 className="welcome-title">{mode === 'login' ? 'Student Login' : 'Student Sign Up'}</h2>
              <p className="welcome-subtitle">
                {mode === 'login'
                  ? 'Enter your credentials to access your dashboard'
                  : 'Create your account to start learning'}
              </p>
            </div>
            <div className="security-badge">
              <Shield className="security-icon" />
              <span>Secure Login</span>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="login-form">
            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label className="form-label">
                    <User className="label-icon" />
                    Full name
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Aarav Sharma"
                      className="form-input"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    <KeyRound className="label-icon" />
                    Batch code <span className="optional-hint">optional</span>
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      value={batchCode}
                      onChange={e => setBatchCode(e.target.value)}
                      placeholder="e.g. AB12C3 — leave blank to join later"
                      maxLength={6}
                      className="form-input"
                      disabled={loading}
                    />
                    <div className="input-icon">
                      <KeyRound className="icon" />
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">
                <Mail className="label-icon" />
                Email
              </label>
              <div className="input-wrapper">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. aarav.sharma@example.com"
                  className="form-input"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
                <div className="input-icon">
                  <Mail className="icon" />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                <Lock className="label-icon" />
                Password
              </label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  className="form-input"
                  required
                  disabled={loading}
                />
                <div className="input-icon">
                  <Lock className="icon" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="toggle-icon" /> : <Eye className="toggle-icon" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className={`submit-button ${loading ? 'loading' : ''}`}
              disabled={loading || (!email || !password) || (mode === 'register' && !name.trim())}
            >
              {loading ? (
                <><div className="loading-spinner"></div><span>{mode === 'register' ? 'Creating account…' : 'Signing in…'}</span></>
              ) : (
                <><LogIn className="submit-icon" /><span>{mode === 'register' ? 'Create Account' : 'Sign In'}</span></>
              )}
            </button>
          </form>
          <button
            type="button"
            className="auth-mode-toggle"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); }}
            disabled={loading}
          >
            {mode === 'login' ? 'New to MockMate? Create an account' : 'Already have an account? Sign in'}
          </button>
          <div className="login-footer">
            <div className="footer-links">
              <span className="student-note">Sign in with your email and password. A teacher will approve your account before you can access your dashboard.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentAuth;
