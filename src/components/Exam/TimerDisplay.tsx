// TimerDisplay.tsx - Timer Display Component
import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface TimerDisplayProps {
  timeRemaining: number; // in seconds
  totalTime: number; // in seconds
  onWarning: (show: boolean) => void;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timeRemaining,
  totalTime,
  onWarning
}) => {
  const [warningShown, setWarningShown] = useState(false);

  // Format time as HH:MM:SS or MM:SS
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Get timer status based on remaining time
  const getTimerStatus = (): 'normal' | 'warning' | 'critical' => {
    const percentage = (timeRemaining / totalTime) * 100;
    
    if (percentage <= 5) return 'critical'; // Less than 5%
    if (percentage <= 15) return 'warning'; // Less than 15%
    return 'normal';
  };

  const timerStatus = getTimerStatus();

  // Handle warning notifications
  useEffect(() => {
    if (timeRemaining <= 300 && !warningShown) { // 5 minutes
      setWarningShown(true);
      onWarning(true);
    }
  }, [timeRemaining, warningShown, onWarning]);

  return (
    <div className={`timer-display ${timerStatus}`}>
      <div className="timer-icon">
        {timerStatus === 'critical' ? (
          <AlertTriangle size={24} />
        ) : (
          <Clock size={24} />
        )}
      </div>
      
      <div className="timer-content">
        <span className="timer-value">{formatTime(timeRemaining)}</span>
        <span className="timer-label">Time Remaining</span>
      </div>
      
      {timerStatus === 'critical' && (
        <div className="timer-pulse" />
      )}
    </div>
  );
};

export default TimerDisplay;