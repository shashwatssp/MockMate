import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home, 
  CheckCircle, 
  Filter, 
  Plus, 
  BookOpen, 
  Clock, 
  Users, 
  Search,
  X,
  ChevronDown,
  Shuffle,
  Target,
  Zap,
  Eye,
  EyeOff,
  Settings,
  Save,
  FileText,
  BarChart3,
  AlertTriangle,
  CheckSquare,
  Square,
  Lightbulb,
  TrendingUp,
  Award,
  Star,
  ArrowRight,
  Sparkles,
  Filter as FilterIcon,
  SortAsc,
  Grid,
  List,
  Calendar,
  Timer
} from 'lucide-react';
import { neon } from '@netlify/neon';
import { dummyQuestions } from '../data/dummyQuestions';
import type { Question, Test } from '../types';
import './CreateTest.css';

interface CreateTestProps {
  onBackToDashboard: () => void;
  onCreateTest: (test: Test) => void;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'default' | 'topic' | 'difficulty';
type DifficultyLevel = 'easy' | 'medium' | 'hard';

// Generate 4-letter random key function
const generateTestKey = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
};

export const CreateTest: React.FC<CreateTestProps> = ({ onBackToDashboard, onCreateTest }) => {
  const [testName, setTestName] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [showPreview, setShowPreview] = useState(false);
  const [timeLimit, setTimeLimit] = useState(2);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedDifficulties, setSelectedDifficulties] = useState<DifficultyLevel[]>([]);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);

  // New state for scheduling
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(90); // Test duration in minutes

  // Initialize database connection
  const sql = neon(); // Uses NETLIFY_DATABASE_URL automatically

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const getTopics = () => {
    const topics = Array.from(new Set(dummyQuestions.map(q => q.topic)));
    return ['All', ...topics];
  };

  const getDifficulty = (question: Question): DifficultyLevel => {
    // Mock difficulty based on question length and complexity
    const textLength = question.text.length;
    const optionsCount = question.options.length;
    
    if (textLength < 50 && optionsCount <= 3) return 'easy';
    if (textLength > 100 || optionsCount >= 5) return 'hard';
    return 'medium';
  };

  const filteredQuestions = useMemo(() => {
    let questions = dummyQuestions;

    // Filter by topic
    if (selectedTopic !== 'All') {
      questions = questions.filter(q => q.topic === selectedTopic);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      questions = questions.filter(q => 
        q.text.toLowerCase().includes(query) ||
        q.topic.toLowerCase().includes(query) ||
        q.options.some(option => option.toLowerCase().includes(query))
      );
    }

    // Filter by difficulty
    if (selectedDifficulties.length > 0) {
      questions = questions.filter(q => 
        selectedDifficulties.includes(getDifficulty(q))
      );
    }

    // Sort questions
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
  }, [selectedTopic, searchQuery, selectedDifficulties, sortBy]);

  const toggleQuestionSelection = (question: Question) => {
    const isSelected = selectedQuestions.find(q => q.id === question.id);
    if (isSelected) {
      setSelectedQuestions(selectedQuestions.filter(q => q.id !== question.id));
    } else {
      setSelectedQuestions([...selectedQuestions, question]);
    }
  };

  // Function to save questions to database
  const saveQuestionsToDb = async (questions: Question[]) => {
    const savedQuestions = [];
    
    for (const question of questions) {
      // Check if question already exists
      const [existingQuestion] = await sql`
        SELECT id FROM questions 
        WHERE text = ${question.text} AND topic = ${question.topic}
      `;
      
      if (existingQuestion) {
        savedQuestions.push(existingQuestion);
      } else {
        // Insert new question
        const [newQuestion] = await sql`
          INSERT INTO questions (text, topic, options, correct_answer)
          VALUES (${question.text}, ${question.topic}, ${JSON.stringify(question.options)}, ${question.correctAnswer})
          RETURNING id
        `;
        savedQuestions.push(newQuestion);
      }
    }
    
    return savedQuestions;
  };

  // Modified handleCreateTest function
  const handleCreateTest = async () => {
    if (!testName.trim() || selectedQuestions.length === 0) {
      alert('Please enter a test name and select at least one question.');
      return;
    }

    if (!startDate || !startTime) {
      alert('Please select start date and time for the test.');
      return;
    }

    setIsCreating(true);
    
    try {
      // Generate unique test key
      let testKey = generateTestKey();
      
      // Ensure key is unique
      let [existingTest] = await sql`SELECT test_key FROM tests WHERE test_key = ${testKey}`;
      while (existingTest) {
        testKey = generateTestKey();
        [existingTest] = await sql`SELECT test_key FROM tests WHERE test_key = ${testKey}`;
      }

      // Save questions to database
      const savedQuestions = await saveQuestionsToDb(selectedQuestions);

      // Create start datetime
      const startDateTime = new Date(`${startDate}T${startTime}`);

      // Insert test into database
      const [newTest] = await sql`
        INSERT INTO tests (
          test_key, name, description, start_date, start_time, 
          duration, time_limit, randomize_questions, allow_review, show_correct_answers
        )
        VALUES (
          ${testKey}, ${testName.trim()}, ${testDescription.trim()}, 
          ${startDate}, ${startTime}, ${duration}, ${timeLimit}, 
          ${randomizeQuestions}, ${allowReview}, ${showCorrectAnswers}
        )
        RETURNING id, test_key
      `;

      // Link questions to test
      for (let i = 0; i < savedQuestions.length; i++) {
        await sql`
          INSERT INTO test_questions (test_id, question_id, order_index)
          VALUES (${newTest.id}, ${savedQuestions[i].id}, ${i})
        `;
      }

      // Create test object for local state
      const testData: Test = {
        id: newTest.id.toString(),
        testKey: newTest.test_key,
        name: testName.trim(),
        description: testDescription.trim(),
        questions: randomizeQuestions ? shuffleArray([...selectedQuestions]) : selectedQuestions,
        createdAt: new Date(),
        startDate: startDateTime,
        duration,
        timeLimit,
        settings: {
          randomizeQuestions,
          allowReview,
          showCorrectAnswers
        }
      };
      
      alert(`Test created successfully! Test Key: ${testKey}`);
      onCreateTest(testData);
      
      // Reset form
      setTestName('');
      setTestDescription('');
      setSelectedQuestions([]);
      setStartDate('');
      setStartTime('');
      setIsCreating(false);
      onBackToDashboard();
      
    } catch (error) {
      console.error('Error creating test:', error);
      alert('Failed to create test. Please try again.');
      setIsCreating(false);
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

  const getSelectedQuestionsByTopic = () => {
    const topicCounts = selectedQuestions.reduce((acc, question) => {
      acc[question.topic] = (acc[question.topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return topicCounts;
  };

  const selectedTopicCounts = getSelectedQuestionsByTopic();
  const estimatedDuration = selectedQuestions.length * timeLimit;
  const averageDifficulty = selectedQuestions.length > 0 
    ? Math.round(selectedQuestions.reduce((sum, q) => {
        const difficultyScore = { easy: 1, medium: 2, hard: 3 }[getDifficulty(q)];
        return sum + difficultyScore;
      }, 0) / selectedQuestions.length)
    : 0;

  return (
    <div className="create-test-wrapper">
      {/* Enhanced Header */}
      <header className="create-test-header">
        <div className="header-content">
          <div className="header-main">
            <div className="header-brand">
              <div className="brand-icon">
                <BookOpen className="icon" />
              </div>
              <div className="brand-text">
                <h1 className="brand-title">Create New Test</h1>
                <p className="brand-subtitle">Build engaging assessments</p>
              </div>
            </div>
            
            <div className="header-actions">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="action-btn secondary"
              >
                {showPreview ? <EyeOff className="btn-icon" /> : <Eye className="btn-icon" />}
                <span className="btn-text">{showPreview ? 'Hide' : 'Preview'}</span>
              </button>
              
              <button
                onClick={onBackToDashboard}
                className="action-btn primary"
              >
                <Home className="btn-icon" />
                <span className="btn-text">Dashboard</span>
              </button>
            </div>
          </div>
          
          {/* Enhanced Progress Indicator */}
          <div className="progress-indicator">
            <div className="progress-step completed">
              <div className="step-circle">
                <CheckCircle className="step-icon" />
              </div>
              <span className="step-label">Setup</span>
            </div>
            <div className="progress-connector active"></div>
            <div className="progress-step active">
              <div className="step-circle">2</div>
              <span className="step-label">Questions</span>
            </div>
            <div className="progress-connector"></div>
            <div className="progress-step">
              <div className="step-circle">3</div>
              <span className="step-label">Review</span>
            </div>
          </div>
        </div>
      </header>

      <main className="create-test-main">
        <div className="main-content">
          {/* Enhanced Test Configuration */}
          <section className={`test-config-section ${isLoaded ? 'loaded' : ''}`}>
            <div className="config-card">
              <div className="card-header">
                <div className="header-left">
                  <h2 className="card-title">Test Configuration</h2>
                  <p className="card-subtitle">Set up your test details</p>
                </div>
                <div className="header-stats">
                  <div className="stat-chip primary">
                    <Clock className="stat-icon" />
                    <span>{estimatedDuration} min</span>
                  </div>
                  <div className="stat-chip success">
                    <Target className="stat-icon" />
                    <span>{selectedQuestions.length} selected</span>
                  </div>
                  <div className="stat-chip warning">
                    <TrendingUp className="stat-icon" />
                    <span>Level {averageDifficulty || 1}</span>
                  </div>
                </div>
              </div>
              
              <div className="card-content">
                <div className="form-grid">
                  <div className="form-field">
                    <label className="field-label">
                      <FileText className="label-icon" />
                      Test Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder="Enter a descriptive test name..."
                      className="field-input"
                      required
                    />
                  </div>
                  
                  {/* New Date Input */}
                  <div className="form-field">
                    <label className="field-label">
                      <Calendar className="label-icon" />
                      Start Date <span className="required">*</span>
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]} // Prevent past dates
                      className="field-input"
                      required
                    />
                  </div>

                  {/* New Time Input */}
                  <div className="form-field">
                    <label className="field-label">
                      <Clock className="label-icon" />
                      Start Time <span className="required">*</span>
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="field-input"
                      required
                    />
                  </div>

                  {/* Test Duration */}
                  <div className="form-field">
                    <label className="field-label">
                      <Timer className="label-icon" />
                      Test Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      min="15"
                      max="300"
                      className="field-input"
                    />
                  </div>
                  
                  <div className="form-field">
                    <label className="field-label">
                      <Clock className="label-icon" />
                      Time per Question (minutes)
                    </label>
                    <input
                      type="number"
                      value={timeLimit}
                      onChange={(e) => setTimeLimit(Number(e.target.value))}
                      min="1"
                      max="10"
                      className="field-input"
                    />
                  </div>
                </div>
                
                <div className="form-field">
                  <label className="field-label">
                    <BookOpen className="label-icon" />
                    Description (Optional)
                  </label>
                  <textarea
                    value={testDescription}
                    onChange={(e) => setTestDescription(e.target.value)}
                    placeholder="Add instructions or description for your test..."
                    className="field-textarea"
                    rows={3}
                  />
                </div>

                {/* Advanced Settings */}
                <div className="advanced-settings">
                  <button
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="settings-toggle"
                  >
                    <Settings className="settings-icon" />
                    <span>Advanced Settings</span>
                    <ChevronDown className={`chevron ${showAdvancedSettings ? 'open' : ''}`} />
                  </button>
                  
                  {showAdvancedSettings && (
                    <div className="settings-panel">
                      <div className="setting-item">
                        <div className="setting-info">
                          <label className="setting-label">Randomize Questions</label>
                          <p className="setting-description">Shuffle question order for each student</p>
                        </div>
                        <button
                          onClick={() => setRandomizeQuestions(!randomizeQuestions)}
                          className={`toggle-switch ${randomizeQuestions ? 'active' : ''}`}
                        >
                          <div className="switch-handle"></div>
                        </button>
                      </div>
                      
                      <div className="setting-item">
                        <div className="setting-info">
                          <label className="setting-label">Allow Review</label>
                          <p className="setting-description">Let students review answers before submission</p>
                        </div>
                        <button
                          onClick={() => setAllowReview(!allowReview)}
                          className={`toggle-switch ${allowReview ? 'active' : ''}`}
                        >
                          <div className="switch-handle"></div>
                        </button>
                      </div>
                      
                      <div className="setting-item">
                        <div className="setting-info">
                          <label className="setting-label">Show Correct Answers</label>
                          <p className="setting-description">Display correct answers after completion</p>
                        </div>
                        <button
                          onClick={() => setShowCorrectAnswers(!showCorrectAnswers)}
                          className={`toggle-switch ${showCorrectAnswers ? 'active' : ''}`}
                        >
                          <div className="switch-handle"></div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Topic Distribution */}
                {Object.keys(selectedTopicCounts).length > 0 && (
                  <div className="topic-distribution">
                    <h3 className="distribution-title">
                      <BarChart3 className="title-icon" />
                      Selected Questions by Topic
                    </h3>
                    <div className="topic-chips">
                      {Object.entries(selectedTopicCounts).map(([topic, count]) => (
                        <div key={topic} className="topic-chip">
                          <span className="topic-name">{topic}</span>
                          <span className="topic-count">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Enhanced Question Selection */}
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
            
            {/* Enhanced Search and Filter Bar */}
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
                {/* Topic Filter */}
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

                {/* Difficulty Filter */}
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

                {/* Sort Options */}
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

            {/* Enhanced Quick Actions */}
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

            {/* Enhanced Questions Display */}
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

            {/* Enhanced Empty State */}
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
        </div>

        {/* Enhanced Floating Action Button */}
        {selectedQuestions.length > 0 && (
          <div className="floating-action-container">
            <div className="fab-summary">
              <div className="summary-stats">
                <div className="summary-stat">
                  <span className="stat-value">{selectedQuestions.length}</span>
                  <span className="stat-label">Questions</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-value">{estimatedDuration}</span>
                  <span className="stat-label">Minutes</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleCreateTest}
              disabled={!testName.trim() || isCreating || !startDate || !startTime}
              className={`create-test-fab ${isCreating ? 'creating' : ''}`}
            >
              {isCreating ? (
                <div className="fab-content creating">
                  <div className="loading-spinner"></div>
                  <span>Creating...</span>
                </div>
              ) : (
                <div className="fab-content">
                  <Sparkles className="fab-icon" />
                  <span className="fab-text">Create Test</span>
                  <ArrowRight className="fab-arrow" />
                </div>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateTest;
