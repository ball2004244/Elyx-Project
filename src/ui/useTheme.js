/**
 * @file Light/dark theme hook (taste-skill 6.C: dual-mode from the start).
 * Defaults to the system preference and persists an explicit user choice.
 */

import { useEffect, useState } from 'react';

const KEY = 'elyx-theme';

function initialTheme() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** @returns {[string, () => void]} current theme and a toggle function. */
export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return [theme, toggle];
}
