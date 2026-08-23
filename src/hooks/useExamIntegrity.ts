/**
 * Exam integrity hook — tracks tab-switching during an active exam and
 * surfaces a warning once a configurable threshold is crossed.
 *
 * Unlike a full proctoring stack (camera, screenshot blocking, etc.), this
 * hook is intentionally lightweight: it only counts how many times the
 * student leaves the exam tab / window, and flips `warned` to `true` when
 * the count reaches `TAB_SWITCH_WARNING_THRESHOLD` (default: 3).
 *
 * The hook is active for **all** exams while the exam phase is 'active'.
 * Listeners are attached only during the active window and cleaned up on
 * unmount or whenever the active state changes.
 *
 * False positives from rapid focus toggles (< 500 ms away) are filtered out.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Number of tab switches before the first warning is surfaced. */
export const TAB_SWITCH_WARNING_THRESHOLD = 3;

/** Minimum time (ms) the tab must be hidden to count as a real switch. */
const MIN_HIDE_DURATION = 500;

export interface ExamIntegrityResult {
  /** How many times the student switched away from the exam tab/window. */
  tabSwitchCount: number;
  /** Whether the student has crossed the warning threshold at least once. */
  warned: boolean;
  /** Reset the counter (e.g. on exam retake). */
  reset: () => void;
}

export const useExamIntegrity = (
  isActive: boolean,
): ExamIntegrityResult => {
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [warned, setWarned] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    setTabSwitchCount(0);
    setWarned(false);
  }, []);

  useEffect(() => {
    if (!isActive) {
      // Tear down listeners when the exam is no longer active.
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    let wasHidden = false;
    let blurTimestamp = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHidden = true;
        blurTimestamp = Date.now();
      } else if (wasHidden) {
        wasHidden = false;
        // Only count if the tab was hidden for a meaningful duration
        // to avoid false positives from quick focus toggles.
        if (Date.now() - blurTimestamp >= MIN_HIDE_DURATION) {
          setTabSwitchCount((c) => c + 1);
        }
      }
    };

    const handleBlur = () => {
      blurTimestamp = Date.now();
      wasHidden = true;
    };

    const handleFocus = () => {
      if (wasHidden && Date.now() - blurTimestamp >= MIN_HIDE_DURATION) {
        setTabSwitchCount((c) => c + 1);
      }
      wasHidden = false;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    cleanupRef.current = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };

    return cleanupRef.current;
  }, [isActive]);

  // Fire the warning flag when the threshold is crossed.
  useEffect(() => {
    if (tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD && !warned) {
      setWarned(true);
    }
  }, [tabSwitchCount, warned]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return {
    tabSwitchCount,
    warned,
    reset,
  };
};
