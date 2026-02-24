import { Zap } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface AppHeaderProps {
  theme: 'dark' | 'light';
}

const AppHeader = ({ theme }: AppHeaderProps) => {
  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 h-14 backdrop-blur-md border-b flex items-center justify-between px-6 z-50 titlebar-drag-region transition-colors duration-300',
        theme === 'light'
          ? 'bg-zinc-900/80 border-white/10'
          : 'bg-zinc-950/80 border-white/5'
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-8 h-8 rounded-full bg-gradient-to-tr flex items-center justify-center shadow-lg transition-colors duration-300',
            theme === 'light'
              ? 'from-sky-500 to-cyan-400 shadow-sky-500/25'
              : 'from-blue-600 to-cyan-500 shadow-blue-500/20'
          )}
        >
          <Zap className="w-5 h-5 text-white fill-white" />
        </div>
        <span
          className={cn(
            'font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r transition-colors duration-300',
            theme === 'light' ? 'from-zinc-800 to-zinc-500' : 'from-white to-zinc-400'
          )}
        >
          Batch<span className={cn('font-light', theme === 'light' ? 'text-zinc-500' : 'text-zinc-600')}>Clip</span>
        </span>
      </div>
    </header>
  );
};

export default AppHeader;
