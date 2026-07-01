import { motion } from 'framer-motion';
import {
  Download, Trash2, CheckCircle2, HardDrive, ExternalLink,
  Pause, Clock, Zap
} from 'lucide-react';
import type { ModelInfo, GPUInfo } from '../types';
import { cn } from '../utils/cn';

interface ModelsPanelProps {
  models: ModelInfo[];
  gpu: GPUInfo | null;
  onDownload: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  lite: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    border: 'border-green-500/20',
    gradient: 'from-green-500 to-emerald-500',
  },
  standard: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
    gradient: 'from-cyan-500 to-blue-500',
  },
  pro: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    gradient: 'from-blue-500 to-indigo-500',
  },
  ultra: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    gradient: 'from-purple-500 to-pink-500',
  },
};

export default function ModelsPanel({ models, gpu, onDownload, onCancel, onDelete }: ModelsPanelProps) {
  const totalDownloaded = models.filter(m => m.downloaded).reduce((s, m) => s + m.size, 0);
  const totalAvailable = models.reduce((s, m) => s + m.size, 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Model Manager</h2>
          <p className="text-sm text-text-secondary mt-1">
            Download and manage AI video models. Models are cached locally after first download.
          </p>
        </div>

        {/* Storage Summary */}
        <div className="flex items-center gap-4 rounded-xl bg-bg-secondary border border-border-dim p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-blue/20">
            <HardDrive className="h-5 w-5 text-accent-blue" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-text-primary">Local Storage</span>
              <span className="text-xs text-text-muted">{totalDownloaded.toFixed(1)} / {totalAvailable.toFixed(1)} GB</span>
            </div>
            <div className="h-2 rounded-full bg-bg-primary overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-purple transition-all duration-500"
                style={{ width: `${(totalDownloaded / totalAvailable) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* GPU Compatibility Note */}
        {gpu && (
          <div className="rounded-xl bg-accent-purple/5 border border-accent-purple/20 px-4 py-3 flex items-center gap-3">
            <Zap className="h-4 w-4 text-accent-purple flex-shrink-0" />
            <p className="text-sm text-text-secondary">
              Your <span className="text-text-primary font-medium">{gpu.name}</span> with{' '}
              <span className="text-text-primary font-medium">{gpu.vram}GB VRAM</span> supports models up to{' '}
              <span className={cn('font-medium', gpu.vram >= 16 ? 'text-purple-400' : gpu.vram >= 12 ? 'text-blue-400' : gpu.vram >= 8 ? 'text-cyan-400' : 'text-green-400')}>
                {gpu.vram >= 16 ? 'Ultra' : gpu.vram >= 12 ? 'Pro' : gpu.vram >= 8 ? 'Standard' : 'Lite'}
              </span> tier.
            </p>
          </div>
        )}

        {/* Model Cards */}
        <div className="space-y-4">
          {models.map((model, i) => {
            const colors = TIER_COLORS[model.tier];
            const compatible = gpu ? gpu.vram >= model.minVram : false;
            const downloadSpeed = 45 + Math.random() * 30; // MB/s
            const etaMinutes = model.downloading
              ? Math.round((model.size * 1024 * (1 - model.downloadProgress / 100)) / downloadSpeed / 60)
              : Math.round((model.size * 1024) / downloadSpeed / 60);

            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  'rounded-xl border overflow-hidden transition-colors',
                  model.downloaded
                    ? 'bg-bg-secondary border-accent-green/20'
                    : 'bg-bg-secondary border-border-dim hover:border-border-active'
                )}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* Tier badge */}
                      <div className={cn('mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl', colors.bg)}>
                        <span className={cn('text-sm font-bold uppercase', colors.text)}>
                          {model.tier.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-text-primary">{model.name}</h3>
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', colors.bg, colors.text, colors.border)}>
                            {model.tier}
                          </span>
                          {model.downloaded && (
                            <span className="flex items-center gap-1 text-xs text-accent-green">
                              <CheckCircle2 className="h-3 w-3" />
                              Installed
                            </span>
                          )}
                          {!compatible && gpu && (
                            <span className="text-xs text-accent-amber">
                              Requires {model.minVram}GB+ VRAM
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-text-secondary max-w-lg">{model.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {model.downloaded ? (
                        <button
                          onClick={() => onDelete(model.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-accent-red/20 bg-accent-red/5 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : model.downloading ? (
                        <button
                          onClick={() => onCancel(model.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-accent-amber/20 bg-accent-amber/5 px-3 py-1.5 text-xs text-accent-amber hover:bg-accent-amber/10 transition-colors"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => onDownload(model.id)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                            compatible
                              ? `bg-gradient-to-r ${colors.gradient} text-white shadow-sm hover:shadow-md`
                              : 'bg-bg-tertiary text-text-muted border border-border-dim'
                          )}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download ({model.size}GB)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Specs Row */}
                  <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <span className="text-text-secondary">Resolution:</span> {model.resolution}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-text-secondary">FPS:</span> {model.fps}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-text-secondary">Duration:</span> {model.duration}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-text-secondary">Min VRAM:</span> {model.minVram}GB
                    </span>
                    <a
                      href={`https://huggingface.co/${model.huggingFaceRepo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent-blue hover:underline ml-auto"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Hugging Face
                    </a>
                  </div>

                  {/* Download Progress */}
                  {model.downloading && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">
                          Downloading... {(model.downloadProgress * model.size / 100).toFixed(1)} / {model.size} GB
                        </span>
                        <div className="flex items-center gap-3 text-text-muted">
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {downloadSpeed.toFixed(0)} MB/s
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            ~{etaMinutes} min
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-bg-primary overflow-hidden">
                        <motion.div
                          className={cn('h-full rounded-full bg-gradient-to-r progress-striped', colors.gradient)}
                          initial={{ width: 0 }}
                          animate={{ width: `${model.downloadProgress}%` }}
                          transition={{ ease: 'linear' }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-text-muted">
                        <span>{model.downloadProgress.toFixed(1)}%</span>
                        <span>Source: huggingface.co</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
