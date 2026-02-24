import type { ChangeEvent, Dispatch, DragEvent, RefObject, SetStateAction } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Button from '../../../components/ui/Button';
import QuickSplitBySizeFeature from '../../../components/quick-actions/QuickSplitBySizeFeature';
import QuickLutBatchFeature, { QuickLutPreviewOverlay } from '../../../components/quick-actions/QuickLutBatchFeature';
import QuickConvertBatchFeature from '../../../components/quick-actions/QuickConvertBatchFeature';
import type { VideoPlayerRef } from '../../../components/VideoPlayer';
import type { TranslationKey } from '../../../i18n/translations';
import type { QuickConvertBatchSettings, QuickConvertBatchVideoItem, QuickConvertCustomTemplate, QuickLutBatchVideoItem } from '../../quick-actions/types';

interface MainLandingWorkspaceProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  dragActive: boolean;
  isQuickSplitPanelOpen: boolean;
  isQuickLutBatchPanelOpen: boolean;
  videoFileAccept: string;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onSourceVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  quickLutPreviewActiveVideoDisplayName: string;
  quickLutBatchVideoCount: number;
  onOpenQuickLutPreviewVideoList: () => void;
  quickLutPreviewPlayerRef: RefObject<VideoPlayerRef>;
  quickLutRealtimePreviewEnabled: boolean;
  quickLutPreviewSrc: string;
  quickLutPreviewPlaying: boolean;
  onToggleQuickLutPreviewPlaying: () => void;
  onQuickLutPreviewTimeUpdate: (time: number) => void;
  onQuickLutPreviewDurationChange: (duration: number) => void;
  onQuickLutPreviewEnded: () => void;
  onQuickLutPreviewDecodeIssue: (issue: { type: 'decode-error' | 'src-not-supported'; code?: number }) => void;
  quickLutPreviewExternalLoadingText: string | null;
  quickLutPreviewLutEnabled: boolean;
  quickLutPreviewLutPath: string | null;
  quickLutPreviewLutIntensity: number;
  quickLutPreviewCurrentTime: number;
  quickLutPreviewDuration: number;
  quickLutPreviewCurrentTimeLabel: string;
  quickLutPreviewDurationLabel: string;
  onQuickLutPreviewSeek: (time: number) => void;
  quickLutPreviewUsingCompatible: boolean;
  quickLutPreviewCompatibleSuggested: boolean;
  onUseQuickLutCompatiblePreview: () => void;
  quickLutPreviewPreparing: boolean;
  onToggleQuickSplitPanel: () => void;
  quickSplitTargetSizeMb: number;
  setQuickSplitTargetSizeMb: Dispatch<SetStateAction<number>>;
  defaultSplitTargetSizeMb: number;
  minSplitTargetSizeMb: number;
  maxSplitTargetSizeMb: number;
  quickSplitSourcePath: string;
  quickSplitSourceDisplayName: string;
  quickSplitSourceSizeLabel: string;
  onQuickSplitSourceChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRunQuickSplit: () => void;
  onToggleQuickLutBatchPanel: () => void;
  onToggleQuickLutRealtimePreview: () => void;
  quickLutBatchVideoCountLabel: string;
  quickLutBatchTotalSizeLabel: string;
  quickLutBatchVideos: QuickLutBatchVideoItem[];
  onQuickLutBatchVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearQuickLutBatchVideos: () => void;
  onRemoveQuickLutBatchVideo: (videoId: string) => void;
  quickLutBatchLutPath: string;
  quickLutBatchLutFileName: string;
  onSelectQuickLutBatchLut: () => void;
  onClearQuickLutBatchLut: () => void;
  quickLutBatchLutIntensity: number;
  onChangeQuickLutBatchLutIntensity: (value: number) => void;
  onRunQuickLutBatchExport: () => void;
  isQuickConvertPanelOpen: boolean;
  onToggleQuickConvertPanel: () => void;
  quickConvertVideoCountLabel: string;
  quickConvertTotalSizeLabel: string;
  quickConvertBatchVideos: QuickConvertBatchVideoItem[];
  quickConvertCustomTemplates: QuickConvertCustomTemplate[];
  onQuickConvertBatchVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearQuickConvertBatchVideos: () => void;
  onRemoveQuickConvertBatchVideo: (videoId: string) => void;
  quickConvertSettings: QuickConvertBatchSettings;
  activeQuickConvertTemplateId: string | null;
  canSaveQuickConvertTemplate: boolean;
  onApplyQuickConvertTemplateById: (templateId: string) => void;
  showQuickConvertTemplateSaveModal: boolean;
  quickConvertTemplateModalMode: 'create' | 'rename';
  quickConvertTemplateDraftTitle: string;
  quickConvertTemplateDraftDescription: string;
  onOpenQuickConvertTemplateSaveModal: () => void;
  onOpenQuickConvertTemplateRenameModal: (templateId: string) => void;
  onDeleteQuickConvertTemplate: (templateId: string) => void;
  onCloseQuickConvertTemplateSaveModal: () => void;
  onChangeQuickConvertTemplateDraftTitle: (value: string) => void;
  onChangeQuickConvertTemplateDraftDescription: (value: string) => void;
  onConfirmQuickConvertTemplateSave: (draft?: { title: string; description: string }) => void;
  onChangeQuickConvertFormat: (value: string) => void;
  onChangeQuickConvertVideoCodec: (value: string) => void;
  onChangeQuickConvertAudioCodec: (value: string) => void;
  onChangeQuickConvertCrf: (value: number) => void;
  onChangeQuickConvertPerformanceMode: (value: string) => void;
  showQuickConvertCodecGuide: boolean;
  onOpenQuickConvertCodecGuide: () => void;
  onCloseQuickConvertCodecGuide: () => void;
  onRunQuickConvertBatchExport: () => void;
  isExporting: boolean;
  exportMode: 'clips' | 'full' | 'split' | 'convert';
  exportProgressPercent: number | null;
}

// EN: Landing workspace for file intake and quick actions.
// ZH: 首屏工作区（拖入视频 + 快捷功能）独立组件，便于后续新增快捷入口。
const MainLandingWorkspace = ({
  t,
  dragActive,
  isQuickSplitPanelOpen,
  isQuickLutBatchPanelOpen,
  videoFileAccept,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onSourceVideosChange,
  quickLutPreviewActiveVideoDisplayName,
  quickLutBatchVideoCount,
  onOpenQuickLutPreviewVideoList,
  quickLutPreviewPlayerRef,
  quickLutRealtimePreviewEnabled,
  quickLutPreviewSrc,
  quickLutPreviewPlaying,
  onToggleQuickLutPreviewPlaying,
  onQuickLutPreviewTimeUpdate,
  onQuickLutPreviewDurationChange,
  onQuickLutPreviewEnded,
  onQuickLutPreviewDecodeIssue,
  quickLutPreviewExternalLoadingText,
  quickLutPreviewLutEnabled,
  quickLutPreviewLutPath,
  quickLutPreviewLutIntensity,
  quickLutPreviewCurrentTime,
  quickLutPreviewDuration,
  quickLutPreviewCurrentTimeLabel,
  quickLutPreviewDurationLabel,
  onQuickLutPreviewSeek,
  quickLutPreviewUsingCompatible,
  quickLutPreviewCompatibleSuggested,
  onUseQuickLutCompatiblePreview,
  quickLutPreviewPreparing,
  onToggleQuickSplitPanel,
  quickSplitTargetSizeMb,
  setQuickSplitTargetSizeMb,
  defaultSplitTargetSizeMb,
  minSplitTargetSizeMb,
  maxSplitTargetSizeMb,
  quickSplitSourcePath,
  quickSplitSourceDisplayName,
  quickSplitSourceSizeLabel,
  onQuickSplitSourceChange,
  onRunQuickSplit,
  onToggleQuickLutBatchPanel,
  onToggleQuickLutRealtimePreview,
  quickLutBatchVideoCountLabel,
  quickLutBatchTotalSizeLabel,
  quickLutBatchVideos,
  onQuickLutBatchVideosChange,
  onClearQuickLutBatchVideos,
  onRemoveQuickLutBatchVideo,
  quickLutBatchLutPath,
  quickLutBatchLutFileName,
  onSelectQuickLutBatchLut,
  onClearQuickLutBatchLut,
  quickLutBatchLutIntensity,
  onChangeQuickLutBatchLutIntensity,
  onRunQuickLutBatchExport,
  isQuickConvertPanelOpen,
  onToggleQuickConvertPanel,
  quickConvertVideoCountLabel,
  quickConvertTotalSizeLabel,
  quickConvertBatchVideos,
  quickConvertCustomTemplates,
  onQuickConvertBatchVideosChange,
  onClearQuickConvertBatchVideos,
  onRemoveQuickConvertBatchVideo,
  quickConvertSettings,
  activeQuickConvertTemplateId,
  canSaveQuickConvertTemplate,
  onApplyQuickConvertTemplateById,
  showQuickConvertTemplateSaveModal,
  quickConvertTemplateModalMode,
  quickConvertTemplateDraftTitle,
  quickConvertTemplateDraftDescription,
  onOpenQuickConvertTemplateSaveModal,
  onOpenQuickConvertTemplateRenameModal,
  onDeleteQuickConvertTemplate,
  onCloseQuickConvertTemplateSaveModal,
  onChangeQuickConvertTemplateDraftTitle,
  onChangeQuickConvertTemplateDraftDescription,
  onConfirmQuickConvertTemplateSave,
  onChangeQuickConvertFormat,
  onChangeQuickConvertVideoCodec,
  onChangeQuickConvertAudioCodec,
  onChangeQuickConvertCrf,
  onChangeQuickConvertPerformanceMode,
  showQuickConvertCodecGuide,
  onOpenQuickConvertCodecGuide,
  onCloseQuickConvertCodecGuide,
  onRunQuickConvertBatchExport,
  isExporting,
  exportMode,
  exportProgressPercent
}: MainLandingWorkspaceProps) => {
  return (
    <div className="flex-1 m-6 rounded-3xl border border-white/10 bg-zinc-900/20 p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 min-h-0">
      <div
        className={cn(
          'relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all duration-300 gap-6 bg-zinc-900/30 min-h-[360px] overflow-hidden',
          dragActive ? 'border-blue-500/90 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-600',
          isQuickLutBatchPanelOpen && 'border-emerald-500/40'
        )}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div
          className={cn(
            'flex flex-col items-center text-center space-y-4 transition-opacity duration-200',
            isQuickLutBatchPanelOpen && 'opacity-15 pointer-events-none select-none'
          )}
        >
          <Upload className="w-12 h-12 mx-auto text-zinc-600" />
          <h2 className="text-2xl font-semibold text-zinc-100">{t('dropVideo')}</h2>
          <input type="file" className="hidden" id="file-upload" multiple accept={videoFileAccept} onChange={onSourceVideosChange} />
          <Button onClick={() => document.getElementById('file-upload')?.click()}>{t('selectVideo')}</Button>
        </div>

        <QuickLutPreviewOverlay
          isOpen={isQuickLutBatchPanelOpen}
          t={t}
          activeVideoDisplayName={quickLutPreviewActiveVideoDisplayName}
          hasVideos={quickLutBatchVideoCount > 0}
          onOpenVideoList={onOpenQuickLutPreviewVideoList}
          previewPlayerRef={quickLutPreviewPlayerRef}
          quickLutRealtimePreviewEnabled={quickLutRealtimePreviewEnabled}
          quickLutPreviewSrc={quickLutPreviewSrc}
          quickLutPreviewPlaying={quickLutPreviewPlaying}
          onTogglePlaying={onToggleQuickLutPreviewPlaying}
          onTimeUpdate={onQuickLutPreviewTimeUpdate}
          onDurationChange={onQuickLutPreviewDurationChange}
          onEnded={onQuickLutPreviewEnded}
          onDecodeIssue={onQuickLutPreviewDecodeIssue}
          quickLutPreviewExternalLoadingText={quickLutPreviewExternalLoadingText}
          lutEnabled={quickLutPreviewLutEnabled}
          lutPath={quickLutPreviewLutPath}
          lutIntensity={quickLutPreviewLutIntensity}
          quickLutPreviewCurrentTime={quickLutPreviewCurrentTime}
          quickLutPreviewDuration={quickLutPreviewDuration}
          quickLutPreviewCurrentTimeLabel={quickLutPreviewCurrentTimeLabel}
          quickLutPreviewDurationLabel={quickLutPreviewDurationLabel}
          onSeek={onQuickLutPreviewSeek}
          quickLutPreviewUsingCompatible={quickLutPreviewUsingCompatible}
          quickLutPreviewCompatibleSuggested={quickLutPreviewCompatibleSuggested}
          onUseCompatiblePreview={onUseQuickLutCompatiblePreview}
          quickLutPreviewPreparing={quickLutPreviewPreparing}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-4 sm:p-5 flex flex-col min-h-[360px] max-h-full overflow-hidden">
        <div className="pb-3 border-b border-white/10 space-y-1.5">
          <p className="text-lg font-semibold text-zinc-100">{t('quickActions')}</p>
          <p className="text-xs text-zinc-400 leading-relaxed">{t('quickActionsDesc')}</p>
        </div>

        <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
          <QuickSplitBySizeFeature
            isOpen={isQuickSplitPanelOpen}
            onToggle={onToggleQuickSplitPanel}
            t={t}
            quickSplitTargetSizeMb={quickSplitTargetSizeMb}
            setQuickSplitTargetSizeMb={setQuickSplitTargetSizeMb}
            defaultSplitTargetSizeMb={defaultSplitTargetSizeMb}
            minSplitTargetSizeMb={minSplitTargetSizeMb}
            maxSplitTargetSizeMb={maxSplitTargetSizeMb}
            quickSplitSourcePath={quickSplitSourcePath}
            quickSplitSourceDisplayName={quickSplitSourceDisplayName}
            quickSplitSourceSizeLabel={quickSplitSourceSizeLabel}
            videoFileAccept={videoFileAccept}
            onSourceChange={onQuickSplitSourceChange}
            onRun={onRunQuickSplit}
            isExporting={isExporting}
            exportMode={exportMode}
            exportProgressPercent={exportProgressPercent}
          />

          <QuickLutBatchFeature
            isOpen={isQuickLutBatchPanelOpen}
            onToggle={onToggleQuickLutBatchPanel}
            t={t}
            quickLutRealtimePreviewEnabled={quickLutRealtimePreviewEnabled}
            onToggleRealtimePreview={onToggleQuickLutRealtimePreview}
            quickLutBatchVideoCountLabel={quickLutBatchVideoCountLabel}
            quickLutBatchTotalSizeLabel={quickLutBatchTotalSizeLabel}
            quickLutBatchVideos={quickLutBatchVideos}
            videoFileAccept={videoFileAccept}
            onVideosChange={onQuickLutBatchVideosChange}
            onClearVideos={onClearQuickLutBatchVideos}
            onRemoveVideo={onRemoveQuickLutBatchVideo}
            quickLutBatchLutPath={quickLutBatchLutPath}
            quickLutBatchLutFileName={quickLutBatchLutFileName}
            onSelectLut={onSelectQuickLutBatchLut}
            onClearLut={onClearQuickLutBatchLut}
            quickLutBatchLutIntensity={quickLutBatchLutIntensity}
            onChangeLutIntensity={onChangeQuickLutBatchLutIntensity}
            onRun={onRunQuickLutBatchExport}
            isExporting={isExporting}
            exportMode={exportMode}
            exportProgressPercent={exportProgressPercent}
          />

          <QuickConvertBatchFeature
            isOpen={isQuickConvertPanelOpen}
            onToggle={onToggleQuickConvertPanel}
            t={t}
            quickConvertBatchVideos={quickConvertBatchVideos}
            quickConvertVideoCountLabel={quickConvertVideoCountLabel}
            quickConvertTotalSizeLabel={quickConvertTotalSizeLabel}
            quickConvertCustomTemplates={quickConvertCustomTemplates}
            videoFileAccept={videoFileAccept}
            onVideosChange={onQuickConvertBatchVideosChange}
            onClearVideos={onClearQuickConvertBatchVideos}
            onRemoveVideo={onRemoveQuickConvertBatchVideo}
            quickConvertSettings={quickConvertSettings}
            activeQuickConvertTemplateId={activeQuickConvertTemplateId}
            canSaveQuickConvertTemplate={canSaveQuickConvertTemplate}
            onApplyTemplateById={onApplyQuickConvertTemplateById}
            showTemplateSaveModal={showQuickConvertTemplateSaveModal}
            templateModalMode={quickConvertTemplateModalMode}
            templateDraftTitle={quickConvertTemplateDraftTitle}
            templateDraftDescription={quickConvertTemplateDraftDescription}
            onOpenTemplateSaveModal={onOpenQuickConvertTemplateSaveModal}
            onOpenTemplateRenameModal={onOpenQuickConvertTemplateRenameModal}
            onDeleteTemplate={onDeleteQuickConvertTemplate}
            onCloseTemplateSaveModal={onCloseQuickConvertTemplateSaveModal}
            onChangeTemplateDraftTitle={onChangeQuickConvertTemplateDraftTitle}
            onChangeTemplateDraftDescription={onChangeQuickConvertTemplateDraftDescription}
            onConfirmTemplateSave={onConfirmQuickConvertTemplateSave}
            onChangeFormat={onChangeQuickConvertFormat}
            onChangeVideoCodec={onChangeQuickConvertVideoCodec}
            onChangeAudioCodec={onChangeQuickConvertAudioCodec}
            onChangeCrf={onChangeQuickConvertCrf}
            onChangePerformanceMode={onChangeQuickConvertPerformanceMode}
            showGuide={showQuickConvertCodecGuide}
            onOpenGuide={onOpenQuickConvertCodecGuide}
            onCloseGuide={onCloseQuickConvertCodecGuide}
            onRun={onRunQuickConvertBatchExport}
            isExporting={isExporting}
            exportMode={exportMode}
            exportProgressPercent={exportProgressPercent}
          />
        </div>
      </div>
    </div>
  );
};

export default MainLandingWorkspace;
