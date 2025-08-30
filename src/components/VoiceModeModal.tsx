import React, { useState, useEffect } from 'react';
import {
  X,
  Mic,
  MicOff,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
  Zap,
  Crown,
  Star,
  Wand2,
  Brain,
  MessageSquare,
  Eye,
  EyeOff
} from 'lucide-react';
import './CreateTest.css';

interface VoiceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isListening: boolean;
  transcript: string;
  isProcessing: boolean;
  onStartRecording: () => any;
  onStopRecording: (recognition?: any) => void;
  onProcessTranscript: () => void;
}

export const VoiceModeModal: React.FC<VoiceModeModalProps> = ({
  isOpen,
  onClose,
  isListening,
  transcript,
  isProcessing,
  onStartRecording,
  onStopRecording,
  onProcessTranscript
}) => {
  const [currentRecognition, setCurrentRecognition] = useState<any>(null);
  const [showInstructions, setShowInstructions] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showTranscript, setShowTranscript] = useState(true);
  const [step, setStep] = useState<'instructions' | 'recording' | 'processing' | 'complete'>('instructions');

  // Audio feedback
  const playSound = (type: 'start' | 'stop' | 'success' | 'error') => {
    if (!audioEnabled) return;
    
    // Create audio context for sound feedback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    const frequencies = {
      start: 800,
      stop: 400,
      success: 1000,
      error: 300
    };
    
    oscillator.frequency.setValueAtTime(frequencies[type], audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  };

  // Handle recording start
  const handleStartRecording = () => {
    const recognition = onStartRecording();
    setCurrentRecognition(recognition);
    setStep('recording');
    playSound('start');
  };

  // Handle recording stop
  const handleStopRecording = () => {
    onStopRecording(currentRecognition);
    setCurrentRecognition(null);
    setStep('instructions');
    playSound('stop');
  };

  // Handle process transcript
  const handleProcessTranscript = () => {
    setStep('processing');
    onProcessTranscript();
    playSound('success');
  };

  // Update step based on props
  useEffect(() => {
    if (isProcessing) {
      setStep('processing');
    } else if (isListening) {
      setStep('recording');
    } else if (transcript && !isProcessing) {
      setStep('complete');
    }
  }, [isListening, isProcessing, transcript]);

  // Close modal handler
  const handleClose = () => {
    if (isListening && currentRecognition) {
      handleStopRecording();
    }
    onClose();
    setStep('instructions');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (event.key) {
        case 'Escape':
          handleClose();
          break;
        case ' ':
          event.preventDefault();
          if (isListening) {
            handleStopRecording();
          } else {
            handleStartRecording();
          }
          break;
        case 'Enter':
          if (transcript && !isProcessing) {
            handleProcessTranscript();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, isListening, transcript, isProcessing, currentRecognition]);

  if (!isOpen) return null;

  return (
    <div className="voice-modal-overlay" onClick={handleClose}>
      <div className="voice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-left">
            <div className="feature-badge">
              <Crown className="badge-icon" />
              <span className="badge-text">Premium Feature</span>
            </div>
            <h2 className="modal-title">
              <Wand2 className="title-icon" />
              Voice Mode Assistant
            </h2>
            <p className="modal-subtitle">Create your test by speaking naturally</p>
          </div>
          
          <div className="header-controls">
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`control-btn ${audioEnabled ? 'active' : ''}`}
              title="Toggle audio feedback"
            >
              {audioEnabled ? <Volume2 className="control-icon" /> : <VolumeX className="control-icon" />}
            </button>
            
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={`control-btn ${showTranscript ? 'active' : ''}`}
              title="Toggle transcript view"
            >
              {showTranscript ? <Eye className="control-icon" /> : <EyeOff className="control-icon" />}
            </button>
            
            <button
              onClick={handleClose}
              className="close-btn"
              title="Close modal (Esc)"
            >
              <X className="close-icon" />
            </button>
          </div>
        </div>

        <div className="modal-content">
          {/* Step Indicator */}
          <div className="step-indicator">
            <div className={`step-item ${step === 'instructions' ? 'active' : step !== 'instructions' ? 'completed' : ''}`}>
              <div className="step-circle">
                {step !== 'instructions' ? <CheckCircle className="step-icon" /> : '1'}
              </div>
              <span className="step-label">Instructions</span>
            </div>
            <div className="step-connector"></div>
            <div className={`step-item ${step === 'recording' ? 'active' : step === 'processing' || step === 'complete' ? 'completed' : ''}`}>
              <div className="step-circle">
                {step === 'processing' || step === 'complete' ? <CheckCircle className="step-icon" /> : '2'}
              </div>
              <span className="step-label">Recording</span>
            </div>
            <div className="step-connector"></div>
            <div className={`step-item ${step === 'processing' ? 'active' : step === 'complete' ? 'completed' : ''}`}>
              <div className="step-circle">
                {step === 'complete' ? <CheckCircle className="step-icon" /> : '3'}
              </div>
              <span className="step-label">Processing</span>
            </div>
            <div className="step-connector"></div>
            <div className={`step-item ${step === 'complete' ? 'active' : ''}`}>
              <div className="step-circle">4</div>
              <span className="step-label">Complete</span>
            </div>
          </div>

          {/* Instructions Panel */}
          {showInstructions && (
            <div className="instructions-panel">
              <div className="panel-header">
                <Info className="panel-icon" />
                <h3 className="panel-title">How to Use Voice Mode</h3>
                <button
                  onClick={() => setShowInstructions(false)}
                  className="toggle-instructions"
                >
                  Hide Instructions
                </button>
              </div>
              
              <div className="instructions-content">
                <div className="instruction-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Click Record Button</h4>
                    <p>Press the microphone button or spacebar to start recording</p>
                  </div>
                </div>
                
                <div className="instruction-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Speak in This Sequence</h4>
                    <div className="speech-format">
                      <div className="format-item">
                        <span className="format-label">Test Name:</span>
                        <span className="format-example">"Mathematics Quiz Chapter 5"</span>
                      </div>
                      <div className="format-item">
                        <span className="format-label">Date & Time:</span>
                        <span className="format-example">"Tomorrow at 2 PM" or "September 1st at 10 AM"</span>
                      </div>
                      <div className="format-item">
                        <span className="format-label">Duration:</span>
                        <span className="format-example">"90 minutes duration"</span>
                      </div>
                      <div className="format-item">
                        <span className="format-label">Questions:</span>
                        <span className="format-example">"5 questions from Algebra, 10 from Geometry"</span>
                      </div>
                      <div className="format-item">
                        <span className="format-label">Difficulty:</span>
                        <span className="format-example">"5 easy, 8 medium, 2 hard questions"</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="instruction-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Review & Create</h4>
                    <p>Check the extracted information and click "Create Test" or edit manually</p>
                  </div>
                </div>
              </div>
              
              <div className="pro-tips">
                <h4 className="tips-title">
                  <Sparkles className="tips-icon" />
                  Pro Tips
                </h4>
                <ul className="tips-list">
                  <li>Speak clearly and at a moderate pace</li>
                  <li>Use natural language - "tomorrow" works just as well as specific dates</li>
                  <li>You can mention subjects, topics, or specific question types</li>
                  <li>The AI will make smart suggestions if information is unclear</li>
                </ul>
              </div>
            </div>
          )}

          {!showInstructions && (
            <button
              onClick={() => setShowInstructions(true)}
              className="show-instructions-btn"
            >
              <Info className="btn-icon" />
              Show Instructions
            </button>
          )}

          {/* Recording Interface */}
          <div className="recording-interface">
            <div className={`recording-visualization ${isListening ? 'active' : ''}`}>
              <div className="mic-container">
                <button
                  onClick={isListening ? handleStopRecording : handleStartRecording}
                  className={`record-btn ${isListening ? 'recording' : ''}`}
                  disabled={isProcessing}
                >
                  {isListening ? (
                    <MicOff className="record-icon" />
                  ) : (
                    <Mic className="record-icon" />
                  )}
                </button>
                
                {isListening && (
                  <div className="sound-waves">
                    <div className="wave wave-1"></div>
                    <div className="wave wave-2"></div>
                    <div className="wave wave-3"></div>
                    <div className="wave wave-4"></div>
                    <div className="wave wave-5"></div>
                  </div>
                )}
              </div>
              
              <div className="recording-status">
                {isProcessing ? (
                  <div className="status-item processing">
                    <Brain className="status-icon" />
                    <span>AI is processing your request...</span>
                  </div>
                ) : isListening ? (
                  <div className="status-item listening">
                    <Mic className="status-icon" />
                    <span>Listening... Speak now</span>
                  </div>
                ) : transcript ? (
                  <div className="status-item ready">
                    <CheckCircle className="status-icon" />
                    <span>Ready to process</span>
                  </div>
                ) : (
                  <div className="status-item idle">
                    <MessageSquare className="status-icon" />
                    <span>Click to start recording</span>
                  </div>
                )}
              </div>
            </div>

            {/* Transcript Display */}
            {showTranscript && transcript && (
              <div className="transcript-panel">
                <div className="transcript-header">
                  <h4 className="transcript-title">Your Voice Input</h4>
                  <button
                    onClick={() => {
                      // Clear transcript functionality
                      if (currentRecognition) {
                        handleStopRecording();
                      }
                    }}
                    className="clear-transcript-btn"
                    title="Clear transcript"
                  >
                    <RotateCcw className="clear-icon" />
                  </button>
                </div>
                <div className="transcript-content">
                  <p className="transcript-text">{transcript}</p>
                </div>
              </div>
            )}

            {/* Control Buttons */}
            <div className="control-buttons">
              {transcript && !isProcessing && !isListening && (
                <button
                  onClick={handleProcessTranscript}
                  className="process-btn primary"
                >
                  <Zap className="btn-icon" />
                  Create Test with AI
                </button>
              )}
              
              {isProcessing && (
                <div className="processing-indicator">
                  <Loader2 className="spinner" />
                  <span>Processing with AI...</span>
                </div>
              )}
              
              <div className="keyboard-shortcuts">
                <div className="shortcut-item">
                  <kbd>Space</kbd>
                  <span>Start/Stop Recording</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Enter</kbd>
                  <span>Process Transcript</span>
                </div>
                <div className="shortcut-item">
                  <kbd>Esc</kbd>
                  <span>Close Modal</span>
                </div>
              </div>
            </div>
          </div>

          {/* Browser Compatibility Warning */}
          {!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window) && (
            <div className="compatibility-warning">
              <AlertCircle className="warning-icon" />
              <div className="warning-content">
                <h4>Browser Compatibility</h4>
                <p>Voice recognition is not supported in this browser. Please use Chrome or Edge for the best experience.</p>
              </div>
            </div>
          )}

          {/* Feature Highlight */}
          <div className="feature-highlight">
            <Star className="highlight-icon" />
            <div className="highlight-content">
              <h4>AI-Powered Test Creation</h4>
              <p>Our advanced AI understands natural speech and intelligently selects questions based on your requirements.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceModeModal;
