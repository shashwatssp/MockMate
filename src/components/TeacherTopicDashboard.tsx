import { toErrorMessage } from '../lib/errors';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react';
import { getOwnedTestsForTeacher, getTestResults } from '../lib/database';
import { getTeacherSession } from '../lib/localAuth';
import type { Test, TestResult } from '../types/exam.types';
import { SkeletonList, SkeletonStats } from './Skeleton';
import { EmptyState } from './EmptyState';
import './TeacherTopicDashboard.css';

interface TopicStat {
  correct: number;
  total: number;
}

interface StudentStat {
  key: string;
  name: string;
  correct: number;
  total: number;
  topics: Map<string, TopicStat>;
}

interface DrillQuestion {
  text: string;
  testKey: string;
  attempts: number;
  correct: number;
}

const pctOf = (stat: TopicStat | undefined): number =>
  stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;

const band = (pct: number): 'good' | 'ok' | 'poor' =>
  pct >= 75 ? 'good' : pct >= 40 ? 'ok' : 'poor';

/** Teacher topic-mastery dashboard (§3.2): class-wide per-topic accuracy,
 *  strongest/weakest topic per student, and a drill-in that lists the actual
 *  questions behind a topic's score. Best attempt per student per test feeds
 *  the aggregates (multi-attempts don't skew the picture). */
export const TeacherTopicDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [resultsByTest, setResultsByTest] = useState<Record<string, TestResult[]>>({});
  const [drillTopic, setDrillTopic] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const teacher = getTeacherSession();
      if (!teacher) {
        navigate('/login');
        return;
      }
      const owned = await getOwnedTestsForTeacher();
      setTests(owned);

      const byTest: Record<string, TestResult[]> = {};
      await Promise.all(
        owned.map(async test => {
          try {
            byTest[test.id] = await getTestResults(test.id);
          } catch {
            byTest[test.id] = []; // a failing test must not sink the page
          }
        }),
      );
      setResultsByTest(byTest);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { topicChips, studentCards } = useMemo(() => {
    const topics = new Map<string, TopicStat>();
    const students = new Map<string, StudentStat>();

    tests.forEach(test => {
      // Best attempt per student per test — re-attempts don't skew averages.
      const bestByStudent = new Map<string, TestResult>();
      (resultsByTest[test.id] ?? []).forEach(result => {
        const key = (result.studentId ?? result.studentEmail ?? result.studentName).toLowerCase();
        const existing = bestByStudent.get(key);
        if (!existing || result.percentage > existing.percentage) bestByStudent.set(key, result);
      });

      bestByStudent.forEach(result => {
        const key = (result.studentId ?? result.studentEmail ?? result.studentName).toLowerCase();
        let student = students.get(key);
        if (!student) {
          student = {
            key,
            name: result.studentName || result.studentEmail || 'Student',
            correct: 0,
            total: 0,
            topics: new Map(),
          };
          students.set(key, student);
        }

        test.questions.forEach(question => {
          const topic = question.topic || 'General';
          const answer = result.answers.find(a => a.questionId === question.id);
          const isCorrect = Boolean(
            answer && answer.selectedOption >= 0 && answer.selectedOption === question.correctAnswer,
          );

          if (!topics.has(topic)) topics.set(topic, { correct: 0, total: 0 });
          const topicStat = topics.get(topic)!;
          topicStat.total += 1;
          if (isCorrect) topicStat.correct += 1;

          student.total += 1;
          if (isCorrect) student.correct += 1;
          if (!student.topics.has(topic)) student.topics.set(topic, { correct: 0, total: 0 });
          const studentTopic = student.topics.get(topic)!;
          studentTopic.total += 1;
          if (isCorrect) studentTopic.correct += 1;
        });
      });
    });

    const topicChips = Array.from(topics.entries())
      .map(([topic, stat]) => ({ topic, ...stat, pct: pctOf(stat) }))
      .sort((a, b) => a.pct - b.pct || b.total - a.total);

    const studentCards = Array.from(students.values())
      .map(student => {
        const entries = Array.from(student.topics.entries())
          .map(([topic, stat]) => ({ topic, ...stat, pct: pctOf(stat) }))
          .filter(entry => entry.total > 0)
          .sort((a, b) => b.pct - a.pct);
        return {
          ...student,
          avgPct: pctOf({ correct: student.correct, total: student.total }),
          strongest: entries.length ? entries[0] : null,
          weakest: entries.length ? entries[entries.length - 1] : null,
          topicEntries: entries,
        };
      })
      .sort((a, b) => b.avgPct - a.avgPct || a.name.localeCompare(b.name));

    return { topicChips, studentCards };
  }, [tests, resultsByTest]);

  // Drill-in: the actual questions behind the selected topic, weakest first.
  const drillQuestions = useMemo<DrillQuestion[]>(() => {
    if (!drillTopic) return [];
    const out: DrillQuestion[] = [];
    tests.forEach(test => {
      test.questions
        .filter(question => (question.topic || 'General') === drillTopic)
        .forEach(question => {
          let attempts = 0;
          let correct = 0;
          (resultsByTest[test.id] ?? []).forEach(result => {
            const answer = result.answers.find(a => a.questionId === question.id);
            attempts += 1;
            if (answer && answer.selectedOption >= 0 && answer.selectedOption === question.correctAnswer) {
              correct += 1;
            }
          });
          out.push({
            text: question.text || question.id,
            testKey: test.testKey,
            attempts,
            correct,
          });
        });
    });
    return out.sort(
      (a, b) => (a.attempts ? a.correct / a.attempts : 0) - (b.attempts ? b.correct / b.attempts : 0),
    );
  }, [drillTopic, tests, resultsByTest]);

  if (loading) {
    return (
      <div className="topics-shell" role="status" aria-busy="true">
        <span className="skel-sr">Loading topic mastery…</span>
        <div className="topics-header">
          <h1>Topic mastery</h1>
        </div>
        <SkeletonStats count={3} />
        <SkeletonList rows={4} />
      </div>
    );
  }

  const hasData = topicChips.length > 0 && studentCards.length > 0;

  return (
    <div className="topics-shell">
      <div className="topics-header">
        <div>
          <h1>Topic mastery</h1>
          <p className="topics-sub">
            How the class performs per topic, aggregated from every test's best attempts.
          </p>
        </div>
        <div className="topics-header-actions">
          <button onClick={() => void load()} className="topics-btn-plain">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => navigate('/dashboard')} className="topics-btn-plain">
            <ArrowLeft size={14} /> Dashboard
          </button>
        </div>
      </div>

      {error ? <div className="student-error-inline" role="alert">{error}</div> : null}

      {!hasData ? (
        <EmptyState
          icon={TrendingUp}
          title="No results yet"
          description="Topic mastery appears once students start attempting your tests."
        />
      ) : (
        <>
          {/* Class-wide topic accuracy — weakest first, tap to drill in. */}
          <section className="topics-card">
            <h2>Class topics</h2>
            <p className="topics-muted">Sorted weakest first. Tap a topic to see the questions behind the score.</p>
            <div className="topics-chip-list">
              {topicChips.map(chip => (
                <button
                  key={chip.topic}
                  type="button"
                  className={`topics-chip band-${band(chip.pct)}`}
                  onClick={() => setDrillTopic(chip.topic)}
                  title={`See the questions behind ${chip.topic}`}
                >
                  <span className="topics-chip-name">{chip.topic}</span>
                  <span className="topics-chip-pct">{chip.pct}%</span>
                  <span className="topics-chip-bar" aria-hidden="true">
                    <span className="topics-chip-fill" style={{ width: `${chip.pct}%` }} />
                  </span>
                  <span className="topics-chip-count">{chip.correct}/{chip.total} correct</span>
                </button>
              ))}
            </div>
          </section>

          {/* Per-student cards: strongest / weakest topic at a glance. */}
          <section className="topics-card">
            <h2>Students</h2>
            <div className="topics-student-grid">
              {studentCards.map(student => (
                <div key={student.key} className="topics-student-card">
                  <div className="topics-student-head">
                    <span className="topics-student-name">{student.name}</span>
                    <span className={`topics-student-avg band-${band(student.avgPct)}`}>{student.avgPct}%</span>
                  </div>
                  <div className="topics-student-extremes">
                    {student.strongest ? (
                      <span className="topics-extreme">
                        <TrendingUp size={13} /> Strongest: <strong>{student.strongest.topic}</strong>{' '}
                        <span className="topics-extreme-pct">({student.strongest.pct}%)</span>
                      </span>
                    ) : null}
                    {student.weakest && student.strongest?.topic !== student.weakest.topic ? (
                      <span className="topics-extreme">
                        <TrendingDown size={13} /> Weakest: <strong>{student.weakest.topic}</strong>{' '}
                        <span className="topics-extreme-pct">({student.weakest.pct}%)</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="topics-mini-list">
                    {student.topicEntries.map(entry => (
                      <span key={entry.topic} className={`topics-mini band-${band(entry.pct)}`} title={`${entry.topic}: ${entry.correct}/${entry.total}`}>
                        {entry.topic} {entry.pct}%
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Topic drill-in modal */}
      {drillTopic ? (
        <div className="topics-modal-overlay" role="dialog" aria-modal="true" onClick={() => setDrillTopic(null)}>
          <div className="topics-modal" onClick={e => e.stopPropagation()}>
            <div className="topics-modal-head">
              <h3>{drillTopic}</h3>
              <button onClick={() => setDrillTopic(null)} className="topics-btn-plain" title="Close">
                <X size={14} />
              </button>
            </div>
            <p className="topics-muted">
              {drillQuestions.length} question{drillQuestions.length !== 1 ? 's' : ''} across your tests, sorted by class accuracy.
            </p>
            <div className="topics-drill-list">
              {drillQuestions.map((question, i) => {
                const pct = question.attempts > 0 ? Math.round((question.correct / question.attempts) * 100) : 0;
                return (
                  <div key={`${question.testKey}-${i}`} className={`topics-drill-item band-${band(pct)}`}>
                    <div className="topics-drill-text">{question.text}</div>
                    <div className="topics-drill-meta">
                      <span className="topics-drill-pct">{pct}%</span>
                      <span className="topics-drill-sub">{question.correct}/{question.attempts} correct · {question.testKey}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TeacherTopicDashboard;
