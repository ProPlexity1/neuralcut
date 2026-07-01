import { useState } from 'react';
import {
  FolderOpen, Monitor, RefreshCw, Database,
  ChevronRight, Check, Info
} from 'lucide-react';
import type { AppSettings, SidecarStatus } from '../types';
import { cn } from '../utils/cn';

interface SettingsPanelProps {
  sidecar: SidecarStatus;
}

export default function SettingsPanel({ sidecar }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>({
    outputDir: 'C:\\Users\\User\\Videos\\NeuralCut',
    autoStart: true,
    theme: 'dark',
    maxConcurrentJobs: 1,
    defaultModel: 'ltx-video-pro',
    watermark: true,
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Settings</h2>
          <p className="text-sm text-text-secondary mt-1">Configure NeuralCut preferences and backend options.</p>
        </div>

        {/* General */}
        <SettingsSection title="General" icon={<Monitor className="h-4 w-4" />}>
          <SettingRow
            label="Output Directory"
            description="Where generated videos are saved"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={settings.outputDir}
                onChange={e => setSettings(s => ({ ...s, outputDir: e.target.value }))}
                className="w-64 rounded-lg bg-bg-tertiary border border-border-dim px-3 py-1.5 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
              />
              <button className="rounded-lg bg-bg-tertiary border border-border-dim p-1.5 text-text-muted hover:text-text-primary hover:border-border-active transition-colors">
                <FolderOpen className="h-4 w-4" />
              </button>
            </div>
          </SettingRow>
          <SettingRow
            label="Auto-start Backend"
            description="Start Python sidecar when app launches"
          >
            <Toggle
              checked={settings.autoStart}
              onChange={(v) => setSettings(s => ({ ...s, autoStart: v }))}
            />
          </SettingRow>
          <SettingRow
            label="Concurrent Jobs"
            description="Max simultaneous generation tasks"
          >
            <select
              value={settings.maxConcurrentJobs}
              onChange={e => setSettings(s => ({ ...s, maxConcurrentJobs: Number(e.target.value) }))}
              className="rounded-lg bg-bg-tertiary border border-border-dim px-3 py-1.5 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value={1}>1 (Recommended)</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </SettingRow>
          <SettingRow
            label="Watermark"
            description="Add NeuralCut watermark to generated videos (Pro removes this)"
          >
            <Toggle
              checked={settings.watermark}
              onChange={(v) => setSettings(s => ({ ...s, watermark: v }))}
            />
          </SettingRow>
        </SettingsSection>

        {/* Backend */}
        <SettingsSection title="Backend" icon={<Database className="h-4 w-4" />}>
          <SettingRow
            label="Python Sidecar"
            description={`Port ${sidecar.port} · v${sidecar.version}`}
          >
            <div className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              sidecar.running ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'
            )}>
              <div className={cn('h-1.5 w-1.5 rounded-full', sidecar.running ? 'bg-accent-green' : 'bg-accent-red')} />
              {sidecar.running ? 'Running' : 'Stopped'}
            </div>
          </SettingRow>
          <SettingRow
            label="ComfyUI Engine"
            description="Local inference backend"
          >
            <div className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              sidecar.comfyuiReady ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-amber/10 text-accent-amber'
            )}>
              <div className={cn('h-1.5 w-1.5 rounded-full', sidecar.comfyuiReady ? 'bg-accent-green' : 'bg-accent-amber')} />
              {sidecar.comfyuiReady ? 'Ready' : 'Loading'}
            </div>
          </SettingRow>
          <SettingRow
            label="Restart Backend"
            description="Restart the Python sidecar process"
          >
            <button className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-border-dim px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-border-active transition-colors">
              <RefreshCw className="h-3.5 w-3.5" />
              Restart
            </button>
          </SettingRow>
        </SettingsSection>

        {/* Updates */}
        <SettingsSection title="Updates" icon={<RefreshCw className="h-4 w-4" />}>
          <SettingRow
            label="Auto Updates"
            description="Automatically check for and install updates"
          >
            <Toggle checked={true} onChange={() => {}} />
          </SettingRow>
          <SettingRow
            label="Current Version"
            description="NeuralCut v1.0.0 (Tauri 2.x)"
          >
            <button className="flex items-center gap-1.5 rounded-lg bg-bg-tertiary border border-border-dim px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-border-active transition-colors">
              Check for Updates
              <ChevronRight className="h-3 w-3" />
            </button>
          </SettingRow>
        </SettingsSection>

        {/* About */}
        <SettingsSection title="About" icon={<Info className="h-4 w-4" />}>
          <div className="px-4 py-3 text-xs text-text-muted space-y-2">
            <p><span className="text-text-secondary">Stack:</span> Tauri (Rust) + React/TypeScript + Tailwind CSS</p>
            <p><span className="text-text-secondary">Backend:</span> Python 3.11 + FastAPI + ComfyUI</p>
            <p><span className="text-text-secondary">Inference:</span> LTX-Video via ComfyUI API mode</p>
            <p><span className="text-text-secondary">Models:</span> Hugging Face Hub</p>
            <p className="pt-2 border-t border-border-dim">© 2026 NeuralCut. All rights reserved.</p>
          </div>
        </SettingsSection>

        {/* Save */}
        <div className="flex justify-end pb-4">
          <button
            onClick={handleSave}
            className={cn(
              'flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium transition-all',
              saved
                ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                : 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-lg shadow-accent-purple/25 hover:shadow-accent-purple/40'
            )}
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved!
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-secondary border border-border-dim overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border-dim px-4 py-3">
        <span className="text-text-muted">{icon}</span>
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      </div>
      <div className="divide-y divide-border-dim">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors',
        checked ? 'bg-accent-purple' : 'bg-bg-tertiary border border-border-dim'
      )}
    >
      <div
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
