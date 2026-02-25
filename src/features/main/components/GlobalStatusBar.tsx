import { Github, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Language, TranslationKey } from '../../../i18n/translations';
import type { ResolvedTheme, ThemePreference } from '../hooks/useMainSettings';

interface GlobalStatusBarProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  language: Language;
  onToggleLanguage: () => void;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  onChangeThemePreference: (nextTheme: ThemePreference) => void;
  onOpenProjectGithub: () => void;
  appVersion: string;
}

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  labelKey: TranslationKey;
  Icon: typeof Moon;
}> = [
  { value: 'dark', labelKey: 'themeDark', Icon: Moon },
  { value: 'light', labelKey: 'themeLight', Icon: Sun },
  { value: 'system', labelKey: 'themeSystem', Icon: Monitor }
];

const GlobalStatusBar = ({
  t,
  language,
  onToggleLanguage,
  themePreference,
  resolvedTheme,
  onChangeThemePreference,
  onOpenProjectGithub,
  appVersion
}: GlobalStatusBarProps) => {
  const languageLabel = language === 'zh' ? 'ZH' : 'EN';
  const resolvedThemeLabel = resolvedTheme === 'dark' ? t('themeDark') : t('themeLight');
  const themeStateLabel = themePreference === 'system'
    ? `${t('themeSystem')} / ${resolvedThemeLabel}`
    : resolvedThemeLabel;
  const isLight = resolvedTheme === 'light';

  return (
    <footer className={cn(
      'h-12 shrink-0 border-t backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-3 transition-colors duration-300',
      isLight
        ? 'bg-slate-100/85 border-slate-300/75'
        : 'bg-zinc-950/80 border-white/10'
    )}>
      <div className="min-w-0 flex items-center gap-2 overflow-x-auto no-drag">
        <button
          type="button"
          className={cn(
            'h-8 w-8 rounded-full border text-xs transition-all duration-200 flex items-center justify-center shrink-0',
            isLight
              ? 'border-slate-300 bg-white/85 hover:bg-white text-slate-700'
              : 'border-white/10 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-200'
          )}
          onClick={onOpenProjectGithub}
          title="GitHub"
          aria-label="Open BatchClip GitHub repository"
        >
          <Github className={cn('w-3.5 h-3.5', isLight ? 'text-slate-700' : 'text-zinc-100')} />
        </button>

        <button
          type="button"
          className={cn(
            'h-8 px-3 rounded-full border text-xs transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap',
            isLight
              ? 'border-slate-300 bg-white/85 hover:bg-white text-slate-700'
              : 'border-white/10 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-200'
          )}
          onClick={onToggleLanguage}
          title={t('statusLanguage')}
        >
          <Languages className={cn('w-3.5 h-3.5', isLight ? 'text-sky-500' : 'text-blue-400')} />
          <span>{t('statusLanguage')}: {languageLabel}</span>
        </button>

        <div className={cn(
          'h-8 px-1 rounded-full border flex items-center gap-1',
          isLight
            ? 'border-slate-300 bg-white/85'
            : 'border-white/10 bg-zinc-900/60'
        )}>
          {THEME_OPTIONS.map(({ value, labelKey, Icon }) => (
            <button
              key={value}
              type="button"
              className={cn(
                'h-6 px-2 rounded-full text-[11px] transition-all duration-200 flex items-center gap-1',
                themePreference === value
                  ? isLight
                    ? 'bg-sky-100 text-sky-700 shadow-inner shadow-sky-200'
                    : 'bg-blue-500/20 text-blue-300 shadow-inner shadow-blue-500/25'
                  : isLight
                    ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
              )}
              onClick={() => onChangeThemePreference(value)}
              title={t(labelKey)}
            >
              <Icon className="w-3 h-3" />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>

        <span className={cn(
          'text-[11px] font-medium whitespace-nowrap',
          isLight ? 'text-slate-500' : 'text-zinc-500'
        )}>
          {t('statusTheme')}: {themeStateLabel}
        </span>
      </div>

      <div className={cn(
        'text-[11px] font-mono whitespace-nowrap no-drag',
        isLight ? 'text-slate-500' : 'text-zinc-500'
      )}>
        {t('statusVersion')}: v{appVersion}
      </div>
    </footer>
  );
};

export default GlobalStatusBar;
