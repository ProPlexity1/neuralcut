import { useState, useCallback, useEffect } from 'react';
import type { GPUInfo, ModelInfo, GenerationJob, AppView, SidecarStatus, LicenseInfo, GenerationStatus } from './types';
import { invoke } from '@tauri-apps/api/core';

// Simulated GPU data
const SIMULATED_GPUS: GPUInfo[] = [
  { name: 'NVIDIA GeForce RTX 4090', vram: 24, driver: '555.42.06', cudaVersion: '12.5', detected: true },
  { name: 'NVIDIA GeForce RTX 4080', vram: 16, driver: '555.42.06', cudaVersion: '12.5', detected: true },
  { name: 'NVIDIA GeForce RTX 4070', vram: 12, driver: '555.42.06', cudaVersion: '12.5', detected: true },
  { name: 'NVIDIA GeForce RTX 3060', vram: 12, driver: '550.54.14', cudaVersion: '12.4', detected: true },
];

// Model definitions matching the VRAM table
export const MODELS: ModelInfo[] = [
  {
    id: 'ltx-video-lite',
    name: 'LTX-Video 0.9 Lite',
    tier: 'lite',
    size: 2.1,
    minVram: 6,
    resolution: '512×320',
    fps: 8,
    duration: '2-4s',
    huggingFaceRepo: 'Lightricks/LTX-Video',
    description: 'Lightweight model for quick previews. Runs on most GPUs with 6GB+ VRAM.',
    downloaded: false,
    downloadProgress: 0,
    downloading: false,
  },
  {
    id: 'ltx-video-standard',
    name: 'LTX-Video 0.9',
    tier: 'standard',
    size: 4.7,
    minVram: 8,
    resolution: '768×512',
    fps: 16,
    duration: '3-5s',
    huggingFaceRepo: 'Lightricks/LTX-Video',
    description: 'Standard quality text-to-video generation with good detail and motion.',
    downloaded: false,
    downloadProgress: 0,
    downloading: false,
  },
  {
    id: 'ltx-video-pro',
    name: 'LTX-Video 0.9.1 Pro',
    tier: 'pro',
    size: 7.2,
    minVram: 12,
    resolution: '1024×576',
    fps: 24,
    duration: '4-8s',
    huggingFaceRepo: 'Lightricks/LTX-Video',
    description: 'High-quality generation with cinematic frame rates and longer duration.',
    downloaded: true,
    downloadProgress: 100,
    downloading: false,
  },
  {
    id: 'ltx-video-ultra',
    name: 'LTX-Video 0.9.5 Ultra',
    tier: 'ultra',
    size: 10.3,
    minVram: 16,
    resolution: '1280×720',
    fps: 30,
    duration: '5-10s',
    huggingFaceRepo: 'Lightricks/LTX-Video',
    description: 'Maximum quality with HD resolution, smooth motion, and extended duration.',
    downloaded: false,
    downloadProgress: 0,
    downloading: false,
  },
];

const SAMPLE_THUMBNAILS = [
  '/images/sample-video-1.jpg',
  '/images/sample-video-2.jpg',
  '/images/sample-video-3.jpg',
  '/images/sample-video-4.jpg',
];

const SAMPLE_PROMPTS = [
  'A futuristic city skyline at sunset with flying vehicles and neon lights',
  'An enchanted forest with bioluminescent mushrooms and fireflies',
  'An astronaut floating in space near a colorful nebula',
  'Ocean waves crashing on rocks at golden hour',
];

let activeWs: WebSocket | null = null;
const activeEventSources: Record<string, EventSource> = {};

const connectWebSocket = (
  setJobs: React.Dispatch<React.SetStateAction<GenerationJob[]>>,
  setGalleryItems: React.Dispatch<React.SetStateAction<GenerationJob[]>>
) => {
  if (activeWs) {
    if (activeWs.readyState === WebSocket.OPEN || activeWs.readyState === WebSocket.CONNECTING) {
      return;
    }
    activeWs.close();
  }

  const ws = new WebSocket('ws://127.0.0.1:8188/ws');
  activeWs = ws;

  ws.onopen = () => {
    console.log('[NeuralCut] WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'job_status') {
        const { job_id, status, progress, eta, outputPath, error } = msg;
        setJobs(prev => prev.map(j => {
          if (j.id === job_id) {
            const updatedJob = {
              ...j,
              status: status as GenerationStatus,
              progress,
              eta,
              outputPath: outputPath || undefined,
              error: error || undefined,
              endTime: status === 'done' || status === 'error' ? Date.now() : j.endTime,
            };
            
            if (status === 'done' && j.status !== 'done') {
              setGalleryItems(gal => {
                if (gal.some(g => g.id === job_id)) return gal;
                return [updatedJob, ...gal];
              });
            }
            return updatedJob;
          }
          return j;
        }));
      }
    } catch (e) {
      console.error('[NeuralCut] Error parsing WebSocket message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[NeuralCut] WebSocket closed, retrying in 3s...');
    activeWs = null;
    setTimeout(() => connectWebSocket(setJobs, setGalleryItems), 3000);
  };

  ws.onerror = (err) => {
    console.error('[NeuralCut] WebSocket error:', err);
    ws.close();
  };
};

export function useAppStore() {
  const [view, setView] = useState<AppView>('setup');
  const [setupStep, setSetupStep] = useState(0); // 0: splash, 1: detecting, 2: detected, 3: ready
  const [gpu, setGpu] = useState<GPUInfo | null>(null);
  const [models, setModels] = useState<ModelInfo[]>(MODELS);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('ltx-video-pro');
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>({
    running: false,
    port: 8188,
    comfyuiReady: false,
    version: '1.0.0',
  });
  const [license, setLicense] = useState<LicenseInfo>({
    key: '',
    valid: false,
    tier: 'free',
    features: ['Basic generation', '512px max', 'Watermark'],
  });
  const [galleryItems, setGalleryItems] = useState<GenerationJob[]>([
    {
      id: 'demo-1',
      prompt: SAMPLE_PROMPTS[0],
      negativePrompt: '',
      model: 'ltx-video-pro',
      status: 'done',
      progress: 100,
      eta: 0,
      startTime: Date.now() - 120000,
      endTime: Date.now() - 60000,
      thumbnailUrl: SAMPLE_THUMBNAILS[0],
      outputPath: '/output/video_001.mp4',
    },
    {
      id: 'demo-2',
      prompt: SAMPLE_PROMPTS[1],
      negativePrompt: '',
      model: 'ltx-video-pro',
      status: 'done',
      progress: 100,
      eta: 0,
      startTime: Date.now() - 240000,
      endTime: Date.now() - 180000,
      thumbnailUrl: SAMPLE_THUMBNAILS[1],
      outputPath: '/output/video_002.mp4',
    },
    {
      id: 'demo-3',
      prompt: SAMPLE_PROMPTS[2],
      negativePrompt: '',
      model: 'ltx-video-standard',
      status: 'done',
      progress: 100,
      eta: 0,
      startTime: Date.now() - 360000,
      endTime: Date.now() - 300000,
      thumbnailUrl: SAMPLE_THUMBNAILS[2],
      outputPath: '/output/video_003.mp4',
    },
    {
      id: 'demo-4',
      prompt: SAMPLE_PROMPTS[3],
      negativePrompt: '',
      model: 'ltx-video-standard',
      status: 'done',
      progress: 100,
      eta: 0,
      startTime: Date.now() - 480000,
      endTime: Date.now() - 420000,
      thumbnailUrl: SAMPLE_THUMBNAILS[3],
      outputPath: '/output/video_004.mp4',
    },
  ]);

  const detectGPU = useCallback(async () => {
    setSetupStep(1);
    try {
      const gpuInfo = await invoke<GPUInfo>('detect_gpu');
      setGpu(gpuInfo);
      setSetupStep(2);
    } catch (err) {
      console.error('GPU detection failed:', err);
      setGpu({
        name: 'No NVIDIA GPU detected',
        vram: 0,
        driver: 'N/A',
        cudaVersion: 'N/A',
        detected: false,
      });
      setSetupStep(2);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8188/models');
      const backendModels = await res.json();
      setModels(prev => prev.map(m => {
        const backendModel = backendModels[m.id];
        if (backendModel) {
          return {
            ...m,
            downloaded: backendModel.downloaded,
            downloading: backendModel.downloading,
            downloadProgress: backendModel.progress,
          };
        }
        return m;
      }));
    } catch (err) {
      console.error('Failed to fetch models from sidecar:', err);
    }
  }, []);

  useEffect(() => {
    if (sidecarStatus.running && sidecarStatus.comfyuiReady) {
      fetchModels();
      connectWebSocket(setJobs, setGalleryItems);
    }
  }, [sidecarStatus.running, sidecarStatus.comfyuiReady, fetchModels]);

  const startSidecar = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const status = await invoke<{
        running: boolean;
        port: number;
        pid: number | null;
        message: string;
      }>('start_sidecar');
      
      console.log('Sidecar invoke result:', JSON.stringify(status));

      if (status.running) {
        setTimeout(async () => {
          try {
            const res = await fetch('http://127.0.0.1:8188/health');
            const data = await res.json();
            console.log('Health check result:', JSON.stringify(data));
            setSidecarStatus({
              running: true,
              port: 8188,
              comfyuiReady: data.comfyui_ready,
              version: data.version,
            });
          } catch (err) {
            console.error('Health check failed:', err);
            setSidecarStatus(prev => ({ ...prev, running: true }));
          }
        }, 4000);
      } else {
        console.error('Sidecar reported not running:', status.message);
      }
    } catch (err) {
      console.error('start_sidecar invoke failed:', err);
    }
  }, []);

  const downloadModel = useCallback(async (modelId: string) => {
    if (activeEventSources[modelId]) return;

    setModels(prev => prev.map(m =>
      m.id === modelId ? { ...m, downloading: true, downloadProgress: 0 } : m
    ));

    try {
      const startRes = await fetch(`http://127.0.0.1:8188/models/download/${modelId}`, {
        method: 'POST',
      });
      const startData = await startRes.json();
      if (startData.status === 'error') {
        console.error('Failed to start model download:', startData.message);
        setModels(prev => prev.map(m =>
          m.id === modelId ? { ...m, downloading: false, downloadProgress: 0 } : m
        ));
        return;
      }

      const es = new EventSource(`http://127.0.0.1:8188/models/download/${modelId}/progress`);
      activeEventSources[modelId] = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setModels(prev => prev.map(m => {
            if (m.id === modelId) {
              return {
                ...m,
                downloading: data.downloading,
                downloaded: data.downloaded,
                downloadProgress: data.progress,
              };
            }
            return m;
          }));

          if (!data.downloading || data.downloaded) {
            es.close();
            delete activeEventSources[modelId];
          }
        } catch (e) {
          console.error('Error parsing SSE download message:', e);
        }
      };

      es.onerror = (err) => {
        console.error('SSE download error:', err);
        es.close();
        delete activeEventSources[modelId];
        setModels(prev => prev.map(m =>
          m.id === modelId ? { ...m, downloading: false, downloadProgress: 0 } : m
        ));
      };

    } catch (err) {
      console.error('Error initiating download:', err);
      setModels(prev => prev.map(m =>
        m.id === modelId ? { ...m, downloading: false, downloadProgress: 0 } : m
      ));
    }
  }, []);

  const cancelDownload = useCallback(async (modelId: string) => {
    if (activeEventSources[modelId]) {
      activeEventSources[modelId].close();
      delete activeEventSources[modelId];
    }
    
    setModels(prev => prev.map(m =>
      m.id === modelId ? { ...m, downloading: false, downloadProgress: 0 } : m
    ));

    try {
      await fetch(`http://127.0.0.1:8188/models/${modelId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to cancel download on backend:', err);
    }
  }, []);

  const deleteModel = useCallback(async (modelId: string) => {
    setModels(prev => prev.map(m =>
      m.id === modelId ? { ...m, downloaded: false, downloadProgress: 0 } : m
    ));

    try {
      await fetch(`http://127.0.0.1:8188/models/${modelId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete model on backend:', err);
    }
  }, []);

  const startGeneration = useCallback(async (prompt: string, negPrompt: string, modelId: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8188/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          negative_prompt: negPrompt,
          model_id: modelId,
        }),
      });

      const data = await res.json();
      const jobId = data.job_id;
      const thumbnailIndex = Math.floor(Math.random() * SAMPLE_THUMBNAILS.length);

      const newJob: GenerationJob = {
        id: jobId,
        prompt,
        negativePrompt: negPrompt,
        model: modelId,
        status: 'queued',
        progress: 0,
        eta: 10,
        startTime: Date.now(),
        thumbnailUrl: SAMPLE_THUMBNAILS[thumbnailIndex],
      };

      setJobs(prev => [newJob, ...prev]);
    } catch (err) {
      console.error('Failed to start generation:', err);
    }
  }, []);

  const validateLicense = useCallback(async (key: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8188/license/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      
      setLicense({
        key,
        valid: data.valid,
        tier: data.tier,
        expiresAt: data.expires_at,
        features: data.features,
      });
    } catch (err) {
      console.error('License validation failed:', err);
      setLicense({
        key,
        valid: false,
        tier: 'free',
        features: ['Basic generation', '512px max', 'Watermark'],
      });
    }
  }, []);

  return {
    view, setView,
    setupStep, setSetupStep,
    gpu, setGpu,
    models, setModels,
    jobs, setJobs,
    currentPrompt, setCurrentPrompt,
    negativePrompt, setNegativePrompt,
    selectedModel, setSelectedModel,
    sidecarStatus, setSidecarStatus,
    license, setLicense,
    galleryItems, setGalleryItems,
    detectGPU,
    startSidecar,
    downloadModel,
    cancelDownload,
    deleteModel,
    startGeneration,
    validateLicense,
  };
}
