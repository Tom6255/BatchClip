import { useEffect, useState } from 'react';
import { CheckCircle2, FileOutput, X } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { cn } from '../../../lib/utils';
import type { TranslationKey } from '../../../i18n/translations';
import type { ResolvedTheme } from '../hooks/useMainSettings';
import type {
  ConvertContainerFormat,
  ConvertVideoCodecTarget,
  DefaultExportPreference
} from '../../quick-actions/types';
import {
  DEFAULT_EXPORT_FORMAT_VIDEO_CODECS,
  ensureCompatibleDefaultExportVideoCodec
} from '../lib/defaultExport';

interface ExportFormatSettingsModalProps {
  visible: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  resolvedTheme: ResolvedTheme;
  value: DefaultExportPreference;
  onClose: () => void;
  onConfirm: (nextValue: DefaultExportPreference) => void;
}

const FORMAT_OPTIONS: Array<{ value: ConvertContainerFormat; label: string }> = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
  { value: 'mov', label: 'MOV' },
  { value: 'webm', label: 'WebM' }
];

const CODEC_LABELS: Record<ConvertVideoCodecTarget, string> = {
  h264: 'H.264',
  hevc: 'H.265 / HEVC',
  vp9: 'VP9',
  av1: 'AV1',
  prores: 'Apple ProRes'
};

const ExportFormatSettingsModal = ({
  visible,
  t,
  resolvedTheme,
  value,
  onClose,
  onConfirm
}: ExportFormatSettingsModalProps) => {
  const [draft, setDraft] = useState<DefaultExportPreference>(value);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(value);
  }, [value, visible]);

  if (!visible) {
    return null;
  }

  const isLight = resolvedTheme === 'light';
  const allowedCodecs = DEFAULT_EXPORT_FORMAT_VIDEO_CODECS[draft.format];

  const updateDraftFormat = (nextFormat: ConvertContainerFormat) => {
    setDraft((prev) => ({
      ...prev,
      format: nextFormat,
      videoCodec: ensureCompatibleDefaultExportVideoCodec(nextFormat, prev.videoCodec)
    }));
  };

  const updateDraftCodec = (nextCodec: ConvertVideoCodecTarget) => {
    setDraft((prev) => ({
      ...prev,
      videoCodec: ensureCompatibleDefaultExportVideoCodec(prev.format, nextCodec)
    }));
  };

  return (
    <div className="fixed inset-0 z-[111] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        'relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200',
        isLight
          ? 'bg-slate-100 border border-slate-300/80'
          : 'bg-zinc-900 border border-white/10'
      )}>
        <div className={cn(
          'p-4 border-b flex items-center justify-between',
          isLight ? 'border-slate-300/80' : 'border-white/5'
        )}>
          <h3 className={cn(
            'text-lg font-semibold flex items-center gap-2',
            isLight ? 'text-slate-900' : 'text-zinc-100'
          )}>
            <FileOutput className={cn('w-5 h-5', isLight ? 'text-cyan-600' : 'text-cyan-300')} />
            {t('exportFormatSettingsTitle')}
          </h3>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <p className={cn(
            'text-xs leading-relaxed',
            isLight ? 'text-slate-600' : 'text-zinc-400'
          )}>
            {t('exportFormatSettingsDesc')}
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, mode: 'transcode' }))}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left transition-colors flex items-start justify-between gap-3',
                draft.mode === 'transcode'
                  ? isLight
                    ? 'border-cyan-400 bg-cyan-50'
                    : 'border-cyan-400/50 bg-cyan-500/10'
                  : isLight
                    ? 'border-slate-300 bg-white hover:border-cyan-300'
                    : 'border-white/10 bg-zinc-950/60 hover:border-cyan-500/30'
              )}
            >
              <div className="min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  isLight ? 'text-slate-900' : 'text-zinc-100'
                )}>{t('exportFormatUseCustom')}</p>
                <p className={cn(
                  'mt-1 text-[11px]',
                  isLight ? 'text-slate-600' : 'text-zinc-400'
                )}>{t('exportFormatUseCustomDesc')}</p>
              </div>
              {draft.mode === 'transcode' && (
                <CheckCircle2 className={cn('w-4.5 h-4.5 shrink-0 mt-0.5', isLight ? 'text-cyan-600' : 'text-cyan-300')} />
              )}
            </button>

            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, mode: 'source' }))}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left transition-colors flex items-start justify-between gap-3',
                draft.mode === 'source'
                  ? isLight
                    ? 'border-cyan-400 bg-cyan-50'
                    : 'border-cyan-400/50 bg-cyan-500/10'
                  : isLight
                    ? 'border-slate-300 bg-white hover:border-cyan-300'
                    : 'border-white/10 bg-zinc-950/60 hover:border-cyan-500/30'
              )}
            >
              <div className="min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  isLight ? 'text-slate-900' : 'text-zinc-100'
                )}>{t('exportFormatUseSource')}</p>
                <p className={cn(
                  'mt-1 text-[11px]',
                  isLight ? 'text-slate-600' : 'text-zinc-400'
                )}>{t('exportFormatUseSourceDesc')}</p>
              </div>
              {draft.mode === 'source' && (
                <CheckCircle2 className={cn('w-4.5 h-4.5 shrink-0 mt-0.5', isLight ? 'text-cyan-600' : 'text-cyan-300')} />
              )}
            </button>
          </div>

          <div className={cn(
            'rounded-lg border px-3 py-2 text-[11px]',
            isLight ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
          )}>
            {draft.mode === 'transcode' ? t('exportFormatActiveHintTranscode') : t('exportFormatActiveHintSource')}
          </div>

          {draft.mode === 'transcode' && (
            <div className={cn(
              'space-y-3 rounded-lg border p-3',
              isLight ? 'border-slate-300 bg-white/85' : 'border-white/10 bg-zinc-950/40'
            )}>
              <label className="block space-y-1">
                <span className={cn('text-xs', isLight ? 'text-slate-700' : 'text-zinc-300')}>{t('exportFormatContainer')}</span>
                <select
                  value={draft.format}
                  onChange={(event) => updateDraftFormat(event.target.value as ConvertContainerFormat)}
                  className={cn(
                    'w-full h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30',
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-zinc-800 border-white/10 text-zinc-100'
                  )}
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className={cn('text-xs', isLight ? 'text-slate-700' : 'text-zinc-300')}>{t('exportFormatVideoCodec')}</span>
                <select
                  value={draft.videoCodec}
                  onChange={(event) => updateDraftCodec(event.target.value as ConvertVideoCodecTarget)}
                  className={cn(
                    'w-full h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30',
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-zinc-800 border-white/10 text-zinc-100'
                  )}
                >
                  {allowedCodecs.map((codec) => (
                    <option key={codec} value={codec}>
                      {CODEC_LABELS[codec]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className={cn(
          'p-4 border-t flex items-center justify-end gap-2',
          isLight ? 'border-slate-300/80' : 'border-white/5'
        )}>
          <Button variant="ghost" className="h-9 px-4" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            className="h-9 px-4"
            onClick={() => {
              onConfirm(draft);
            }}
          >
            {t('exportFormatSave')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ExportFormatSettingsModal;
