import React from 'react';
import { BookOpen, Loader } from 'lucide-react';

interface LoadingScreenProps {
  message?: string;
  submessage?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = "Loading...",
  submessage = "Please wait"
}) => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-animation">
          <BookOpen className="loading-book" size={48} />
          <Loader className="loading-spinner" size={32} />
        </div>
        
        <h2 className="loading-title">{message}</h2>
        <p className="loading-subtitle">{submessage}</p>
        
        <div className="loading-steps">
          <div className="step active">
            <div className="step-indicator"></div>
            <span>Initializing</span>
          </div>
          <div className="step">
            <div className="step-indicator"></div>
            <span>Loading Content</span>
          </div>
          <div className="step">
            <div className="step-indicator"></div>
            <span>Preparing Interface</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;