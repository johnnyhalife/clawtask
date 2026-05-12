'use client';

import { createContext, use, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: 'system',
  setTheme: () => {},
  toggle: () => {},
});

export function useTheme() { return use(ThemeContext); }

function resolveTheme(t: Theme): 'dark' | 'light' {
  if (t === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return t;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');

  useEffect(() => {
    const saved = localStorage.getItem('clawtask-theme') as Theme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') setThemeState(saved);
  }, []);

  useEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute('data-theme', resolveTheme(theme));
    };
    apply();
    localStorage.setItem('clawtask-theme', theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
