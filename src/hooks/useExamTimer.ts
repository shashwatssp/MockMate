import { useRef, useCallback, useState, useEffect } from 'react';

export const useExamTimer = () => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [warnings, setWarnings] = useState({
    fifteenMinutes: false,
    fiveMinutes: false,
    oneMinute: false
  });
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  const start = useCallback((initialTime: number) => {
    setTimeRemaining(initialTime);
    setIsRunning(true);
    startTimeRef.current = Date.now();
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = Math.max(0, prev - 1);
        
        // Trigger warnings
        setWarnings(prevWarnings => ({
          fifteenMinutes: newTime <= 900 || prevWarnings.fifteenMinutes, // 15 minutes
          fiveMinutes: newTime <= 300 || prevWarnings.fiveMinutes, // 5 minutes
          oneMinute: newTime <= 60 || prevWarnings.oneMinute // 1 minute
        }));

        if (newTime === 0) {
          setIsRunning(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }

        return newTime;
      });
    }, 1000);
  }, []);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    pausedTimeRef.current = Date.now();
  }, []);

  const resume = useCallback(() => {
    if (!isRunning && timeRemaining > 0) {
      setIsRunning(true);
      
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = Math.max(0, prev - 1);
          
          if (newTime === 0) {
            setIsRunning(false);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
          }

          return newTime;
        });
      }, 1000);
    }
  }, [isRunning, timeRemaining]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimeRemaining(0);
    setIsRunning(false);
    setWarnings({
      fifteenMinutes: false,
      fiveMinutes: false,
      oneMinute: false
    });
    startTimeRef.current = 0;
    pausedTimeRef.current = 0;
  }, []);

  const addTime = useCallback((seconds: number) => {
    setTimeRemaining(prev => prev + seconds);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Handle page visibility change (pause when tab is hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRunning) {
        pause();
      } else if (!document.hidden && pausedTimeRef.current > 0) {
        resume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRunning, pause, resume]);

  return {
    timeRemaining,
    isRunning,
    warnings,
    start,
    pause,
    resume,
    stop,
    reset,
    addTime
  };
};
