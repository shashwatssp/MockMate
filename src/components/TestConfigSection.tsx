import React, { useState } from 'react';
import {
  FileText,
  Calendar,
  Clock,
  Timer,
  BookOpen,
  Settings,
  ChevronDown,
  BarChart3,
  Target,
  TrendingUp,
  Info,
  Zap
} from 'lucide-react';
import './CreateTest.css';

interface TestConfigSectionProps {
  testName: string;
  setTestName: (name: string) => void;
  testDescription: string;
  setTestDescription: (description: string) => void;
  timeLimit: number;
  setTimeLimit: (limit: number) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  startTime: string;
  setStartTime: (time: string) => void;
  duration: number;
  setDuration: (duration: number) => void;
  randomizeQuestions: boolean;
  setRandomizeQuestions: (randomize: boolean) => void;
  allowReview: boolean;
  setAllowReview: (allow: boolean) => void;
  showCorrectAnswers: boolean;
  setShowCorrectAnswers: (show: boolean) => void;
  selectedTopicCounts: Record<string, number>;
  estimatedDuration: number;
  averageDifficulty: number;
  selectedQuestionsCount: number;
  isLoaded: boolean;
}

export const TestConfigSection: React.FC<TestConfigSectionProps> = ({
  testName,
  setTestName,
  testDescription,
  setTestDescription,
  timeLimit,
  setTimeLimit,
  startDate,
  setStartDate,
  startTime,
  setStartTime,
  duration,
  setDuration,
  randomizeQuestions,
  setRandomizeQuestions,
  allowReview,
  setAllowReview,
  showCorrectAnswers,
  setShowCorrectAnswers,
  selectedTopicCounts,
  estimatedDuration,
  averageDifficulty,
  selectedQuestionsCount,
  isLoaded
}) => {
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // Quick preset configurations
  const presets = [
    {
      name: "Quick Quiz",
      icon: <Zap className="preset-icon" />,
      description: "15-30 min quiz",
      config: {
        duration: 30,
        timeLimit: 2,
        randomizeQuestions: true,
        allowReview: false,
        showCorrectAnswers: true
      }
    },
    {
      name: "Standard Test",
      icon: <BookOpen className="preset-icon" />,
      description: "60-90 min exam",
      config: {
        duration: 90,
        timeLimit: 3,
        randomizeQuestions: false,
        allowReview: true,
        showCorrectAnswers: false
      }
    },
    {
      name: "Comprehensive Exam",
      icon: <Target className="preset-icon" />,
      description: "2-3 hour assessment",
      config: {
        duration: 180,
        timeLimit: 5,
        randomizeQuestions: true,
        allowReview: true,
        showCorrectAnswers: false
      }
    }
  ];

  const applyPreset = (preset: typeof presets[0]) => {
    setDuration(preset.config.duration);
    setTimeLimit(preset.config.timeLimit);
    setRandomizeQuestions(preset.config.randomizeQuestions);
    setAllowReview(preset.config.allowReview);
    setShowCorrectAnswers(preset.config.showCorrectAnswers);
    setShowPresets(false);
  };

  // Smart suggestions based on selected questions
  const getSmartSuggestions = () => {
    const suggestions = [];
    
    if (selectedQuestionsCount > 0) {
      const recommendedDuration = Math.max(30, selectedQuestionsCount * timeLimit + 10);
      if (Math.abs(duration - recommendedDuration) > 15) {
        suggestions.push({
          type: 'duration',
          message: `Consider ${recommendedDuration} minutes for ${selectedQuestionsCount} questions`,
          action: () => setDuration(recommendedDuration)
        });
      }
      
      if (averageDifficulty >= 2.5 && timeLimit < 3) {
        suggestions.push({
          type: 'time',
          message: 'Increase time per question for harder questions',
          action: () => setTimeLimit(Math.min(5, timeLimit + 1))
        });
      }
    }
    
    return suggestions;
  };

  const smartSuggestions = getSmartSuggestions();

  return (
    <section className={`test-config-section ${isLoaded ? 'loaded' : ''}`}>
      <div className="config-card">
        <div className="card-header">
          <div className="header-left">
            <h2 className="card-title">Test Configuration</h2>
            <p className="card-subtitle">Set up your test details and preferences</p>
          </div>
          <div className="header-stats">
            <div className="stat-chip primary">
              <Timer className="stat-icon" />
              {estimatedDuration} min
            </div>
            <div className="stat-chip success">
              <BarChart3 className="stat-icon" />
              {selectedQuestionsCount} selected
            </div>
            <div className="stat-chip warning">
              <TrendingUp className="stat-icon" />
              Level {averageDifficulty || 1}
            </div>
          </div>
        </div>

        <div className="card-content">
          {/* Smart Suggestions */}
          {smartSuggestions.length > 0 && (
            <div className="smart-suggestions">
              <div className="suggestions-header">
                <Info className="suggestions-icon" />
                <span className="suggestions-title">Smart Suggestions</span>
              </div>
              <div className="suggestions-list">
                {smartSuggestions.map((suggestion, index) => (
                  <div key={index} className="suggestion-item">
                    <span className="suggestion-text">{suggestion.message}</span>
                    <button 
                      onClick={suggestion.action}
                      className="suggestion-btn"
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Presets */}
          <div className="quick-presets">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="presets-toggle"
            >
              <Zap className="presets-icon" />
              <span>Quick Presets</span>
              <ChevronDown className={`chevron ${showPresets ? 'open' : ''}`} />
            </button>
            
            {showPresets && (
              <div className="presets-grid">
                {presets.map((preset, index) => (
                  <button
                    key={index}
                    onClick={() => applyPreset(preset)}
                    className="preset-card"
                  >
                    {preset.icon}
                    <div className="preset-content">
                      <span className="preset-name">{preset.name}</span>
                      <span className="preset-description">{preset.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-grid">
            <div className="form-column">
              {/* Basic Configuration */}
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

              <div className="form-field">
                <label className="field-label">
                  <Calendar className="label-icon" />
                  Start Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="field-input"
                  required
                />
              </div>

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

              <div className="form-field">
                <label className="field-label">
                  <FileText className="label-icon" />
                  Description (Optional)
                </label>
                <textarea
                  value={testDescription}
                  onChange={(e) => setTestDescription(e.target.value)}
                  placeholder="Add instructions or description for your test..."
                  className="field-textarea"
                  rows={4}
                />
              </div>
            </div>

            <div className="form-column">
              {/* Timing Configuration */}
              <div className="timing-section">
                <h3 className="section-title">Timing Settings</h3>
                
                <div className="form-field">
                  <label className="field-label">
                    <Timer className="label-icon" />
                    Test Duration (minutes)
                  </label>
                  <div className="input-with-slider">
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      min="15"
                      max="300"
                      className="field-input"
                    />
                    <input
                      type="range"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      min="15"
                      max="300"
                      className="duration-slider"
                    />
                  </div>
                  <div className="field-hint">
                    Recommended: {selectedQuestionsCount > 0 ? Math.max(30, selectedQuestionsCount * timeLimit + 10) : 90} minutes
                  </div>
                </div>

                <div className="form-field">
                  <label className="field-label">
                    <Clock className="label-icon" />
                    Time per Question (minutes)
                  </label>
                  <div className="time-options">
                    {[1, 2, 3, 5, 10].map(time => (
                      <button
                        key={time}
                        onClick={() => setTimeLimit(time)}
                        className={`time-option ${timeLimit === time ? 'active' : ''}`}
                      >
                        {time}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
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
                    <div className="setting-label">Randomize Questions</div>
                    <p className="setting-description">Shuffle question order for each student to prevent cheating</p>
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
                    <div className="setting-label">Allow Review</div>
                    <p className="setting-description">Let students review and change answers before final submission</p>
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
                    <div className="setting-label">Show Correct Answers</div>
                    <p className="setting-description">Display correct answers after test completion for learning purposes</p>
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

          {/* Topic Distribution - Enhanced */}
          {Object.keys(selectedTopicCounts).length > 0 && (
            <div className="topic-distribution">
              <h3 className="distribution-title">
                <Target className="title-icon" />
                Selected Questions by Topic
              </h3>
              <div className="topic-stats">
                <div className="stats-summary">
                  <div className="summary-item">
                    <span className="summary-value">{Object.keys(selectedTopicCounts).length}</span>
                    <span className="summary-label">Topics</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-value">{selectedQuestionsCount}</span>
                    <span className="summary-label">Questions</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-value">{averageDifficulty.toFixed(1)}</span>
                    <span className="summary-label">Avg Level</span>
                  </div>
                </div>
              </div>
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
  );
};

export default TestConfigSection;
