import { useState, useCallback } from 'react';
import type { ExamState, StudentAnswer } from '../types/exam.types';

export const useExamState = () => {
  const [examState, setExamState] = useState<ExamState>({
    currentQuestionIndex: 0,
    answers: [],
    timeRemaining: 0,
    isSubmitted: false,
    bookmarkedQuestions: new Set(),
    visitedQuestions: new Set(),
    reviewMode: false
  });

  const initialize = useCallback((initialState: ExamState) => {
    setExamState(initialState);
  }, []);

  const updateAnswer = useCallback((questionId: string, selectedOption: number) => {
    setExamState(prev => {
      const existingIndex = prev.answers.findIndex(a => a.questionId === questionId);
      const newAnswer: StudentAnswer = {
        questionId,
        selectedOption,
        isBookmarked: prev.bookmarkedQuestions.has(questionId)
      };

      const updatedAnswers = existingIndex >= 0
        ? prev.answers.map((answer, index) => 
            index === existingIndex ? newAnswer : answer
          )
        : [...prev.answers, newAnswer];

      return {
        ...prev,
        answers: updatedAnswers
      };
    });
  }, []);

  const setCurrentQuestion = useCallback((index: number) => {
    setExamState(prev => ({
      ...prev,
      currentQuestionIndex: index
    }));
  }, []);

  const toggleBookmark = useCallback((questionId: string) => {
    setExamState(prev => {
      const newBookmarks = new Set(prev.bookmarkedQuestions);
      if (newBookmarks.has(questionId)) {
        newBookmarks.delete(questionId);
      } else {
        newBookmarks.add(questionId);
      }

      return {
        ...prev,
        bookmarkedQuestions: newBookmarks,
        answers: prev.answers.map(answer => 
          answer.questionId === questionId 
            ? { ...answer, isBookmarked: newBookmarks.has(questionId) }
            : answer
        )
      };
    });
  }, []);

  const markVisited = useCallback((questionId: string) => {
    setExamState(prev => ({
      ...prev,
      visitedQuestions: new Set([...prev.visitedQuestions, questionId])
    }));
  }, []);

  const submitExam = useCallback(() => {
    setExamState(prev => ({
      ...prev,
      isSubmitted: true
    }));
  }, []);

  const reset = useCallback(() => {
    setExamState({
      currentQuestionIndex: 0,
      answers: [],
      timeRemaining: 0,
      isSubmitted: false,
      bookmarkedQuestions: new Set(),
      visitedQuestions: new Set(),
      reviewMode: false
    });
  }, []);

  return {
    ...examState,
    initialize,
    updateAnswer,
    setCurrentQuestion,
    toggleBookmark,
    markVisited,
    submitExam,
    reset,
    answers: examState.answers
  };
};