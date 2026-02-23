# BatchClip

BatchClip 是一个基于 Electron + React + TypeScript 的桌面视频批处理工具，面向“多视频、多片段、可选 LUT”的高效导出流程。

当前版本：`v1.0.4`

![界面截图](./docs/screenshot00.png)
![界面截图](./docs/screenshot01.png)

## 功能概览

### 主功能（编辑工作区）
- 视频队列管理：一次导入多个视频，支持在队列中切换当前编辑对象。
- 片段裁剪：支持 `I` / `O` 快捷键标记入点和出点，批量管理多个片段。
- 标签系统：支持标签库、片段标签绑定，导出文件名可带标签前缀。
- LUT 预览与导出：支持导入 `.cube`，可启用/关闭 LUT 预览，并调节强度（0%~100%）。
- 批量导出片段：一键导出队列中所有片段。
- LUT 全量导出：对队列中所有视频直接套用 LUT 导出（不切片）。

### 首屏快捷功能（Quick Actions）
- 按体积自动分割：
  - 选择一个源视频，设置目标体积（MB），按目标大小连续分段导出。
  - 保持源分辨率与码流，不重新编码（`-c copy`），最后一段可能小于目标值。
- 批量套用 LUT 并导出：
  - 批量选择视频 + 统一 LUT + 强度参数后直接导出。
  - 首屏支持 LUT 实时预览（含预览开关、视频切换、进度拖动条）。

## GPU 与回退策略

- Windows 导出优先尝试：`h264_nvenc` / `h264_qsv` / `h264_amf`，失败自动回退 `libx264`。
- macOS 导出优先尝试：`h264_videotoolbox`，失败自动回退 `libx264`。
- 预览链路提供兼容模式（必要时自动或手动切换），提升不同编码源视频的可用性。

说明：开发模式下控制台看到“GPU 编码失败并回退”的日志是预期行为之一，不影响最终自动回退后的导出成功。

## 安装与开发

### 环境要求
- Node.js 18+
- npm

### 安装依赖
```bash
npm install
```

### 本地开发
```bash
npm run dev
```

### 代码检查
```bash
npm run lint
```

## 构建

### Windows
```bash
npm run build
# 或
npm run build:win
```

如遇 Windows 符号链接权限问题可使用：
```bash
npm run build:win:ps1
```

### macOS
```bash
npm run build:mac
```

### 同时尝试构建 Win + mac
```bash
npm run build:all
```

## 使用流程

1. 若是精细剪辑场景，可以首屏拖入视频，或点击选择文件即可进入主编辑工作区。
2. 若是快速批处理场景，可在右侧快捷功能中直接执行：
   - 按体积自动分割
   - 批量 LUT 导出
3. 对于精细剪辑场景，进入主编辑工作区后：
   - 使用 `I` / `O` 标记片段
   - 管理标签
   - 导出的文件命名将会拼接标签，方便区分素材
   - 批量导出片段或执行 LUT 全量导出、
   - 视频列表可以切换当前视频进行预览
   - 可以固定片段时长，点击I机会自动控制O，实现快速固定时长片段剪辑

## 导出命名规则

- 主功能片段导出：`<标签前缀_><原视频名>_clip_01.mov`
- 快捷按体积分割：`<原视频名>_clip01.<源扩展名>`
- LUT 全量导出：`<原视频名>_lut.mov`
- 若重名会自动追加后缀，避免覆盖。

## 项目结构（当前）

```text
electron/
  main.ts                     # Electron 主进程 + IPC + FFmpeg 调度
  preload.ts                  # 安全桥接

src/
  App.tsx                     # 组合层：状态编排与页面装配
  main.tsx                    # 前端入口

  components/
    VideoPlayer.tsx
    Timeline.tsx
    quick-actions/
      QuickSplitBySizeFeature.tsx
      QuickLutBatchFeature.tsx

  features/
    main/
      types.ts
      hooks/
        useMainSettings.ts
      components/
        AppHeader.tsx
        MainLandingWorkspace.tsx
        MainEditorWorkspace.tsx
        SegmentList.tsx
        SettingsModal.tsx
        QueueModal.tsx
        ProgressOverlays.tsx
        LutFullExportConfirmModal.tsx

    quick-actions/
      types.ts
      hooks/
        useQuickSplitBySize.ts
        useQuickLutBatch.ts

  i18n/
    translations.ts           # 中英文本

  lib/
    video.ts                  # 视频文件与路径工具

public/                       # 静态资源
docs/                         # 文档资源（截图等）
```

## License

MIT
