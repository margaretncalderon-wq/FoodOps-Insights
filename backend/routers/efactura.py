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
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Path

from models.efactura import EInvoicingConfig, EInvoicingConfigUpdate, EInvoicingToggleRequest


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
