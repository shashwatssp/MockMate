import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // Import your supabase client
import { getOwnedTestIds, getQuestionCount, getTestResults } from '../lib/database';
import { getTeacherSession } from '../lib/localAuth';
import { 
  Plus, 
  LogOut, 
  Copy, 
  BookOpen, 
  Users, 
  Clock, 
  Calendar,
  Eye,
  Share2,
  MoreVertical,
  Search,
  Filter,
  BarChart3,
  CheckCircle,
  AlertCircle,
  Activity,
  RefreshCw,
  Zap,
  Loader2,
  LayoutGrid,
  List,
  ListPlus
} from 'lucide-react';
import type { Test, TestResult } from '../types/exam.types';
import { TestInsightsModal } from './TestInsightsModal';
import './Dashboard.css';

interface DashboardProps {
  onCreateTest: () => void;
  onCreateQuestion: () => void;
  onLogout: () => void;
  tests: Test[]; // This will be replaced by fetched data
}

export const Dashboard: React.FC<DashboardProps> = ({ onCreateTest, onCreateQuestion, onLogout }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [copiedTestId, setCopiedTestId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // New state for actual data
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
      ? 'cards'
      : 'table'
  ));
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [insightsTest, setInsightsTest] = useState<Test | null>(null);
  const [insightsMode, setInsightsMode] = useState<'preview' | 'analytics'>('preview');
  const [insightsResults, setInsightsResults] = useState<TestResult[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [questionBankCount, setQuestionBankCount] = useState(0);

  // Fetch tests from Supabase
  const fetchTests = async () => {
    try {
      setLoading(true);
      setError(null);

      const teacher = getTeacherSession();
      let query = supabase
        .from('tests')
        .select('*')
        .order('created_at', { ascending: false });
      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      const ownedIds = teacher ? new Set(getOwnedTestIds(teacher.id)) : new Set<string>();
      const scopedRows = (data || []).filter((test) => {
        if (!teacher) return true;
        return ownedIds.has(test.id) || test.created_by === teacher.id;
      });

      // Transform Supabase data to match your Test interface
      const transformedTests: Test[] = scopedRows.map(test => ({
        id: test.id,
        testKey: test.test_key,
        name: test.name,
        title: test.name, // Using name as title
        questions: test.questions || [],
        settings: test.settings,
        endTime: test.end_date ? new Date(test.end_date) : undefined,
        createdAt: new Date(test.created_at),
        duration: test.duration ?? test.time_limit,
        timeLimit: test.duration ?? test.time_limit,
        description: test.description || undefined,
        startDate: test.start_date ? new Date(test.start_date) : undefined
      })) || [];

      setTests(transformedTests);
      try {
        setQuestionBankCount(await getQuestionCount());
      } catch (questionCountError) {
        console.warn('Unable to load question-bank count:', questionCountError);
        setQuestionBankCount(new Set(
          transformedTests.flatMap(test => test.questions.map(question => question.id))
        ).size);
      }

      // Count distinct student names per test. This is intentionally best-effort:
      // a restrictive RLS policy should not prevent teachers from seeing tests.
      const { data: resultRows, error: resultsError } = await supabase
        .from('test_results')
        .select('test_id, student_name');

      if (resultsError) {
        console.warn('Unable to load test attempt counts:', resultsError);
        setAttemptCounts({});
      } else {
        const studentsByTest = (resultRows || []).reduce<Record<string, Set<string>>>((acc, row, index) => {
          if (!row.test_id) return acc;
          if (!acc[row.test_id]) acc[row.test_id] = new Set<string>();
          const studentName = String(row.student_name || '').trim();
          // Keep unnamed attempts countable without collapsing all of them together.
          acc[row.test_id].add(studentName || `attempt-${index}`);
          return acc;
        }, {});
        setAttemptCounts(Object.fromEntries(
          Object.entries(studentsByTest).map(([testId, students]) => [testId, students.size])
        ));
      }
    } catch (err) {
      console.error('Error fetching tests:', err);
      setError('Failed to load tests. Please try again.');
    } finally {
      setLoading(false);
      setIsLoaded(true);
    }
  };

  const loadTestAnalytics = async (test: Test) => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const results = await getTestResults(test.id);
      setInsightsResults(results.filter(result => !result.isPractice));
    } catch (err) {
      console.error('Failed to load test analytics:', err);
      setInsightsError('Unable to load analytics for this test.');
    } finally {
      setInsightsLoading(false);
    }
  };

  const openTestInsights = (test: Test, mode: 'preview' | 'analytics') => {
    setInsightsTest(test);
    setInsightsMode(mode);
    setInsightsResults([]);
    setInsightsError(null);
    if (mode === 'analytics') {
      void loadTestAnalytics(test);
    }
  };

  const closeTestInsights = () => {
    setInsightsTest(null);
    setInsightsResults([]);
    setInsightsError(null);
  };

  const formatDateOnly = (date?: Date) => {
    if (!date || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchTests();
  }, []);

  // Real-time subscription for test updates (optional)
  useEffect(() => {
    const subscription = supabase
      .channel('tests-channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'tests' }, 
        (payload) => {
          console.log('Test updated:', payload);
          fetchTests(); // Refetch data when changes occur
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const copyTestLink = async (testKey: string) => {
    const testLink = `${window.location.origin}/${testKey}`;
    try {
      await navigator.clipboard.writeText(testLink);
      setCopiedTestId(testKey);
      setTimeout(() => setCopiedTestId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = testLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedTestId(testKey);
      setTimeout(() => setCopiedTestId(null), 2000);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    const diffInWeeks = Math.floor(diffInDays / 7);
    return `${diffInWeeks}w ago`;
  };

  const recentTests = tests.filter(test => 
    (new Date().getTime() - test.createdAt.getTime()) < (7 * 24 * 60 * 60 * 1000)
  ).length;

  const filteredTests = tests.filter(test => {
    const matchesSearch = (test.name || test.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedFilter === 'all') return matchesSearch;
    if (selectedFilter === 'recent') {
      const isRecent = (new Date().getTime() - test.createdAt.getTime()) < (7 * 24 * 60 * 60 * 1000);
      return matchesSearch && isRecent;
    }
    return matchesSearch;
  });

  // Handle loading state
  if (loading) {
    return (
        <div className="loading-container">
          <Loader2 className="loading-spinner" />
          <h2>Loading your tests...</h2>
          <p>Please wait while we fetch your data</p>
        </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="dashboard-wrapper">
        <div className="error-container">
          <AlertCircle className="error-icon" />
          <h2>Oops! Something went wrong</h2>
          <p>{error}</p>
          <button onClick={fetchTests} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-main">
            <div className="brand-section">
              <div className="brand-icon">
                <BookOpen className="icon" />
              </div>
              <h1 className="brand-title">
                Mock<span className="brand-highlight">Mate</span>
              </h1>
              <div className="brand-badge">Dashboard</div>
            </div>
            
            <div className="header-actions">
              <button onClick={fetchTests} className="refresh-btn" title="Refresh" aria-label="Refresh dashboard">
                <RefreshCw className="btn-icon" aria-hidden="true" />
                <span className="sr-only">Refresh dashboard</span>
              </button>
              
              <button onClick={onCreateTest} className="create-btn" aria-label="Create test">
                <Plus className="btn-icon" />
                <span className="btn-text">Create Test</span>
              </button>
              
              <button onClick={onCreateQuestion} className="create-btn secondary" aria-label="Create question">
                <ListPlus className="btn-icon" />
                <span className="btn-text">Create Question</span>
              </button>
              
            <a href="/batches" className="create-btn secondary" aria-label="Manage batches" title="Manage batches">
                <Users className="btn-icon" />
                <span className="btn-text">Batches</span>
              </a>
              <button onClick={onLogout} className="logout-btn" aria-label="Log out">
                <LogOut className="btn-icon" />
                <span className="btn-text">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Welcome Section */}
        <section className={`welcome-section ${isLoaded ? 'loaded' : ''}`}>
          <div className="welcome-content">
            <div className="welcome-text">
              <div className="welcome-greeting">
                <h2 className="greeting-title">
                  Welcome back, {getTeacherSession()?.name || 'Teacher'}! 
                  <span className="greeting-emoji">👋</span>
                </h2>
                <p className="greeting-subtitle">
                  {tests.length > 0 
                    ? "Here's an overview of your tests"
                    : "Ready to create your first amazing test?"
                  }
                </p>
              </div>
              
              <div className="quick-stats">
                <div className="quick-stat">
                  <div className="stat-value">{tests.length}</div>
                  <div className="stat-label">Tests Created</div>
                </div>
                <div className="quick-stat">
                  <div className="stat-value">{questionBankCount}</div>
                  <div className="stat-label">Question Bank</div>
                </div>
                <div className="quick-stat">
                  <div className="stat-value">{recentTests}</div>
                  <div className="stat-label">This Week</div>
                </div>
              </div>
            </div>
            
            <div className="welcome-visual">
              <div className="feature-highlights">
                <div className="highlight-card">
                  <Zap className="highlight-icon" />
                  <span>Quick Setup</span>
                </div>
                <div className="highlight-card">
                  <BarChart3 className="highlight-icon" />
                  <span>Analytics</span>
                </div>
                <div className="highlight-card">
                  <Share2 className="highlight-icon" />
                  <span>Easy Share</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tests Section */}
        <section className={`tests-section ${isLoaded ? 'loaded' : ''}`}>
          <div className="tests-header">
            <div className="tests-title-area">
              <h2 className="tests-title">Your Tests</h2>
              <p className="tests-subtitle">
                Manage and share your created assessments
              </p>
            </div>
            
            <div className="tests-controls">
              <div className="search-box">
                <Search className="search-icon" />
                <input
                  type="text"
                  placeholder="Search tests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              
              <div className="filter-dropdown">
                <Filter className="filter-icon" />
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Tests</option>
                  <option value="recent">Recent</option>
                </select>
              </div>

              <div className="view-toggle" role="group" aria-label="Test list view">
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setViewMode('cards')}
                  aria-label="Show tests as cards"
                  aria-pressed={viewMode === 'cards'}
                >
                  <LayoutGrid className="view-toggle-icon" />
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  aria-label="Show tests as a table"
                  aria-pressed={viewMode === 'table'}
                >
                  <List className="view-toggle-icon" />
                </button>
              </div>
            </div>
          </div>
          
          {tests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-visual">
                <div className="empty-icon">
                  <BookOpen className="icon" />
                </div>
                <div className="empty-decoration">
                  <div className="decoration-circle"></div>
                  <div className="decoration-circle"></div>
                  <div className="decoration-circle"></div>
                </div>
              </div>
              
              <div className="empty-content">
                <h3 className="empty-title">No tests created yet</h3>
                <p className="empty-description">
                  Create your first test to get started with MockMate! 
                  It only takes a few minutes to set up.
                </p>
                
                
                <button onClick={onCreateTest} className="empty-cta">
                  <Plus className="cta-icon" />
                  <span>Create Your First Test</span>
                </button>
              </div>
            </div>
          ) : (
            viewMode === 'table' ? (
              <div className="tests-table-wrapper">
                <table className="tests-table">
                  <thead>
                    <tr>
                      <th scope="col">Test name</th>
                      <th scope="col">Date created</th>
                      <th scope="col">Date of exam</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Students attempted</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTests.map((test) => (
                      <tr key={test.id}>
                        <th scope="row">
                          <span className="table-test-name">{test.name || test.title}</span>
                          <span className="table-test-key">{test.testKey}</span>
                          {test.endTime && new Date(test.endTime).getTime() < Date.now() ? (
                            <span style={{marginLeft: 8, padding: '2px 8px', fontSize: '11px', fontWeight: 700, color: '#b91c1c', background: '#fee2e2', borderRadius: 4}}>Expired</span>
                          ) : null}
                        </th>
                        <td>{formatDateOnly(test.createdAt)}</td>
                        <td>{formatDateOnly(test.startDate)}</td>
                        <td>{test.duration || test.timeLimit || 30} min</td>
                        <td>
                          <span className="attempt-count">
                            <Users className="attempt-count-icon" />
                            {attemptCounts[test.id] ?? 0}
                          </span>
                        </td>
                        <td className="table-actions">
                          <button
                            type="button"
                            onClick={() => openTestInsights(test, 'preview')}
                            className="table-insights-btn preview"
                          >
                            <Eye className="table-action-icon" />
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openTestInsights(test, 'analytics')}
                            className="table-insights-btn analytics"
                          >
                            <BarChart3 className="table-action-icon" />
                            <span>Analytics</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => copyTestLink(test.testKey)}
                            className={`table-copy-btn ${copiedTestId === test.testKey ? 'copied' : ''}`}
                          >
                            {copiedTestId === test.testKey ? <CheckCircle className="table-action-icon" /> : <Copy className="table-action-icon" />}
                            <span>{copiedTestId === test.testKey ? 'Copied' : 'Copy link'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
            <div className="tests-grid">
              {filteredTests.map((test, index) => (
                <div 
                  key={test.id} 
                  className="test-card"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="test-card-header">
                    <div className="test-info">
                      <h3 className="test-name">
                        {test.name || test.title}
                      </h3>
                      <div className="test-meta">
                        <span className="meta-item">
                          <Calendar className="meta-icon" />
                          {getTimeAgo(test.createdAt)}
                        </span>
                        <span className="meta-divider">•</span>
                        <span className="meta-item">
                          {formatDate(test.createdAt)}
                        </span>
                      </div>
                    </div>
                    
                    <button className="test-menu">
                      <MoreVertical className="menu-icon" />
                    </button>
                  </div>
                  
                  <div className="test-stats-row">
                    <div className="test-stat">
                      <div className="stat-icon-small questions">
                        <BookOpen className="stat-icon-xs" />
                      </div>
                      <span className="stat-text">
                        {test.questions.length} questions
                      </span>
                    </div>
                    
                    <div className="test-stat">
                      <div className="stat-icon-small duration">
                        <Clock className="stat-icon-xs" />
                      </div>
                      <span className="stat-text">
                        {test.duration || test.timeLimit || 30} min
                      </span>
                    </div>
                    
                    <div className="test-stat">
                      <div className="stat-icon-small status">
                        <Activity className="stat-icon-xs" />
                      </div>
                      {test.endTime && new Date(test.endTime).getTime() < Date.now() ? (
                        <span className="stat-text status-expired" style={{color: '#b91c1c', fontWeight: 700}}>
                          Expired
                        </span>
                      ) : (
                        <span className="stat-text status-active">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="test-actions">
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={() => openTestInsights(test, 'preview')}
                    >
                      <Eye className="action-icon" />
                      <span>Preview</span>
                    </button>
                    
                    <button
                      type="button"
                      className="action-btn analytics"
                      onClick={() => openTestInsights(test, 'analytics')}
                    >
                      <BarChart3 className="action-icon" />
                      <span>Analytics</span>
                    </button>
                    <button
                      onClick={() => copyTestLink(test.testKey)}
                      className={`action-btn primary ${copiedTestId === test.testKey ? 'copied' : ''}`}
                    >
                      {copiedTestId === test.testKey ? (
                        <>
                          <CheckCircle className="action-icon" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="action-icon" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="test-progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                </div>
              ))}
            </div>
            )
          )}
          
          {filteredTests.length === 0 && tests.length > 0 && (
            <div className="no-results">
              <AlertCircle className="no-results-icon" />
              <h3 className="no-results-title">No tests found</h3>
              <p className="no-results-description">
                Try adjusting your search query or filter options.
              </p>
            </div>
          )}
        </section>
      </main>

      {insightsTest && (
        <TestInsightsModal
          test={insightsTest}
          mode={insightsMode}
          results={insightsResults}
          isLoading={insightsLoading}
          error={insightsError}
          onModeChange={(mode) => {
            setInsightsMode(mode);
            if (mode === 'analytics') {
              void loadTestAnalytics(insightsTest);
            }
          }}
          onClose={closeTestInsights}
          onRetry={() => void loadTestAnalytics(insightsTest)}
        />
      )}
    </div>
  );
};

export default Dashboard;