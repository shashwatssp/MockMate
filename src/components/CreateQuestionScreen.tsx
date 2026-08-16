import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  X,
  Upload,
  Save,
  Layers,
  Calendar,
  BarChart,
  Shield,
  CheckCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';
import type { Question, Difficulty } from '../types/exam.types';
import { insertQuestions, uploadQuestionImage } from '../lib/database';
import './CreateTest.css';
import './CreateQuestion.css';

interface CreateQuestionScreenProps {
  onBackToDashboard: () => void;
  onQuestionCreated?: () => void;
}

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const YEARS = Array.from({ length: 30 }, (_, i) => (2025 - i).toString());

export const CreateQuestionScreen: React.FC<CreateQuestionScreenProps> = ({
  onBackToDashboard,
  onQuestionCreated,
}) => {
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [year, setYear] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSubmitStatus({ type: 'error', message: 'Please choose an image file (png, jpg, gif, …).' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSubmitStatus({ type: 'error', message: 'Image must be smaller than 5 MB.' });
      return;
    }
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus(null);

    if (!questionText.trim()) {
      setSubmitStatus({ type: 'error', message: 'Question text is required.' });
      return;
    }
    if (options.some((o) => !o.trim())) {
      setSubmitStatus({ type: 'error', message: 'All four options are required.' });
      return;
    }

    setIsSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        imageUrl = await uploadQuestionImage(imageFile);
      }

      const question: Omit<Question, 'id'> = {
        text: questionText.trim(),
        options,
        correctAnswer,
        topic: topic.trim() || 'General',
        subject: subject.trim() || 'General',
        year: year.trim() || new Date().getFullYear().toString(),
        difficulty,
        ...(imageUrl ? { imageUrl } : {}),
      };

      await insertQuestions([question]);

      // Reset form
      setSubject('');
      setTopic('');
      setYear('');
      setDifficulty('medium');
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectAnswer(0);
      removeImage();

      setSubmitStatus({ type: 'success', message: 'Question created successfully!' });
      onQuestionCreated?.();
    } catch (err) {
      setSubmitStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create question. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <div className="create-test-wrapper">
      <header className="create-test-header">
        <div className="header-content">
          <div className="header-main">
            <div className="header-brand">
              <div className="brand-icon">
                <BookOpen className="icon" />
              </div>
              <div className="brand-text">
                <h1 className="brand-title">Create New Question</h1>
                <p className="brand-subtitle">Add a single question (or an image-backed one) to your bank</p>
              </div>
            </div>
            <div className="header-actions">
              <button onClick={onBackToDashboard} className="action-btn secondary">
                <Layers className="btn-icon" />
                <span className="btn-text">Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="create-test-main">
        <div className="main-content">
          <form onSubmit={handleSubmit} className="question-form">
            {submitStatus && (
              <div className={`import-status ${submitStatus.type === 'success' ? 'success' : 'error'}`} role="status">
                {submitStatus.type === 'success' ? (
                  <CheckCircle className="import-status-icon" />
                ) : (
                  <AlertCircle className="import-status-icon" />
                )}
                <span>{submitStatus.message}</span>
              </div>
            )}

            {/* Metadata row */}
            <div className="form-grid">
              <div className="form-column">
                <div className="form-field">
                  <label className="field-label">
                    <Layers className="label-icon" />
                    Subject <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Physics"
                    className="field-input"
                    disabled={isSubmitting}
                    list="question-subjects"
                  />
                  <datalist id="question-subjects">
                    <option value="Physics" />
                    <option value="Chemistry" />
                    <option value="Biology" />
                    <option value="Mathematics" />
                    <option value="English" />
                  </datalist>
                </div>

                <div className="form-field">
                  <label className="field-label">
                    <FileText className="label-icon" />
                    Topic <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Mechanics"
                    className="field-input"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-field">
                  <label className="field-label">
                    <Calendar className="label-icon" />
                    Year
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="field-input"
                    disabled={isSubmitting}
                  >
                    <option value="">Use current year</option>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label className="field-label">
                    <BarChart className="label-icon" />
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                    className="field-input"
                    disabled={isSubmitting}
                  >
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-column">
                <div className="form-field">
                  <label className="field-label">
                    <Shield className="label-icon" />
                    Correct Option
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {optionLabels.map((label, idx) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setCorrectAnswer(idx)}
                        disabled={isSubmitting}
                        className={`correctness-btn ${correctAnswer === idx ? 'selected' : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="field-hint">Choose which of the four options below is correct.</div>
                </div>
              </div>
            </div>

            {/* Question text */}
            <div className="form-field">
              <label className="field-label">
                <FileText className="label-icon" />
                Question Text <span className="required">*</span>
              </label>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="Write your question here…"
                className="field-textarea"
                rows={4}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Image upload */}
            <div className="form-field">
              <label className="field-label">
                <Upload className="label-icon" />
                Question Image (optional)
              </label>
              <div
                className="image-upload-dropzone"
                onClick={() => !isSubmitting && fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #d1d5db',
                  borderRadius: 8,
                  padding: 16,
                  textAlign: 'center',
                  cursor: isSubmitting ? 'default' : 'pointer',
                  background: '#f9fafb',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="question-upload-input"
                  onChange={handleImageChange}
                  disabled={isSubmitting}
                />
                <Upload className="upload-icon" style={{ margin: '0 auto 8px' }} />
                <div className="upload-text">Click to upload an image</div>
                <div className="field-hint">PNG, JPG, GIF up to 5 MB.</div>
              </div>

              {imagePreview && (
                <div className="image-preview" style={{ marginTop: 12 }}>
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="remove-image-btn"
                    style={{ marginTop: 8 }}
                    disabled={isSubmitting}
                  >
                    <X /> Remove
                  </button>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="form-field">
              <label className="field-label">
                <Layers className="label-icon" />
                Options <span className="required">*</span>
              </label>
              <div className="options-input-grid">
                {options.map((option, idx) => (
                  <div key={idx} className="option-input-row">
                    <span className="option-letter">{optionLabels[idx]}</span>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateOption(idx, e.target.value)}
                      placeholder={`Option ${optionLabels[idx]}`}
                      className="option-input"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className={`submit-button ${isSubmitting ? 'loading' : ''}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="loading-spinner"></div>
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <Save className="submit-icon" />
                  <span>Create Question</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateQuestionScreen;
