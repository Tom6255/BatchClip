import { Zap } from 'lucide-react';

// EN: Shared application top bar.
// ZH: 应用顶部栏，统一管理品牌头部展示。
const AppHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-50 titlebar-drag-region">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Zap className="w-5 h-5 text-white fill-white" />
        </div>
        <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
          Batch<span className="font-light text-zinc-600">Clip</span>
        </span>
      </div>
    </header>
  );
};

export default AppHeader;
