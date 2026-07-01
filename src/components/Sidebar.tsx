import {
  Video, Download, Settings, Key, Cpu, BarChart3, FolderOpen
} from 'lucide-react';
import type { AppView, GPUInfo } from '../types';
import { cn } from '../utils/cn';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  gpu: GPUInfo | null;
  activeJobCount: number;
}

const NAV_ITEMS: { view: AppView; icon: React.ReactNode; label: string }[] = [
  { view: 'main', icon: <Video className="h-4 w-4" />, label: 'Generate' },
  { view: 'models', icon: <Download className="h-4 w-4" />, label: 'Models' },
  { view: 'settings', icon: <Settings className="h-4 w-4" />, label: 'Settings' },
  { view: 'license', icon: <Key className="h-4 w-4" />, label: 'License' },
];

export default function Sidebar({ activeView, onViewChange, gpu, activeJobCount }: SidebarProps) {
  return (
    <div className="flex h-full w-56 flex-col border-r border-border-dim bg-bg-secondary/50 flex-shrink-0">
      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(item => (
          <button
            key={item.view}
            onClick={() => onViewChange(item.view)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
              activeView === item.view
                ? 'bg-accent-purple/15 text-accent-purple'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            {item.icon}
            {item.label}
            {item.view === 'main' && activeJobCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-purple/20 px-1.5 text-xs text-accent-purple">
                {activeJobCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* GPU Info Footer */}
      {gpu && (
        <div className="border-t border-border-dim p-3">
          <div className="rounded-lg bg-bg-tertiary/50 border border-border-dim p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Cpu className="h-3.5 w-3.5" />
              <span className="font-medium uppercase tracking-wider">GPU</span>
            </div>
            <p className="text-xs text-text-primary font-medium truncate">{gpu.name}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-bg-primary overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-accent-green to-accent-cyan" />
              </div>
              <span className="text-xs text-text-muted">{gpu.vram}GB</span>
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                ~30% utilized
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3" />
                42°C
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
