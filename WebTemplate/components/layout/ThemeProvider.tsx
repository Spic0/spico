"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Theme preference is one of three; the *resolved* theme applied to
// documentElement[data-theme] is always concrete light/dark so every existing
// [data-theme="dark"] rule keeps working unchanged. "system" follows the OS
// colour scheme live. See docs/ui-audit.md (Phase 1 foundation).
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  cycleTheme: () => void;
  setThemePreference: (preference: ThemePreference) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "spico-theme";
const SIDEBAR_KEY = "spico-sidebar-collapsed";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Restore persisted preferences post-mount: localStorage isn't available
  // during SSR, so applying it synchronously would mismatch the server HTML.
  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const storedSidebar = window.localStorage.getItem(SIDEBAR_KEY);
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemePreferenceState(storedTheme);
    }
    if (storedSidebar === "true") setSidebarCollapsed(true);
  }, []);

  // Track the OS colour scheme (only affects the applied theme while the
  // preference is "system", but we keep it current regardless so switching to
  // "system" resolves instantly).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSystemDark(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    themePreference === "system" ? (systemDark ? "dark" : "light") : themePreference;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    window.localStorage.setItem(THEME_KEY, preference);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemePreferenceState((current) => {
      const next: ThemePreference = current === "light" ? "dark" : current === "dark" ? "system" : "light";
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const value: ThemeContextValue = {
    themePreference,
    resolvedTheme,
    cycleTheme,
    setThemePreference,
    sidebarCollapsed,
    toggleSidebar: () => setSidebarCollapsed((current) => !current),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
