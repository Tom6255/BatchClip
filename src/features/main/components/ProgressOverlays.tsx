import { cn } from '../../../lib/utils';
import Button from '../../../components/ui/Button';

interface ProgressOverlaysProps {
  isPreparingPreview: boolean;
  previewProgressPercent: number | null;
  previewLoadingText: string;
  isExporting: boolean;
  exportProgressPercent: number | null;
  exportProgressLabel: string;
  exportProgressClip: { current: number; total: number } | null;
  onCancelExport?: () => void;
  isCancellingExport?: boolean;
  cancelExportLabel?: string;
  cancelingExportLabel?: string;
}

// EN: Floating progress HUD for preview preparation and export.
// ZH: 预览准备与导出流程的悬浮进度提示层。
const ProgressOverlays = ({
  isPreparingPreview,
  previewProgressPercent,
  previewLoadingText,
  isExporting,
  exportProgressPercent,
  exportProgressLabel,
  exportProgressClip,
  onCancelExport,
  isCancellingExport = false,
  cancelExportLabel,
  cancelingExportLabel
}: ProgressOverlaysProps) => {
  return (
    <>
      {isPreparingPreview && previewProgressPercent !== null && (
        <div className="fixed top-16 right-5 z-[95] pointer-events-none">
          <div className="w-72 rounded-xl border border-white/10 bg-zinc-900/85 backdrop-blur-xl shadow-2xl p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-zinc-200">{previewLoadingText}</span>
              <span className="font-mono text-cyan-300">{Math.round(previewProgressPercent)}%</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, previewProgressPercent))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isExporting && exportProgressPercent !== null && (
        <div className={cn(
          'fixed right-5 z-[95] pointer-events-none',
          isPreparingPreview && previewProgressPercent !== null ? 'top-36' : 'top-16'
        )}>
          <div className="w-72 rounded-xl border border-white/10 bg-zinc-900/85 backdrop-blur-xl shadow-2xl p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-zinc-200">{exportProgressLabel}</span>
              <div className="flex items-center gap-2">
                {exportProgressClip && exportProgressClip.total > 0 && (
                  <span className="font-mono text-zinc-400">
                    {Math.min(exportProgressClip.current, exportProgressClip.total)}/{exportProgressClip.total}
                  </span>
                )}
                <span className="font-mono text-emerald-300">{Math.round(exportProgressPercent)}%</span>
                {onCancelExport && (
                  <Button
                    variant="danger"
                    className="h-6 px-2 text-[10px] pointer-events-auto"
                    onClick={onCancelExport}
                    disabled={isCancellingExport}
                  >
                    {isCancellingExport
                      ? (cancelingExportLabel ?? cancelExportLabel ?? 'Stopping...')
                      : (cancelExportLabel ?? 'Stop')}
                  </Button>
                )}
              </div>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, exportProgressPercent))}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProgressOverlays;
