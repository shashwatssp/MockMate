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
  Star,
  BookOpen,
  Calendar,
  TrendingUp,
  BarChart3,
  Target,
  Eye,
  Settings
} from 'lucide-react';
import { useQuestions } from './CreateTest';
import type { Question } from '../types';
import './CreateTest.css';

type ViewMode = 'grid' | 'list';
type SortBy = 'default' | 'topic' | 'difficulty' | 'subject' | 'year';
type DifficultyLevel = 'easy' | 'medium' | 'hard';

interface QuestionSelectionSectionProps {
  selectedQuestions: Question[];
  setSelectedQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  getDifficulty: (question: Question) => DifficultyLevel;
  isLoaded: boolean;
}

export const QuestionSelectionSection: React.FC<QuestionSelectionSectionProps> = ({
  selectedQuestions,
  setSelectedQuestions,
  getDifficulty,
  isLoaded
}) => {
  // Use cached questions from context
  const { allQuestions } = useQuestions();

  console.log("ALL Questions ", allQuestions);

  // Filter states
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedDifficulties, setSelectedDifficulties] = useState<DifficultyLevel[]>([]);
  
  // UI states
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  
  // Dropdown states
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [isDifficultyDropdownOpen, setIsDifficultyDropdownOpen] = useState(false);

  // Search states for dropdowns
  const [subjectSearch, setSubjectSearch] = useState('');
  const [topicSearch, setTopicSearch] = useState('');
  const [yearSearch, setYearSearch] = useState('');

  // Predefined data
  const predefinedSubjects = ['Physics', 'Chemistry', 'Biology'];
  const predefinedYears = Array.from({ length: 26 }, (_, i) => (2025 - i).toString());
  const predefinedTopics = {
    Physics: [
      'Mechanics', 'Thermodynamics', 'Electromagnetism', 'Optics', 'Modern Physics',
      'Quantum Mechanics', 'Atomic Physics', 'Nuclear Physics', 'Waves', 'Oscillations',
      'Gravitation', 'Fluid Mechanics', 'Kinetic Theory', 'Electronics', 'Magnetism'
    ],
    Chemistry: [
      'Organic Chemistry', 'Inorganic Chemistry', 'Physical Chemistry', 'Analytical Chemistry',
      'Biochemistry', 'Electrochemistry', 'Chemical Bonding', 'Periodic Table', 'Acids and Bases',
      'Thermochemistry', 'Chemical Kinetics', 'Equilibrium', 'Redox Reactions', 'Coordination Chemistry',
      'Surface Chemistry', 'Polymers', 'Environmental Chemistry'
    ],
    Biology: [
      'Cell Biology', 'Genetics', 'Evolution', 'Ecology', 'Human Physiology', 'Plant Biology',
      'Animal Biology', 'Microbiology', 'Molecular Biology', 'Biotechnology', 'Immunology',
      'Neurobiology', 'Developmental Biology', 'Marine Biology', 'Botany', 'Zoology',
      'Anatomy', 'Biochemistry', 'Bioinformatics'
    ]
  };

  // Get filter options from cached questions with predefined fallbacks
  const getSubjects = () => {
    const questionSubjects = allQuestions && allQuestions.length > 0 
      ? Array.from(new Set(
          allQuestions
            .map(q => q.subject)
            .filter(Boolean)
            .filter(subject => subject.trim() !== '')
        ))
      : [];
    
    const allSubjects = Array.from(new Set([...predefinedSubjects, ...questionSubjects])).sort();
    const filteredSubjects = allSubjects.filter(subject =>
      subject.toLowerCase().includes(subjectSearch.toLowerCase())
    );
         console.log("FILTERED QUESTIONS ", filteredQuestions);
    
    return ['All', ...filteredSubjects];
  };

  const getTopics = () => {
    let questionTopics: string[] = [];
    
    if (allQuestions && allQuestions.length > 0) {
      let questions = allQuestions;
      if (selectedSubject !== 'All') {
        questions = questions.filter(q => q.subject === selectedSubject);
      }
      
      questionTopics = Array.from(new Set(
        questions
          .map(q => q.topic)
          .filter(Boolean)
          .filter(topic => topic.trim() !== '')
      ));
    }
    
    // Add predefined topics based on selected subject
    let predefinedTopicsForSubject: string[] = [];
    if (selectedSubject !== 'All' && predefinedTopics[selectedSubject as keyof typeof predefinedTopics]) {
      predefinedTopicsForSubject = predefinedTopics[selectedSubject as keyof typeof predefinedTopics];
    } else if (selectedSubject === 'All') {
      predefinedTopicsForSubject = Object.values(predefinedTopics).flat();
    }
    
    const allTopics = Array.from(new Set([...predefinedTopicsForSubject, ...questionTopics])).sort();
    const filteredTopics = allTopics.filter(topic =>
      topic.toLowerCase().includes(topicSearch.toLowerCase())
    );
    
    return ['All', ...filteredTopics];
  };

  const getYears = () => {
    const questionYears = allQuestions && allQuestions.length > 0
      ? Array.from(new Set(
          allQuestions
            .map(q => q.year)
            .filter(Boolean)
            .filter(year => year.trim() !== '')
        ))
      : [];
    
    const allYears = Array.from(new Set([...predefinedYears, ...questionYears])).sort().reverse();
    const filteredYears = allYears.filter(year =>
      year.toLowerCase().includes(yearSearch.toLowerCase())
    );
    
    return ['All', ...filteredYears];
  };


  // Advanced filtering logic
  const filteredQuestions = useMemo(() => {
    if (!allQuestions || allQuestions.length === 0) return [];
    
    let questions = [...allQuestions];

    // Subject filter
    if (selectedSubject !== 'All') {
      questions = questions.filter(q => 
        q.subject && q.subject.trim() !== '' && q.subject === selectedSubject
      );
    }

    // Topic filter
    if (selectedTopic !== 'All') {
      questions = questions.filter(q => 
        q.topic && q.topic.trim() !== '' && q.topic === selectedTopic
      );
    }

    // Year filter
    if (selectedYear !== 'All') {
      questions = questions.filter(q => 
        q.year && q.year.trim() !== '' && q.year === selectedYear
      );
    }

    // Difficulty filter
    if (selectedDifficulties.length > 0) {
      questions = questions.filter(q => {
        try {
          const difficulty = getDifficulty(q);
          return selectedDifficulties.includes(difficulty);
        } catch (error) {
          console.warn('Error getting difficulty for question:', q.id, error);
          return false;
        }
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      questions = questions.filter(q => {
        try {
          const searchableText = [
            q.text || '',
            q.topic || '',
            q.subject || '',
            ...(q.options || [])
          ].join(' ').toLowerCase();
          
          return searchableText.includes(query);
        } catch (error) {
          console.warn('Error filtering question:', q.id, error);
          return false;
        }
      });
    }

    // Sorting
    try {
      switch (sortBy) {
        case 'subject':
          questions = questions.sort((a, b) => 
            (a.subject || '').localeCompare(b.subject || '')
          );
          break;
        case 'topic':
          questions = questions.sort((a, b) => 
            (a.topic || '').localeCompare(b.topic || '')
          );
          break;
        case 'year':
          questions = questions.sort((a, b) => 
            (b.year || '').localeCompare(a.year || '')
          );
          break;
        case 'difficulty':
          questions = questions.sort((a, b) => {
            const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
            try {
              const diffA = getDifficulty(a);
              const diffB = getDifficulty(b);
              return difficultyOrder[diffA] - difficultyOrder[diffB];
            } catch (error) {
              console.warn('Error sorting by difficulty:', error);
              return 0;
            }
          });
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn('Error sorting questions:', error);
    }

    return questions;
  }, [
    allQuestions, 
    selectedSubject, 
    selectedTopic, 
    selectedYear, 
    selectedDifficulties, 
    searchQuery, 
    sortBy, 
    getDifficulty
  ]);

  // Question selection logic
  const toggleQuestionSelection = (question: Question) => {
    if (!question || !question.id) return;
    
    const isSelected = selectedQuestions.find(q => q.id === question.id);
    if (isSelected) {
      setSelectedQuestions(selectedQuestions.filter(q => q.id !== question.id));
    } else {
      setSelectedQuestions([...selectedQuestions, question]);
    }
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    if (!array || array.length === 0) return [];
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Bulk selection actions
  const selectAllFilteredQuestions = () => {
    if (!filteredQuestions || filteredQuestions.length === 0) return;
    
    setSelectedQuestions(prev => {
      const newQuestions = filteredQuestions.filter(q => 
        !prev.find(selected => selected.id === q.id)
      );
      return [...prev, ...newQuestions];
    });
  };

  const deselectAllFilteredQuestions = () => {
    if (!filteredQuestions || filteredQuestions.length === 0) return;
    
    setSelectedQuestions(prev => 
      prev.filter(q => !filteredQuestions.find(filtered => filtered.id === q.id))
    );
  };

  const selectRandomQuestions = (count: number) => {
    if (!filteredQuestions || filteredQuestions.length === 0) return;
    
    const availableQuestions = filteredQuestions.filter(q => 
      !selectedQuestions.find(selected => selected.id === q.id)
    );
    
    const randomQuestions = shuffleArray(availableQuestions).slice(0, count);
    setSelectedQuestions(prev => [...prev, ...randomQuestions]);
  };

  const selectByDifficulty = (difficulty: DifficultyLevel, count: number) => {
    if (!filteredQuestions || filteredQuestions.length === 0) return;
    
    try {
      const availableQuestions = filteredQuestions.filter(q => 
        getDifficulty(q) === difficulty && 
        !selectedQuestions.find(selected => selected.id === q.id)
      );
      
      const selectedDifficultyQuestions = shuffleArray(availableQuestions).slice(0, count);
      setSelectedQuestions(prev => [...prev, ...selectedDifficultyQuestions]);
    } catch (error) {
      console.warn('Error selecting questions by difficulty:', error);
    }
  };

  const toggleDifficulty = (difficulty: DifficultyLevel) => {
    setSelectedDifficulties(prev => 
      prev.includes(difficulty) 
        ? prev.filter(d => d !== difficulty)
        : [...prev, difficulty]
    );
  };

  // Reset all filters
  const resetAllFilters = () => {
    setSelectedSubject('All');
    setSelectedTopic('All');
    setSelectedYear('All');
    setSelectedDifficulties([]);
    setSearchQuery('');
    setSortBy('default');
    
    // Reset search states
    setSubjectSearch('');
    setTopicSearch('');
    setYearSearch('');
    
    // Close all dropdowns
    setIsSubjectDropdownOpen(false);
    setIsTopicDropdownOpen(false);
    setIsYearDropdownOpen(false);
    setIsDifficultyDropdownOpen(false);
  };

  // Get filter counts safely
  const getFilterCounts = () => {
    try {
      const subjects = getSubjects().slice(1);
      const topics = getTopics().slice(1);
      const years = getYears().slice(1);
      
      return {
        subjects: subjects.length,
        topics: topics.length,
        years: years.length,
        difficulties: 3
      };
    } catch (error) {
      console.warn('Error getting filter counts:', error);
      return {
        subjects: 0,
        topics: 0,
        years: 0,
        difficulties: 3
      };
    }
  };

  const filterCounts = getFilterCounts();

  // Close dropdowns when clicking outside
  const closeAllDropdowns = () => {
    setIsSubjectDropdownOpen(false);
    setIsTopicDropdownOpen(false);
    setIsYearDropdownOpen(false);
    setIsDifficultyDropdownOpen(false);
  };

  // Safe getters for counts
  const getQuestionCountForSubject = (subject: string) => {
    if (!allQuestions || subject === 'All') return allQuestions?.length || 0;
    return allQuestions.filter(q => q.subject === subject).length;
  };

  const getQuestionCountForTopic = (topic: string) => {
    if (!allQuestions || topic === 'All') return allQuestions?.length || 0;
    return allQuestions.filter(q => 
      q.topic === topic && 
      (selectedSubject === 'All' || q.subject === selectedSubject)
    ).length;
  };

  const getQuestionCountForYear = (year: string) => {
    if (!allQuestions || year === 'All') return allQuestions?.length || 0;
    return allQuestions.filter(q => q.year === year).length;
  };

  const getQuestionCountForDifficulty = (difficulty: DifficultyLevel) => {
    if (!allQuestions) return 0;
    try {
      return allQuestions.filter(q => getDifficulty(q) === difficulty).length;
    } catch (error) {
      console.warn('Error counting questions by difficulty:', error);
      return 0;
    }
  };


  const searchableDropdownStyles = {
    searchableDropdown: {
      minWidth: '280px',
      maxHeight: '320px',
      overflowY: 'auto' as const,
      border: '1px solid #e1e5e9',
      borderRadius: '8px',
      backgroundColor: '#ffffff',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
      zIndex: 99999999,
      position: 'absolute' as const,
      top: '100%',
      left: '0',
      right: '0',
      marginTop: '4px'
    },
    dropdownSearch: {
      padding: '12px 16px',
      borderBottom: '1px solid #f0f2f5',
      position: 'sticky' as const,
      top: '0',
      backgroundColor: '#ffffff',
      zIndex: 99999999,
    },
    searchInput: {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '14px',
      outline: 'none',
      transition: 'all 0.2s ease',
      backgroundColor: '#f9fafb'
    },
    searchInputFocus: {
      borderColor: '#3b82f6',
      backgroundColor: '#ffffff',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
    },
    optionsContainer: {
      maxHeight: '240px',
      overflowY: 'auto' as const,
      padding: '4px 0'
    },
    filterOption: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      borderBottom: '1px solid transparent',
      fontSize: '14px'
    },
    filterOptionHover: {
      backgroundColor: '#f8fafc',
      borderColor: '#e2e8f0'
    },
    filterOptionActive: {
      backgroundColor: '#eff6ff',
      color: '#1d4ed8',
      fontWeight: '500' as const
    },
    optionCount: {
      fontSize: '12px',
      color: '#6b7280',
      backgroundColor: '#f3f4f6',
      padding: '2px 8px',
      borderRadius: '12px',
      fontWeight: '500' as const,
      minWidth: '20px',
      textAlign: 'center' as const
    },
    noOptions: {
      padding: '16px',
      textAlign: 'center' as const,
      color: '#9ca3af',
      fontSize: '14px',
      fontStyle: 'italic' as const
    }
  };

  return (
    <section className={`question-selection-section ${isLoaded ? 'loaded' : ''}`} onClick={closeAllDropdowns}>
      <div className="selection-header">
        <div className="header-left">
          <h2 className="section-title">
            <Lightbulb className="title-icon" />
            Question Bank
          </h2>
          <p className="section-subtitle">
            {filteredQuestions?.length || 0} questions available
            {searchQuery && ` • Searching: "${searchQuery}"`}
            {selectedSubject !== 'All' && ` • Subject: ${selectedSubject}`}
            {selectedTopic !== 'All' && ` • Topic: ${selectedTopic}`}
            {selectedYear !== 'All' && ` • Year: ${selectedYear}`}
          </p>
        </div>
        
        <div className="header-controls">
          <div className="filter-summary">
            <div className="summary-item">
              <span className="summary-value">{filteredQuestions?.length || 0}</span>
              <span className="summary-label">Available</span>
            </div>
            <div className="summary-item">
              <span className="summary-value">{selectedQuestions.length}</span>
              <span className="summary-label">Selected</span>
            </div>
          </div>
          
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
      <div className="search-filter-bar" onClick={(e) => e.stopPropagation()}>
        <div className="search-container">
          <Search className="search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions, topics, subjects, or answers..."
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
          {/* Subject Filter */}
          <div className="filter-group">
            <button
              className={`filter-btn ${selectedSubject !== 'All' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsSubjectDropdownOpen(!isSubjectDropdownOpen);
                setIsTopicDropdownOpen(false);
                setIsYearDropdownOpen(false);
                setIsDifficultyDropdownOpen(false);
              }}
            >
              <BookOpen className="filter-icon" />
              <span>Subject</span>
              {selectedSubject !== 'All' && <span className="filter-badge">{selectedSubject}</span>}
              <ChevronDown className="chevron" />
            </button>
            
            {isSubjectDropdownOpen && (
              <div style={searchableDropdownStyles.searchableDropdown} onClick={(e) => e.stopPropagation()}>
                <div style={searchableDropdownStyles.dropdownSearch}>
                  <input
                    type="text"
                    placeholder="Search subjects..."
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    style={searchableDropdownStyles.searchInput}
                    autoFocus
                  />
                </div>
                <div style={searchableDropdownStyles.optionsContainer}>
                  {getSubjects().length > 0 ? (
                    getSubjects().map(subject => (
                      <button
                        key={subject}
                        style={{
                          ...searchableDropdownStyles.filterOption,
                          ...(selectedSubject === subject ? searchableDropdownStyles.filterOptionActive : {})
                        }}
                        onMouseEnter={(e) => {
                          if (selectedSubject !== subject) {
                            Object.assign(e.currentTarget.style, searchableDropdownStyles.filterOptionHover);
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedSubject !== subject) {
                            e.currentTarget.style.backgroundColor = '';
                            e.currentTarget.style.borderColor = 'transparent';
                          }
                        }}
                        onClick={() => {
                          setSelectedSubject(subject);
                          setSelectedTopic('All'); // Reset topic when subject changes
                          setIsSubjectDropdownOpen(false);
                          setSubjectSearch('');
                        }}
                      >
                        <span>{subject}</span>
                        <span style={searchableDropdownStyles.optionCount}>
                          {getQuestionCountForSubject(subject)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div style={searchableDropdownStyles.noOptions}>
                      No subjects found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Topic Filter */}
          <div className="filter-group">
            <button
              className={`filter-btn ${selectedTopic !== 'All' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsTopicDropdownOpen(!isTopicDropdownOpen);
                setIsSubjectDropdownOpen(false);
                setIsYearDropdownOpen(false);
                setIsDifficultyDropdownOpen(false);
              }}
            >
              <Target className="filter-icon" />
              <span>Topic</span>
              {selectedTopic !== 'All' && <span className="filter-badge">{selectedTopic}</span>}
              <ChevronDown className="chevron" />
            </button>
            
            {isTopicDropdownOpen && (
              <div style={searchableDropdownStyles.searchableDropdown} onClick={(e) => e.stopPropagation()}>
                <div style={searchableDropdownStyles.dropdownSearch}>
                  <input
                    type="text"
                    placeholder="Search topics..."
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    style={searchableDropdownStyles.searchInput}
                    autoFocus
                  />
                </div>
                <div style={searchableDropdownStyles.optionsContainer}>
                  {getTopics().length > 0 ? (
                    getTopics().map(topic => (
                      <button
                        key={topic}
                        style={{
                          ...searchableDropdownStyles.filterOption,
                          ...(selectedTopic === topic ? searchableDropdownStyles.filterOptionActive : {})
                        }}
                        onMouseEnter={(e) => {
                          if (selectedTopic !== topic) {
                            Object.assign(e.currentTarget.style, searchableDropdownStyles.filterOptionHover);
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedTopic !== topic) {
                            e.currentTarget.style.backgroundColor = '';
                            e.currentTarget.style.borderColor = 'transparent';
                          }
                        }}
                        onClick={() => {
                          setSelectedTopic(topic);
                          setIsTopicDropdownOpen(false);
                          setTopicSearch('');
                        }}
                      >
                        <span>{topic}</span>
                        <span style={searchableDropdownStyles.optionCount}>
                          {getQuestionCountForTopic(topic)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div style={searchableDropdownStyles.noOptions}>
                      No topics found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Year Filter */}
          <div className="filter-group">
            <button
              className={`filter-btn ${selectedYear !== 'All' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsYearDropdownOpen(!isYearDropdownOpen);
                setIsSubjectDropdownOpen(false);
                setIsTopicDropdownOpen(false);
                setIsDifficultyDropdownOpen(false);
              }}
            >
              <Calendar className="filter-icon" />
              <span>Year</span>
              {selectedYear !== 'All' && <span className="filter-badge">{selectedYear}</span>}
              <ChevronDown className="chevron" />
            </button>
            
            {isYearDropdownOpen && (
              <div style={searchableDropdownStyles.searchableDropdown} onClick={(e) => e.stopPropagation()}>
                <div style={searchableDropdownStyles.dropdownSearch}>
                  <input
                    type="text"
                    placeholder="Search years..."
                    value={yearSearch}
                    onChange={(e) => setYearSearch(e.target.value)}
                    style={searchableDropdownStyles.searchInput}
                    autoFocus
                  />
                </div>
                <div style={searchableDropdownStyles.optionsContainer}>
                  {getYears().length > 0 ? (
                    getYears().map(year => (
                      <button
                        key={year}
                        style={{
                          ...searchableDropdownStyles.filterOption,
                          ...(selectedYear === year ? searchableDropdownStyles.filterOptionActive : {})
                        }}
                        onMouseEnter={(e) => {
                          if (selectedYear !== year) {
                            Object.assign(e.currentTarget.style, searchableDropdownStyles.filterOptionHover);
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedYear !== year) {
                            e.currentTarget.style.backgroundColor = '';
                            e.currentTarget.style.borderColor = 'transparent';
                          }
                        }}
                        onClick={() => {
                          setSelectedYear(year);
                          setIsYearDropdownOpen(false);
                          setYearSearch('');
                        }}
                      >
                        <span>{year}</span>
                        <span style={searchableDropdownStyles.optionCount}>
                          {getQuestionCountForYear(year)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div style={searchableDropdownStyles.noOptions}>
                      No years found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Difficulty Filter */}
          <div className="filter-group">
            <button
              className={`filter-btn ${selectedDifficulties.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsDifficultyDropdownOpen(!isDifficultyDropdownOpen);
                setIsSubjectDropdownOpen(false);
                setIsTopicDropdownOpen(false);
                setIsYearDropdownOpen(false);
              }}
            >
              <TrendingUp className="filter-icon" />
              <span>Difficulty</span>
              {selectedDifficulties.length > 0 && (
                <span className="filter-badge">{selectedDifficulties.length}</span>
              )}
              <ChevronDown className="chevron" />
            </button>
            
            {isDifficultyDropdownOpen && (
              <div className="filter-dropdown" onClick={(e) => e.stopPropagation()}>
                {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map(difficulty => (
                  <button
                    key={difficulty}
                    className={`filter-option ${selectedDifficulties.includes(difficulty) ? 'active' : ''}`}
                    onClick={() => toggleDifficulty(difficulty)}
                  >
                    <span className={`difficulty-dot ${difficulty}`}></span>
                    <span className="capitalize">{difficulty}</span>
                    <span className="option-count">
                      {getQuestionCountForDifficulty(difficulty)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Options */}
          <div className="sort-container">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="sort-select"
            >
              <option value="default">Default Order</option>
              <option value="subject">Sort by Subject</option>
              <option value="topic">Sort by Topic</option>
              <option value="year">Sort by Year</option>
              <option value="difficulty">Sort by Difficulty</option>
            </select>
            <SortAsc className="sort-icon" />
          </div>

          {/* Reset Filters */}
          <button
            onClick={resetAllFilters}
            className="reset-filters-btn"
            title="Reset all filters"
          >
            <Settings className="reset-icon" />
            Reset
          </button>
        </div>
      </div>

      <div style={{ height: '270px' }}></div>

      {/* Enhanced Quick Actions */}
      {filteredQuestions && filteredQuestions.length > 0 && (
        <div className="quick-actions">
          <div className="action-group">
            <button
              className="quick-btn primary"
              onClick={selectAllFilteredQuestions}
              disabled={filteredQuestions.every(q => selectedQuestions.find(s => s.id === q.id))}
            >
              <CheckSquare className="btn-icon" />
              Select All ({filteredQuestions.length})
            </button>
            
            <button
              className="quick-btn secondary"
              onClick={deselectAllFilteredQuestions}
              disabled={!filteredQuestions.some(q => selectedQuestions.find(s => s.id === q.id))}
            >
              <Square className="btn-icon" />
              Deselect All
            </button>
          </div>
          
          <div className="action-group">
            <button
              className="quick-btn accent"
              onClick={() => selectRandomQuestions(5)}
              disabled={filteredQuestions.filter(q => !selectedQuestions.find(s => s.id === q.id)).length < 5}
            >
              <Shuffle className="btn-icon" />
              Random 5
            </button>
            
            <button
              className="quick-btn accent"
              onClick={() => selectRandomQuestions(10)}
              disabled={filteredQuestions.filter(q => !selectedQuestions.find(s => s.id === q.id)).length < 10}
            >
              <Zap className="btn-icon" />
              Random 10
            </button>
          </div>

          <div className="action-group difficulty-actions">
            <button
              className="quick-btn easy-btn"
              onClick={() => selectByDifficulty('easy', 5)}
              disabled={!filteredQuestions.some(q => {
                try { return getDifficulty(q) === 'easy'; } catch { return false; }
              })}
            >
              <span className="difficulty-dot easy"></span>
              5 Easy
            </button>
            
            <button
              className="quick-btn medium-btn"
              onClick={() => selectByDifficulty('medium', 5)}
              disabled={!filteredQuestions.some(q => {
                try { return getDifficulty(q) === 'medium'; } catch { return false; }
              })}
            >
              <span className="difficulty-dot medium"></span>
              5 Medium
            </button>
            
            <button
              className="quick-btn hard-btn"
              onClick={() => selectByDifficulty('hard', 5)}
              disabled={!filteredQuestions.some(q => {
                try { return getDifficulty(q) === 'hard'; } catch { return false; }
              })}
            >
              <span className="difficulty-dot hard"></span>
              5 Hard
            </button>
          </div>
        </div>
      )}



      {/* Questions Display */}
      <div className={`questions-container ${viewMode}`}>
        {filteredQuestions?.map((question, index) => {
          const isSelected = selectedQuestions.find(q => q.id === question.id);
          let difficulty: DifficultyLevel = 'easy';
          
          try {
            difficulty = getDifficulty(question);
          } catch (error) {
            console.warn('Error getting difficulty for question:', question.id, error);
          }
          
          return (
            <div
              key={question.id}
              className={`question-card ${isSelected ? 'selected' : ''} ${difficulty} ${viewMode}`}
              onClick={() => toggleQuestionSelection(question)}
            >
              <div className="card-header">
                <div className="card-meta">
                  <span className="question-number">Q{index + 1}</span>
                  <span className="subject-badge">{question.subject || 'No Subject'}</span>
                  <span className="topic-badge">{question.topic || 'No Topic'}</span>
                  {question.year && <span className="year-badge">{question.year}</span>}
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
                <p className="question-text">{question.text || 'No question text'}</p>
                
                <div className="options-container">
                  {(question.options || []).map((option, optIndex) => (
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
                    {(question.options || []).length} options
                  </span>
                  {question.year && (
                    <span className="stat">
                      <Calendar className="stat-icon" />
                      {question.year}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Enhanced Empty State */}
      {(!filteredQuestions || filteredQuestions.length === 0) && (
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
                onClick={resetAllFilters}
                className="empty-btn secondary"
              >
                <Settings className="btn-icon" />
                Reset All Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default QuestionSelectionSection;
