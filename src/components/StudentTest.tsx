import React, { useState, useEffect } from 'react';
import type { StudentAnswer, Test } from '../types';


interface StudentTestProps {
  test: Test;
  studentName: string;
  onSubmitTest: (answers: StudentAnswer[]) => void;
}

export const StudentTest: React.FC<StudentTestProps> = ({ test, studentName, onSubmitTest }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<StudentAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(test.duration * 60); // Convert minutes to seconds
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          handleSubmitTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleAnswerSelect = (questionId: string, selectedOption: number) => {
    setAnswers(prev => {
      const existingAnswer = prev.find(a => a.questionId === questionId);
      if (existingAnswer) {
        return prev.map(a => 
          a.questionId === questionId 
            ? { ...a, selectedOption } 
            : a
        );
      }
      return [...prev, { questionId, selectedOption }];
    });
  };

  const getSelectedAnswer = (questionId: string): number | undefined => {
    const answer = answers.find(a => a.questionId === questionId);
    return answer?.selectedOption;
  };

  const handleNext = () => {
    if (currentQuestion < test.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleQuestionJump = (index: number) => {
    setCurrentQuestion(index);
  };

  const handleSubmitTest = () => {
    onSubmitTest(answers);
  };

  const getAnsweredQuestionsCount = () => {
    return answers.length;
  };

  const currentQ = test.questions[currentQuestion];
  const selectedAnswer = getSelectedAnswer(currentQ.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{test.title}</h1>
              <p className="text-sm text-gray-600">Student: {studentName}</p>
            </div>
            <div className="flex items-center gap-4 mt-2 md:mt-0">
              <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                timeLeft > 300 ? 'bg-green-100 text-green-800' :
                timeLeft > 120 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                ⏱️ {formatTime(timeLeft)}
              </div>
              <div className="text-sm text-gray-600">
                {getAnsweredQuestionsCount()}/{test.questions.length} answered
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Question Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md p-4 sticky top-24">
                <h3 className="font-semibold text-gray-800 mb-4">Questions</h3>
                <div className="grid grid-cols-5 lg:grid-cols-4 gap-2">
                  {test.questions.map((_, index) => {
                    const isAnswered = answers.some(a => a.questionId === test.questions[index].id);
                    const isCurrent = index === currentQuestion;
                    
                    return (
                      <button
                        key={index}
                        onClick={() => handleQuestionJump(index)}
                        className={`w-8 h-8 rounded text-xs font-medium transition duration-200 ${
                          isCurrent
                            ? 'bg-blue-600 text-white'
                            : isAnswered
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setShowSubmitDialog(true)}
                  className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition duration-200"
                >
                  Submit Test
                </button>
              </div>
            </div>

            {/* Current Question */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Question {currentQuestion + 1} of {test.questions.length}
                  </h2>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-sm">
                    {currentQ.topic}
                  </span>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg text-gray-800 mb-6">{currentQ.text}</h3>
                  <div className="space-y-3">
                    {currentQ.options.map((option, index) => (
                      <label
                        key={index}
                        className={`block p-4 border rounded-lg cursor-pointer transition duration-200 ${
                          selectedAnswer === index
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center">
                          <input
                            type="radio"
                            name={`question-${currentQ.id}`}
                            value={index}
                            checked={selectedAnswer === index}
                            onChange={() => handleAnswerSelect(currentQ.id, index)}
                            className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-gray-800">
                            <strong>{String.fromCharCode(65 + index)}.</strong> {option}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={handlePrevious}
                    disabled={currentQuestion === 0}
                    className={`px-6 py-2 rounded-lg transition duration-200 ${
                      currentQuestion === 0
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    Previous
                  </button>
                  
                  <button
                    onClick={handleNext}
                    disabled={currentQuestion === test.questions.length - 1}
                    className={`px-6 py-2 rounded-lg transition duration-200 ${
                      currentQuestion === test.questions.length - 1
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Dialog */}
      {showSubmitDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Submit Test?</h3>
            <p className="text-gray-600 mb-6">
              You have answered {getAnsweredQuestionsCount()} out of {test.questions.length} questions. 
              {getAnsweredQuestionsCount() < test.questions.length && 
                ' Unanswered questions will be marked as incorrect.'
              }
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowSubmitDialog(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg transition duration-200"
              >
                Continue Test
              </button>
              <button
                onClick={handleSubmitTest}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition duration-200"
              >
                Submit Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentTest;