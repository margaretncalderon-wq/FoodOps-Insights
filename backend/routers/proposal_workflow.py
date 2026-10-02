"""Tenant-scoped configuration for the proposal workflow (stage/status labels
+ palettes). Phase B3 of the approval system work.

Storage shape (company_settings doc):

  {
    "proposal_approval": {"require_approval": bool},         # existed before
    "proposal_workflow": {                                     # new (Sep 2026)
        "stage_config": {
            "Inquiry Received": {
                "label_en": "Inquiry Received",
                "label_es": "Consulta Recibida",
                "palette":  "slate"
            },
            ...
        },
        "commercial_status_config": {
            "Draft":    {"label_en": "Draft", "label_es": "Borrador", "palette": "slate"},
            "Sent":     {"label_en": "Sent",  "label_es": "Enviada",  "palette": "cyan"},
            ...
        }
    }
  }

Stage keys / status keys are internal and immutable (per the user's choice
c2 — "nombre visible + color, interno fijo"). Only `label_en`, `label_es`
and `palette` are editable.
"""
import logging
from typing import Any, Dict, List

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from config import db
from dependencies import get_current_user
from models.auth import User
from routers.proposals import proposals_router  # we re-use the same prefix

logger = logging.getLogger(__name__)


# Immutable stage keys — must match ENGAGEMENT_STAGES in routers/events.py.
ENGAGEMENT_STAGE_KEYS: List[str] = [
    "Inquiry Received", "Context Captured", "Scope Drafted",
    "Definition In Review", "Sent to Client", "Confirmed by Client",
    "Committed", "Archived",
]

# Immutable commercial status keys (per user's choice d1 — only 4 fixed).
COMMERCIAL_STATUS_KEYS: List[str] = ["Draft", "Sent", "Accepted", "Rejected"]

VALID_PALETTES = {
    "slate", "gray", "zinc", "neutral", "stone",
    "red", "orange", "amber", "yellow", "lime", "green", "emerald",
    "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
    "fuchsia", "pink", "rose",
}

DEFAULT_STAGE_CONFIG: Dict[str, Dict[str, str]] = {
    "Inquiry Received":     {"label_en": "Inquiry Received",     "label_es": "Consulta Recibida",     "palette": "slate"},
    "Context Captured":     {"label_en": "Context Captured",     "label_es": "Contexto Capturado",    "palette": "blue"},
    "Scope Drafted":        {"label_en": "Scope Drafted",        "label_es": "Alcance Definido",      "palette": "amber"},
    "Definition In Review": {"label_en": "Definition In Review", "label_es": "Definición en Revisión", "palette": "orange"},
    "Sent to Client":       {"label_en": "Sent to Client",       "label_es": "Enviada al Cliente",    "palette": "cyan"},
    "Confirmed by Client":  {"label_en": "Confirmed by Client",  "label_es": "Confirmada por Cliente", "palette": "violet"},
    "Committed":            {"label_en": "Committed",            "label_es": "Comprometido",          "palette": "emerald"},
    "Archived":             {"label_en": "Archived",             "label_es": "Perdida",               "palette": "gray"},
}

DEFAULT_STATUS_CONFIG: Dict[str, Dict[str, str]] = {
    "Draft":    {"label_en": "Draft",    "label_es": "Borrador",  "palette": "slate"},
    "Sent":     {"label_en": "Sent",     "label_es": "Enviada",   "palette": "cyan"},
    "Accepted": {"label_en": "Accepted", "label_es": "Aceptada",  "palette": "emerald"},
    "Rejected": {"label_en": "Rejected", "label_es": "Rechazada", "palette": "rose"},
}


class StageEntry(BaseModel):
    label_en: str
    label_es: str
    palette: str


class WorkflowConfigUpdate(BaseModel):
    stage_config: Dict[str, StageEntry] | None = None
    commercial_status_config: Dict[str, StageEntry] | None = None


def _validate_palette(palette: str) -> str:
    if palette not in VALID_PALETTES:
        raise HTTPException(status_code=400, detail=f"Unknown palette '{palette}'. Allowed: {sorted(VALID_PALETTES)}")
    return palette


def _merge_defaults(stored: Dict[str, Any] | None, defaults: Dict[str, Dict[str, str]], valid_keys: List[str]) -> Dict[str, Dict[str, str]]:
    """Return defaults overlaid with any stored overrides. Only known keys
    survive — ignores legacy or renamed stages so a stale DB value doesn't
    render an orphan row in the Settings UI."""
    out: Dict[str, Dict[str, str]] = {}
    for k in valid_keys:
        base = defaults[k].copy()
        if stored and k in stored and isinstance(stored[k], dict):
            for field in ("label_en", "label_es", "palette"):
                if stored[k].get(field):
                    base[field] = stored[k][field]
        out[k] = base
    return out


@proposals_router.get("/settings/workflow")
async def get_workflow(user: User = Depends(get_current_user)):
    doc = await db.company_settings.find_one(
        {"company_id": user.company_id}, {"_id": 0, "proposal_workflow": 1, "proposal_approval": 1}
    )
    stored = (doc or {}).get("proposal_workflow") or {}
    return {
        "stage_config": _merge_defaults(stored.get("stage_config"), DEFAULT_STAGE_CONFIG, ENGAGEMENT_STAGE_KEYS),
        "commercial_status_config": _merge_defaults(
            stored.get("commercial_status_config"), DEFAULT_STATUS_CONFIG, COMMERCIAL_STATUS_KEYS,
        ),
        "require_approval": bool(((doc or {}).get("proposal_approval") or {}).get("require_approval", False)),
    }


@proposals_router.put("/settings/workflow")
async def update_workflow(payload: WorkflowConfigUpdate, user: User = Depends(get_current_user)):
    update_set: Dict[str, Any] = {}

    if payload.stage_config is not None:
        for k, entry in payload.stage_config.items():
            if k not in ENGAGEMENT_STAGE_KEYS:
                raise HTTPException(status_code=400, detail=f"Unknown stage '{k}'")
            _validate_palette(entry.palette)
            update_set[f"proposal_workflow.stage_config.{k}"] = entry.model_dump()

    if payload.commercial_status_config is not None:
        for k, entry in payload.commercial_status_config.items():
            if k not in COMMERCIAL_STATUS_KEYS:
                raise HTTPException(status_code=400, detail=f"Unknown status '{k}'")
            _validate_palette(entry.palette)
            update_set[f"proposal_workflow.commercial_status_config.{k}"] = entry.model_dump()

    if not update_set:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.company_settings.update_one(
        {"company_id": user.company_id}, {"$set": update_set}, upsert=True,
    )
    logger.info(f"[proposal_workflow] updated keys={list(update_set.keys())} for company={user.company_id}")
    return await get_workflow(user)
