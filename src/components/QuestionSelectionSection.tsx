import React, { useState, useMemo } from 'react';
import {
  Lightbulb,
  Grid,
  List,
  Search,
  X,
  Filter as FilterIcon,
  ChevronDown,
  SortAsc,
  CheckSquare,
  Square,
  Shuffle,
  Zap,
  CheckCircle,
  Users,
  Star
} from 'lucide-react';
import type { Question } from '../types';
import './CreateTest.css';

type ViewMode = 'grid' | 'list';
type SortBy = 'default' | 'topic' | 'difficulty';
type DifficultyLevel = 'easy' | 'medium' | 'hard';

interface QuestionSelectionSectionProps {
  selectedQuestions: Question[];
  setSelectedQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  dummyQuestions: Question[];
  getDifficulty: (question: Question) => DifficultyLevel;
  isLoaded: boolean;
}

export const QuestionSelectionSection: React.FC<QuestionSelectionSectionProps> = ({
  selectedQuestions,
  setSelectedQuestions,
  dummyQuestions,
  getDifficulty,
  isLoaded
}) => {
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [selectedDifficulties, setSelectedDifficulties] = useState<DifficultyLevel[]>([]);

  const getTopics = () => {
    const topics = Array.from(new Set(dummyQuestions.map(q => q.topic)));
    return ['All', ...topics];
  };

  const filteredQuestions = useMemo(() => {
    let questions = dummyQuestions;

    if (selectedTopic !== 'All') {
      questions = questions.filter(q => q.topic === selectedTopic);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      questions = questions.filter(q => 
        q.text.toLowerCase().includes(query) ||
        q.topic.toLowerCase().includes(query) ||
        q.options.some(option => option.toLowerCase().includes(query))
      );
    }

    if (selectedDifficulties.length > 0) {
      questions = questions.filter(q => 
        selectedDifficulties.includes(getDifficulty(q))
      );
    }

    switch (sortBy) {
      case 'topic':
        questions = [...questions].sort((a, b) => a.topic.localeCompare(b.topic));
        break;
      case 'difficulty':
        questions = [...questions].sort((a, b) => {
          const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
          return difficultyOrder[getDifficulty(a)] - difficultyOrder[getDifficulty(b)];
        });
        break;
      default:
        break;
    }

    return questions;
  }, [selectedTopic, searchQuery, selectedDifficulties, sortBy, dummyQuestions, getDifficulty]);

  const toggleQuestionSelection = (question: Question) => {
    const isSelected = selectedQuestions.find(q => q.id === question.id);
    if (isSelected) {
      setSelectedQuestions(selectedQuestions.filter(q => q.id !== question.id));
    } else {
      setSelectedQuestions([...selectedQuestions, question]);
    }
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const selectAllTopicQuestions = () => {
    setSelectedQuestions(prev => {
      const currentTopicQuestions = filteredQuestions.filter(q => 
        !prev.find(selected => selected.id === q.id)
      );
      return [...prev, ...currentTopicQuestions];
    });
  };

  const deselectAllTopicQuestions = () => {
    setSelectedQuestions(prev => 
      prev.filter(q => !filteredQuestions.find(filtered => filtered.id === q.id))
    );
  };

  const selectRandomQuestions = (count: number) => {
    const availableQuestions = filteredQuestions.filter(q => 
      !selectedQuestions.find(selected => selected.id === q.id)
    );
    const randomQuestions = shuffleArray(availableQuestions).slice(0, count);
    setSelectedQuestions(prev => [...prev, ...randomQuestions]);
  };

  const toggleDifficulty = (difficulty: DifficultyLevel) => {
    setSelectedDifficulties(prev => 
      prev.includes(difficulty) 
        ? prev.filter(d => d !== difficulty)
        : [...prev, difficulty]
    );
  };

  return (
    <section className={`question-selection-section ${isLoaded ? 'loaded' : ''}`}>
      <div className="selection-header">
        <div className="header-left">
          <h2 className="section-title">
            <Lightbulb className="title-icon" />
            Question Bank
          </h2>
          <p className="section-subtitle">
            {filteredQuestions.length} questions available
            {searchQuery && ` • Searching: "${searchQuery}"`}
            {selectedTopic !== 'All' && ` • Topic: ${selectedTopic}`}
          </p>
        </div>
        
        <div className="header-controls">
          <div className="view-controls">
            <button
              onClick={() => setViewMode('grid')}
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              title="Grid View"
            >
              <Grid className="view-icon" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              title="List View"
            >
              <List className="view-icon" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Search and Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-container">
          <Search className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions, topics, or answers..."
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="clear-search"
            >
              <X className="clear-icon" />
            </button>
          )}
        </div>
        
        <div className="filter-bar">
          <div className="filter-group">
            <button
              className={`filter-btn ${isFilterOpen ? 'active' : ''}`}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <FilterIcon className="filter-icon" />
              <span>Topic</span>
              <span className="filter-badge">{selectedTopic}</span>
              <ChevronDown className="chevron" />
            </button>
            
            {isFilterOpen && (
              <div className="filter-dropdown">
                {getTopics().map(topic => (
                  <button
                    key={topic}
                    className={`filter-option ${selectedTopic === topic ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTopic(topic);
                      setIsFilterOpen(false);
                    }}
                  >
                    <span>{topic}</span>
                    {topic !== 'All' && (
                      <span className="option-count">
                        {dummyQuestions.filter(q => q.topic === topic).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="difficulty-filters">
            {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map(difficulty => (
              <button
                key={difficulty}
                onClick={() => toggleDifficulty(difficulty)}
                className={`difficulty-btn ${selectedDifficulties.includes(difficulty) ? 'active' : ''} ${difficulty}`}
              >
                <span className="difficulty-dot"></span>
                <span className="difficulty-label">{difficulty}</span>
              </button>
            ))}
          </div>

          <div className="sort-container">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="sort-select"
            >
              <option value="default">Default Order</option>
              <option value="topic">Sort by Topic</option>
              <option value="difficulty">Sort by Difficulty</option>
            </select>
            <SortAsc className="sort-icon" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {filteredQuestions.length > 0 && (
        <div className="quick-actions">
          <div className="action-group">
            <button
              className="quick-btn primary"
              onClick={selectAllTopicQuestions}
            >
              <CheckSquare className="btn-icon" />
              Select All ({filteredQuestions.length})
            </button>
            
            <button
              className="quick-btn secondary"
              onClick={deselectAllTopicQuestions}
            >
              <Square className="btn-icon" />
              Deselect All
            </button>
          </div>
          
          <div className="action-group">
            <button
              className="quick-btn accent"
              onClick={() => selectRandomQuestions(5)}
            >
              <Shuffle className="btn-icon" />
              Random 5
            </button>
            
            <button
              className="quick-btn accent"
              onClick={() => selectRandomQuestions(10)}
            >
              <Zap className="btn-icon" />
              Random 10
            </button>
          </div>
        </div>
      )}

      {/* Questions Display */}
      <div className={`questions-container ${viewMode}`}>
        {filteredQuestions.map((question, index) => {
          const isSelected = selectedQuestions.find(q => q.id === question.id);
          const difficulty = getDifficulty(question);
          
          return (
            <div
              key={question.id}
              className={`question-card ${isSelected ? 'selected' : ''} ${difficulty} ${viewMode}`}
              onClick={() => toggleQuestionSelection(question)}
            >
              <div className="card-header">
                <div className="card-meta">
                  <span className="question-number">Q{index + 1}</span>
                  <span className="topic-badge">{question.topic}</span>
                  <span className={`difficulty-badge ${difficulty}`}>
                    <Star className="difficulty-icon" />
                    {difficulty}
                  </span>
                </div>
                
                <div className="card-actions">
                  {isSelected && (
                    <div className="selection-indicator">
                      <CheckCircle className="check-icon" />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="card-content">
                <p className="question-text">{question.text}</p>
                
                <div className="options-container">
                  {question.options.map((option, optIndex) => (
                    <div 
                      key={optIndex} 
                      className={`option-item ${optIndex === question.correctAnswer ? 'correct' : ''}`}
                    >
                      <span className="option-label">
                        {String.fromCharCode(65 + optIndex)}
                      </span>
                      <span className="option-text">{option}</span>
                      {optIndex === question.correctAnswer && (
                        <CheckCircle className="correct-icon" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="card-footer">
                <div className="card-stats">
                  <span className="stat">
                    <Users className="stat-icon" />
                    {question.options.length} options
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredQuestions.length === 0 && (
        <div className="empty-state">
          <div className="empty-visual">
            <div className="empty-icon">
              <Search className="icon" />
            </div>
            <div className="empty-animation">
              <div className="animation-circle"></div>
              <div className="animation-circle"></div>
              <div className="animation-circle"></div>
            </div>
          </div>
          
          <div className="empty-content">
            <h3 className="empty-title">No questions found</h3>
            <p className="empty-description">
              {searchQuery ? 
                `No questions match "${searchQuery}". Try adjusting your search or filters.` :
                'No questions available for the selected filters. Try changing your criteria.'
              }
            </p>
            
            <div className="empty-actions">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="empty-btn primary"
                >
                  <X className="btn-icon" />
                  Clear Search
                </button>
              )}
              
              <button
                onClick={() => {
                  setSelectedTopic('All');
                  setSelectedDifficulties([]);
                  setSearchQuery('');
                }}
                className="empty-btn secondary"
              >
                <FilterIcon className="btn-icon" />
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default QuestionSelectionSection;
