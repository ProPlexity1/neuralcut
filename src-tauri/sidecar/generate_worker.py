import sys, os, json, traceback, inspect, diffusers, torch
# Force UTF-8 on stdout/stderr so Windows CP1252 never crashes on Unicode in debug prints
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).parent))
from model_registry import MODEL_CONFIG, SHARED_RESOURCES, MODELS_DIR, OUTPUT_DIR, clamp_settings, resolve_offload_strategy

print("WORKER_STARTED_DEBUG_TEST_123", flush=True)

def emit(payload: dict):
    print(json.dumps(payload), flush=True)


def get_free_vram_gb() -> float:
    try:
        import torch
        free, total = torch.cuda.mem_get_info()
        return free / (1024 ** 3)
    except Exception:
        return 0.0


def validate_output_frames(frames: Any, model_id: str, model_cfg: dict, expected_count: int) -> tuple[bool, str]:
    """Validate that generated frames are usable before export."""
    import torch
    import numpy as np
    from PIL import Image
    
    try:
        # Check frame count
        actual_count = len(frames) if isinstance(frames, (list, tuple)) else 1
        if actual_count == 0:
            return False, f"Generated 0 frames (expected {expected_count})"
        
        if actual_count < expected_count * 0.8:  # Allow 20% variance
            return False, f"Generated {actual_count} frames, expected ~{expected_count} (possible inference failure)"
        
        # Check frame format
        first_frame = frames[0] if isinstance(frames, (list, tuple)) else frames
        
        if isinstance(first_frame, Image.Image):
            w, h = first_frame.size
            if w < 256 or h < 256:
                return False, f"Frame too small: {w}x{h} (likely generation failed)"
            print(f"[DEBUG] Output is PIL images: {actual_count}x{w}x{h}", flush=True)
            return True, f"Valid: {actual_count} PIL frames {w}x{h}"

        elif isinstance(first_frame, np.ndarray):
            shape = first_frame.shape
            print(f"[DEBUG] Output is numpy array: shape={shape}, dtype={first_frame.dtype}", flush=True)
            if first_frame.ndim < 2:
                return False, f"Numpy frame has invalid shape: {shape}"
            h, w = first_frame.shape[:2]
            if w < 256 or h < 256:
                return False, f"Frame too small: {w}x{h} (likely generation failed)"
            min_val, max_val = float(np.min(first_frame)), float(np.max(first_frame))
            if max_val <= min_val:
                return False, f"Numpy frame is flat: range=[{min_val:.3f}, {max_val:.3f}]"
            return True, f"Valid: {actual_count} numpy frames {w}x{h}, range=[{min_val:.3f}, {max_val:.3f}]"
        
        elif isinstance(first_frame, torch.Tensor):
            if model_cfg.get("identity", {}).get("family") == "ltx-video":
                return False, (
                    "LTX returned tensor/latent frames instead of decoded PIL frames. "
                    "Check that output_type='pil' is accepted by the installed Diffusers LTXPipeline."
                )

            # Tensor: check shape and values
            shape = first_frame.shape
            print(f"[DEBUG] Output is Tensor: shape={shape}, dtype={first_frame.dtype}", flush=True)
            
            # Check for NaN/Inf
            if torch.isnan(first_frame).any() or torch.isinf(first_frame).any():
                return False, f"Frame contains NaN/Inf values (generation produced garbage)"
            
            # Check value range (should be [0, 1] or [0, 255] depending on model)
            min_val, max_val = first_frame.min().item(), first_frame.max().item()
            mean_val = first_frame.mean().item()
            std_val = first_frame.std().item()
            print(f"[DEBUG] Tensor stats: min={min_val:.3f}, max={max_val:.3f}, mean={mean_val:.3f}, std={std_val:.3f}", flush=True)
            
            if max_val < 0.01:  # Likely all black/empty
                return False, f"Tensor values suspiciously low [{min_val:.3f}, {max_val:.3f}] — likely blank output"
            
            # Check for high noise (std should be reasonable, not chaotic)
            if std_val > 0.4 and max_val < 0.5:
                return False, f"Frame has high noise std={std_val:.3f} with low max={max_val:.3f} — likely dtype/decoding error"
            
            return True, f"Valid: {actual_count} tensors, shape={shape}, range=[{min_val:.3f}, {max_val:.3f}], std={std_val:.3f}"
        
        else:
            return False, f"Unknown frame format: {type(first_frame)}"
    
    except Exception as e:
        return False, f"Validation error: {str(e)}"


def export_frames_to_video(frames: Any, output_path: str, fps: int, model_id: str, model_cfg: dict):
    """Model-aware frame export."""
    from diffusers.utils import export_to_video
    from PIL import Image
    import torch
    import numpy as np
    
    print(f"[DEBUG] export_frames_to_video: model={model_id}, fps={fps}", flush=True)
    
    # Convert tensors to PIL if needed
    if len(frames) > 0 and isinstance(frames[0], torch.Tensor):
        print(f"[DEBUG] Converting {len(frames)} tensors to PIL images...", flush=True)
        pil_frames = []
        
        for i, frame in enumerate(frames):
            # Ensure [0, 1] range
            frame_np = frame.cpu().numpy()
            
            if frame_np.dtype == np.float32 or frame_np.dtype == np.float64:
                # Likely [0, 1] or [-1, 1]
                if frame_np.min() < 0:
                    frame_np = (frame_np + 1) / 2  # [-1, 1] -> [0, 1]
                
                if frame_np.max() > 1.0:
                    frame_np = frame_np / frame_np.max()  # Scale to [0, 1]
                
                frame_np = (frame_np * 255).astype(np.uint8)
            
            # Handle channel order (CHW vs HWC)
            if frame_np.ndim == 3:
                if frame_np.shape[0] == 3:  # CHW
                    frame_np = np.transpose(frame_np, (1, 2, 0))
                elif frame_np.shape[0] not in (3, 4):
                    raise ValueError(f"Unexpected channel dimension: {frame_np.shape[0]}")
            
            pil_frames.append(Image.fromarray(frame_np))
        
        print(f"[DEBUG] Converted to {len(pil_frames)} PIL images", flush=True)
        frames = pil_frames
    
    # Now export
    export_to_video(frames, str(output_path), fps=fps)
    print(f"[DEBUG] Exported to {output_path}", flush=True)


def main():
    params_path = Path(sys.argv[1])
    with open(params_path, "r") as f:
        params = json.load(f)

    job_id = params["job_id"]
    model_id = params["model_id"]
    prompt = params["prompt"]
    negative_prompt = params.get("negative_prompt", "")
    model_cfg = MODEL_CONFIG[model_id]

    settings = clamp_settings(model_id, params)
    steps, cfg_scale = settings["steps"], settings["cfg_scale"]
    width, height = settings["width"], settings["height"]
    num_frames, fps = settings["num_frames"], settings["fps"]

    emit({"type": "job_status", "job_id": job_id, "status": "loading_model",
          "progress": 0.0, "eta": 30, "outputPath": None, "error": None})

    try:
        import torch
        import diffusers
        from diffusers.utils import export_to_video

        runtime = model_cfg["runtime"]
        dtype = getattr(torch, runtime["dtype"])
        pipeline_cls = getattr(diffusers, runtime["pipeline_class"])

        if runtime["load_mode"] == "from_single_file":
            transformer_cls = getattr(diffusers, runtime["transformer_class"])
            print(f"[DEBUG] Loading transformer {runtime['transformer_class']} with dtype={runtime['dtype']}", flush=True)
            transformer = transformer_cls.from_single_file(
                str(MODELS_DIR / model_id / runtime["transformer_file"]),
                torch_dtype=dtype,
                local_files_only=True,
            )
            print(f"[DEBUG] Transformer loaded: dtype={transformer.dtype}", flush=True)
            dist = model_cfg["distribution"]
            shared_key = dist.get("shared_resources")
            if not shared_key:
                raise ValueError(f"Model {model_id} has load_mode 'from_single_file' but no shared_resources defined")
            shared = SHARED_RESOURCES[shared_key]
            shared_dir = shared["local_dir"]
            pipe = pipeline_cls.from_pretrained(
                str(MODELS_DIR / shared_dir),
                transformer=transformer,
                torch_dtype=dtype,
                local_files_only=True,
            )
        else:
            pipe = pipeline_cls.from_pretrained(
                str(MODELS_DIR / model_id), torch_dtype=dtype, local_files_only=True,
            )
        print("=" * 80, flush=True)
        print("Diffusers:", diffusers.__version__, flush=True)
        print("Pipeline:", type(pipe).__name__, flush=True)
        print("Signature:", inspect.signature(pipe.__call__), flush=True)
        print("=" * 80, flush=True)
        # Check VRAM BEFORE moving to GPU
        free_vram = get_free_vram_gb()
        recommended_vram = model_cfg.get("hardware", {}).get("recommended_vram_gb", 12)
        
        offloading_enabled = False
        
        if free_vram < recommended_vram:
            offloading_enabled = True
            print(f"[WARNING] GPU VRAM insufficient: {free_vram:.1f}GB available < {recommended_vram}GB required — enabling CPU offloading", flush=True)
            
            # Enable offloading (pipeline stays on CPU, offloading handles GPU placement)
            if hasattr(pipe, "enable_sequential_cpu_offload"):
                pipe.enable_sequential_cpu_offload()
                print(f"[INFO] Sequential CPU offloading enabled on {model_id}", flush=True)
            elif hasattr(pipe, "enable_model_cpu_offload"):
                pipe.enable_model_cpu_offload()
                print(f"[INFO] Model CPU offloading enabled on {model_id}", flush=True)
            
            emit({"type": "job_status", "job_id": job_id, "status": "loading_model",
                  "progress": 8.0, "eta": 50, "outputPath": None, 
                  "error": None})
        else:
            print(f"[INFO] GPU VRAM sufficient: {free_vram:.1f}GB available >= {recommended_vram}GB required — moving to GPU", flush=True)
            
            # Enough VRAM: move to GPU directly
            try:
                pipe = pipe.to("cuda")
                print(f"[INFO] {model_id} successfully moved to GPU", flush=True)
                emit({"type": "job_status", "job_id": job_id, "status": "loading_model",
                      "progress": 8.0, "eta": 25, "outputPath": None, 
                      "error": None})
            except torch.cuda.OutOfMemoryError as oom_err:
                print(f"[WARNING] OOM even with {free_vram:.1f}GB — enabling CPU offloading as fallback", flush=True)
                
                # Clear cache and enable offloading
                torch.cuda.empty_cache()
                if hasattr(pipe, "enable_sequential_cpu_offload"):
                    pipe.enable_sequential_cpu_offload()
                    print(f"[INFO] Sequential CPU offloading enabled on {model_id} (fallback)", flush=True)
                elif hasattr(pipe, "enable_model_cpu_offload"):
                    pipe.enable_model_cpu_offload()
                    print(f"[INFO] Model CPU offloading enabled on {model_id} (fallback)", flush=True)
                
                offloading_enabled = True
                emit({"type": "job_status", "job_id": job_id, "status": "loading_model",
                      "progress": 8.0, "eta": 50, "outputPath": None, 
                      "error": None})

        # DEBUG: Check component dtypes
        print(f"[DEBUG] Pipeline component dtypes:", flush=True)
        if hasattr(pipe, "transformer"):
            print(f"  transformer: {pipe.transformer.dtype}", flush=True)
        if hasattr(pipe, "vae"):
            print(f"  vae: {pipe.vae.dtype}", flush=True)
        if hasattr(pipe, "text_encoder"):
            print(f"  text_encoder: {pipe.text_encoder.dtype}", flush=True)

        # Apply optimizations
        opts = model_cfg.get("optimization", {})
        
        # Try pipeline-level tiling first (most models)
        if opts.get("vae_tiling"):
            if hasattr(pipe, "enable_vae_tiling"):
                pipe.enable_vae_tiling()
                print(f"[INFO] VAE tiling enabled (pipeline level)", flush=True)
            elif hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
                # Fallback: some models (CogVideoX) only expose it on pipe.vae
                pipe.vae.enable_tiling()
                print(f"[INFO] VAE tiling enabled (VAE level)", flush=True)
        
        if opts.get("vae_slicing"):
            if hasattr(pipe, "enable_vae_slicing"):
                pipe.enable_vae_slicing()
                print(f"[INFO] VAE slicing enabled (pipeline level)", flush=True)
            elif hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_slicing"):
                pipe.vae.enable_slicing()
                print(f"[INFO] VAE slicing enabled (VAE level)", flush=True)

        emit({"type": "job_status", "job_id": job_id, "status": "generating",
              "progress": 10.0, "eta": 60, "outputPath": None, "error": None})

        def step_callback(pipe, step, timestep, kwargs=None):
            progress = 10 + (step / steps) * 85
            emit({"type": "job_status", "job_id": job_id, "status": "generating",
                  "progress": round(progress, 1), "eta": int((steps - step) * 2),
                  "outputPath": None, "error": None})
            return kwargs if kwargs is not None else {}

        # Build pipeline kwargs from config
        generation_args = {
            "prompt": prompt,
            "negative_prompt": negative_prompt or "low quality, blurry, deformed, duplicate, unrealistic motion, jitter, flickering, bad anatomy, oversaturated, cartoon, CGI, artifacts",
            "num_inference_steps": steps,
            "guidance_scale": cfg_scale,
            "width": width,
            "height": height,
            "num_frames": num_frames,
            "callback_on_step_end": step_callback,
        }
        
        # LTXPipeline uses 'frame_rate' instead of 'fps' — remap before signature filtering
        pipe_signature = inspect.signature(pipe.__call__)
        if "frame_rate" in pipe_signature.parameters and "fps" not in pipe_signature.parameters:
            generation_args["frame_rate"] = fps
            print(f"[DEBUG] Remapped fps->frame_rate={fps} for {runtime['pipeline_class']}", flush=True)
        else:
            generation_args["fps"] = fps
        
        # Filter base kwargs to only those the pipeline's __call__ signature accepts
        pipe_kwargs = {
            key: value
            for key, value in generation_args.items()
            if key in pipe_signature.parameters
        }
        
        # Inject model-specific generation defaults (e.g. output_type and decode params for LTX).
        # Keep this generic: the worker only passes extra kwargs declared by the registry and
        # accepted by the active pipeline, so LTX fixes do not leak into other models.
        generation_defaults = model_cfg.get("generation", {}).get("defaults", {})
        base_generation_keys = {
            "steps",
            "cfg_scale",
            "width",
            "height",
            "num_frames",
            "fps",
        }
        accepts_var_kwargs = any(
            param.kind == inspect.Parameter.VAR_KEYWORD
            for param in pipe_signature.parameters.values()
        )
        injected = []
        skipped = []
        for key, value in generation_defaults.items():
            if key in base_generation_keys or key in pipe_kwargs:
                continue
            if key in pipe_signature.parameters or accepts_var_kwargs:
                pipe_kwargs[key] = value
                injected.append(f"{key}={value}")
            else:
                skipped.append(key)

        # Some older Diffusers LTX builds accepted decode kwargs through internal forwarding even
        # when inspect.signature did not expose them. Preserve that compatibility only for LTX.
        if runtime["pipeline_class"] == "LTXPipeline":
            for key in ("decode_timestep", "decode_noise_scale"):
                if key in generation_defaults and key not in pipe_kwargs:
                    pipe_kwargs[key] = generation_defaults[key]
                    injected.append(f"{key}={generation_defaults[key]}")
            if "output_type" not in pipe_kwargs:
                pipe_kwargs["output_type"] = "pil"
                injected.append("output_type=pil")

        if injected:
            print(f"[DEBUG] Injected config pipeline defaults: {', '.join(injected)}", flush=True)
        if skipped:
            print(f"[DEBUG] Skipped unsupported config defaults: {', '.join(skipped)}", flush=True)

        # DEBUG: Log what's being passed
        print(f"[DEBUG] Calling {runtime['pipeline_class']} with {len(pipe_kwargs)} kwargs...", flush=True)
        print(f"[DEBUG] Kwargs: {json.dumps({k: str(v)[:50] for k, v in pipe_kwargs.items()}, indent=2)}", flush=True)
        
        result = pipe(**pipe_kwargs)
        print(f"[DEBUG] Generation complete. Result type: {type(result)}", flush=True)
        
        # Extract frames — handle different return types
        if hasattr(result, 'frames'):
            video = result.frames[0] if isinstance(result.frames, list) else result.frames
        else:
            video = result
        
        print(f"[DEBUG] Extracted video: type={type(video)}, len={len(video) if hasattr(video, '__len__') else 'N/A'}", flush=True)
        
        # VALIDATE BEFORE EXPORT
        is_valid, validation_msg = validate_output_frames(video, model_id, model_cfg, num_frames)
        print(f"[INFO] Frame validation: {validation_msg}", flush=True)
        
        if not is_valid:
            raise RuntimeError(f"Generated frames failed validation: {validation_msg}")

        output_path = OUTPUT_DIR / f"video_{job_id}.mp4"
        export_frames_to_video(video, str(output_path), fps, model_id, model_cfg)

        emit({"type": "job_status", "job_id": job_id, "status": "done",
              "progress": 100.0, "eta": 0, "outputPath": str(output_path), "error": None})

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        emit({"type": "job_status", "job_id": job_id, "status": "error",
              "progress": 0.0, "eta": 0, "outputPath": None, "error": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
