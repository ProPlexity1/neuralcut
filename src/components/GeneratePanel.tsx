import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2, ChevronDown, Clock, Loader2, CheckCircle2,
  AlertCircle, Play, ImageIcon, Trash2, Copy, Download,
  Maximize2, X, Film
} from 'lucide-react';
import type { GenerationJob, ModelInfo, GenerationStatus } from '../types';
import { cn } from '../utils/cn';

interface GeneratePanelProps {
  currentPrompt: string;
  negativePrompt: string;
  selectedModel: string;
  models: ModelInfo[];
  jobs: GenerationJob[];
  galleryItems: GenerationJob[];
  onPromptChange: (p: string) => void;
  onNegativePromptChange: (p: string) => void;
  onModelChange: (m: string) => void;
  onGenerate: (prompt: string, negPrompt: string, model: string) => void;
}

const STATUS_CONFIG: Record<GenerationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  idle: { label: 'Idle', color: 'text-text-muted', icon: null },
  queued: { label: 'Queued', color: 'text-accent-amber', icon: <Clock className="h-3.5 w-3.5" /> },
  loading_model: { label: 'Loading Model', color: 'text-accent-cyan', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  generating: { label: 'Generating', color: 'text-accent-purple', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  done: { label: 'Complete', color: 'text-accent-green', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  error: { label: 'Error', color: 'text-accent-red', icon: <AlertCircle className="h-3.5 w-3.5" /> },
};

const PROMPT_SUGGESTIONS = [
  'A majestic dragon flying over snow-capped mountains at dawn',
  'Timelapse of a flower blooming in a sunlit meadow',
  'Underwater scene with colorful coral reef and tropical fish',
  'A steampunk train racing through a desert landscape',
  'Northern lights dancing over a frozen lake in Iceland',
  'A cat sitting on a windowsill watching rain outside',
];

export default function GeneratePanel({
  currentPrompt,
  negativePrompt,
  selectedModel,
  models,
  jobs,
  galleryItems,
  onPromptChange,
  onNegativePromptChange,
  onModelChange,
  onGenerate,
}: GeneratePanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedGalleryItem, setSelectedGalleryItem] = useState<GenerationJob | null>(null);

  const activeModel = models.find(m => m.id === selectedModel);
  const activeJobs = jobs.filter(j => j.status !== 'done' && j.status !== 'error' && j.status !== 'idle');
  const canGenerate = currentPrompt.trim().length > 0 && activeModel?.downloaded;

  const handleGenerate = () => {
    if (canGenerate) {
      onGenerate(currentPrompt, negativePrompt, selectedModel);
    }
  };

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Left: Prompt & Controls */}
      <div className="flex w-[420px] flex-col border-r border-border-dim flex-shrink-0">
        {/* Prompt Input */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted uppercase tracking-wider">
              Prompt
            </label>
            <textarea
              value={currentPrompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Describe the video you want to generate..."
              rows={4}
              className="w-full rounded-xl bg-bg-tertiary border border-border-dim px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple focus:outline-none focus:ring-1 focus:ring-accent-purple/50 resize-none transition-colors"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROMPT_SUGGESTIONS.slice(0, 3).map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => onPromptChange(suggestion)}
                  className="rounded-md bg-bg-tertiary/50 border border-border-dim px-2 py-1 text-xs text-text-muted hover:text-text-secondary hover:border-border-active transition-colors truncate max-w-[180px]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Model Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted uppercase tracking-wider">
              Model
            </label>
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex w-full items-center justify-between rounded-xl bg-bg-tertiary border border-border-dim px-4 py-2.5 text-sm text-text-primary hover:border-border-active transition-colors"
              >
                <div className="flex items-center gap-2">
                  <TierBadge tier={activeModel?.tier || 'standard'} />
                  <span>{activeModel?.name || 'Select model'}</span>
                  {activeModel && !activeModel.downloaded && (
                    <span className="text-xs text-accent-amber">(not downloaded)</span>
                  )}
                </div>
                <ChevronDown className={cn('h-4 w-4 text-text-muted transition-transform', showModelDropdown && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {showModelDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl bg-bg-secondary border border-border-dim shadow-xl overflow-hidden"
                  >
                    {models.map(model => (
                      <button
                        key={model.id}
                        onClick={() => { onModelChange(model.id); setShowModelDropdown(false); }}
                        className={cn(
                          'flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-bg-hover transition-colors',
                          model.id === selectedModel ? 'bg-accent-purple/10' : ''
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <TierBadge tier={model.tier} />
                          <div className="text-left">
                            <span className="text-text-primary">{model.name}</span>
                            <div className="text-xs text-text-muted">{model.resolution} · {model.fps}fps · {model.duration}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {model.downloaded ? (
                            <span className="text-xs text-accent-green">Ready</span>
                          ) : (
                            <span className="text-xs text-text-muted">{model.size}GB</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Advanced Options */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', showAdvanced && 'rotate-180')} />
              Advanced Options
            </button>
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-text-muted">Negative Prompt</label>
                      <textarea
                        value={negativePrompt}
                        onChange={(e) => onNegativePromptChange(e.target.value)}
                        placeholder="What to avoid..."
                        rows={2}
                        className="w-full rounded-lg bg-bg-tertiary border border-border-dim px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:border-accent-purple focus:outline-none resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">Steps</label>
                        <input type="number" defaultValue={30} min={10} max={100} className="w-full rounded-lg bg-bg-tertiary border border-border-dim px-3 py-2 text-xs text-text-primary focus:border-accent-purple focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">CFG Scale</label>
                        <input type="number" defaultValue={7.5} min={1} max={20} step={0.5} className="w-full rounded-lg bg-bg-tertiary border border-border-dim px-3 py-2 text-xs text-text-primary focus:border-accent-purple focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">Seed</label>
                        <input type="number" defaultValue={-1} className="w-full rounded-lg bg-bg-tertiary border border-border-dim px-3 py-2 text-xs text-text-primary focus:border-accent-purple focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">Frames</label>
                        <input type="number" defaultValue={81} min={9} max={257} step={8} className="w-full rounded-lg bg-bg-tertiary border border-border-dim px-3 py-2 text-xs text-text-primary focus:border-accent-purple focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Active Jobs */}
          {activeJobs.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-text-muted uppercase tracking-wider">
                Active Jobs ({activeJobs.length})
              </label>
              <div className="space-y-2">
                {activeJobs.map(job => {
                  const statusConf = STATUS_CONFIG[job.status];
                  return (
                    <motion.div
                      key={job.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-bg-tertiary/50 border border-border-dim p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className={cn('flex items-center gap-1.5 text-xs font-medium', statusConf.color)}>
                          {statusConf.icon}
                          {statusConf.label}
                        </div>
                        {job.eta > 0 && (
                          <span className="text-xs text-text-muted">~{job.eta}s remaining</span>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary line-clamp-1">{job.prompt}</p>
                      {job.status === 'generating' && (
                        <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent-blue progress-striped"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <div className="border-t border-border-dim p-4">
          <motion.button
            whileHover={canGenerate ? { scale: 1.01 } : {}}
            whileTap={canGenerate ? { scale: 0.99 } : {}}
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium text-sm transition-all',
              canGenerate
                ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-lg shadow-accent-purple/25 hover:shadow-accent-purple/40'
                : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
            )}
          >
            <Wand2 className="h-4 w-4" />
            Generate Video
          </motion.button>
          {!activeModel?.downloaded && activeModel && (
            <p className="mt-2 text-center text-xs text-accent-amber">
              Download the {activeModel.name} model first
            </p>
          )}
        </div>
      </div>

      {/* Right: Gallery */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-dim px-4 py-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-text-muted" />
            <h3 className="text-sm font-medium text-text-primary">Output Gallery</h3>
            <span className="text-xs text-text-muted">({galleryItems.length} videos)</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {galleryItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Film className="h-12 w-12 text-text-muted/30 mb-3" />
              <p className="text-sm text-text-muted">No videos generated yet</p>
              <p className="text-xs text-text-muted/60 mt-1">Enter a prompt and click Generate to create your first video</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {galleryItems.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="group relative rounded-xl overflow-hidden border border-border-dim bg-bg-tertiary cursor-pointer hover:border-accent-purple/50 transition-colors"
                  onClick={() => setSelectedGalleryItem(item)}
                >
                  <div className="aspect-video relative">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.prompt}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-accent-purple/20 to-accent-blue/20 flex items-center justify-center">
                        <Film className="h-8 w-8 text-text-muted/30" />
                      </div>
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                      <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {/* Duration badge */}
                    <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      0:{String(3 + Math.floor(Math.random() * 7)).padStart(2, '0')}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{item.prompt}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <TierBadge tier={models.find(m => m.id === item.model)?.tier || 'standard'} />
                      <span className="text-xs text-text-muted">
                        {new Date(item.endTime || item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedGalleryItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedGalleryItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full mx-4 rounded-2xl bg-bg-secondary border border-border-dim overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border-dim px-4 py-3">
                <span className="text-sm font-medium text-text-primary">Video Preview</span>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors">
                    <Download className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors">
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSelectedGalleryItem(null)}
                    className="ml-1 p-1.5 rounded-md text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* Image */}
              <div className="aspect-video bg-black">
                {selectedGalleryItem.thumbnailUrl && (
                  <img
                    src={selectedGalleryItem.thumbnailUrl}
                    alt={selectedGalleryItem.prompt}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
              {/* Info */}
              <div className="border-t border-border-dim p-4">
                <p className="text-sm text-text-primary mb-2">{selectedGalleryItem.prompt}</p>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span>Model: {models.find(m => m.id === selectedGalleryItem.model)?.name}</span>
                  <span>•</span>
                  <span>{selectedGalleryItem.outputPath}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    lite: 'bg-green-500/15 text-green-400 border-green-500/30',
    standard: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    pro: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    ultra: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase', colors[tier] || colors.standard)}>
      {tier}
    </span>
  );
}
