import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, Globe, LayoutGrid, ListPlus, LogOut, Menu, Plus, Target, Users, X,
} from 'lucide-react';
import { signOut } from '../lib/auth';
import { getTeacherSession } from '../lib/localAuth';
import { ThemeToggle } from './ThemeToggle';
import './TeacherShell.css';

const NAV: Array<{ to: string; label: string; icon: React.ComponentType<{ size?: number }>; end?: boolean }> = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/create-test', label: 'Create Test', icon: Plus },
  { to: '/create-question', label: 'Create Question', icon: ListPlus },
  { to: '/batches', label: 'Batches', icon: Users },
  { to: '/dashboard/topics', label: 'Topic Mastery', icon: Target },
  { to: '/dashboard/questions', label: 'Question Bank', icon: BookOpen },
  { to: '/teacher-page', label: 'My Page', icon: Globe },
];

/**
 * Application sidebar for the teacher surfaces: navigation lives here (instead
 * of crowding page headers), with the theme switcher and logout pinned to the
 * bottom. Desktop ≥1100px shows it permanently; smaller screens get a slide-in
 * drawer behind a hamburger top bar.
 */
export const TeacherShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Navigating (drawer link or back gesture) closes the mobile drawer.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Lock body scroll behind the open drawer.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.warn('Unable to sign out:', error);
    } finally {
      navigate('/');
    }
  };

  const teacher = getTeacherSession();

  return (
    <div className="teacher-shell">
      {/* Mobile top bar with the hamburger */}
      <div className="teacher-topbar">
        <button
          type="button"
          className="teacher-topbar-menu"
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
        <span className="teacher-topbar-brand">Mock<span>Mate</span></span>
      </div>

      {open ? <div className="teacher-drawer-overlay" onClick={() => setOpen(false)} /> : null}

      <aside className={`teacher-sidebar ${open ? 'is-open' : ''}`} aria-label="Teacher navigation">
        <div className="teacher-sidebar-head">
          <span className="teacher-sidebar-brand">Mock<span>Mate</span></span>
          <button
            type="button"
            className="teacher-sidebar-close"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {teacher ? (
          <p className="teacher-sidebar-teacher">{teacher.name || teacher.username}</p>
        ) : null}

        <nav className="teacher-sidebar-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `teacher-nav-item ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="teacher-sidebar-foot">
          <ThemeToggle />
          <button type="button" onClick={() => void handleLogout()} className="teacher-nav-item teacher-logout">
            <LogOut size={17} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="teacher-content">{children}</main>
    </div>
  );
};

export default TeacherShell;
