import { v4 as uuidv4 } from 'uuid';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { getFileNameFromPath, isSupportedVideoFile } from '../../../lib/video';
import type {
  ConvertAudioCodecTarget,
  ConvertContainerFormat,
  ConvertPerformanceMode,
  ConvertVideoCodecTarget,
  ExportProgressController,
  QuickConvertBatchSettings,
  QuickConvertBatchVideoItem,
  QuickConvertCustomTemplate,
  TranslateFn
} from '../types';

type QuickConvertBuiltInTemplateId = 'compatibility' | 'quality-lossless';
type QuickConvertTemplateModalMode = 'create' | 'rename';

interface QuickConvertBuiltInTemplate {
  id: QuickConvertBuiltInTemplateId;
  settings: QuickConvertBatchSettings;
}

const QUICK_CONVERT_TEMPLATE_STORAGE_KEY = 'quickConvertTemplateLibrary';
const MAX_QUICK_CONVERT_TEMPLATE_COUNT = 48;
const MAX_QUICK_CONVERT_TEMPLATE_TITLE_LENGTH = 36;
const MAX_QUICK_CONVERT_TEMPLATE_DESCRIPTION_LENGTH = 120;

const DEFAULT_CONVERT_SETTINGS: QuickConvertBatchSettings = {
  format: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  crf: 23,
  performanceMode: 'auto'
};

const QUICK_CONVERT_BUILTIN_TEMPLATES: QuickConvertBuiltInTemplate[] = [
  {
    id: 'compatibility',
    settings: {
      format: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      crf: 22,
      performanceMode: 'auto'
    }
  },
  {
    id: 'quality-lossless',
    settings: {
      format: 'mkv',
      videoCodec: 'hevc',
      audioCodec: 'copy',
      crf: 17,
      performanceMode: 'auto'
    }
  }
];

const normalizeContainerFormat = (value: string): ConvertContainerFormat => {
  if (value === 'mkv' || value === 'webm' || value === 'mov') {
    return value;
  }
  return 'mp4';
};

const normalizeVideoCodec = (value: string): ConvertVideoCodecTarget => {
  if (value === 'hevc' || value === 'vp9' || value === 'av1') {
    return value;
  }
  return 'h264';
};

const normalizeAudioCodec = (value: string): ConvertAudioCodecTarget => {
  if (value === 'opus' || value === 'copy') {
    return value;
  }
  return 'aac';
};

const normalizePerformanceMode = (value: string): ConvertPerformanceMode => {
  if (value === 'cpu') {
    return 'cpu';
  }
  return 'auto';
};

const normalizeCrf = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONVERT_SETTINGS.crf;
  }
  return Math.min(51, Math.max(0, Math.round(value)));
};

const normalizeTemplateTitle = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_QUICK_CONVERT_TEMPLATE_TITLE_LENGTH);
};

const normalizeTemplateDescription = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_QUICK_CONVERT_TEMPLATE_DESCRIPTION_LENGTH);
};

const normalizeSettingsObject = (value: unknown): QuickConvertBatchSettings | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return {
    format: normalizeContainerFormat(String(candidate.format ?? '')),
    videoCodec: normalizeVideoCodec(String(candidate.videoCodec ?? '')),
    audioCodec: normalizeAudioCodec(String(candidate.audioCodec ?? '')),
    crf: normalizeCrf(Number(candidate.crf)),
    performanceMode: normalizePerformanceMode(String(candidate.performanceMode ?? ''))
  };
};

const isSameConvertSettings = (a: QuickConvertBatchSettings, b: QuickConvertBatchSettings) => (
  a.format === b.format &&
  a.videoCodec === b.videoCodec &&
  a.audioCodec === b.audioCodec &&
  a.crf === b.crf &&
  a.performanceMode === b.performanceMode
);

const parseStoredCustomTemplates = (): QuickConvertCustomTemplate[] => {
  const raw = localStorage.getItem(QUICK_CONVERT_TEMPLATE_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const dedupeIds = new Set<string>();
    const normalized: QuickConvertCustomTemplate[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const candidate = item as Record<string, unknown>;
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
      if (!id || dedupeIds.has(id)) {
        continue;
      }

      const title = normalizeTemplateTitle(candidate.title);
      if (!title) {
        continue;
      }

      const settings = normalizeSettingsObject(candidate.settings);
      if (!settings) {
        continue;
      }

      dedupeIds.add(id);
      normalized.push({
        id,
        title,
        description: normalizeTemplateDescription(candidate.description),
        settings
      });

      if (normalized.length >= MAX_QUICK_CONVERT_TEMPLATE_COUNT) {
        break;
      }
    }

    return normalized;
  } catch {
    return [];
  }
};

interface UseQuickConvertBatchParams {
  t: TranslateFn;
  exportController: ExportProgressController;
}

interface UseQuickConvertBatchResult {
  quickConvertBatchVideos: QuickConvertBatchVideoItem[];
  quickConvertSettings: QuickConvertBatchSettings;
  setQuickConvertSettings: Dispatch<SetStateAction<QuickConvertBatchSettings>>;
  quickConvertCustomTemplates: QuickConvertCustomTemplate[];
  activeQuickConvertTemplateId: string | null;
  canSaveQuickConvertTemplate: boolean;
  showQuickConvertTemplateSaveModal: boolean;
  quickConvertTemplateModalMode: QuickConvertTemplateModalMode;
  quickConvertTemplateDraftTitle: string;
  quickConvertTemplateDraftDescription: string;
  showQuickConvertCodecGuide: boolean;
  setShowQuickConvertCodecGuide: Dispatch<SetStateAction<boolean>>;
  handleQuickConvertBatchVideosChange: (event: ChangeEvent<HTMLInputElement>) => void;
  clearQuickConvertBatchVideos: () => void;
  removeQuickConvertBatchVideo: (videoId: string) => void;
  applyQuickConvertTemplateById: (templateId: string) => void;
  openQuickConvertTemplateSaveModal: () => void;
  openQuickConvertTemplateRenameModal: (templateId: string) => void;
  closeQuickConvertTemplateSaveModal: () => void;
  deleteQuickConvertTemplate: (templateId: string) => void;
  updateQuickConvertTemplateDraftTitle: (value: string) => void;
  updateQuickConvertTemplateDraftDescription: (value: string) => void;
  confirmQuickConvertTemplateSave: (draft?: { title: string; description: string }) => void;
  updateQuickConvertFormat: (value: string) => void;
  updateQuickConvertVideoCodec: (value: string) => void;
  updateQuickConvertAudioCodec: (value: string) => void;
  updateQuickConvertCrf: (value: number) => void;
  updateQuickConvertPerformanceMode: (value: string) => void;
  runQuickConvertBatchExport: () => Promise<void>;
}

export const useQuickConvertBatch = ({
  t,
  exportController
}: UseQuickConvertBatchParams): UseQuickConvertBatchResult => {
  const [quickConvertBatchVideos, setQuickConvertBatchVideos] = useState<QuickConvertBatchVideoItem[]>([]);
  const [quickConvertSettings, setQuickConvertSettings] = useState<QuickConvertBatchSettings>(DEFAULT_CONVERT_SETTINGS);
  const [quickConvertCustomTemplates, setQuickConvertCustomTemplates] = useState<QuickConvertCustomTemplate[]>(parseStoredCustomTemplates);
  const [showQuickConvertTemplateSaveModal, setShowQuickConvertTemplateSaveModal] = useState(false);
  const [quickConvertTemplateModalMode, setQuickConvertTemplateModalMode] = useState<QuickConvertTemplateModalMode>('create');
  const [quickConvertEditingTemplateId, setQuickConvertEditingTemplateId] = useState<string | null>(null);
  const [quickConvertTemplateDraftTitle, setQuickConvertTemplateDraftTitle] = useState('');
  const [quickConvertTemplateDraftDescription, setQuickConvertTemplateDraftDescription] = useState('');
  const [showQuickConvertCodecGuide, setShowQuickConvertCodecGuide] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(QUICK_CONVERT_TEMPLATE_STORAGE_KEY, JSON.stringify(quickConvertCustomTemplates));
    } catch (error) {
      console.warn('Failed to persist quick convert custom templates:', error);
    }
  }, [quickConvertCustomTemplates]);

  const handleQuickConvertBatchVideosChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';

    if (selectedFiles.length === 0) {
      return;
    }

    const validFiles = selectedFiles.filter((file) => isSupportedVideoFile(file));
    if (validFiles.length === 0) {
      alert(t('uploadVideoAlert'));
      return;
    }

    let missingPathCount = 0;
    setQuickConvertBatchVideos((prev) => {
      const existingPathSet = new Set(prev.map((item) => item.filePath));
      const nextItems = [...prev];

      for (const file of validFiles) {
        const filePath = (file as File & { path?: string }).path ?? '';
        if (!filePath) {
          missingPathCount += 1;
          continue;
        }

        if (existingPathSet.has(filePath)) {
          continue;
        }

        existingPathSet.add(filePath);
        nextItems.push({
          id: uuidv4(),
          filePath,
          displayName: getFileNameFromPath(filePath),
          sizeBytes: file.size
        });
      }

      return nextItems;
    });

    if (missingPathCount > 0) {
      alert(t('pathError'));
    }
  }, [t]);

  const clearQuickConvertBatchVideos = useCallback(() => {
    setQuickConvertBatchVideos([]);
  }, []);

  const removeQuickConvertBatchVideo = useCallback((videoId: string) => {
    setQuickConvertBatchVideos((prev) => prev.filter((item) => item.id !== videoId));
  }, []);

  const activeBuiltInTemplate = useMemo(() => {
    return QUICK_CONVERT_BUILTIN_TEMPLATES.find((template) => isSameConvertSettings(template.settings, quickConvertSettings)) ?? null;
  }, [quickConvertSettings]);

  const activeCustomTemplate = useMemo(() => {
    return quickConvertCustomTemplates.find((template) => isSameConvertSettings(template.settings, quickConvertSettings)) ?? null;
  }, [quickConvertCustomTemplates, quickConvertSettings]);

  const activeQuickConvertTemplateId = activeBuiltInTemplate?.id ?? activeCustomTemplate?.id ?? null;
  const canSaveQuickConvertTemplate = activeQuickConvertTemplateId === null;

  const applyQuickConvertTemplateById = useCallback((templateId: string) => {
    const builtInTemplate = QUICK_CONVERT_BUILTIN_TEMPLATES.find((template) => template.id === templateId);
    if (builtInTemplate) {
      setQuickConvertSettings({ ...builtInTemplate.settings });
      return;
    }

    const customTemplate = quickConvertCustomTemplates.find((template) => template.id === templateId);
    if (customTemplate) {
      setQuickConvertSettings({ ...customTemplate.settings });
    }
  }, [quickConvertCustomTemplates]);

  const openQuickConvertTemplateSaveModal = useCallback(() => {
    if (!canSaveQuickConvertTemplate) {
      return;
    }

    setQuickConvertTemplateModalMode('create');
    setQuickConvertEditingTemplateId(null);
    setQuickConvertTemplateDraftTitle(t('quickConvertTemplateDefaultTitle', { index: quickConvertCustomTemplates.length + 1 }));
    setQuickConvertTemplateDraftDescription('');
    setShowQuickConvertTemplateSaveModal(true);
  }, [canSaveQuickConvertTemplate, quickConvertCustomTemplates.length, t]);

  const openQuickConvertTemplateRenameModal = useCallback((templateId: string) => {
    const targetTemplate = quickConvertCustomTemplates.find((template) => template.id === templateId);
    if (!targetTemplate) {
      return;
    }

    setQuickConvertTemplateModalMode('rename');
    setQuickConvertEditingTemplateId(templateId);
    setQuickConvertTemplateDraftTitle(targetTemplate.title);
    setQuickConvertTemplateDraftDescription(targetTemplate.description);
    setShowQuickConvertTemplateSaveModal(true);
  }, [quickConvertCustomTemplates]);

  const closeQuickConvertTemplateSaveModal = useCallback(() => {
    setShowQuickConvertTemplateSaveModal(false);
    setQuickConvertTemplateModalMode('create');
    setQuickConvertEditingTemplateId(null);
    setQuickConvertTemplateDraftTitle('');
    setQuickConvertTemplateDraftDescription('');
  }, []);

  const deleteQuickConvertTemplate = useCallback((templateId: string) => {
    const targetTemplate = quickConvertCustomTemplates.find((template) => template.id === templateId);
    if (!targetTemplate) {
      return;
    }

    const confirmDelete = window.confirm(t('quickConvertTemplateDeleteConfirm', { title: targetTemplate.title }));
    if (!confirmDelete) {
      return;
    }

    setQuickConvertCustomTemplates((prev) => prev.filter((template) => template.id !== templateId));
    if (quickConvertEditingTemplateId === templateId) {
      setShowQuickConvertTemplateSaveModal(false);
      setQuickConvertTemplateModalMode('create');
      setQuickConvertEditingTemplateId(null);
      setQuickConvertTemplateDraftTitle('');
      setQuickConvertTemplateDraftDescription('');
    }
    alert(t('quickConvertTemplateDeleteSuccess'));
  }, [quickConvertCustomTemplates, quickConvertEditingTemplateId, t]);

  const updateQuickConvertTemplateDraftTitle = useCallback((value: string) => {
    setQuickConvertTemplateDraftTitle(value.slice(0, MAX_QUICK_CONVERT_TEMPLATE_TITLE_LENGTH));
  }, []);

  const updateQuickConvertTemplateDraftDescription = useCallback((value: string) => {
    setQuickConvertTemplateDraftDescription(value.slice(0, MAX_QUICK_CONVERT_TEMPLATE_DESCRIPTION_LENGTH));
  }, []);

  const confirmQuickConvertTemplateSave = useCallback((draft?: { title: string; description: string }) => {
    const draftTitle = typeof draft?.title === 'string' ? draft.title : quickConvertTemplateDraftTitle;
    const draftDescription = typeof draft?.description === 'string' ? draft.description : quickConvertTemplateDraftDescription;
    const title = normalizeTemplateTitle(draftTitle);
    if (!title) {
      alert(t('quickConvertTemplateNeedName'));
      return;
    }

    const description = normalizeTemplateDescription(draftDescription);
    if (quickConvertTemplateModalMode === 'rename') {
      if (!quickConvertEditingTemplateId) {
        return;
      }

      setQuickConvertCustomTemplates((prev) => prev.map((template) => (
        template.id === quickConvertEditingTemplateId
          ? { ...template, title, description }
          : template
      )));
      setShowQuickConvertTemplateSaveModal(false);
      setQuickConvertTemplateModalMode('create');
      setQuickConvertEditingTemplateId(null);
      setQuickConvertTemplateDraftTitle('');
      setQuickConvertTemplateDraftDescription('');
      alert(t('quickConvertTemplateRenameSuccess'));
      return;
    }

    if (!canSaveQuickConvertTemplate) {
      return;
    }

    const nextTemplate: QuickConvertCustomTemplate = {
      id: uuidv4(),
      title,
      description,
      settings: { ...quickConvertSettings }
    };

    setQuickConvertCustomTemplates((prev) => [nextTemplate, ...prev].slice(0, MAX_QUICK_CONVERT_TEMPLATE_COUNT));
    setShowQuickConvertTemplateSaveModal(false);
    setQuickConvertTemplateModalMode('create');
    setQuickConvertEditingTemplateId(null);
    setQuickConvertTemplateDraftTitle('');
    setQuickConvertTemplateDraftDescription('');
    alert(t('quickConvertTemplateSaveSuccess'));
  }, [
    canSaveQuickConvertTemplate,
    quickConvertEditingTemplateId,
    quickConvertTemplateModalMode,
    quickConvertSettings,
    quickConvertTemplateDraftDescription,
    quickConvertTemplateDraftTitle,
    t
  ]);

  const updateQuickConvertFormat = useCallback((value: string) => {
    setQuickConvertSettings((prev) => ({
      ...prev,
      format: normalizeContainerFormat(value)
    }));
  }, []);

  const updateQuickConvertVideoCodec = useCallback((value: string) => {
    setQuickConvertSettings((prev) => ({
      ...prev,
      videoCodec: normalizeVideoCodec(value)
    }));
  }, []);

  const updateQuickConvertAudioCodec = useCallback((value: string) => {
    setQuickConvertSettings((prev) => ({
      ...prev,
      audioCodec: normalizeAudioCodec(value)
    }));
  }, []);

  const updateQuickConvertCrf = useCallback((value: number) => {
    setQuickConvertSettings((prev) => ({
      ...prev,
      crf: normalizeCrf(value)
    }));
  }, []);

  const updateQuickConvertPerformanceMode = useCallback((value: string) => {
    setQuickConvertSettings((prev) => ({
      ...prev,
      performanceMode: normalizePerformanceMode(value)
    }));
  }, []);

  const runQuickConvertBatchExport = useCallback(async () => {
    try {
      if (quickConvertBatchVideos.length === 0) {
        alert(t('quickConvertNeedVideos'));
        return;
      }

      const outputDir = await window.ipcRenderer.showOpenDialog();
      if (!outputDir) {
        return;
      }

      exportController.clearExportProgressTimer();
      const jobId = `quick-convert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      exportController.activeExportJobIdRef.current = jobId;
      exportController.activeExportContextRef.current = null;
      exportController.setExportMode('convert');
      exportController.setExportProgressPercent(0);
      exportController.setExportProgressClip({ current: 0, total: quickConvertBatchVideos.length });
      exportController.setIsExporting(true);
      let exportCompleted = false;
      let exportCanceled = false;

      try {
        const result = await window.ipcRenderer.processConvertBatch({
          videos: quickConvertBatchVideos.map((video) => ({
            id: video.id,
            filePath: video.filePath
          })),
          outputDir,
          format: quickConvertSettings.format,
          videoCodec: quickConvertSettings.videoCodec,
          audioCodec: quickConvertSettings.audioCodec,
          crf: quickConvertSettings.crf,
          performanceMode: quickConvertSettings.performanceMode,
          jobId
        });

        if (result.canceled) {
          exportCanceled = true;
          alert(t('exportCanceled'));
          return;
        }

        const successCount = result.results.filter((item) => item.success).length;
        exportCompleted = true;

        if (!result.success || successCount === 0 || successCount !== result.results.length) {
          if (result.error) {
            alert(t('quickConvertFailed') + result.error);
          } else {
            alert(t('exportFailed'));
          }
        } else if (Array.isArray(result.warnings) && result.warnings.length > 0) {
          alert(`${t('quickConvertSuccess', { count: successCount })}\n${t('quickConvertWarnings')}\n- ${result.warnings.join('\n- ')}`);
        } else {
          alert(t('quickConvertSuccess', { count: successCount }));
        }
      } finally {
        exportController.setIsExporting(false);
        if (exportController.activeExportJobIdRef.current === jobId) {
          exportController.activeExportJobIdRef.current = null;
          exportController.activeExportContextRef.current = null;
          if (exportCompleted && !exportCanceled) {
            exportController.setExportProgressPercent(100);
            exportController.clearExportProgressTimer();
            exportController.exportProgressHideTimerRef.current = window.setTimeout(() => {
              if (exportController.activeExportJobIdRef.current === null) {
                exportController.setExportProgressPercent(null);
                exportController.setExportProgressClip(null);
              }
              exportController.exportProgressHideTimerRef.current = null;
            }, 400);
          } else {
            exportController.setExportProgressPercent(null);
            exportController.setExportProgressClip(null);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      exportController.setIsExporting(false);
      exportController.activeExportJobIdRef.current = null;
      exportController.activeExportContextRef.current = null;
      exportController.clearExportProgressTimer();
      exportController.setExportProgressPercent(null);
      exportController.setExportProgressClip(null);
      console.error('Quick convert batch export error:', error);
      alert(t('quickConvertFailed') + errorMessage);
    }
  }, [exportController, quickConvertBatchVideos, quickConvertSettings, t]);

  return {
    quickConvertBatchVideos,
    quickConvertSettings,
    setQuickConvertSettings,
    quickConvertCustomTemplates,
    activeQuickConvertTemplateId,
    canSaveQuickConvertTemplate,
    showQuickConvertTemplateSaveModal,
    quickConvertTemplateModalMode,
    quickConvertTemplateDraftTitle,
    quickConvertTemplateDraftDescription,
    showQuickConvertCodecGuide,
    setShowQuickConvertCodecGuide,
    handleQuickConvertBatchVideosChange,
    clearQuickConvertBatchVideos,
    removeQuickConvertBatchVideo,
    applyQuickConvertTemplateById,
    openQuickConvertTemplateSaveModal,
    openQuickConvertTemplateRenameModal,
    closeQuickConvertTemplateSaveModal,
    deleteQuickConvertTemplate,
    updateQuickConvertTemplateDraftTitle,
    updateQuickConvertTemplateDraftDescription,
    confirmQuickConvertTemplateSave,
    updateQuickConvertFormat,
    updateQuickConvertVideoCodec,
    updateQuickConvertAudioCodec,
    updateQuickConvertCrf,
    updateQuickConvertPerformanceMode,
    runQuickConvertBatchExport
  };
};
