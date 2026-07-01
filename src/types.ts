export interface GPUInfo {
  name: string;
  vram: number; // in GB
  driver: string;
  cudaVersion: string;
  detected: boolean;
}

export type ModelTier = 'lite' | 'standard' | 'pro' | 'ultra';

export interface ModelInfo {
  id: string;
  name: string;
  tier: ModelTier;
  size: number; // in GB
  minVram: number; // in GB
  resolution: string;
  fps: number;
  duration: string;
  huggingFaceRepo: string;
  description: string;
  downloaded: boolean;
  downloadProgress: number;
  downloading: boolean;
}

export type GenerationStatus = 'idle' | 'queued' | 'loading_model' | 'generating' | 'done' | 'error';

export interface GenerationJob {
  id: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  status: GenerationStatus;
  progress: number;
  eta: number; // seconds remaining
  startTime: number;
  endTime?: number;
  outputPath?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface AppSettings {
  outputDir: string;
  autoStart: boolean;
  theme: 'dark';
  maxConcurrentJobs: number;
  defaultModel: string;
  watermark: boolean;
}

export type AppView = 'setup' | 'main' | 'settings' | 'models' | 'license';

export interface SidecarStatus {
  running: boolean;
  port: number;
  comfyuiReady: boolean;
  version: string;
}

export interface LicenseInfo {
  key: string;
  valid: boolean;
  tier: 'free' | 'pro' | 'enterprise';
  expiresAt?: string;
  features: string[];
}
