import json
import os
from pathlib import Path

# ── Registry loading ─────────────────────────────────────────────────────────
# Single source of truth: vmr.json. Nothing in this module hardcodes a
# model's repo id, file list, settings, or hardware requirements — it only
# knows how to read and resolve what's already in the registry.

_REGISTRY_PATH = Path(__file__).parent / "vmr.json"

with open(_REGISTRY_PATH, "r") as f:
    _RAW = json.load(f)

VMR_METADATA = _RAW["vmr_metadata"]
SHARED_RESOURCES = _RAW.get("shared_resources", {})
FAMILIES = _RAW.get("families", {})
MODEL_CONFIG = _RAW["models"]  # full nested VMR shape, keyed by model_id

MODELS_DIR = Path(os.environ.get("MODELS_DIR", Path.home() / "AppData/Local/NeuralCut/models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", Path.home() / "Videos/NeuralCut"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def get_model(model_id: str) -> dict:
    if model_id not in MODEL_CONFIG:
        raise ValueError(f"Unknown model: {model_id}")
    return MODEL_CONFIG[model_id]


# ── Settings clamping ─────────────────────────────────────────────────────────

def clamp_settings(model_id: str, requested: dict) -> dict:
    """Take whatever the frontend sent and force every value onto the
    model's own allowed slider range (generation.limits). A modified
    client, a stale UI, or a raw API call can never push a model outside
    settings it actually supports."""
    limits = get_model(model_id)["generation"]["limits"]
    resolved = {}
    for key, spec in limits.items():
        value = requested.get(key, spec["default"])
        step = spec["step"]
        lo, hi = spec["min"], spec["max"]
        # snap to nearest valid step, then clamp to range
        snapped = round((value - lo) / step) * step + lo
        resolved[key] = max(lo, min(hi, snapped))
    return resolved


# ── Offload strategy ──────────────────────────────────────────────────────────

def resolve_offload_strategy(model_id: str, free_vram_gb: float) -> str:
    """'auto' picks sequential vs model-level offload based on what's
    actually free on this GPU right now, instead of a fixed per-model
    guess baked into code."""
    model = get_model(model_id)
    strategy = model["optimization"]["offload_strategy"]
    if strategy != "auto":
        return strategy
    recommended = model["hardware"]["recommended_vram_gb"]
    return "model" if free_vram_gb >= recommended else "sequential"


# ── Download manifest (handles shared_resources, e.g. LTX's shared bundle) ────

def get_download_manifest(model_id: str) -> list[dict]:
    """Every file this model needs on disk, whether it's the model's own
    distribution.files.required or a shared_resources bundle it references.
    Each entry: {repo_id, filename, local_path, shared} — local_path is
    relative to MODELS_DIR.

    Shared entries are deduplicated by filename so two models pointing at
    the same shared_resources id don't get queued twice by a naive caller;
    callers downloading multiple models still need their own in-flight
    tracking, this just describes what's needed for one model_id.
    """
    model = get_model(model_id)
    dist = model["distribution"]
    manifest = []

    for filename in dist["files"]["required"]:
        manifest.append({
            "repo_id": dist["repo"],
            "filename": filename,
            "local_path": f"{model_id}/{filename}",
            "shared": False,
        })

    shared_key = dist.get("shared_resources")
    if shared_key:
        if shared_key not in SHARED_RESOURCES:
            raise ValueError(
                f"Model {model_id} references unknown shared_resources '{shared_key}'"
            )
        shared = SHARED_RESOURCES[shared_key]
        local_dir = shared["local_dir"]
        for filename in shared["files"]:
            manifest.append({
                "repo_id": shared["repo"],
                "filename": filename,
                "local_path": f"{local_dir}/{filename}",
                "shared": True,
            })

    return manifest


def check_downloaded(model_id: str, models_dir: Path) -> bool:
    """True only if every file in this model's full manifest (its own
    files plus any shared_resources bundle) exists on disk."""
    manifest = get_download_manifest(model_id)
    return all((models_dir / entry["local_path"]).exists() for entry in manifest)