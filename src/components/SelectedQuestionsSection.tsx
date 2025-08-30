import React, { useState } from 'react';
import {
  CheckCircle,
  X,
  Star,
  BookOpen,
  Calendar,
  Target,
  TrendingUp,
  BarChart3,
  Users,
  Eye,
  EyeOff,
  Shuffle,
  RotateCcw,
  Filter,
  Search,
  Grid,
  List,
  ChevronDown,
  Zap,
  Trash2,
  Copy,
  Download,
  Share2
} from 'lucide-react';
import type { Question } from '../types';
import './CreateTest.css';

type ViewMode = 'grid' | 'list' | 'compact';
type SortBy = 'default' | 'topic' | 'difficulty' | 'subject' | 'selection-order';
type DifficultyLevel = 'easy' | 'medium' | 'hard';
type GroupBy = 'none' | 'subject' | 'topic' | 'difficulty';

interface SelectedQuestionsSectionProps {
  selectedQuestions: Question[];
  setSelectedQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  getDifficulty: (question: Question) => DifficultyLevel;
  isLoaded: boolean;
}

export const SelectedQuestionsSection: React.FC<SelectedQuestionsSectionProps> = ({
  selectedQuestions,
  setSelectedQuestions,
  getDifficulty,
  isLoaded
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [sortBy, setSortBy] = useState<SortBy>('selection-order');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedForAction, setSelectedForAction] = useState<string[]>([]);

  // Filter selected questions based on search
  const filteredQuestions = selectedQuestions.filter(question =>
    searchQuery === '' ||
    question.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    question.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
    question.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort questions
  const sortedQuestions = [...filteredQuestions].sort((a, b) => {
    switch (sortBy) {
      case 'topic':
        return a.topic.localeCompare(b.topic);
      case 'subject':
        return a.subject.localeCompare(b.subject);
      case 'difficulty':
        const diffOrder = { easy: 1, medium: 2, hard: 3 };
        return diffOrder[getDifficulty(a)] - diffOrder[getDifficulty(b)];
      case 'selection-order':
      default:
        return selectedQuestions.indexOf(a) - selectedQuestions.indexOf(b);
    }
  });

  // Group questions
  const groupedQuestions = () => {
    if (groupBy === 'none') {
      return { 'All Questions': sortedQuestions };
    }

    return sortedQuestions.reduce((groups, question) => {
      let key: string;
      switch (groupBy) {
        case 'subject':
          key = question.subject || 'Unknown Subject';
          break;
        case 'topic':
          key = question.topic || 'Unknown Topic';
          break;
        case 'difficulty':
          key = getDifficulty(question);
          break;
        default:
          key = 'All Questions';
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(question);
      return groups;
    }, {} as Record<string, Question[]>);
  };

  const groups = groupedQuestions();

  // Remove question
  const removeQuestion = (questionId: string) => {
    setSelectedQuestions(prev => prev.filter(q => q.id !== questionId));
    setSelectedForAction(prev => prev.filter(id => id !== questionId));
  };

  // Remove multiple questions
  const removeSelectedQuestions = () => {
    setSelectedQuestions(prev => prev.filter(q => !selectedForAction.includes(q.id)));
    setSelectedForAction([]);
  };

  // Shuffle questions
  const shuffleQuestions = () => {
    setSelectedQuestions(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  };

  // Clear all questions
  const clearAllQuestions = () => {
    if (window.confirm('Are you sure you want to remove all selected questions?')) {
      setSelectedQuestions([]);
      setSelectedForAction([]);
    }
  };

  // Toggle question selection for bulk actions
  const toggleQuestionForAction = (questionId: string) => {
    setSelectedForAction(prev => 
      prev.includes(questionId) 
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  // Select all questions for action
  const selectAllForAction = () => {
    setSelectedForAction(filteredQuestions?.map(q => q.id));
  };

  // Deselect all questions for action
  const deselectAllForAction = () => {
    setSelectedForAction([]);
  };

  // Get statistics
  const getStats = () => {
    const total = selectedQuestions.length;
    const byDifficulty = selectedQuestions.reduce((acc, q) => {
      const diff = getDifficulty(q);
      acc[diff] = (acc[diff] || 0) + 1;
      return acc;
    }, {} as Record<DifficultyLevel, number>);
    
    const bySubject = selectedQuestions.reduce((acc, q) => {
      acc[q.subject] = (acc[q.subject] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byTopic = selectedQuestions.reduce((acc, q) => {
      acc[q.topic] = (acc[q.topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total, byDifficulty, bySubject, byTopic };
  };

  const stats = getStats();

  // Export functionality
  const exportQuestions = () => {
    const exportData = selectedQuestions.map((q, index) => ({
      number: index + 1,
      subject: q.subject,
      topic: q.topic,
      difficulty: getDifficulty(q),
      question: q.text,
      options: q.options.join(' | '),
      correctAnswer: q.options[q.correctAnswer],
      year: q.year || 'N/A'
    }));

    const csvContent = [
      Object.keys(exportData[0]).join(','),
      ...exportData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selected-questions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (selectedQuestions.length === 0) {
    return (
      <section className={`selected-questions-section empty ${isLoaded ? 'loaded' : ''}`}>
        <div className="empty-selection-state">
          <div className="empty-icon">
            <Target className="icon" />
          </div>
          <h3 className="empty-title">No Questions Selected</h3>
          <p className="empty-description">
            Start building your test by selecting questions from the question bank below.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`selected-questions-section ${isLoaded ? 'loaded' : ''}`}>
      <div className="selection-card">
        <div className="card-header">
          <div className="header-left">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="expand-toggle"
            >
              <ChevronDown className={`toggle-icon ${isExpanded ? 'expanded' : ''}`} />
            </button>
            <div className="header-content">
              <h2 className="card-title">
                <CheckCircle className="title-icon" />
                Selected Questions
              </h2>
              <p className="card-subtitle">
                {stats.total} questions selected • Ready for test creation
              </p>
            </div>
          </div>
          
          <div className="header-stats">
            <div className="stat-chip primary">
              <BarChart3 className="stat-icon" />
              {stats.total} total
            </div>
            <div className="stat-chip success">
              <TrendingUp className="stat-icon" />
              {stats.byDifficulty.easy || 0}E {stats.byDifficulty.medium || 0}M {stats.byDifficulty.hard || 0}H
            </div>
            <div className="stat-chip warning">
              <Target className="stat-icon" />
              {Object.keys(stats.bySubject).length} subjects
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="card-content">
            {/* Quick Stats Overview */}
            <div className="stats-overview">
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{stats.total}</div>
                  <div className="stat-label">Total Questions</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{Object.keys(stats.bySubject).length}</div>
                  <div className="stat-label">Subjects</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{Object.keys(stats.byTopic).length}</div>
                  <div className="stat-label">Topics</div>
                </div>
                <div className="stat-item difficulty-breakdown">
                  <div className="difficulty-bars">
                    <div className="difficulty-bar easy" style={{ width: `${((stats.byDifficulty.easy || 0) / stats.total) * 100}%` }}></div>
                    <div className="difficulty-bar medium" style={{ width: `${((stats.byDifficulty.medium || 0) / stats.total) * 100}%` }}></div>
                    <div className="difficulty-bar hard" style={{ width: `${((stats.byDifficulty.hard || 0) / stats.total) * 100}%` }}></div>
                  </div>
                  <div className="stat-label">Difficulty Mix</div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="selection-controls">
              <div className="control-group">
                <div className="search-container">
                  <Search className="search-icon" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search selected questions..."
                    className="search-input"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="clear-search">
                      <X className="clear-icon" />
                    </button>
                  )}
                </div>
              </div>

              <div className="control-group">
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="group-select"
                >
                  <option value="none">No Grouping</option>
                  <option value="subject">Group by Subject</option>
                  <option value="topic">Group by Topic</option>
                  <option value="difficulty">Group by Difficulty</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="sort-select"
                >
                  <option value="selection-order">Selection Order</option>
                  <option value="subject">Sort by Subject</option>
                  <option value="topic">Sort by Topic</option>
                  <option value="difficulty">Sort by Difficulty</option>
                </select>

                <div className="view-controls">
                  <button
                    onClick={() => setViewMode('compact')}
                    className={`view-btn ${viewMode === 'compact' ? 'active' : ''}`}
                    title="Compact View"
                  >
                    <List className="view-icon" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    title="Grid View"
                  >
                    <Grid className="view-icon" />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="action-bar">
              <div className="bulk-actions">
                <button
                  onClick={selectedForAction.length > 0 ? deselectAllForAction : selectAllForAction}
                  className="bulk-btn secondary"
                >
                  <CheckCircle className="btn-icon" />
                  {selectedForAction.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
                
                {selectedForAction.length > 0 && (
                  <button
                    onClick={removeSelectedQuestions}
                    className="bulk-btn danger"
                  >
                    <Trash2 className="btn-icon" />
                    Remove Selected ({selectedForAction.length})
                  </button>
                )}
              </div>

              <div className="quick-actions">
                <button onClick={shuffleQuestions} className="action-btn secondary">
                  <Shuffle className="btn-icon" />
                  Shuffle
                </button>
                
                <button onClick={exportQuestions} className="action-btn secondary">
                  <Download className="btn-icon" />
                  Export
                </button>
                
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="action-btn secondary"
                >
                  {showPreview ? <EyeOff className="btn-icon" /> : <Eye className="btn-icon" />}
                  {showPreview ? 'Hide' : 'Show'} Answers
                </button>
                
                <button onClick={clearAllQuestions} className="action-btn danger">
                  <Trash2 className="btn-icon" />
                  Clear All
                </button>
              </div>
            </div>

            {/* Questions Display */}
            <div className={`selected-questions-container ${viewMode}`}>
              {Object.entries(groups).map(([groupName, questions]) => (
                <div key={groupName} className="question-group">
                  {groupBy !== 'none' && (
                    <div className="group-header">
                      <h3 className="group-title">{groupName}</h3>
                      <span className="group-count">{questions.length} questions</span>
                    </div>
                  )}
                  
                  <div className={`questions-grid ${viewMode}`}>
                    {questions.map((question, index) => {
                      const difficulty = getDifficulty(question);
                      const isSelectedForAction = selectedForAction.includes(question.id);
                      const globalIndex = selectedQuestions.indexOf(question) + 1;
                      
                      return (
                        <div
                          key={question.id}
                          className={`selected-question-card ${difficulty} ${viewMode} ${isSelectedForAction ? 'selected-for-action' : ''}`}
                        >
                          <div className="card-header">
                            <div className="card-meta">
                              <div className="selection-checkbox">
                                <input
                                  type="checkbox"
                                  checked={isSelectedForAction}
                                  onChange={() => toggleQuestionForAction(question.id)}
                                  className="checkbox"
                                />
                              </div>
                              <span className="question-number">#{globalIndex}</span>
                              <span className="subject-badge">{question.subject}</span>
                              <span className="topic-badge">{question.topic}</span>
                              {question.year && <span className="year-badge">{question.year}</span>}
                              <span className={`difficulty-badge ${difficulty}`}>
                                <Star className="difficulty-icon" />
                                {difficulty}
                              </span>
                            </div>
                            
                            <button
                              onClick={() => removeQuestion(question.id)}
                              className="remove-btn"
                              title="Remove question"
                            >
                              <X className="remove-icon" />
                            </button>
                          </div>
                          
                          <div className="card-content">
                            <p className="question-text">{question.text}</p>
                            
                            {(viewMode !== 'compact' || showPreview) && (
                              <div className="options-container">
                                {question.options.map((option, optIndex) => (
                                  <div 
                                    key={optIndex} 
                                    className={`option-item ${optIndex === question.correctAnswer && showPreview ? 'correct' : ''}`}
                                  >
                                    <span className="option-label">
                                      {String.fromCharCode(65 + optIndex)}
                                    </span>
                                    <span className="option-text">{option}</span>
                                    {optIndex === question.correctAnswer && showPreview && (
                                      <CheckCircle className="correct-icon" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          {viewMode !== 'compact' && (
                            <div className="card-footer">
                              <div className="card-stats">
                                <span className="stat">
                                  <Users className="stat-icon" />
                                  {question.options.length} options
                                </span>
                                {question.year && (
                                  <span className="stat">
                                    <Calendar className="stat-icon" />
                                    {question.year}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* No Results State */}
            {filteredQuestions?.length === 0 && searchQuery && (
              <div className="no-results-state">
                <Search className="no-results-icon" />
                <h4 className="no-results-title">No matching questions found</h4>
                <p className="no-results-description">
                  Try adjusting your search query or clear the search to see all selected questions.
                </p>
                <button onClick={() => setSearchQuery('')} className="clear-search-btn">
                  <X className="btn-icon" />
                  Clear Search
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default SelectedQuestionsSection;
