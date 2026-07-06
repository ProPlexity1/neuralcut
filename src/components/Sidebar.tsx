import { useState, useEffect } from 'react';
import {
  Video, Download, Settings, Key, Cpu, BarChart3, Thermometer
} from 'lucide-react';
import type { AppView, GPUInfo } from '../types';
import { cn } from '../utils/cn';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  gpu: GPUInfo | null;
  activeJobCount: number;
}

interface GpuStats {
  utilization: number;
  vram_used_mb: number;
  vram_total_mb: number;
  temperature: number;
  power_draw: number;
}

const NAV_ITEMS: { view: AppView; icon: React.ReactNode; label: string }[] = [
  { view: 'main', icon: <Video className="h-4 w-4" />, label: 'Generate' },
  { view: 'models', icon: <Download className="h-4 w-4" />, label: 'Models' },
  { view: 'settings', icon: <Settings className="h-4 w-4" />, label: 'Settings' },
  { view: 'license', icon: <Key className="h-4 w-4" />, label: 'License' },
];

export default function Sidebar({ activeView, onViewChange, gpu, activeJobCount }: SidebarProps) {
  const [gpuStats, setGpuStats] = useState<GpuStats | null>(null);

  useEffect(() => {
    if (!gpu) return;

    const fetchStats = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8188/gpu/stats');
        const data = await res.json();
        if (!data.error) setGpuStats(data);
      } catch {
        // sidecar not ready yet, ignore
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [gpu]);

  const vramUsedGb = gpuStats ? (gpuStats.vram_used_mb / 1024).toFixed(1) : '0.0';
  const vramTotalGb = gpu?.vram ?? 0;
  const vramPct = gpuStats ? Math.min(gpuStats.vram_used_mb / (gpuStats.vram_total_mb || 1), 1) : 0;
  const utilPct = gpuStats?.utilization ?? 0;
  const temp = gpuStats?.temperature ?? 0;

  const tempColor = temp >= 80 ? 'text-accent-red' : temp >= 65 ? 'text-accent-amber' : 'text-text-muted';

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

            {/* VRAM bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-text-muted">
                <span>VRAM</span>
                <span>{vramUsedGb} / {vramTotalGb}GB</span>
              </div>
              <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-green to-accent-cyan transition-all duration-500"
                  style={{ width: `${vramPct * 100}%` }}
                />
              </div>
            </div>

            {/* GPU util + temp */}
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                {utilPct}% util
              </span>
              <span className={cn('flex items-center gap-1', tempColor)}>
                <Thermometer className="h-3 w-3" />
                {temp}°C
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
