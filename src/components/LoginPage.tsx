import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  User, 
  Lock, 
  AlertCircle, 
  CheckCircle,
  BookOpen,
  Shield,
  Sparkles,
  LogIn,
  Copy,
  Info
} from 'lucide-react';
import './LoginPage.css';

interface LoginPageProps {
  onLogin: () => void;
  onBack: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onBack }) => {
  const [credentials, setCredentials] = useState({
    id: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [copiedCredential, setCopiedCredential] = useState<string | null>(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    // Simulate authentication delay for better UX
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check credentials
    if (credentials.id === '1234' && credentials.password === 'Testing') {
      onLogin();
    } else {
      setError('Invalid credentials. Please check your ID and password.');
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
    setError(''); // Clear error when user types
  };

  const copyCredential = async (type: 'id' | 'password', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCredential(type);
      setTimeout(() => setCopiedCredential(null), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      console.log(`${type}: ${value}`);
    }
  };

  const fillDemoCredentials = () => {
    setCredentials({
      id: '1234',
      password: 'Testing'
    });
    setError('');
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
        <button
          onClick={onBack}
          className="back-button"
        >
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
                Sign in to continue creating amazing tests
              </p>
            </div>

            <div className="security-badge">
              <Shield className="security-icon" />
              <span>Secure Login</span>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {/* Teacher ID Field */}
            <div className="form-group">
              <label htmlFor="id" className="form-label">
                <User className="label-icon" />
                Teacher ID
              </label>
              <div className={`input-wrapper ${focusedField === 'id' ? 'focused' : ''}`}>
                <input
                  type="text"
                  id="id"
                  name="id"
                  value={credentials.id}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('id')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your teacher ID"
                  className="form-input"
                  required
                  disabled={isLoading}
                />
                <div className="input-icon">
                  <User className="icon" />
                </div>
              </div>
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password" className="form-label">
                <Lock className="label-icon" />
                Password
              </label>
              <div className={`input-wrapper ${focusedField === 'password' ? 'focused' : ''}`}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={credentials.password}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password"
                  className="form-input"
                  required
                  disabled={isLoading}
                />
                <div className="input-icon">
                  <Lock className="icon" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="toggle-icon" />
                  ) : (
                    <Eye className="toggle-icon" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="error-message">
                <AlertCircle className="error-icon" />
                <span className="error-text">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className={`submit-button ${isLoading ? 'loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <LogIn className="submit-icon" />
                  <span>Sign In</span>
                </>
              )}
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
                Use these credentials to explore MockMate:
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
                onClick={fillDemoCredentials}
                className="auto-fill-button"
                disabled={isLoading}
              >
                <Sparkles className="fill-icon" />
                <span>Auto-fill credentials</span>
              </button>
            </div>
          </div>

          {/* Additional Links */}
          <div className="login-footer">
            <div className="footer-links">
              <a href="#" className="footer-link">Forgot Password?</a>
              <span className="link-divider">•</span>
              <a href="#" className="footer-link">Contact Support</a>
            </div>
            
            <div className="security-note">
              <Shield className="security-note-icon" />
              <span>Your data is encrypted and secure</span>
            </div>
          </div>
        </div>

        {/* Features Preview */}
        <div className={`features-preview ${isVisible ? 'visible' : ''}`}>
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
                <Sparkles className="icon" />
              </div>
              <div className="feature-content">
                <h4 className="feature-name">Smart Analytics</h4>
                <p className="feature-description">Detailed student analytics</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
