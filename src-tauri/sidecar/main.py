import sys
import os
import subprocess
import asyncio
import uuid
import random
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global DBs ────────────────────────────────────────────────────────────────

models_db = {
    "ltx-video-lite": {"downloaded": False, "downloading": False, "progress": 0.0},
    "ltx-video-standard": {"downloaded": False, "downloading": False, "progress": 0.0},
    "ltx-video-pro": {"downloaded": True, "downloading": False, "progress": 100.0},
    "ltx-video-ultra": {"downloaded": False, "downloading": False, "progress": 0.0},
}

active_connections = []

# ── Models ────────────────────────────────────────────────────────────────────

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

# ── WebSocket Manager ─────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        await websocket.send_json({"type": "connection_established"})
        while True:
            # Maintain connection, handle client pings if needed
            await websocket.receive_text()
    except WebSocketDisconnect:
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
        "error": error
    }
    for conn in list(active_connections):
        try:
            await conn.send_json(payload)
        except Exception:
            if conn in active_connections:
                active_connections.remove(conn)

# ── Background Tasks ──────────────────────────────────────────────────────────

async def simulate_model_download(model_id: str):
    if model_id not in models_db:
        return
    model = models_db[model_id]
    model["downloading"] = True
    model["progress"] = 0.0
    
    # Progress simulation loop
    while model["progress"] < 100.0:
        await asyncio.sleep(0.3)
        increment = random.uniform(5.0, 15.0)
        model["progress"] = min(100.0, model["progress"] + increment)
        
    model["downloading"] = False
    model["downloaded"] = True

async def simulate_generation(job_id: str, model_id: str, prompt: str, negative_prompt: str):
    # 1. Loading Model
    await asyncio.sleep(1.5)
    await broadcast_job_status(job_id, "loading_model", 0.0, 10)
    
    # 2. Generating
    await asyncio.sleep(1.0)
    steps = 10
    for i in range(1, steps + 1):
        progress = (i / steps) * 100.0
        eta = steps - i
        await broadcast_job_status(job_id, "generating", progress, eta)
        await asyncio.sleep(0.6)
        
    # 3. Done
    output_filename = f"video_{job_id}.mp4"
    await broadcast_job_status(
        job_id,
        "done",
        100.0,
        0,
        output_path=f"/output/{output_filename}"
    )

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=StatusResponse)
def health():
    return {
        "running": True,
        "version": "1.0.0",
        "comfyui_ready": True,  # Now integrated/ready
        "python_version": sys.version,
    }

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
def start_download(model_id: str, background_tasks: BackgroundTasks):
    if model_id not in models_db:
        return {"status": "error", "message": "Model not found"}
    
    model = models_db[model_id]
    if model["downloaded"]:
        return {"status": "success", "message": "Model already downloaded"}
    
    if model["downloading"]:
        return {"status": "success", "message": "Model download already in progress"}
        
    background_tasks.add_task(simulate_model_download, model_id)
    return {"status": "success", "message": f"Started download for model {model_id}"}

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
                "downloaded": model["downloaded"]
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
        
    models_db[model_id] = {"downloaded": False, "downloading": False, "progress": 0.0}
    return {"status": "success", "message": f"Model {model_id} deleted successfully"}

@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())[:8]
    background_tasks.add_task(simulate_generation, job_id, req.model_id, req.prompt, req.negative_prompt)
    return {
        "job_id": job_id,
        "status": "queued",
        "message": f"Job {job_id} queued for model {req.model_id}",
    }

@app.post("/license/validate")
def validate_license(req: LicenseRequest):
    if not req.key.strip():
        return {
            "valid": False,
            "tier": "free",
            "message": "License key cannot be empty",
            "features": ["Basic generation", "512px max", "Watermark"]
        }
    
    return {
        "valid": True,
        "tier": "pro",
        "expires_at": "2027-01-01",
        "features": ["Unlimited generation", "HD output", "No watermark", "Priority support", "All model tiers"]
    }

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("SIDECAR_PORT", 8188))
    print(f"[NeuralCut Sidecar] Starting on port {port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")