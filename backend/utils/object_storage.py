"""Thin wrapper around Emergent Object Storage.

Session-scoped `storage_key` cached at module level — init once at startup
and reused for every put/get. See integration playbook for status-code
semantics; we surface storage errors as HTTPExceptions so routers can bubble
them to the client without extra try/except at every call site.
"""
import logging
import os

import requests
from fastapi import HTTPException

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "kora-os"

_storage_key: str | None = None


def init_storage(force: bool = False) -> str | None:
    """Mint a session-scoped storage key. Call once at startup.

    Returns None silently on failure so startup doesn't crash — individual
    uploads will fail with a clear 503 later and the UI can degrade.
    """
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        logger.warning("object_storage: EMERGENT_LLM_KEY not set — uploads disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        logger.info("object_storage: initialized")
        return _storage_key
    except Exception as e:
        logger.error(f"object_storage: init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Object storage not available")
    try:
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
        if resp.status_code == 404:
            # Dead session key: force refresh and retry once.
            new_key = init_storage(force=True)
            if new_key:
                resp = requests.put(
                    f"{STORAGE_URL}/objects/{path}",
                    headers={"X-Storage-Key": new_key, "Content-Type": content_type},
                    data=data,
                    timeout=120,
                )
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}") from e


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Object storage not available")
    try:
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
        if resp.status_code == 404:
            new_key = init_storage(force=True)
            if new_key:
                resp = requests.get(
                    f"{STORAGE_URL}/objects/{path}",
                    headers={"X-Storage-Key": new_key},
                    timeout=60,
                )
        resp.raise_for_status()
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    except requests.HTTPError as e:
        raise HTTPException(status_code=404, detail=f"File not found: {e}") from e


MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
    "pdf": "application/pdf",
    "doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "txt": "text/plain", "csv": "text/csv",
    "json": "application/json",
}


def guess_mime(filename: str) -> str:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    return MIME_TYPES.get(ext, "application/octet-stream")
