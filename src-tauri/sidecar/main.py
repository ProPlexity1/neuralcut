import sys
import os
import subprocess
import asyncio
import uuid
import json
import threading
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
import requests

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────────────────────

MODELS_DIR = Path(os.environ.get("MODELS_DIR", Path.home() / "AppData/Local/NeuralCut/models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", Path.home() / "Videos/NeuralCut"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_CONFIG = {
    "ltx-video-lite": {
        "repo_id": "Lightricks/LTX-Video",
        "files": ["ltx-video-2b-v0.9.1.safetensors"],
        "size_gb": 5.72,
    },
    "ltx-video-standard": {
        "repo_id": "Lightricks/LTX-Video",
        "files": ["ltx-video-2b-v0.9.5.safetensors"],
        "size_gb": 6.34,
    },
    "ltx-video-pro": {
        "repo_id": "Lightricks/LTX-Video",
        "files": ["ltxv-13b-0.9.7-dev-fp8.safetensors"],
        "size_gb": 15.7,
    },
    "ltx-video-ultra": {
        "repo_id": "Lightricks/LTX-Video",
        "files": ["ltxv-13b-0.9.8-distilled-fp8.safetensors"],
        "size_gb": 16.0,
    },
}

# ── Global State ──────────────────────────────────────────────────────────────

def check_downloaded(model_id: str) -> bool:
    config = MODEL_CONFIG.get(model_id)
    if not config:
        return False
    model_dir = MODELS_DIR / model_id
    return all((model_dir / f).exists() for f in config["files"])

models_db = {
    model_id: {
        "downloaded": check_downloaded(model_id),
        "downloading": False,
        "progress": 100.0 if check_downloaded(model_id) else 0.0,
        "speed_mbps": 0.0,
        "eta_seconds": 0,
    }
    for model_id in MODEL_CONFIG
}

active_connections = []
cancel_flags: dict[str, bool] = {}
main_event_loop = None

# ── Pydantic Models ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    model_id: str = "ltx-video-standard"
    steps: int = 25
    cfg_scale: float = 7.5

class GenerateResponse(BaseModel):
    job_id: str
    status: str
    message: str

class StatusResponse(BaseModel):
    running: bool
    version: str
    comfyui_ready: bool
    python_version: str

class LicenseRequest(BaseModel):
    key: str

# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        await websocket.send_json({"type": "connection_established"})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
    except Exception:
        if websocket in active_connections:
            active_connections.remove(websocket)

async def broadcast_job_status(job_id: str, status: str, progress: float, eta: int, output_path: str = None, error: str = None):
    payload = {
        "type": "job_status",
        "job_id": job_id,
        "status": status,
        "progress": progress,
        "eta": eta,
        "outputPath": output_path,
        "error": error,
    }
    for conn in list(active_connections):
        try:
            await conn.send_json(payload)
        except Exception:
            if conn in active_connections:
                active_connections.remove(conn)

def broadcast_from_thread(payload: dict):
    if main_event_loop is None or not active_connections:
        return

    async def _send_all():
        for conn in list(active_connections):
            try:
                await conn.send_json(payload)
            except Exception:
                if conn in active_connections:
                    active_connections.remove(conn)

    try:
        asyncio.run_coroutine_threadsafe(_send_all(), main_event_loop)
    except Exception as e:
        print(f"[NeuralCut] Broadcast error: {e}", flush=True)

# ── Model Download ────────────────────────────────────────────────────────────

def real_model_download(model_id: str, loop=None):
    try:
        import time
        from huggingface_hub import hf_hub_url

        config = MODEL_CONFIG[model_id]
        model_dir = MODELS_DIR / model_id
        model_dir.mkdir(parents=True, exist_ok=True)

        files = config["files"]
        total_files = len(files)
        cancel_flags[model_id] = False
        total_bytes = config.get("size_gb", 2.0) * 1024 * 1024 * 1024

        for file_idx, filename in enumerate(files):
            if cancel_flags.get(model_id):
                models_db[model_id]["downloading"] = False
                models_db[model_id]["progress"] = 0.0
                return

            dest_path = model_dir / filename
            if dest_path.exists():
                models_db[model_id]["progress"] = ((file_idx + 1) / total_files) * 100.0
                continue

            print(f"[NeuralCut] Downloading {filename}", flush=True)

            dest_path_temp = model_dir / f"{filename}.tmp"
            initial_size = dest_path_temp.stat().st_size if dest_path_temp.exists() else 0

            try:
                url = hf_hub_url(repo_id=config["repo_id"], filename=filename)
                hf_token = os.environ.get("HF_TOKEN", "")
                headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
                if initial_size > 0:
                    headers["Range"] = f"bytes={initial_size}-"

                response = requests.get(url, headers=headers, stream=True, timeout=60)
                response.raise_for_status()

                downloaded = initial_size
                last_time = time.time()
                last_bytes = initial_size

                with open(dest_path_temp, "ab") as f:
                    for chunk in response.iter_content(chunk_size=512 * 1024):
                        if cancel_flags.get(model_id):
                            models_db[model_id]["downloading"] = False
                            models_db[model_id]["progress"] = 0.0
                            broadcast_from_thread({
                                "type": "download_progress",
                                "model_id": model_id,
                                "progress": 0.0,
                                "speed_mbps": 0.0,
                                "eta_seconds": 0,
                                "downloading": False,
                                "downloaded": False,
                            })
                            return

                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)

                            now = time.time()
                            elapsed = now - last_time
                            if elapsed >= 0.3:
                                bytes_delta = downloaded - last_bytes
                                speed_bps = bytes_delta / elapsed if elapsed > 0 else 0
                                speed_mbps = speed_bps / (1024 * 1024)
                                file_progress = min(downloaded / total_bytes, 1.0)
                                overall = ((file_idx + file_progress) / total_files) * 100.0
                                eta = int((total_bytes - downloaded) / speed_bps) if speed_bps > 0 else 0

                                models_db[model_id]["progress"] = round(overall, 1)
                                models_db[model_id]["speed_mbps"] = round(speed_mbps, 1)
                                models_db[model_id]["eta_seconds"] = eta

                                broadcast_from_thread({
                                    "type": "download_progress",
                                    "model_id": model_id,
                                    "progress": round(overall, 1),
                                    "speed_mbps": round(speed_mbps, 1),
                                    "eta_seconds": eta,
                                    "downloading": True,
                                    "downloaded": False,
                                })

                                last_time = now
                                last_bytes = downloaded

                dest_path_temp.rename(dest_path)
                print(f"[NeuralCut] {filename} done", flush=True)

            except Exception as e:
                print(f"[NeuralCut] Download error: {e}", flush=True)
                models_db[model_id]["downloading"] = False
                models_db[model_id]["progress"] = 0.0
                broadcast_from_thread({
                    "type": "download_progress",
                    "model_id": model_id,
                    "progress": 0.0,
                    "speed_mbps": 0.0,
                    "eta_seconds": 0,
                    "downloading": False,
                    "downloaded": False,
                })
                return

        # All files done
        models_db[model_id]["downloading"] = False
        models_db[model_id]["downloaded"] = True
        models_db[model_id]["progress"] = 100.0
        models_db[model_id]["speed_mbps"] = 0.0
        models_db[model_id]["eta_seconds"] = 0
        print(f"[NeuralCut] Model {model_id} fully downloaded", flush=True)

        broadcast_from_thread({
            "type": "download_progress",
            "model_id": model_id,
            "progress": 100.0,
            "speed_mbps": 0.0,
            "eta_seconds": 0,
            "downloading": False,
            "downloaded": True,
        })

    except Exception as e:
        print(f"[NeuralCut] Download failed: {e}", flush=True)
        models_db[model_id]["downloading"] = False
        models_db[model_id]["progress"] = 0.0

# ── Generation (simulated — real inference next) ──────────────────────────────

async def run_generation(job_id: str, model_id: str, prompt: str, negative_prompt: str):
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _generate_sync, job_id, model_id, prompt, negative_prompt)

def _generate_sync(job_id: str, model_id: str, prompt: str, negative_prompt: str):
    import torch
    from diffusers import LTXPipeline
    from diffusers.utils import export_to_video

    # Map model IDs to their diffusers repo
    DIFFUSERS_REPOS = {
        "ltx-video-lite": "Lightricks/LTX-Video-0.9.1",
        "ltx-video-standard": "Lightricks/LTX-Video-0.9.5",
        "ltx-video-pro": "Lightricks/LTX-Video",
        "ltx-video-ultra": "Lightricks/LTX-Video",
    }

    repo_id = DIFFUSERS_REPOS.get(model_id, "Lightricks/LTX-Video-0.9.1")

    broadcast_from_thread({"type": "job_status", "job_id": job_id, "status": "loading_model", "progress": 0.0, "eta": 30, "outputPath": None, "error": None})

    try:
        pipe = LTXPipeline.from_pretrained(
            repo_id,
            torch_dtype=torch.bfloat16,
        )
        pipe.enable_model_cpu_offload()

        broadcast_from_thread({"type": "job_status", "job_id": job_id, "status": "generating", "progress": 10.0, "eta": 60, "outputPath": None, "error": None})

        def step_callback(pipe, step, timestep, kwargs):
            progress = 10 + (step / 25) * 85
            broadcast_from_thread({"type": "job_status", "job_id": job_id, "status": "generating", "progress": round(progress, 1), "eta": int((25 - step) * 2), "outputPath": None, "error": None})
            return kwargs

        video = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt or "worst quality, blurry, low resolution",
            num_frames=25,
            width=512,
            height=320,
            num_inference_steps=25,
            guidance_scale=3.0,
            callback_on_step_end=step_callback,
        ).frames[0]

        output_path = OUTPUT_DIR / f"video_{job_id}.mp4"
        export_to_video(video, str(output_path), fps=8)

        broadcast_from_thread({"type": "job_status", "job_id": job_id, "status": "done", "progress": 100.0, "eta": 0, "outputPath": str(output_path), "error": None})
        print(f"[NeuralCut] Generation done: {output_path}", flush=True)

    except Exception as e:
        print(f"[NeuralCut] Generation error: {e}", flush=True)
        broadcast_from_thread({"type": "job_status", "job_id": job_id, "status": "error", "progress": 0.0, "eta": 0, "outputPath": None, "error": str(e)})

        
# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=StatusResponse)
def health():
    return {
        "running": True,
        "version": "1.0.0",
        "comfyui_ready": True,
        "python_version": sys.version,
    }

@app.get("/gpu/stats")
def gpu_stats():
    try:
        result = subprocess.run(
            ["nvidia-smi", 
             "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            parts = [p.strip() for p in result.stdout.strip().split(",")]
            return {
                "utilization": int(parts[0]) if len(parts) > 0 else 0,
                "vram_used_mb": int(parts[1]) if len(parts) > 1 else 0,
                "vram_total_mb": int(parts[2]) if len(parts) > 2 else 0,
                "temperature": int(parts[3]) if len(parts) > 3 else 0,
                "power_draw": float(parts[4]) if len(parts) > 4 else 0,
            }
    except Exception as e:
        return {"error": str(e)}
    
@app.get("/gpu")
def gpu_info():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            parts = [p.strip() for p in result.stdout.strip().split(",")]
            return {
                "detected": True,
                "name": parts[0] if len(parts) > 0 else "Unknown",
                "vram_mb": int(parts[1]) if len(parts) > 1 else 0,
                "vram_gb": round(int(parts[1]) / 1024) if len(parts) > 1 else 0,
                "driver": parts[2] if len(parts) > 2 else "Unknown",
                "temperature": int(parts[3]) if len(parts) > 3 else 0,
            }
    except Exception as e:
        return {"detected": False, "error": str(e)}

@app.get("/models")
def get_models():
    return models_db

@app.post("/models/download/{model_id}")
def start_download(model_id: str):
    if model_id not in models_db:
        return {"status": "error", "message": "Model not found"}

    model = models_db[model_id]
    if model["downloaded"]:
        return {"status": "success", "message": "Model already downloaded"}
    if model["downloading"]:
        return {"status": "success", "message": "Already downloading"}

    models_db[model_id]["downloading"] = True
    models_db[model_id]["progress"] = 0.0

    thread = threading.Thread(
        target=real_model_download,
        args=(model_id, None),
        daemon=True,
    )
    thread.start()

    return {"status": "success", "message": f"Started download for {model_id}"}

@app.get("/models/download/{model_id}/progress")
async def download_progress(model_id: str):
    if model_id not in models_db:
        return {"status": "error", "message": "Model not found"}

    async def event_generator():
        while True:
            model = models_db[model_id]
            data = {
                "progress": model["progress"],
                "downloading": model["downloading"],
                "downloaded": model["downloaded"],
                "speed_mbps": model.get("speed_mbps", 0.0),
                "eta_seconds": model.get("eta_seconds", 0),
            }
            yield f"data: {json.dumps(data)}\n\n"
            if not model["downloading"] or model["downloaded"]:
                break
            await asyncio.sleep(0.3)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.delete("/models/{model_id}")
def delete_model(model_id: str):
    if model_id not in models_db:
        return {"status": "error", "message": "Model not found"}

    cancel_flags[model_id] = True

    model_dir = MODELS_DIR / model_id
    if model_dir.exists():
        import shutil
        shutil.rmtree(model_dir)

    models_db[model_id] = {
        "downloaded": False,
        "downloading": False,
        "progress": 0.0,
        "speed_mbps": 0.0,
        "eta_seconds": 0,
    }
    return {"status": "success", "message": f"Model {model_id} deleted"}

@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    model = models_db.get(req.model_id, {})
    if not model.get("downloaded"):
        return GenerateResponse(
            job_id="",
            status="error",
            message=f"Model {req.model_id} is not downloaded yet",
        )

    job_id = str(uuid.uuid4())[:8]
    background_tasks.add_task(run_generation, job_id, req.model_id, req.prompt, req.negative_prompt)
    return GenerateResponse(
        job_id=job_id,
        status="queued",
        message=f"Job {job_id} queued",
    )

@app.post("/license/validate")
def validate_license(req: LicenseRequest):
    if not req.key.strip():
        return {
            "valid": False,
            "tier": "free",
            "message": "License key cannot be empty",
            "features": ["Basic generation", "512px max", "Watermark"],
        }
    # TODO: replace with real Lemon Squeezy API call
    return {
        "valid": True,
        "tier": "pro",
        "expires_at": "2027-01-01",
        "features": ["Unlimited generation", "HD output", "No watermark", "Priority support", "All model tiers"],
    }

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    global main_event_loop
    main_event_loop = asyncio.get_running_loop()
     # Set HF token for faster downloads if available
    hf_token = os.environ.get("HF_TOKEN", "")
    if hf_token:
        from huggingface_hub import login
        login(token=hf_token)
        print(f"[NeuralCut] HuggingFace authenticated", flush=True)
    else:
        print(f"[NeuralCut] No HF_TOKEN set — downloads may be slower", flush=True)

    print(f"[NeuralCut] Event loop captured", flush=True)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("SIDECAR_PORT", 8188))
    print(f"[NeuralCut Sidecar] Starting on port {port}", flush=True)
    print(f"[NeuralCut] Models dir: {MODELS_DIR}", flush=True)
    print(f"[NeuralCut] Output dir: {OUTPUT_DIR}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")