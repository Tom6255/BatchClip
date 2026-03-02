import { useEffect, useState, type ChangeEvent } from 'react';
import { ChevronDown, ChevronRight, Cpu, Download, FileVideo2, Gauge, Pencil, Save, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import Button from '../ui/Button';
import type {
  QuickConvertBatchSettings,
  QuickConvertBatchVideoItem,
  QuickConvertCustomTemplate
} from '../../features/quick-actions/types';

type QuickConvertTextKey =
  | 'quickConvertButtonLabel'
  | 'quickConvertDesc'
  | 'quickConvertTemplatesLabel'
  | 'quickConvertTemplateCompat'
  | 'quickConvertTemplateCompatDesc'
  | 'quickConvertTemplateQuality'
  | 'quickConvertTemplateQualityDesc'
  | 'quickConvertTemplateCustomTag'
  | 'quickConvertTemplateSaveButton'
  | 'quickConvertTemplateRenameButton'
  | 'quickConvertTemplateDeleteButton'
  | 'quickConvertTemplateSaveTitle'
  | 'quickConvertTemplateSaveDesc'
  | 'quickConvertTemplateRenameTitle'
  | 'quickConvertTemplateRenameDesc'
  | 'quickConvertTemplateNameLabel'
  | 'quickConvertTemplateDescriptionLabel'
  | 'quickConvertTemplateNamePlaceholder'
  | 'quickConvertTemplateDescriptionPlaceholder'
  | 'quickConvertTemplateSaveConfirm'
  | 'quickConvertTemplateRenameConfirm'
  | 'quickConvertTemplateSaveCancel'
  | 'quickConvertVideosLabel'
  | 'quickConvertVideoCount'
  | 'quickConvertTotalSize'
  | 'quickConvertSelectVideos'
  | 'quickConvertClearVideos'
  | 'quickConvertNoVideos'
  | 'quickConvertFormat'
  | 'quickConvertVideoCodec'
  | 'quickConvertAudioCodec'
  | 'quickConvertCrf'
  | 'quickConvertPerformance'
  | 'quickConvertPerformanceAuto'
  | 'quickConvertPerformanceCpu'
  | 'quickConvertGuideOpen'
  | 'quickConvertGuideTitle'
  | 'quickConvertGuideSubtitle'
  | 'quickConvertGuideFormatMp4'
  | 'quickConvertGuideFormatMkv'
  | 'quickConvertGuideFormatWebm'
  | 'quickConvertGuideCodecH264'
  | 'quickConvertGuideCodecHevc'
  | 'quickConvertGuideCodecVp9'
  | 'quickConvertGuideCodecAv1'
  | 'quickConvertGuideCrf'
  | 'quickConvertGuidePerformance'
  | 'quickConvertAutoFallbackHint'
  | 'quickConvertRun'
  | 'quickConverting';

interface QuickConvertBatchFeatureProps {
  isOpen: boolean;
  onToggle: () => void;
  t: (key: QuickConvertTextKey, params?: Record<string, string | number>) => string;
  quickConvertBatchVideos: QuickConvertBatchVideoItem[];
  quickConvertVideoCountLabel: string;
  quickConvertTotalSizeLabel: string;
  videoFileAccept: string;
  onVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearVideos: () => void;
  onRemoveVideo: (videoId: string) => void;
  quickConvertSettings: QuickConvertBatchSettings;
  quickConvertCustomTemplates: QuickConvertCustomTemplate[];
  activeQuickConvertTemplateId: string | null;
  canSaveQuickConvertTemplate: boolean;
  onApplyTemplateById: (templateId: string) => void;
  showTemplateSaveModal: boolean;
  templateModalMode: 'create' | 'rename';
  templateDraftTitle: string;
  templateDraftDescription: string;
  onOpenTemplateSaveModal: () => void;
  onOpenTemplateRenameModal: (templateId: string) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCloseTemplateSaveModal: () => void;
  onChangeTemplateDraftTitle: (value: string) => void;
  onChangeTemplateDraftDescription: (value: string) => void;
  onConfirmTemplateSave: (draft?: { title: string; description: string }) => void;
  onChangeFormat: (value: string) => void;
  onChangeVideoCodec: (value: string) => void;
  onChangeAudioCodec: (value: string) => void;
  onChangeCrf: (value: number) => void;
  onChangePerformanceMode: (value: string) => void;
  showGuide: boolean;
  onOpenGuide: () => void;
  onCloseGuide: () => void;
  onRun: () => void;
  isExporting: boolean;
  exportMode: 'clips' | 'full' | 'split' | 'convert' | 'livephoto';
  exportProgressPercent: number | null;
}

interface QuickConvertCodecGuideModalProps {
  visible: boolean;
  t: (key: QuickConvertTextKey, params?: Record<string, string | number>) => string;
  onClose: () => void;
}

interface QuickConvertTemplateSaveModalProps {
  visible: boolean;
  mode: 'create' | 'rename';
  t: (key: QuickConvertTextKey, params?: Record<string, string | number>) => string;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: (draft: { title: string; description: string }) => void;
}

const QuickConvertCodecGuideModal = ({
  visible,
  t,
  onClose
}: QuickConvertCodecGuideModalProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[108] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              {t('quickConvertGuideTitle')}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">{t('quickConvertGuideSubtitle')}</p>
          </div>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[68vh] overflow-y-auto custom-scrollbar">
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">MP4</p>
            {t('quickConvertGuideFormatMp4')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">MKV</p>
            {t('quickConvertGuideFormatMkv')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">WebM</p>
            {t('quickConvertGuideFormatWebm')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">H.264</p>
            {t('quickConvertGuideCodecH264')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">H.265 / HEVC</p>
            {t('quickConvertGuideCodecHevc')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">VP9</p>
            {t('quickConvertGuideCodecVp9')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">AV1</p>
            {t('quickConvertGuideCodecAv1')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed">
            <p className="font-semibold text-zinc-100 mb-1">CRF</p>
            {t('quickConvertGuideCrf')}
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-zinc-950/70 p-3 text-xs text-zinc-300 leading-relaxed sm:col-span-2">
            <p className="font-semibold text-zinc-100 mb-1">{t('quickConvertPerformance')}</p>
            {t('quickConvertGuidePerformance')}
          </div>
        </div>
      </div>
    </div>
  );
};

const QuickConvertTemplateSaveModal = ({
  visible,
  mode,
  t,
  title,
  description,
  onClose,
  onConfirm
}: QuickConvertTemplateSaveModalProps) => {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraftTitle(title);
    setDraftDescription(description);
  }, [description, title, visible, mode]);

  if (!visible) {
    return null;
  }

  const isRenameMode = mode === 'rename';

  return (
    <div className="fixed inset-0 z-[109] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {isRenameMode ? t('quickConvertTemplateRenameTitle') : t('quickConvertTemplateSaveTitle')}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              {isRenameMode ? t('quickConvertTemplateRenameDesc') : t('quickConvertTemplateSaveDesc')}
            </p>
          </div>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-zinc-300">{t('quickConvertTemplateNameLabel')}</span>
            <input
              type="text"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder={t('quickConvertTemplateNamePlaceholder')}
              className="w-full h-9 rounded-lg bg-zinc-800 border border-white/10 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-300">{t('quickConvertTemplateDescriptionLabel')}</span>
            <textarea
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              placeholder={t('quickConvertTemplateDescriptionPlaceholder')}
              rows={3}
              className="w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
            />
          </label>
        </div>

        <div className="p-4 border-t border-white/5 flex items-center justify-end gap-2">
          <Button variant="ghost" className="h-9 px-4" onClick={onClose}>
            {t('quickConvertTemplateSaveCancel')}
          </Button>
          <Button className="h-9 px-4" onClick={() => onConfirm({ title: draftTitle, description: draftDescription })}>
            <Save className="w-4 h-4" />
            {isRenameMode ? t('quickConvertTemplateRenameConfirm') : t('quickConvertTemplateSaveConfirm')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const QuickConvertBatchFeature = ({
  isOpen,
  onToggle,
  t,
  quickConvertBatchVideos,
  quickConvertVideoCountLabel,
  quickConvertTotalSizeLabel,
  videoFileAccept,
  onVideosChange,
  onClearVideos,
  onRemoveVideo,
  quickConvertSettings,
  quickConvertCustomTemplates,
  activeQuickConvertTemplateId,
  canSaveQuickConvertTemplate,
  onApplyTemplateById,
  showTemplateSaveModal,
  templateModalMode,
  templateDraftTitle,
  templateDraftDescription,
  onOpenTemplateSaveModal,
  onOpenTemplateRenameModal,
  onDeleteTemplate,
  onCloseTemplateSaveModal,
  onChangeTemplateDraftTitle,
  onChangeTemplateDraftDescription,
  onConfirmTemplateSave,
  onChangeFormat,
  onChangeVideoCodec,
  onChangeAudioCodec,
  onChangeCrf,
  onChangePerformanceMode,
  showGuide,
  onOpenGuide,
  onCloseGuide,
  onRun,
  isExporting,
  exportMode,
  exportProgressPercent
}: QuickConvertBatchFeatureProps) => {
  const builtInTemplateCards = [
    {
      id: 'compatibility',
      title: t('quickConvertTemplateCompat'),
      description: t('quickConvertTemplateCompatDesc')
    },
    {
      id: 'quality-lossless',
      title: t('quickConvertTemplateQuality'),
      description: t('quickConvertTemplateQualityDesc')
    }
  ] as const;

  return (
    <>
      <div className="mt-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'group w-full rounded-xl border px-3 py-3 flex items-center gap-3 text-left transition-all',
            isOpen
              ? 'border-amber-400/50 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.16)]'
              : 'border-white/10 bg-zinc-950/45 hover:border-amber-500/40 hover:bg-amber-500/5'
          )}
        >
          <span
            className={cn(
              'h-6 min-w-6 px-1 rounded-md flex items-center justify-center text-xs font-semibold font-mono',
              isOpen ? 'bg-amber-300 text-zinc-900' : 'bg-zinc-800 text-zinc-300'
            )}
          >
            3
          </span>
          <span className="flex-1 text-sm font-medium text-zinc-100">
            {t('quickConvertButtonLabel')}
          </span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-amber-300" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-300 transition-colors" />
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
          <div className="rounded-xl border border-amber-500/20 bg-zinc-950/65 p-4 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">{t('quickConvertDesc')}</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-zinc-400">{t('quickConvertTemplatesLabel')}</p>
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={onOpenTemplateSaveModal}
                  disabled={!canSaveQuickConvertTemplate}
                >
                  <Save className="w-3.5 h-3.5" />
                  {t('quickConvertTemplateSaveButton')}
                </Button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {builtInTemplateCards.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onApplyTemplateById(template.id)}
                    className={cn(
                      'min-w-[220px] rounded-lg border p-2.5 text-left transition-colors shrink-0',
                      activeQuickConvertTemplateId === template.id
                        ? 'border-amber-400/50 bg-amber-500/10'
                        : 'border-white/10 bg-zinc-900/60 hover:border-amber-500/30'
                    )}
                  >
                    <p className="text-xs font-semibold text-zinc-100">{template.title}</p>
                    <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">{template.description}</p>
                  </button>
                ))}

                {quickConvertCustomTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={cn(
                      'min-w-[220px] rounded-lg border p-2.5 text-left transition-colors shrink-0',
                      activeQuickConvertTemplateId === template.id
                        ? 'border-amber-400/50 bg-amber-500/10'
                        : 'border-white/10 bg-zinc-900/60 hover:border-amber-500/30'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onApplyTemplateById(template.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-zinc-100 truncate">{template.title}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-zinc-400">
                          {t('quickConvertTemplateCustomTag')}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                        {template.description || '...'}
                      </p>
                    </button>

                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => onOpenTemplateRenameModal(template.id)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {t('quickConvertTemplateRenameButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-zinc-500 hover:text-red-400"
                        onClick={() => onDeleteTemplate(template.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('quickConvertTemplateDeleteButton')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">{t('quickConvertVideosLabel')}</span>
                <span className="text-[11px] font-mono text-zinc-200">{quickConvertVideoCountLabel}</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">{t('quickConvertTotalSize')}</span>
                <span className="text-[11px] font-mono text-zinc-200">{quickConvertTotalSizeLabel}</span>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="file"
                className="hidden"
                id="quick-convert-batch-videos-upload"
                multiple
                accept={videoFileAccept}
                onChange={onVideosChange}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  onClick={() => document.getElementById('quick-convert-batch-videos-upload')?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('quickConvertSelectVideos')}
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-xs text-zinc-500 hover:text-red-400"
                  onClick={onClearVideos}
                  disabled={quickConvertBatchVideos.length === 0}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('quickConvertClearVideos')}
                </Button>
              </div>

              {quickConvertBatchVideos.length === 0 ? (
                <p className="text-[11px] text-zinc-500">{t('quickConvertNoVideos')}</p>
              ) : (
                <div className="max-h-24 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                  {quickConvertBatchVideos.map((videoItem) => (
                    <div
                      key={videoItem.id}
                      className="rounded-md border border-white/10 bg-zinc-900/70 px-2 py-1.5 flex items-center justify-between gap-2"
                    >
                      <span className="text-[11px] text-zinc-200 truncate" title={videoItem.displayName}>
                        {videoItem.displayName}
                      </span>
                      <button
                        type="button"
                        className="text-zinc-500 hover:text-red-400 transition-colors"
                        onClick={() => onRemoveVideo(videoItem.id)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-2 space-y-1">
                <span className="text-[11px] text-zinc-400">{t('quickConvertFormat')}</span>
                <select
                  value={quickConvertSettings.format}
                  onChange={(event) => onChangeFormat(event.target.value)}
                  className="w-full bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WebM</option>
                  <option value="mov">MOV</option>
                </select>
              </label>

              <label className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-2 space-y-1">
                <span className="text-[11px] text-zinc-400">{t('quickConvertVideoCodec')}</span>
                <select
                  value={quickConvertSettings.videoCodec}
                  onChange={(event) => onChangeVideoCodec(event.target.value)}
                  className="w-full bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="h264">H.264</option>
                  <option value="hevc">H.265 / HEVC</option>
                  <option value="vp9">VP9</option>
                  <option value="av1">AV1</option>
                  <option value="prores">Apple ProRes</option>
                </select>
              </label>

              <label className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-2 space-y-1">
                <span className="text-[11px] text-zinc-400">{t('quickConvertAudioCodec')}</span>
                <select
                  value={quickConvertSettings.audioCodec}
                  onChange={(event) => onChangeAudioCodec(event.target.value)}
                  className="w-full bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="aac">AAC</option>
                  <option value="opus">Opus</option>
                  <option value="copy">Copy</option>
                </select>
              </label>

              <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-400">{t('quickConvertCrf')}</span>
                  <span className="text-[11px] font-mono text-zinc-200">{quickConvertSettings.crf}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={51}
                    step={1}
                    value={quickConvertSettings.crf}
                    onChange={(event) => onChangeCrf(Number(event.target.value))}
                    className="flex-1 accent-amber-400"
                  />
                  <input
                    type="number"
                    min={0}
                    max={51}
                    step={1}
                    value={quickConvertSettings.crf}
                    onChange={(event) => onChangeCrf(Number(event.target.value))}
                    className="w-14 bg-zinc-800 border border-white/10 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-100 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-amber-300" />
                  {t('quickConvertPerformance')}
                </p>
                <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={onOpenGuide}>
                  <Gauge className="w-3.5 h-3.5" />
                  {t('quickConvertGuideOpen')}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangePerformanceMode('auto')}
                  className={cn(
                    'quick-convert-performance-option h-8 rounded-md border text-xs font-medium transition-colors',
                    quickConvertSettings.performanceMode === 'auto'
                      ? 'quick-convert-performance-option--active border-amber-400/50 bg-amber-500/10 text-amber-200'
                      : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:border-amber-500/30'
                  )}
                >
                  {t('quickConvertPerformanceAuto')}
                </button>
                <button
                  type="button"
                  onClick={() => onChangePerformanceMode('cpu')}
                  className={cn(
                    'quick-convert-performance-option h-8 rounded-md border text-xs font-medium transition-colors',
                    quickConvertSettings.performanceMode === 'cpu'
                      ? 'quick-convert-performance-option--active border-amber-400/50 bg-amber-500/10 text-amber-200'
                      : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:border-amber-500/30'
                  )}
                >
                  {t('quickConvertPerformanceCpu')}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">{t('quickConvertAutoFallbackHint')}</p>
            </div>

            <Button
              className="w-full h-9 text-sm"
              disabled={isExporting || quickConvertBatchVideos.length === 0}
              onClick={onRun}
            >
              <FileVideo2 className="w-4 h-4" />
              <Download className="w-4 h-4" />
              {isExporting && exportMode === 'convert'
                ? `${t('quickConverting')} ${Math.round(exportProgressPercent ?? 0)}%`
                : t('quickConvertRun')}
            </Button>
          </div>
        </div>
      </div>

      <QuickConvertCodecGuideModal
        visible={showGuide}
        t={t}
        onClose={onCloseGuide}
      />

      <QuickConvertTemplateSaveModal
        visible={showTemplateSaveModal}
        mode={templateModalMode}
        t={t}
        title={templateDraftTitle}
        description={templateDraftDescription}
        onClose={onCloseTemplateSaveModal}
        onConfirm={(draft) => {
          onChangeTemplateDraftTitle(draft.title);
          onChangeTemplateDraftDescription(draft.description);
          onConfirmTemplateSave(draft);
        }}
      />
    </>
  );
};

export default QuickConvertBatchFeature;
