# BatchClip 
# 视频切片助手

[中文](./README.md) | [English](./README_EN.md)

是否遇到过文件太大无法上传或者分享？是否遇到素材太多不知道怎么标注与导出？快来试试BatchClip吧！

 BatchClip是一个基于 Electron + React + TypeScript 的桌面视频批处理工具，面向“多视频、多片段、可选 LUT”的高效导出流程。支持主编辑工作区精细剪辑（支持视频片段添加标签），也支持首屏快捷批处理（分割 / LUT / 转换）。

当前版本：`v1.0.7`

![界面截图](./docs/screenshot00.png)
![界面截图](./docs/screenshot01.png)

## 最近更新（2026-02-26）

- 新增全局状态栏交互：首屏底部可直接切换 `ZH/EN`、主题（暗黑 / 白天 / 跟随系统），并显示当前版本号。
- 新增第三个快捷功能：批量视频转换（格式 + 视频编码器 + 音频编码器 + CRF）。
- 批量转换支持内置模板（全兼容优先 / 画质无损压缩优先）和自定义模板（保存 / 重命名 / 删除）。
- 转换任务增加“自动兼容修正”与提示：若格式与编码器不兼容会自动调整为可用组合并给出提醒。
- 新增状态栏“默认导出格式”设置弹窗：支持“转码为目标格式”与“保持源格式”，默认 `MP4 + H.264`。
- 默认导出格式会作用于片段导出与 LUT 导出（含快捷 LUT 批量导出）；快捷“批量视频转换”仍保持独立参数。
- macOS 导出链路补充 `-hwaccel videotoolbox` 尝试硬件解码 + 硬件编码，失败后自动回退软件编码。

## 功能概览

### 主功能（编辑工作区）
- 视频队列管理：一次导入多个视频，支持在队列中切换当前编辑对象。
- 片段裁剪：支持 `I` / `O` 快捷键标记入点和出点，批量管理多个片段。
- 标签系统：支持标签库、片段标签绑定，导出文件名可带标签前缀。
- LUT 预览与导出：支持导入 `.cube`，可启用/关闭 LUT 预览，并调节强度（0%~100%）。
- 批量导出片段：一键导出队列中所有片段。
- LUT 全量导出：对队列中所有视频直接套用 LUT 导出（不切片）。
- 全局状态栏：支持快速切换 `ZH/EN`、主题偏好（暗黑 / 白天 / 跟随系统）、默认导出格式，并显示当前版本号。
- 默认导出格式：支持“转码为目标格式”与“保持源格式”。除快捷“批量视频转换”外，其他导出任务均遵循此默认策略。

### 首屏快捷功能（Quick Actions）
- 按体积自动分割：
  - 选择一个源视频，设置目标体积（MB），按目标大小连续分段导出。
  - 保持源分辨率与码流，不重新编码（`-c copy`），最后一段可能小于目标值。
- 批量套用 LUT 并导出：
  - 批量选择视频 + 统一 LUT + 强度参数后直接导出。
  - 首屏支持 LUT 实时预览（含预览开关、视频切换、进度拖动条）。
- 批量视频转换：
  - 批量选择视频，统一设置输出容器格式、视频/音频编码器、CRF 质量参数。
  - 提供内置参数模板（全兼容优先、画质无损压缩优先）与自定义模板管理（保存、重命名、删除）。
  - 当容器与编解码组合不兼容时自动调整为可用组合，并在任务完成后汇总提示。
  - 提供参数说明弹窗（格式与编码器小卡片），方便新手快速理解并选择。
  - 支持“自动 GPU 优先 + CPU 回退”与“仅 CPU”两种性能策略。

## 批量转换支持矩阵

| 输出容器 | 视频编码器 | 音频编码器 |
| --- | --- | --- |
| `mp4` | `h264` / `hevc` / `av1` | `aac` |
| `mkv` | `h264` / `hevc` / `vp9` / `av1` | `aac` / `opus` / `copy` |
| `webm` | `vp9` / `av1` | `opus` |
| `mov` | `h264` / `hevc` | `aac` |

说明：若选择了不兼容组合，程序会自动修正为兼容选项（并在结果中给出提醒）。

## GPU 与回退策略

- Windows 导出优先尝试：`h264_nvenc` / `h264_qsv` / `h264_amf`，失败自动回退 `libx264`。
- macOS 导出优先尝试：`h264_videotoolbox` / `hevc_videotoolbox` / `av1_videotoolbox`，并附带 `-hwaccel videotoolbox`；失败自动回退软件编码。
- 快捷批量转换支持自动线程调优，并按所选编码器优先尝试硬件编码，失败后无感回退到软件编码。
- 预览链路提供兼容模式（必要时自动或手动切换），提升不同编码源视频的可用性。

说明：开发模式下控制台看到“GPU 编码失败并回退”的日志是预期行为之一，不影响最终自动回退后的导出成功。
补充：macOS 默认关闭 Electron 渲染硬件加速（兼容性优先，可通过 `BATCHCLIP_FORCE_HW_ACCEL=1` 打开），不影响 FFmpeg 导出链路对 VideoToolbox 的尝试。

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
   - 批量 LUT 导出（含实时预览）
   - 批量视频转换（支持预设模板）
3. 对于精细剪辑场景，进入主编辑工作区后：
   - 使用 `I` / `O` 标记片段
   - 管理标签
   - 导出的文件命名将会拼接标签，方便区分素材
   - 批量导出片段或执行 LUT 全量导出
   - 视频列表可以切换当前视频进行预览
   - 可通过偏好设置固定片段时长，点击 `I` 后自动控制 `O`，实现快速固定时长剪辑
4. 底部状态栏支持随时切换语言、主题和“默认导出格式”，设置会持久化到本地。

## 导出命名规则

- 主功能片段导出：`<标签前缀_><原视频名>_clip_01.<导出扩展名>`
- 快捷按体积分割：`<原视频名>_clip01.<源扩展名>`
- LUT 全量导出：`<原视频名>_lut.<导出扩展名>`
- 快捷批量转换：`<原视频名>_convert.<目标扩展名>`
- 若重名会自动追加后缀，避免覆盖。

说明：
- `<导出扩展名>` 由“状态栏 -> 默认导出格式”决定。
- 当选择“保持源格式”且未启用 LUT 时，片段导出优先沿用源视频扩展名（如 `.mp4/.mkv/.mov`）。

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
      QuickConvertBatchFeature.tsx

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
        GlobalStatusBar.tsx
        ExportFormatSettingsModal.tsx
        LutFullExportConfirmModal.tsx
      lib/
        defaultExport.ts

    quick-actions/
      types.ts
      hooks/
        useQuickSplitBySize.ts
        useQuickLutBatch.ts
        useQuickConvertBatch.ts

  i18n/
    translations.ts           # 中英文本

  lib/
    video.ts                  # 视频文件与路径工具

public/                       # 静态资源
docs/                         # 文档资源（截图等）
```

## License

MIT

## 赞助支持

开发不易，如果 BatchClip 对你有帮助，欢迎请作者喝杯咖啡。感谢每一份支持与鼓励。

可使用支付宝扫码赞助：

![支付宝赞助码](./docs/Ali_pay.PNG)
