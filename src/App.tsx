import { useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
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
import CreateQuestionScreen from './components/CreateQuestionScreen';
import PdfImportScreen from './components/PdfImportScreen';
import PdfImportPremiumReview from './components/PdfImportPremiumReview';
import type { GeminiQuestion } from './lib/geminiExtract';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ExamWrapper from './components/Exam/ExamWrapper';
import StudentAuth from './components/StudentAuth';
import StudentDashboard from './components/StudentDashboard';
import StudentProfile from './components/StudentProfile';
import StudentResults from './components/StudentResults';
import BatchesHome from './components/BatchesHome';
import BatchDetail from './components/BatchDetail';
import type { Test } from './types/exam.types';
import type { StudentIdentity } from './lib/database';
import { signOut } from './lib/auth';
import { setStudentSession } from './lib/studentSession';
import { getTeacherSession } from './lib/auth';
import SignUpPage from './components/SignUpPage';
import { extractionHealth } from './lib/extractionClient';
import { Toaster } from 'react-hot-toast';
import './App.css';

// AuthBridge is intentionally a no-op now that Clerk is optional.
// The local auth system (localAuth.ts) manages all sessions directly.
// Keep the component slot so the tree structure is unchanged.
const AuthBridge = () => null;

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

/** Auth gate: requires a local teacher session (e.g. demo teacher 1234 or a
 *  username registered via the local sign-up form). */
const RequireTeacherAuth = ({ children }: { children: ReactNode }) => {
  if (!getTeacherSession()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function TeacherApp({ tests, setTests }: TeacherAppProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut(); // clears local sessions
    } catch (error) {
      console.warn('Unable to sign out:', error);
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
      if (!getTeacherSession()) {
        return <LoginPage onLogin={() => navigate('/dashboard')} onBack={() => navigate('/')} />;
      }
      return (
        <Dashboard
          onCreateTest={() => navigate('/create-test')}
          onCreateQuestion={() => navigate('/create-question')}
          onLogout={handleLogout}
          tests={tests}
        />
      );
    case '/create-test':
      return (
        <CreateTest
          onBackToDashboard={() => navigate('/dashboard')}
          onImportPdf={() => navigate('/import-pdf', { state: { returnTo: '/create-test' } })}
          onCreateTest={handleTestCreated}
        />
      );
    case '/import-pdf': {
      // `returnTo` is passed via location state by whichever create screen
      // launched the import, so the flow can hand control back correctly.
      const returnTo = (location.state as { returnTo?: string })?.returnTo ?? '/create-test';
      return (
        <PdfImportScreen
          returnTo={returnTo}
          onBack={() => navigate(returnTo, { replace: true })}
        />
      );
    }
    case '/import-premium': {
      const premiumState = (location.state as {
        questions?: GeminiQuestion[];
        returnTo?: string;
      }) ?? {};
      const premiumReturnTo = premiumState.returnTo ?? '/create-test';
      const premiumQuestions = premiumState.questions ?? [];
      return (
        <PdfImportPremiumReview
          questions={premiumQuestions}
          returnTo={premiumReturnTo}
          onBack={() => navigate(premiumReturnTo, { replace: true })}
        />
      );
    }
    case '/create-question':
      return (
        <CreateQuestionScreen
          onBackToDashboard={() => navigate('/dashboard')}
          onImportPdf={() => navigate('/import-pdf', { state: { returnTo: '/create-question' } })}
        />
      );
    case '/forgot-password':
      return <ForgotPassword onBack={() => navigate('/')} />;
    case '/reset-password':
      return (
        <ResetPassword
          onBack={() => navigate('/login')}
          onPasswordReset={() => navigate('/login')}
        />
      );
    case '/signup':
      return <SignUpPage onBack={() => navigate('/')} />;
    default:
      return <LandingPage onLogin={() => navigate('/login')} />;
  }
}

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(getTeacherSession() ? '/dashboard' : '/login', { replace: true });
  }, [navigate]);

  return (
    <div className="auth-callback">
      <p>Completing sign-in...</p>
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  // Probe the Questify extraction service on app open. Render's free tier
  // cold-starts, so firing this on launch lets it become healthy before the user
  // reaches the PDF import screen. Fire-and-forget only: it never blocks or
  // breaks app load — PdfImportScreen re-checks `serviceReady` on its own mount.
  useEffect(() => {
    extractionHealth().catch(() => {});
  }, []);

  const handleStudentAuthenticated = (identity: StudentIdentity) => {
    setStudentSession(identity);
    navigate('/student/dashboard', { replace: true });
  };

  const [tests, setTests] = useState<Test[]>([]);
  return (
    <div className="App">
      <Toaster position="bottom-right" />
      <AuthBridge />
      <Routes>
          <Route path="/" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/login" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/dashboard" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/create-test" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/create-question" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/import-pdf" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/import-premium" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/forgot-password" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/reset-password" element={<TeacherApp tests={tests} setTests={setTests} />} />
          <Route path="/signup" element={<TeacherApp tests={tests} setTests={setTests} />} />

          {/* Student batch-shell routes (auth-gated inside each component). */}
          <Route path="/student/login" element={<StudentAuth onAuthenticated={handleStudentAuthenticated} onBack={() => navigate('/')} />} />
          <Route path="/student/register" element={<StudentAuth onAuthenticated={handleStudentAuthenticated} onBack={() => navigate('/')} />} />
          <Route path="/student/dashboard" element={<StudentDashboard batch={null} />} />
          <Route path="/student/profile" element={<StudentProfile />} />
          <Route path="/student/results/:testCode" element={<StudentResults />} />

          {/* Teacher batch-management routes (Clerk + local guard). */}
          <Route path="/batches" element={<RequireTeacherAuth><BatchesHome /></RequireTeacherAuth>} />
          <Route path="/batches/:code" element={<RequireTeacherAuth><BatchDetail /></RequireTeacherAuth>} />

          <Route path="/exam/:testCode" element={<LegacyExamRedirect />} />
          <Route path="/exam/:testCode/entry" element={<ExamRouteWrapper />} />
          <Route path="/exam/:testCode/test" element={<ExamRouteWrapper />} />
          <Route path="/exam/:testCode/results" element={<ExamRouteWrapper />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Preserve old four-character student links. */}
          <Route path="/:testCode" element={<LegacyExamRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
