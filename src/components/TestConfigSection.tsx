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
  TrendingUp
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

  return (
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
              <span>{selectedQuestionsCount} selected</span>
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
  );
};

export default TestConfigSection;
