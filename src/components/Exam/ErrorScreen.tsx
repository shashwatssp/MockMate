import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorScreenProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}

export const ErrorScreen: React.FC<ErrorScreenProps> = ({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  onGoHome
}) => {
  return (
    <div className="error-screen">
      <div className="error-content">
        <div className="error-icon">
          <AlertTriangle size={64} />
        </div>
        
        <h1 className="error-title">{title}</h1>
        <p className="error-message">{message}</p>
        
        <div className="error-actions">
          {onRetry && (
            <button onClick={onRetry} className="btn btn-primary">
              <RefreshCw size={16} />
              Try Again
            </button>
          )}
          
          {onGoHome && (
            <button onClick={onGoHome} className="btn btn-secondary">
              <Home size={16} />
              Go Home
            </button>
          )}
        </div>
        
        <div className="error-tips">
          <h3>Troubleshooting Tips:</h3>
          <ul>
            <li>Check your internet connection</li>
            <li>Refresh the page</li>
            <li>Clear your browser cache</li>
            <li>Contact support if the problem persists</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen;