import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import CreateTest from './components/CreateTest';
import ExamWrapper from './components/Exam/ExamWrapper';
import type { Test } from './types/exam.types';
import { signOut } from './lib/auth';
import './App.css';

const ExamRouteWrapper = () => {
  const { testCode } = useParams();
  return <ExamWrapper testCode={testCode} />;
};

const LegacyExamRedirect = () => {
  const { testCode } = useParams();
  return <Navigate to={`/exam/${testCode?.toUpperCase()}/entry`} replace />;
};

interface TeacherAppProps {
  tests: Test[];
  setTests: Dispatch<SetStateAction<Test[]>>;
}

function TeacherApp({ tests, setTests }: TeacherAppProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.warn('Unable to sign out of Supabase:', error);
    } finally {
      navigate('/');
    }
  };

  const handleTestCreated = (test: Test) => {
    setTests(prev => [...prev, test]);
    navigate('/dashboard');

    // Show success message with test link using testKey (4-letter code)
    const testLink = `${window.location.origin}/${test.testKey}`;
    alert(`Test created successfully!\n\nShare this link with your students:\n${testLink}\n\nTest Code: ${test.testKey}`);
  };

  switch (location.pathname) {
    case '/login':
      return <LoginPage onLogin={() => navigate('/dashboard')} onBack={() => navigate('/')} />;
    case '/dashboard':
      return (
        <Dashboard
          onCreateTest={() => navigate('/create-test')}
          onLogout={handleLogout}
          tests={tests}
        />
      );
    case '/create-test':
      return (
        <CreateTest
          onBackToDashboard={() => navigate('/dashboard')}
          onCreateTest={handleTestCreated}
        />
      );
    default:
      return <LandingPage onLogin={() => navigate('/login')} />;
  }
}

function App() {
  const [tests, setTests] = useState<Test[]>(() => {
    try {
      const stored = window.localStorage.getItem('mockmate.teacher.tests');
      return stored ? (JSON.parse(stored) as Test[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem('mockmate.teacher.tests', JSON.stringify(tests));
  }, [tests]);
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/login" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/dashboard" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/create-test" element={<TeacherApp tests={tests} setTests={setTests} />} />

          <Route path="/exam/:testCode" element={<LegacyExamRedirect />} />
          <Route path="/exam/:testCode/entry" element={<ExamRouteWrapper />} />
          <Route path="/exam/:testCode/test" element={<ExamRouteWrapper />} />
          <Route path="/exam/:testCode/results" element={<ExamRouteWrapper />} />

          {/* Preserve old four-character student links. */}
          <Route path="/:testCode" element={<LegacyExamRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
