import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import StudentEntry from './components/StudentEntry';
import StudentTest from './components/StudentTest';
import TestResult from './components/TestResult';
import type { StudentAnswer, Test, TestResult as TestResultType } from './types';
import LandingPage from './components/LandingPage';
import CreateTest from './components/CreateTest';
import { StudentTestWrapperOld } from './components/StudentTestWrapperOld';
import './App.css';
import ExamWrapper from './components/Exam/ExamWrapper';

// Create a wrapper component to extract URL params
const ExamRouteWrapper = () => {
  const { testCode } = useParams();
  return <ExamWrapper testCode={testCode} />;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState<'landing' | 'login' | 'dashboard' | 'create'>('landing');
  const [tests, setTests] = useState<Test[]>([]);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentView('landing');
  };

  const handleTestCreated = (test: Test) => {
    setTests(prev => [...prev, test]);
    setCurrentView('dashboard');
    
    // Show success message with test link using testKey (4-letter code)
    const testLink = `${window.location.origin}/${test.testKey}`;
    alert(`Test created successfully!\n\nShare this link with your students:\n${testLink}\n\nTest Code: ${test.testKey}`);
  };

  const TeacherApp = () => {
    switch (currentView) {
      case 'landing':
        return <LandingPage onLogin={() => setCurrentView('login')} />;
      case 'login':
        return <LoginPage onLogin={handleLogin} onBack={() => setCurrentView('landing')} />;
      case 'dashboard':
        return (
          <Dashboard 
            onCreateTest={() => setCurrentView('create')}
            onLogout={handleLogout}
            tests={tests}
          />
        );
      case 'create':
        return (
          <CreateTest 
            onBackToDashboard={() => setCurrentView('dashboard')}
            onCreateTest={handleTestCreated}
          />
        );
      default:
        return <LandingPage onLogin={() => setCurrentView('login')} />;
    }
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Teacher routes */}
          <Route path="/" element={<TeacherApp />} />
          
          {/* Student routes - 4-letter test codes */}
          <Route path="/:testCode" element={<ExamRouteWrapper />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
