import type { Dispatch, SetStateAction, ChangeEvent } from 'react';
import { ChevronDown, ChevronRight, Scissors, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';
import Button from '../ui/Button';

type QuickSplitTextKey =
  | 'quickSplitButtonLabel'
  | 'quickSplitBySizeDesc'
  | 'quickSplitTargetSize'
  | 'quickSplitTargetHint'
  | 'quickSplitSourceFile'
  | 'quickSplitSourceSize'
  | 'quickSplitChooseSource'
  | 'quickSplitting'
  | 'quickSplitRun';

interface QuickSplitBySizeFeatureProps {
  isOpen: boolean;
  onToggle: () => void;
  t: (key: QuickSplitTextKey, params?: Record<string, string | number>) => string;
  quickSplitTargetSizeMb: number;
  setQuickSplitTargetSizeMb: Dispatch<SetStateAction<number>>;
  defaultSplitTargetSizeMb: number;
  minSplitTargetSizeMb: number;
  maxSplitTargetSizeMb: number;
  quickSplitSourcePath: string;
  quickSplitSourceDisplayName: string;
  quickSplitSourceSizeLabel: string;
  videoFileAccept: string;
  onSourceChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRun: () => void;
  isExporting: boolean;
  exportMode: 'clips' | 'full' | 'split';
  exportProgressPercent: number | null;
}

const QuickSplitBySizeFeature = ({
  isOpen,
  onToggle,
  t,
  quickSplitTargetSizeMb,
  setQuickSplitTargetSizeMb,
  defaultSplitTargetSizeMb,
  minSplitTargetSizeMb,
  maxSplitTargetSizeMb,
  quickSplitSourcePath,
  quickSplitSourceDisplayName,
  quickSplitSourceSizeLabel,
  videoFileAccept,
  onSourceChange,
  onRun,
  isExporting,
  exportMode,
  exportProgressPercent
}: QuickSplitBySizeFeatureProps) => {
  return (
    <>
      <div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'group w-full rounded-xl border px-3 py-3 flex items-center gap-3 text-left transition-all',
            isOpen
              ? 'border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.16)]'
              : 'border-white/10 bg-zinc-950/45 hover:border-cyan-500/40 hover:bg-cyan-500/5'
          )}
        >
          <span
            className={cn(
              'h-6 min-w-6 px-1 rounded-md flex items-center justify-center text-xs font-semibold font-mono',
              isOpen ? 'bg-cyan-300 text-zinc-900' : 'bg-zinc-800 text-zinc-300'
            )}
          >
            1
          </span>
          <span className="flex-1 text-sm font-medium text-zinc-100">
            {t('quickSplitButtonLabel')}
          </span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-cyan-300" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-300 transition-colors" />
          )}
        </button>
      </div>

      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          isOpen ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
        )}
      >
        <div className="overflow-hidden">
          <div className="rounded-xl border border-cyan-500/20 bg-zinc-950/65 p-4 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">{t('quickSplitBySizeDesc')}</p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-200">{t('quickSplitTargetSize')}</label>
              <div className="relative">
                <input
                  type="number"
                  min={minSplitTargetSizeMb}
                  max={maxSplitTargetSizeMb}
                  step={1}
                  value={quickSplitTargetSizeMb}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) {
                      setQuickSplitTargetSizeMb(minSplitTargetSizeMb);
                      return;
                    }
                    setQuickSplitTargetSizeMb(nextValue);
                  }}
                  onBlur={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue) || nextValue < minSplitTargetSizeMb) {
                      setQuickSplitTargetSizeMb(defaultSplitTargetSizeMb);
                      return;
                    }
                    setQuickSplitTargetSizeMb(Math.min(maxSplitTargetSizeMb, Math.round(nextValue)));
                  }}
                  className="w-full h-9 rounded-lg bg-zinc-800 border border-white/10 pl-3 pr-10 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">MB</span>
              </div>
              <p className="text-[11px] text-zinc-500">{t('quickSplitTargetHint')}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-zinc-200">{t('quickSplitSourceFile')}</label>
                <span
                  className={cn(
                    'max-w-[60%] truncate text-[11px] font-mono text-right',
                    quickSplitSourcePath ? 'text-zinc-300' : 'text-zinc-500'
                  )}
                  title={quickSplitSourceDisplayName}
                >
                  {quickSplitSourceDisplayName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5">
                <span className="text-[11px] text-zinc-400">{t('quickSplitSourceSize')}</span>
                <span className="text-[11px] font-mono text-zinc-200">{quickSplitSourceSizeLabel}</span>
              </div>

              <input
                type="file"
                className="hidden"
                id="quick-split-file-upload"
                accept={videoFileAccept}
                onChange={onSourceChange}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-9 px-3 text-xs shrink-0"
                  onClick={() => document.getElementById('quick-split-file-upload')?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('quickSplitChooseSource')}
                </Button>
                <Button
                  className="h-9 flex-1 text-sm"
                  disabled={isExporting || !quickSplitSourcePath}
                  onClick={onRun}
                >
                  <Scissors className="w-4 h-4" />
                  {isExporting && exportMode === 'split'
                    ? `${t('quickSplitting')} ${Math.round(exportProgressPercent ?? 0)}%`
                    : t('quickSplitRun')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default QuickSplitBySizeFeature;
