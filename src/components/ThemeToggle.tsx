import React, { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { getThemeMode, setThemeMode, type ThemeMode } from '../lib/theme';

const OPTIONS: Array<{
  mode: ThemeMode;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
}> = [
  { mode: 'light', icon: Sun, label: 'Light theme' },
  { mode: 'dark', icon: Moon, label: 'Dark theme' },
  { mode: 'system', icon: Monitor, label: 'Match system theme' },
];

/** Segmented light / dark / system switcher. Lives in dashboard headers;
 *  the choice persists in localStorage and paints instantly app-wide. */
export const ThemeToggle: React.FC = () => {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {OPTIONS.map(({ mode: m, icon: Icon, label }) => (
        <button
          key={m}
          type="button"
          className={`theme-toggle-option ${mode === m ? 'is-active' : ''}`}
          aria-pressed={mode === m}
          aria-label={label}
          title={label}
          onClick={() => {
            setThemeMode(m);
            setMode(m);
          }}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
