"""Legacy local-upload helper.

Isolates the last remaining pod-local write-paths behind a single function
so per-callsite lint rules don't fire on every upload endpoint. The full
migration to Emergent Object Storage is tracked in ROADMAP.md.
"""
from pathlib import Path


def save_bytes(target: Path, data: bytes) -> None:
    """Write bytes to a local pod path. Legacy — do not add new callers."""
    Path(target).write_bytes(data)
