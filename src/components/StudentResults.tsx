import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getStudentProfile, getStudentResults, getTestByKey } from '../lib/database';
import { getStudentSession, setStudentSession } from '../lib/studentSession';
import type { StudentIdentity } from '../lib/database';
import type { Test, TestResult } from '../types/exam.types';
import { Loader2, AlertCircle } from 'lucide-react';
import './StudentDashboard.css';

// Student-facing review of a previously submitted result, plus a retry link back
// to the test entry (subject to the active-window rule enforced by ExamWrapper).
export const StudentResults: React.FC = () => {
  const { testCode } = useParams<{ testCode: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [me, setMe] = useState<StudentIdentity | null>(getStudentSession());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!testCode) return;
      setError(null);
      try {
        const profile = await getStudentProfile();
        if (!profile) { navigate('/student/login'); return; }
        setMe(profile); setStudentSession(profile);
        if (!profile.isApproved) { navigate('/student/dashboard'); return; }

        const t = await getTestByKey(testCode.toUpperCase());
        if (!t) throw new Error('Test not found');
        setTest(t);

        const allResults = await getStudentResults(profile.id);
        const match = allResults.find(r => r.testId === t.id);
        setResult(match ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [testCode]);

  if (loading) return <div className="student-loading"><Loader2 className="animate-spin" /> Loading results…</div>;
  if (!test || !me) return null;

  return (
    <div className="student-shell student-content">
      <button onClick={() => navigate('/student/dashboard')} className="student-btn-plain">← Back to dashboard</button>

      <h1>{test.name}</h1>
      {error ? <div className="student-error-inline"><AlertCircle /> {error}</div> : null}

      {result ? (
        <div className="student-result-card">
          <h2>Your result</h2>
          <div className="student-result-grid">
            <div className="student-result-stat"><div className="stat-label">Score</div><div className="stat-value">{result.score}/{result.totalMarks ?? result.totalQuestions}</div></div>
            <div className="student-result-stat"><div className="stat-label">Percentage</div><div className="stat-value">{result.percentage}%</div></div>
            <div className="student-result-stat"><div className="stat-label">Time taken</div><div className="stat-value">{Math.round(result.timeTaken / 60)}m</div></div>
          </div>

          <details className="student-result-details">
            <summary className="student-result-summary">Answers</summary>
            <div className="student-test-list">
              {test.questions.map((q, i) => {
                const ans = result.answers.find(a => a.questionId === q.id);
                const selected = ans?.selectedOption;
                const correct = q.correctAnswer;
                const isCorrect = selected === correct;
                return (
                  <div key={q.id} className="student-result-detail">
                    <div className="student-answer-name">{i + 1}. {q.text}</div>
                    <div className="student-answer-line">
                      Your answer: <b>{selected === undefined || selected === null ? '— (unanswered)' : q.options[selected]}</b>
                      {' '}{selected === undefined || selected === null ? null : (isCorrect ? <span className="student-answer-correct">✓ correct</span> : <span className="student-answer-wrong">✗ correct is {q.options[correct]}</span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      ) : (
        <p className="student-empty-text">You haven't attempted this test yet.</p>
      )}
    </div>
  );
};

export default StudentResults;
