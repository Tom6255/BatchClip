import type { Dispatch, SetStateAction } from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Button from '../../../components/ui/Button';
import type { TranslationKey } from '../../../i18n/translations';

interface SettingsModalProps {
  visible: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onClose: () => void;
  defaultFixedDuration: number;
  useFixedDuration: boolean;
  setUseFixedDuration: Dispatch<SetStateAction<boolean>>;
  defaultDuration: number;
  setDefaultDuration: Dispatch<SetStateAction<number>>;
  hasLutFile: boolean;
  lutFileName: string;
  onImportLut: () => void;
  onClearLut: () => void;
  enableLutPreview: boolean;
  onToggleLutPreview: () => void;
}

const SettingsModal = ({
  visible,
  t,
  onClose,
  defaultFixedDuration,
  useFixedDuration,
  setUseFixedDuration,
  defaultDuration,
  setDefaultDuration,
  hasLutFile,
  lutFileName,
  onImportLut,
  onClearLut,
  enableLutPreview,
  onToggleLutPreview
}: SettingsModalProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-500" />
            {t('settings')}
          </h3>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-zinc-200">{t('fixedDuration')}</label>
                <p className="text-xs text-zinc-500">{t('fixedDurationDesc')}</p>
              </div>
              <button
                onClick={() => setUseFixedDuration(!useFixedDuration)}
                className={cn(
                  'w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none',
                  useFixedDuration ? 'bg-blue-600' : 'bg-zinc-700'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full bg-white transition-transform duration-200 mx-1',
                    useFixedDuration ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            <div className={cn('space-y-3 transition-opacity duration-200', !useFixedDuration && 'opacity-50')}>
              <label className="text-sm font-medium text-zinc-200 block">
                {t('defaultDurationLabel')}
              </label>
              <div className="relative group">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={defaultDuration}
                  onChange={(event) => {
                    const value = parseFloat(event.target.value);
                    if (!isNaN(value)) setDefaultDuration(value);
                  }}
                  onBlur={(event) => {
                    const value = parseFloat(event.target.value);
                    if (isNaN(value) || value <= 0) setDefaultDuration(defaultFixedDuration);
                  }}
                  disabled={!useFixedDuration}
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 pointer-events-none">
                  sec
                </div>
              </div>
              {!useFixedDuration && (
                <p className="text-[10px] text-zinc-500">{t('disabledDesc')}</p>
              )}
            </div>

            <div className="pt-4 border-t border-white/5 space-y-3">
              <label className="text-sm font-medium text-zinc-200 block">
                {t('lutSettings')}
              </label>

              <div className="space-y-3 rounded-lg border border-white/10 bg-zinc-950/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-zinc-500">{t('lutFile')}</p>
                    <p
                      className={cn(
                        'text-xs font-mono truncate mt-1',
                        hasLutFile ? 'text-zinc-200' : 'text-zinc-500'
                      )}
                    >
                      {lutFileName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={onImportLut}
                    >
                      {t('importLut')}
                    </Button>
                    {hasLutFile && (
                      <Button
                        variant="ghost"
                        className="h-8 px-2 text-xs text-zinc-500 hover:text-red-400"
                        onClick={onClearLut}
                      >
                        {t('clearLut')}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-zinc-200">{t('enableLutPreview')}</label>
                    <p className="text-xs text-zinc-500">{t('enableLutPreviewDesc')}</p>
                  </div>
                  <button
                    onClick={onToggleLutPreview}
                    disabled={!hasLutFile}
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none',
                      enableLutPreview ? 'bg-blue-600' : 'bg-zinc-700',
                      !hasLutFile && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full bg-white transition-transform duration-200 mx-1',
                        enableLutPreview ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-zinc-900/50 border-t border-white/5">
          <Button className="w-full" onClick={onClose}>{t('done')}</Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
