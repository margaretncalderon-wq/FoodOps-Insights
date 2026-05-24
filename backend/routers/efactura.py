"""Phase 0 e-invoicing router.

Exposes:
  GET  /api/efactura/config           — current org config (any auth'd user can read)
  PUT  /api/efactura/config           — admin/owner updates fiscal settings
  POST /api/efactura/test             — placeholder, returns "not implemented"
  GET  /api/super-admin/companies/{cid}/efactura  — super-admin reads any tenant
  POST /api/super-admin/companies/{cid}/efactura/toggle — super-admin enables/disables module

No XML generation, signing, or webservice calls land here yet — that is
Phase 1+. This file only wires the config + feature flag so the UI can be
gated cleanly and we have a typed surface area to grow into.
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, UploadFile

from models.efactura import EInvoicingConfig, EInvoicingConfigUpdate, EInvoicingToggleRequest
from services.efactura.cert_vault import (
    now_iso,
    pack_certificate,
    parse_p12,
)


# Hard limit on cert payload size — DGII p12 files are typically <8KB.
MAX_CERT_BYTES = 256 * 1024
ALLOWED_ROLES = {"owner", "admin", "finance"}


def build_efactura_router(db, get_current_user, require_super_admin, User):
    """Factory keeps the router decoupled from server.py module globals."""
    router = APIRouter(prefix="/efactura", tags=["E-Invoicing"])
    super_router = APIRouter(prefix="/super-admin/companies", tags=["E-Invoicing · Super Admin"])

    DEFAULT_CONFIG = EInvoicingConfig().model_dump()

    async def _load(company_id: str) -> Dict[str, Any]:
        co = await db.companies.find_one(
            {"company_id": company_id},
            {"_id": 0, "industry_config": 1},
        )
        cfg = ((co or {}).get("industry_config") or {}).get("e_invoicing") or {}
        # Fill any missing keys with defaults so the UI doesn't have to guess.
        merged = {**DEFAULT_CONFIG, **cfg}
        return merged

    async def _save(company_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        current = await _load(company_id)
        merged = {**current, **patch, "updated_at": datetime.now(timezone.utc).isoformat()}
        # Validate the merged shape through the Pydantic model before persisting.
        validated = EInvoicingConfig(**merged).model_dump()
        await db.companies.update_one(
            {"company_id": company_id},
            {"$set": {"industry_config.e_invoicing": validated}},
            upsert=False,
        )
        return validated

    # ----- Org-scoped endpoints -------------------------------------------------

    @router.get("/config")
    async def get_efactura_config(user: User = Depends(get_current_user)):
        return await _load(user.company_id)

    @router.put("/config")
    async def update_efactura_config(
        data: EInvoicingConfigUpdate,
        user: User = Depends(get_current_user),
    ):
        # Only owners/admins/finance can change fiscal settings.
        role = (getattr(user, "role", "") or "").lower()
        if role not in {"owner", "admin", "finance"}:
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        patch = {k: v for k, v in data.model_dump().items() if v is not None}
        return await _save(user.company_id, patch)

    @router.post("/test")
    async def test_connection(user: User = Depends(get_current_user)):
        """Placeholder — Phase 1 will ping the authority's webservice using
        the uploaded certificate. For now we just acknowledge."""
        return {
            "ok": False,
            "detail": "Test de conexión disponible en Fase 1 (después de cargar el certificado y configurar el provider).",
        }

    # ----- Certificate vault (1A) ----------------------------------------------

    def _require_role(user) -> None:
        role = (getattr(user, "role", "") or "").lower()
        if role not in ALLOWED_ROLES:
            raise HTTPException(status_code=403, detail="Insufficient privileges")

    @router.post("/cert/upload")
    async def upload_certificate(
        file: UploadFile = File(...),
        password: Optional[str] = Form(None),
        user: User = Depends(get_current_user),
    ):
        """Upload the org's digital certificate (PFX/P12). The PFX bytes and
        password are encrypted with the master key before storage. Returns
        only the non-sensitive metadata."""
        _require_role(user)
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(contents) > MAX_CERT_BYTES:
            raise HTTPException(status_code=400, detail="Certificate file too large")

        try:
            meta = parse_p12(contents, password)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        token = pack_certificate(contents, password)
        now = now_iso()
        doc = {
            "company_id": user.company_id,
            "metadata": meta,
            "encrypted_blob": token,
            "uploaded_by": getattr(user, "user_id", None),
            "uploaded_at": now,
            "filename": file.filename,
        }
        # One active cert per company — replace any previous one.
        await db.efactura_certificates.update_one(
            {"company_id": user.company_id},
            {"$set": doc},
            upsert=True,
        )
        await _save(user.company_id, {"cert_uploaded_at": now})
        return {"metadata": meta, "uploaded_at": now, "filename": file.filename}

    @router.get("/cert")
    async def get_certificate(user: User = Depends(get_current_user)):
        """Return only the safe metadata of the currently-stored cert. The
        encrypted blob never leaves the server."""
        doc = await db.efactura_certificates.find_one(
            {"company_id": user.company_id},
            {"_id": 0, "encrypted_blob": 0, "company_id": 0},
        )
        if not doc:
            return {"present": False}
        return {
            "present": True,
            "metadata": doc.get("metadata", {}),
            "uploaded_at": doc.get("uploaded_at"),
            "filename": doc.get("filename"),
        }

    @router.delete("/cert")
    async def delete_certificate(user: User = Depends(get_current_user)):
        _require_role(user)
        await db.efactura_certificates.delete_one({"company_id": user.company_id})
        await _save(user.company_id, {"cert_uploaded_at": None})
        return {"ok": True}

    # ----- Super-admin endpoints (cross-tenant) --------------------------------

    @super_router.get("/{company_id}/efactura")
    async def super_get(company_id: str = Path(...), _: User = Depends(require_super_admin)):
        return await _load(company_id)

    @super_router.post("/{company_id}/efactura/toggle")
    async def super_toggle(
        company_id: str,
        data: EInvoicingToggleRequest,
        _: User = Depends(require_super_admin),
    ):
        patch: Dict[str, Any] = {"enabled": data.enabled}
        if data.country:
            patch["country"] = data.country
        if data.provider:
            patch["provider"] = data.provider
        return await _save(company_id, patch)

    return router, super_router
