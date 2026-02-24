import { useEffect, useMemo, useState } from 'react';
import type { Language } from '../../../i18n/translations';

const USE_FIXED_DURATION_STORAGE_KEY = 'useFixedDuration';
const DEFAULT_DURATION_STORAGE_KEY = 'defaultDuration';
const LANGUAGE_STORAGE_KEY = 'language';
const THEME_PREFERENCE_STORAGE_KEY = 'themePreference';
const LUT_FILE_PATH_STORAGE_KEY = 'lutFilePath';
const LUT_INTENSITY_STORAGE_KEY = 'lutIntensity';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

const isThemePreference = (value: string | null): value is ThemePreference => {
  return value === 'dark' || value === 'light' || value === 'system';
};

const getInitialSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

interface UseMainSettingsParams {
  defaultFixedDuration: number;
  defaultLutIntensity: number;
  clampLutIntensity: (value: number) => number;
}

// EN: Encapsulates primary editor settings + persistence behavior.
// ZH: 封装主编辑功能的设置状态与本地持久化行为。
export const useMainSettings = ({
  defaultFixedDuration,
  defaultLutIntensity,
  clampLutIntensity
}: UseMainSettingsParams) => {
  const [useFixedDuration, setUseFixedDuration] = useState(() => {
    const saved = localStorage.getItem(USE_FIXED_DURATION_STORAGE_KEY);
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [defaultDuration, setDefaultDuration] = useState(() => {
    const saved = localStorage.getItem(DEFAULT_DURATION_STORAGE_KEY);
    return saved !== null ? JSON.parse(saved) : defaultFixedDuration;
  });

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return (saved === 'en' || saved === 'zh') ? saved : 'zh';
  });

  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return isThemePreference(saved) ? saved : 'system';
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getInitialSystemTheme);

  const [lutFilePath, setLutFilePath] = useState(() => {
    return localStorage.getItem(LUT_FILE_PATH_STORAGE_KEY) ?? '';
  });

  const [enableLutPreview, setEnableLutPreview] = useState(false);

  const [lutIntensity, setLutIntensity] = useState(() => {
    const saved = localStorage.getItem(LUT_INTENSITY_STORAGE_KEY);
    if (saved === null) {
      return defaultLutIntensity;
    }
    return clampLutIntensity(Number(saved));
  });

  const [lutIntensityDraft, setLutIntensityDraft] = useState(() => {
    const saved = localStorage.getItem(LUT_INTENSITY_STORAGE_KEY);
    if (saved === null) {
      return defaultLutIntensity;
    }
    return clampLutIntensity(Number(saved));
  });

  useEffect(() => {
    localStorage.setItem(USE_FIXED_DURATION_STORAGE_KEY, JSON.stringify(useFixedDuration));
  }, [useFixedDuration]);

  useEffect(() => {
    localStorage.setItem(DEFAULT_DURATION_STORAGE_KEY, JSON.stringify(defaultDuration));
  }, [defaultDuration]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = (matches: boolean) => {
      setSystemTheme(matches ? 'dark' : 'light');
    };

    syncTheme(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncTheme(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(LUT_FILE_PATH_STORAGE_KEY, lutFilePath);
  }, [lutFilePath]);

  useEffect(() => {
    localStorage.setItem(LUT_INTENSITY_STORAGE_KEY, String(lutIntensity));
  }, [lutIntensity]);

  const resolvedTheme = useMemo<ResolvedTheme>(() => {
    return themePreference === 'system' ? systemTheme : themePreference;
  }, [systemTheme, themePreference]);

  return {
    useFixedDuration,
    setUseFixedDuration,
    defaultDuration,
    setDefaultDuration,
    language,
    setLanguage,
    themePreference,
    setThemePreference,
    resolvedTheme,
    lutFilePath,
    setLutFilePath,
    enableLutPreview,
    setEnableLutPreview,
    lutIntensity,
    setLutIntensity,
    lutIntensityDraft,
    setLutIntensityDraft
  };
};
