import { Minus, Square, X, Sparkles, Wifi, WifiOff } from 'lucide-react';
import type { SidecarStatus } from '../types';
import { cn } from '../utils/cn';

interface TitlebarProps {
  sidecar: SidecarStatus;
}

export default function Titlebar({ sidecar }: TitlebarProps) {
  return (
    <div className="titlebar-drag flex h-10 items-center justify-between border-b border-border-dim bg-bg-secondary/80 backdrop-blur-sm px-4 flex-shrink-0">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent-purple to-accent-blue">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-text-primary">NeuralCut</span>
        <span className="text-xs text-text-muted">v1.0.0</span>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-2">
        <div className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs',
          sidecar.running
            ? 'bg-accent-green/10 text-accent-green'
            : 'bg-accent-red/10 text-accent-red'
        )}>
          {sidecar.running ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {sidecar.running ? 'Backend Connected' : 'Backend Offline'}
        </div>
        {sidecar.comfyuiReady && (
          <div className="flex items-center gap-1.5 rounded-full bg-accent-blue/10 px-2.5 py-0.5 text-xs text-accent-blue">
            <div className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse" />
            ComfyUI Ready
          </div>
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="titlebar-no-drag flex items-center gap-1">
        <button className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors">
          <Square className="h-3 w-3" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-accent-red/20 hover:text-accent-red transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
