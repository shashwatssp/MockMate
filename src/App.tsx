import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, Navigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import StudentEntry from './components/StudentEntry';
import StudentTest from './components/StudentTest';
import TestResult from './components/TestResult';
import type { StudentAnswer, Test } from './types';
import LandingPage from './components/LandingPage';
import CreateTest from './components/CreateTest';
import './App.css';

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
    
    // Show success message with test link
    const testLink = `${window.location.origin}/test/${test.id}`;
    alert(`Test created successfully!\n\nShare this link with your students:\n${testLink}`);
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

  const StudentTestPage = () => {
    const { testId } = useParams();
    const [studentName, setStudentName] = useState<string>('');
    const [testStarted, setTestStarted] = useState(false);
    const [testCompleted, setTestCompleted] = useState(false);
    const [studentAnswers, setStudentAnswers] = useState<StudentAnswer[]>([]);
    const [score, setScore] = useState(0);

    const test = tests.find(t => t.id === testId);

    const handleStartTest = (name: string) => {
      setStudentName(name);
      setTestStarted(true);
    };

    const handleSubmitTest = (answers: StudentAnswer[]) => {
      if (!test) return;

      // Calculate score
      let correctAnswers = 0;
      answers.forEach(answer => {
        const question = test.questions.find(q => q.id === answer.questionId);
        if (question && question.correctAnswer === answer.selectedOption) {
          correctAnswers++;
        }
      });


      setStudentAnswers(answers);
      setScore(correctAnswers);
      setTestCompleted(true);
    };

    const handleRetakeTest = () => {
      setTestStarted(false);
      setTestCompleted(false);
      setStudentAnswers([]);
      setScore(0);
      setStudentName('');
    };

    if (testCompleted && test) {
      return (
        <TestResult
          test={test}
          studentName={studentName}
          answers={studentAnswers}
          score={score}
          onRetakeTest={handleRetakeTest}
        />
      );
    }

    if (testStarted && test) {
      return (
        <StudentTest
          test={test}
          studentName={studentName}
          onSubmitTest={handleSubmitTest}
        />
      );
    }

    return (
      <StudentEntry
        test={test}
        onStartTest={handleStartTest}
      />
    );
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<TeacherApp />} />
          <Route path="/test/:testId" element={<StudentTestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}


export default App;