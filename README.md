# BatchClip - 视频批量片段提取工具

一款用于从视频中快速截取多个短片段的桌面应用。特别适合为 Live Photo 准备素材（每段≤3.9秒）。

![界面截图](./docs/screenshot.png)

## ✨ 功能特点

- **多片段标记**: 在同一视频中标记任意数量的片段
- **快捷键操作**: 使用 `I` / `O` 键快速标记入点/出点
- **自动限时**: 片段超过 3.9 秒时自动闭合（符合 Live Photo 规范）
- **批量导出**: 一键导出所有片段为独立的 `.mov` 文件
- **实时预览**: 时间轴可视化已标记的所有片段

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 pnpm

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 构建发布版
```bash
npm run build
```

## 📖 使用方法

1. **导入视频**: 拖拽视频文件到应用窗口，或点击选择文件
2. **播放视频**: 按 `空格键` 播放/暂停
3. **标记片段**: 
   - 按 `I` 键标记片段起始点
   - 按 `O` 键标记片段结束点
   - 或等待 3.9 秒后自动闭合
4. **管理片段**: 在右侧列表查看和删除已标记的片段
5. **批量导出**: 点击「Export All Clips」选择输出文件夹

## ⌨️ 快捷键

| 按键 | 功能 |
|------|------|
| `I` | 标记入点 (Set In) |
| `O` | 标记出点 (Set Out) |
| `Space` | 播放/暂停 |

## 🛠️ 技术栈

- **框架**: Electron + Vite
- **前端**: React + TypeScript
- **样式**: TailwindCSS
- **视频处理**: FFmpeg (通过 fluent-ffmpeg)

## 📁 项目结构

```
├── electron/           # Electron 主进程
│   ├── main.ts        # 主进程入口
│   └── preload.ts     # 预加载脚本
├── src/               # React 前端
│   ├── App.tsx        # 主应用组件
│   └── components/    # UI 组件
│       ├── VideoPlayer.tsx
│       └── Timeline.tsx
└── public/            # 静态资源
```

## 📄 输出格式

- **格式**: MOV (QuickTime)
- **视频编码**: H.264
- **音频编码**: AAC
- **命名规则**: `原文件名_clip_01.mov`, `原文件名_clip_02.mov`, ...

## 📝 License

MIT
