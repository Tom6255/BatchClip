import { X } from 'lucide-react';
import Button from '../../../components/ui/Button';
import type { TranslationKey } from '../../../i18n/translations';

interface LutFullExportConfirmModalProps {
  visible: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onCancel: () => void;
  onConfirm: () => void;
}

// EN: Confirmation modal before running full-queue LUT export.
// ZH: 执行整队列 LUT 全量导出前的确认弹窗。
const LutFullExportConfirmModal = ({
  visible,
  t,
  onCancel,
  onConfirm
}: LutFullExportConfirmModalProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('lutFullExportTitle')}</h3>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-zinc-200">{t('lutFullExportDesc')}</p>
          <p className="text-xs text-zinc-500">{t('lutFullExportDesc2')}</p>
        </div>
        <div className="p-4 border-t border-white/5 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            className="h-9 px-4"
            onClick={onCancel}
          >
            {t('cancel')}
          </Button>
          <Button
            className="h-9 px-4"
            onClick={onConfirm}
          >
            {t('confirmExport')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LutFullExportConfirmModal;
