import React, { useState } from 'react';
import type { Test } from '../types';


interface StudentEntryProps {
  test: Test | null;
  onStartTest: (studentName: string) => void;
}

export const StudentEntry: React.FC<StudentEntryProps> = ({ test, onStartTest }) => {
  const [studentName, setStudentName] = useState('');

  const handleStartTest = () => {
    if (!studentName.trim()) {
      alert('Please enter your name to start the test.');
      return;
    }
    onStartTest(studentName.trim());
  };

  if (!test) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Test Not Found</h1>
          <p className="text-gray-600">
            The test you're looking for doesn't exist or may have been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="text-blue-600 text-5xl mb-4">📝</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Mock<span className="text-blue-600">Mate</span>
          </h1>
          <p className="text-gray-600">Ready to take your test?</p>
        </div>

        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{test.title}</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center">
              <span className="w-4 h-4 mr-2">📝</span>
              <span>{test.questions.length} questions</span>
            </div>
            <div className="flex items-center">
              <span className="w-4 h-4 mr-2">⏱️</span>
              <span>{test.duration} minutes</span>
            </div>
            <div className="flex items-center">
              <span className="w-4 h-4 mr-2">✅</span>
              <span>Multiple choice questions</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label htmlFor="studentName" className="block text-sm font-medium text-gray-700 mb-2">
            Your Name
          </label>
          <input
            type="text"
            id="studentName"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleStartTest()}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition duration-200"
            placeholder="Enter your full name"
            required
          />
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Instructions:</h3>
          <ul className="text-xs text-yellow-700 space-y-1">
            <li>• Read each question carefully</li>
            <li>• Select only one answer per question</li>
            <li>• You can review and change answers before submitting</li>
            <li>• Submit the test before time runs out</li>
          </ul>
        </div>

        <button
          onClick={handleStartTest}
          disabled={!studentName.trim()}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition duration-300 transform hover:scale-105 ${
            studentName.trim()
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Start Test
        </button>

        <div className="text-center mt-6">
          <p className="text-xs text-gray-500">
            Good luck! Do your best and stay calm.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StudentEntry;