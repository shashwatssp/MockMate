import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudentProfile, getBatchById } from '../lib/database';
import { getStudentSession, setStudentSession, clearStudentSession } from '../lib/studentSession';
import { signOut } from '../lib/auth';
import type { StudentIdentity, BatchRow } from '../lib/database';
import { User, Mail, BookOpen, CheckCircle, Clock, LogOut, RefreshCw, AlertCircle } from 'lucide-react';
import './StudentDashboard.css';

export const StudentProfile: React.FC = () => {
  const navigate = useNavigate();
  const [me, setMe] = useState<StudentIdentity | null>(getStudentSession());
  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const profile = await getStudentProfile();
      if (!profile) {
        clearStudentSession();
        navigate('/student/login');
        return;
      }
      setMe(profile);
      setStudentSession(profile);
      if (profile.batchId) setBatch(await getBatchById(profile.batchId));
      else setBatch(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!me) {
    return <div className="student-redirect"><Clock className="animate-spin" /> Redirecting to login…</div>;
  }

  return (
    <div className="student-shell student-form-shell student-profile-page">
      <div className="student-profile-header">
        <h1>Your Profile</h1>
        <button onClick={load} disabled={loading} className="student-btn-plain">
          <RefreshCw size={14} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="student-error"><AlertCircle size={14} /> {error}</div>
      ) : null}

      <div className="student-profile-card">
        <div className="student-profile-item">
          <User size={18} className="profile-item-icon" />
          <div>
            <div className="student-profile-label">Name</div>
            <div className="student-profile-value">{me.name || <i className="student-muted">Not set</i>}</div>
          </div>
        </div>
        <div className="student-profile-item">
          <Mail size={18} className="profile-item-icon" />
          <div>
            <div className="student-profile-label">Email</div>
            <div className="student-profile-value">{me.username || me.email}</div>
          </div>
        </div>
        <div className="student-profile-item">
          <BookOpen size={18} className="profile-item-icon" />
          <div>
            <div className="student-profile-label">Batch</div>
            <div className="student-profile-value">{batch ? `${batch.name} (${batch.code})` : <i className="student-muted">Not assigned</i>}</div>
          </div>
        </div>
      </div>

      <div className={`student-status-badge ${me.isApproved ? 'status-approved' : 'status-pending'}`}>
        <CheckCircle size={18} className="status-icon" />
        <div>
          <div className="student-profile-label">Account status</div>
          <div className="student-profile-value">{me.isApproved ? 'Approved — you can take tests' : 'Awaiting teacher approval'}</div>
        </div>
      </div>

      <div className="student-profile-actions">
        <button
          onClick={() => navigate('/student/dashboard')}
          className="student-btn-primary"
        >
          Back to dashboard
        </button>
        <button
          onClick={async () => {
            await signOut();
            clearStudentSession();
            navigate('/');
          }}
          className="student-btn-plain"
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </div>
  );
};

export default StudentProfile;
