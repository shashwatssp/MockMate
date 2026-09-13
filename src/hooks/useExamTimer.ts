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
  /** Absolute wall-clock end time (ms epoch) while running. The remaining
   *  time is always DERIVED from this deadline, never from decrementing a
   *  counter, so background-tab/OS interval throttling cannot stretch the
   *  exam and switching apps can never grant free time. */
  const deadlineRef = useRef<number>(0);
  /** Last computed remaining seconds (used by pause/resume/addTime). */
  const remainingRef = useRef<number>(0);

  const clearTicker = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const tick = useCallback((): number => {
    const newTime = deadlineRef.current > 0
      ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      : 0;
    remainingRef.current = newTime;
    setTimeRemaining(newTime);

    // Trigger warnings
    setWarnings(prevWarnings => ({
      fifteenMinutes: newTime <= 900 || prevWarnings.fifteenMinutes, // 15 minutes
      fiveMinutes: newTime <= 300 || prevWarnings.fiveMinutes, // 5 minutes
      oneMinute: newTime <= 60 || prevWarnings.oneMinute // 1 minute
    }));

    if (newTime === 0) {
      setIsRunning(false);
      clearTicker();
    }
    return newTime;
  }, []);

  const start = useCallback((initialTime: number) => {
    deadlineRef.current = Date.now() + initialTime * 1000;
    setIsRunning(true);
    clearTicker();
    tick();
    intervalRef.current = setInterval(tick, 1000);
  }, [tick]);

  const pause = useCallback(() => {
    // Freeze at the last computed remaining time. On resume the deadline is
    // recomputed as now + remaining, so a paused exam consumes no extra time
    // but also never gains any.
    clearTicker();
    setIsRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (!isRunning && remainingRef.current > 0) {
      deadlineRef.current = Date.now() + remainingRef.current * 1000;
      setIsRunning(true);
      clearTicker();
      tick();
      intervalRef.current = setInterval(tick, 1000);
    }
  }, [isRunning, tick]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    clearTicker();
    deadlineRef.current = 0;
    remainingRef.current = 0;
    setTimeRemaining(0);
    setIsRunning(false);
    setWarnings({
      fifteenMinutes: false,
      fiveMinutes: false,
      oneMinute: false
    });
  }, []);

  const addTime = useCallback((seconds: number) => {
    if (isRunning) {
      deadlineRef.current += seconds * 1000;
      tick();
    } else {
      remainingRef.current = Math.max(0, remainingRef.current + seconds);
      setTimeRemaining(remainingRef.current);
    }
  }, [isRunning, tick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // NOTE: there is intentionally NO `visibilitychange` pause here. Pausing
  // while the tab/app is hidden was an exploit: a student could switch apps
  // for ten minutes and lose nothing. Background ticks may be throttled by the
  // browser, but the wall-clock derivation means no tick is needed to lose
  // time — the remaining time is already in the past when the next tick fires.

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
