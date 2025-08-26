import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  BookOpen, 
  Users, 
  Award, 
  Zap, 
  Target, 
  BarChart3, 
  Star,
  CheckCircle,
  Play,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import './LandingPage.css';
import { populateDatabase } from '../scripts/populateQuestions';

interface LandingPageProps {
  onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);

  populateDatabase();

  useEffect(() => {
    console.log("ENTERED");
    setIsVisible(true);
    populateDatabase();
    
    // Auto-rotate feature highlights
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % 3);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const stats = [
    { number: '10K+', label: 'Happy Teachers', icon: Users },
    { number: '50K+', label: 'Tests Created', icon: BookOpen },
    { number: '1M+', label: 'Questions Answered', icon: Target },
    { number: '98%', label: 'Success Rate', icon: Award }
  ];

  const features = [
    {
      icon: Zap,
      title: 'Lightning Fast Setup',
      description: 'Create comprehensive tests in under 2 minutes with our AI-powered question selection',
      color: 'from-yellow-400 to-orange-500'
    },
    {
      icon: Target,
      title: 'Smart Topic Mapping',
      description: 'Automatically categorized questions with difficulty levels and learning outcomes',
      color: 'from-blue-400 to-cyan-500'
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Deep insights into student performance with personalized improvement suggestions',
      color: 'from-purple-400 to-pink-500'
    }
  ];

  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'Mathematics Teacher',
      content: 'MockMate has revolutionized how I assess my students. The analytics help me identify learning gaps instantly.',
      rating: 5,
      avatar: '👩‍🏫'
    },
    {
      name: 'Dr. Rajesh Kumar',
      role: 'Physics Professor',
      content: 'The question bank is incredibly comprehensive. My students love the instant feedback feature.',
      rating: 5,
      avatar: '👨‍🔬'
    },
    {
      name: 'Emily Chen',
      role: 'English Instructor',
      content: 'Finally, a platform that makes test creation enjoyable. The interface is intuitive and powerful.',
      rating: 5,
      avatar: '👩‍💼'
    }
  ];

  return (
    <div className="landing-wrapper">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-background">
          <div className="hero-gradient"></div>
          <div className="floating-shapes">
            <div className="shape shape-1"></div>
            <div className="shape shape-2"></div>
            <div className="shape shape-3"></div>
            <div className="shape shape-4"></div>
          </div>
        </div>
        
        <div className="hero-content">
          <div className={`hero-text ${isVisible ? 'visible' : ''}`}>
            <div className="hero-badge">
              <Sparkles className="badge-icon" />
              <span>Trusted by 10,000+ Educators</span>
            </div>
            
            <h1 className="hero-title">
              Mock<span className="title-highlight">Mate</span>
            </h1>
            
            <p className="hero-subtitle">
              Create Mock Tests for your students & help them 
              <span className="subtitle-highlight"> ACE Exams</span>
            </p>
            
            <p className="hero-description">
              Empower your teaching with AI-driven test creation, real-time analytics, 
              and personalized student insights. Transform assessment into engagement.
            </p>
            
            <div className="hero-actions">
              <button
                onClick={onLogin}
                className="cta-primary"
              >
                <span>Start Creating Tests</span>
                <ArrowRight className="cta-icon" />
              </button>
              
              <button className="cta-secondary">
                <Play className="play-icon" />
                <span>Watch Demo</span>
              </button>
            </div>
            
            <div className="hero-stats">
              {stats.map((stat, index) => (
                <div key={index} className="stat-item">
                  <stat.icon className="stat-icon" />
                  <div className="stat-content">
                    <div className="stat-number">{stat.number}</div>
                    <div className="stat-label">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className={`hero-visual ${isVisible ? 'visible' : ''}`}>
            <div className="dashboard-mockup">
              <div className="mockup-header">
                <div className="mockup-controls">
                  <div className="control red"></div>
                  <div className="control yellow"></div>
                  <div className="control green"></div>
                </div>
                <div className="mockup-title">MockMate Dashboard</div>
              </div>
              
              <div className="mockup-content">
                <div className="mockup-sidebar">
                  <div className="sidebar-item active">
                    <BookOpen className="sidebar-icon" />
                    <span>My Tests</span>
                  </div>
                  <div className="sidebar-item">
                    <BarChart3 className="sidebar-icon" />
                    <span>Analytics</span>
                  </div>
                  <div className="sidebar-item">
                    <Users className="sidebar-icon" />
                    <span>Students</span>
                  </div>
                </div>
                
                <div className="mockup-main">
                  <div className="test-card">
                    <div className="test-header">Mathematics Quiz - Chapter 5</div>
                    <div className="test-stats">
                      <span>25 Questions • 30 min</span>
                      <span className="test-status">Active</span>
                    </div>
                  </div>
                  
                  <div className="analytics-preview">
                    <div className="chart-placeholder">
                      <TrendingUp className="chart-icon" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="features-container">
          <div className="section-header">
            <h2 className="section-title">
              Why Teachers Choose MockMate
            </h2>
            <p className="section-subtitle">
              Discover the features that make test creation effortless and student assessment meaningful
            </p>
          </div>
          
          <div className="features-grid">
            {features.map((feature, index) => (
              <div 
                key={index}
                className={`feature-card ${activeFeature === index ? 'active' : ''}`}
                onMouseEnter={() => setActiveFeature(index)}
              >
                <div className={`feature-icon-wrapper bg-gradient-to-br ${feature.color}`}>
                  <feature.icon className="feature-icon" />
                </div>
                
                <div className="feature-content">
                  <h3 className="feature-title">{feature.title}</h3>
                  <p className="feature-description">{feature.description}</p>
                  
                  <div className="feature-benefits">
                    <div className="benefit-item">
                      <CheckCircle className="check-icon" />
                      <span>Easy to use</span>
                    </div>
                    <div className="benefit-item">
                      <CheckCircle className="check-icon" />
                      <span>Instant results</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="process-section">
        <div className="process-container">
          <div className="section-header">
            <h2 className="section-title">
              Get Started in 3 Simple Steps
            </h2>
            <p className="section-subtitle">
              From question selection to student insights in minutes
            </p>
          </div>
          
          <div className="process-steps">
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3 className="step-title">Choose Questions</h3>
                <p className="step-description">
                  Select from our curated question bank or upload your own
                </p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3 className="step-title">Create Test</h3>
                <p className="step-description">
                  Customize settings and generate your test instantly
                </p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step-item">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3 className="step-title">Share & Analyze</h3>
                <p className="step-description">
                  Share with students and get real-time performance insights
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="testimonials-section">
        <div className="testimonials-container">
          <div className="section-header">
            <h2 className="section-title">
              Loved by Educators Worldwide
            </h2>
            <p className="section-subtitle">
              See what teachers are saying about MockMate
            </p>
          </div>
          
          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="testimonial-card">
                <div className="testimonial-header">
                  <div className="avatar">{testimonial.avatar}</div>
                  <div className="author-info">
                    <div className="author-name">{testimonial.name}</div>
                    <div className="author-role">{testimonial.role}</div>
                  </div>
                  <div className="rating">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="star-icon filled" />
                    ))}
                  </div>
                </div>
                
                <p className="testimonial-content">"{testimonial.content}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <div className="cta-content">
            <h2 className="cta-title">
              Ready to Transform Your Teaching?
            </h2>
            <p className="cta-description">
              Join thousands of educators who have revolutionized their assessment process with MockMate
            </p>
            
            <div className="cta-actions">
              <button
                onClick={onLogin}
                className="cta-primary large"
              >
                <span>Start Your Free Trial</span>
                <ArrowRight className="cta-icon" />
              </button>
            </div>
            
            <div className="cta-features">
              <div className="cta-feature">
                <CheckCircle className="feature-check" />
                <span>No credit card required</span>
              </div>
              <div className="cta-feature">
                <CheckCircle className="feature-check" />
                <span>14-day free trial</span>
              </div>
              <div className="cta-feature">
                <CheckCircle className="feature-check" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
