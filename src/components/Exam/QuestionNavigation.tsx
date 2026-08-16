import { useEffect, useMemo, useRef } from 'react';
import type { Question, StudentAnswer } from '../../types/exam.types';

export type QuestionStatus =
  | 'current' // the active question
  | 'answered-review' // answered AND marked for review
  | 'answered' // answered, not marked
  | 'review' // marked for review but unanswered
  | 'visited' // visited but unanswered, not marked
  | 'unvisited'; // never touched

export interface QuestionNavigationProps {
  /** Full canonical list of questions for the exam (already shuffled if randomization is on). */
  questions: Question[];
  /** Index of the question currently being edited. */
  currentQuestionIndex: number;
  /** Shared answer records keyed by questionId. */
  answers: StudentAnswer[];
  /** "Mark for Review" bucket — same set as examState.bookmarkedQuestions. */
  bookmarkedQuestions: Set<string>;
  /** Questions the student has visited at least once. */
  visitedQuestions: Set<string>;
  /** Jump to the given question index. */
  onQuestionSelect: (index: number) => void;
  /** On mobile the sidebar is a drawer; this controls the open state. */
  isOpen?: boolean;
}

type StatusCounts = Record<QuestionStatus, number>;

const initialCounts: StatusCounts = {
  current: 0,
  'answered-review': 0,
  answered: 0,
  review: 0,
  visited: 0,
  unvisited: 0,
};

/**
 * Derive the status of every question from the shared source of truth.
 * No answer state is duplicated here — statuses are recomputed on every
 * change to answers / bookmarkedQuestions / visitedQuestions.
 */
function useQuestionStatuses(props: QuestionNavigationProps): QuestionStatus[] {
  const {
    questions,
    currentQuestionIndex,
    answers,
    bookmarkedQuestions,
    visitedQuestions,
  } = props;

  return useMemo(() => {
    const answerMap = new Map<string, StudentAnswer>();
    answers.forEach((a) => answerMap.set(a.questionId, a));

    return questions.map((q, i) => {
      const answered =
        answerMap.has(q.id) && answerMap.get(q.id)!.selectedOption !== -1;
      const marked = bookmarkedQuestions.has(q.id);
      const visited = visitedQuestions.has(q.id) || i === currentQuestionIndex;
      const current = i === currentQuestionIndex;

      if (current) return 'current';
      if (answered && marked) return 'answered-review';
      if (answered) return 'answered';
      if (marked) return 'review';
      if (visited) return 'visited';
      return 'unvisited';
    });
  }, [
    questions,
    currentQuestionIndex,
    answers,
    bookmarkedQuestions,
    visitedQuestions,
  ]);
}

/**
 * Keep focus on the newly-current question button when the current question
 * moves, so keyboard / screen-reader users follow navigation without relying
 * on color alone. `<button>` already handles Enter/Space natively.
 */
function useFocusCurrentButton(
  currentIndex: number,
  questionCount: number,
) {
  const buttonRefs = useRef<Map<number, HTMLButtonElement | null>>(null);
  const currentIdRef = useRef<string | null>(null);

  if (!buttonRefs.current) {
    buttonRefs.current = new Map();
  }

  const register = (index: number) => (el: HTMLButtonElement | null) => {
    buttonRefs.current!.set(index, el);
  };

  useEffect(() => {
    const key = `q-${currentIndex}`;
    if (currentIdRef.current !== key) {
      currentIdRef.current = key;
      buttonRefs.current!.get(currentIndex)?.focus();
    }
  }, [currentIndex]);

  // Drop stale refs when the question list itself changes shape.
  useEffect(() => {
    const store = buttonRefs.current;
    if (!store) return;
    return () => {
      for (let i = 0; i < questionCount; i++) store.delete(i);
    };
  }, [questionCount]);

  return register;
}

const QuestionNavigation = (props: QuestionNavigationProps) => {
  const {
    questions,
    currentQuestionIndex,
    onQuestionSelect,
    isOpen = false,
  } = props;

  const statuses = useQuestionStatuses(props);

  const statusCounts: StatusCounts = useMemo(() => {
    const counts = { ...initialCounts };
    statuses.forEach((s) => {
      counts[s] += 1;
    });
    return counts;
  }, [statuses]);

  const register = useFocusCurrentButton(
    currentQuestionIndex,
    questions.length,
  );

  const answeredCount = statusCounts.answered + statusCounts['answered-review'];
  const markedCount = statusCounts.review + statusCounts['answered-review'];
  const visitedCount =
    statusCounts.visited + answeredCount + markedCount;
  const total = questions.length;
  const progress = total === 0 ? 0 : Math.round((answeredCount / total) * 100);

  const className = `exam-sidebar${isOpen ? ' open' : ''}`;

  if (total === 0) {
    return null;
  }

  return (
    <aside id="question-navigation" className={className} aria-label="Question navigation">
      <nav
        className="question-nav"
        aria-label="Questions"
        role="group"
        aria-labelledby="nav-title"
      >
        <header className="nav-header">
          <h2 id="nav-title" className="nav-title">
            Questions
          </h2>
        </header>

        <ul className="nav-stats" aria-label="Answer summary">
          <li className="nav-stat answered">
            <span className="nav-stat-value">{answeredCount}</span>
            <span className="nav-stat-label">Answered</span>
          </li>
          <li className="nav-stat">
            <span className="nav-stat-value">{markedCount}</span>
            <span className="nav-stat-label">Marked</span>
          </li>
          <li className="nav-stat">
            <span className="nav-stat-value">{visitedCount}</span>
            <span className="nav-stat-label">Visited</span>
          </li>
          <li className="nav-stat nav-stat--progress" aria-label="Progress">
            <div
              className="nav-progress-bar"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: `${progress}%` }}
            />
            <span className="nav-stat-value">{progress}%</span>
            <span className="nav-stat-label">Complete</span>
          </li>
        </ul>

        <ol className="question-grid" role="list">
          {questions.map((q, i) => {
            const status = statuses[i];
            const classes = [
              'question-btn',
              `status-${status}`,
              status === 'current' ? 'current' : '',
              status === 'answered' || status === 'answered-review'
                ? 'answered'
                : '',
              status === 'review' || status === 'answered-review'
                ? 'bookmarked'
                : '',
            ]
              .filter(Boolean)
              .join(' ');

            // Communicate full status non-visually (colors are reinforced with
            // text via the aria-label, never color-only).
            let statusWord: string;
            if (status === 'current') statusWord = 'current question';
            else if (status === 'answered' || status === 'answered-review')
              statusWord = 'answered';
            else if (status === 'review')
              statusWord = 'marked for review';
            else if (status === 'visited') statusWord = 'visited, unanswered';
            else statusWord = 'not visited';

            return (
              <li key={q.id}>
                <button
                  ref={register(i)}
                  type="button"
                  className={classes}
                  aria-label={`Go to question ${i + 1}, ${statusWord}`}
                  aria-current={status === 'current' ? 'step' : undefined}
                  title={`Question ${i + 1} — ${statusWord}`}
                  onClick={() => onQuestionSelect(i)}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>

        <footer className="nav-legend" aria-label="Legend">
          <h3 className="legend-title">Status legend</h3>
          <ul className="legend">
            <li>
              <span className="legend-swatch current" aria-hidden="true" />
              <span>Current</span>
            </li>
            <li>
              <span className="legend-swatch answered" aria-hidden="true" />
              <span>Answered</span>
            </li>
            <li>
              <span className="legend-swatch review" aria-hidden="true" />
              <span>Marked for review</span>
            </li>
            <li>
              <span className="legend-swatch visited" aria-hidden="true" />
              <span>Visited</span>
            </li>
            <li>
              <span className="legend-swatch unvisited" aria-hidden="true" />
              <span>Not visited</span>
            </li>
          </ul>
          <p className="legend-note">
            Colors are reinforced with status text in each button label.
          </p>
        </footer>
      </nav>
    </aside>
  );
};

export default QuestionNavigation;
