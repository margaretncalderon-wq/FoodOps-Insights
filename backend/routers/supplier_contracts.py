"""Supplier Contracts router — CRUD + PDF/doc attachments + accounting rollup.

Endpoints (all prefixed `/api/supplier-contracts` by the FastAPI include):
    GET    /                        list contracts (optionally filtered)
    POST   /                        create contract
    GET    /{contract_id}           get one (with rollups + attachments)
    PUT    /{contract_id}           update
    DELETE /{contract_id}           soft-delete (marks Cancelled) unless ?hard=true
    POST   /{contract_id}/attachments   upload a PDF/doc
    DELETE /{contract_id}/attachments/{attachment_id}
    GET    /{contract_id}/expenses  list all expenses/bills linked via `contract_id`
"""
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query

from config import db, UPLOADS_DIR
from models.auth import User
from models.supplier_contracts import (
    SupplierContractCreate,
    SupplierContractUpdate,
    SupplierContractAttachment,
)
from routers.auth import get_current_user

supplier_contracts_router = APIRouter(prefix="/supplier-contracts", tags=["Supplier Contracts"])

CONTRACT_ATTACHMENTS_DIR = UPLOADS_DIR / "supplier_contract_attachments"
CONTRACT_ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
}


async def _hydrate_contract(doc: dict) -> dict:
    """Fetch supplier/partner names + compute financial rollups from expenses."""
    doc = dict(doc)
    doc.pop("_id", None)

    # Supplier name
    if doc.get("supplier_id"):
        supplier = await db.suppliers.find_one({"supplier_id": doc["supplier_id"]}, {"_id": 0, "name": 1})
        doc["supplier_name"] = supplier.get("name") if supplier else None

    # Partner name (optional link)
    if doc.get("partner_id"):
        partner = await db.partners.find_one({"partner_id": doc["partner_id"]}, {"_id": 0, "name": 1})
        doc["partner_name"] = partner.get("name") if partner else None

    # Rollup — payables/expenses linked back to this contract via `contract_id`.
    # We aggregate from BOTH `db.supplier_payables` (the AP flow) and `db.expenses`
    # (legacy/direct expense flow) so both entry points feed the same total.
    payables = await db.supplier_payables.find(
        {"company_id": doc["company_id"], "contract_id": doc["contract_id"]},
        {"_id": 0, "amount": 1, "paid_amount": 1, "status": 1}
    ).to_list(2000)
    legacy_expenses = await db.expenses.find(
        {"company_id": doc["company_id"], "contract_id": doc["contract_id"]},
        {"_id": 0, "amount": 1, "payment_status": 1}
    ).to_list(2000)
    invoiced = sum(float(p.get("amount", 0) or 0) for p in payables) \
        + sum(float(e.get("amount", 0) or 0) for e in legacy_expenses)
    paid = sum(float(p.get("paid_amount", 0) or 0) for p in payables) \
        + sum(float(e.get("amount", 0) or 0) for e in legacy_expenses if e.get("payment_status") == "Paid")
    doc["invoiced_to_date"] = round(invoiced, 2)
    doc["paid_to_date"] = round(paid, 2)
    doc["balance_remaining"] = round((doc.get("total_value") or 0) - invoiced, 2)
    doc["linked_expenses_count"] = len(payables) + len(legacy_expenses)

    doc.setdefault("attachments", [])
    doc.setdefault("tags", [])
    return doc


@supplier_contracts_router.get("")
async def list_supplier_contracts(
    supplier_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    query = {"company_id": user.company_id}
    if supplier_id:
        query["supplier_id"] = supplier_id
    if status:
        query["status"] = status
    docs = await db.supplier_contracts.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [await _hydrate_contract(d) for d in docs]


@supplier_contracts_router.post("")
async def create_supplier_contract(data: SupplierContractCreate, user: User = Depends(get_current_user)):
    # Verify the supplier exists on this tenant
    supplier = await db.suppliers.find_one({"supplier_id": data.supplier_id, "company_id": user.company_id})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found on this tenant")

    now = datetime.now(timezone.utc)
    contract_id = f"ct_{uuid.uuid4().hex[:12]}"
    # Auto-generate contract number if blank
    contract_number = data.contract_number
    if not contract_number:
        count = await db.supplier_contracts.count_documents({"company_id": user.company_id})
        contract_number = f"CT-{now.year}-{count + 1:04d}"

    doc = {
        "contract_id": contract_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "contract_number": contract_number,
        "attachments": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "created_by": user.user_id,
    }
    await db.supplier_contracts.insert_one(doc)
    return await _hydrate_contract(doc)


@supplier_contracts_router.get("/{contract_id}")
async def get_supplier_contract(contract_id: str, user: User = Depends(get_current_user)):
    doc = await db.supplier_contracts.find_one(
        {"contract_id": contract_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")
    return await _hydrate_contract(doc)


@supplier_contracts_router.put("/{contract_id}")
async def update_supplier_contract(
    contract_id: str, data: SupplierContractUpdate, user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    patch = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    patch["updated_at"] = now.isoformat()
    r = await db.supplier_contracts.update_one(
        {"contract_id": contract_id, "company_id": user.company_id}, {"$set": patch}
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contract not found")
    doc = await db.supplier_contracts.find_one(
        {"contract_id": contract_id, "company_id": user.company_id}, {"_id": 0}
    )
    return await _hydrate_contract(doc)


@supplier_contracts_router.delete("/{contract_id}")
async def delete_supplier_contract(
    contract_id: str, hard: bool = Query(False), user: User = Depends(get_current_user)
):
    if hard:
        r = await db.supplier_contracts.delete_one(
            {"contract_id": contract_id, "company_id": user.company_id}
        )
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Contract not found")
        return {"deleted": True, "hard": True}
    # Soft-delete: mark Cancelled
    r = await db.supplier_contracts.update_one(
        {"contract_id": contract_id, "company_id": user.company_id},
        {"$set": {"status": "Cancelled", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"deleted": True, "hard": False}


@supplier_contracts_router.post("/{contract_id}/attachments")
async def upload_contract_attachment(
    contract_id: str,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    doc = await db.supplier_contracts.find_one(
        {"contract_id": contract_id, "company_id": user.company_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")

    ext = ALLOWED_MIME_TYPES[file.content_type]
    attachment_id = f"att_{uuid.uuid4().hex[:12]}"
    stored_name = f"{attachment_id}.{ext}"
    file_path = CONTRACT_ATTACHMENTS_DIR / stored_name
    from utils.local_upload import save_bytes as _save
    _save(file_path, file.file.read())
    size = file_path.stat().st_size

    attachment = {
        "attachment_id": attachment_id,
        "file_name": stored_name,
        "original_name": file.filename,
        "mime_type": file.content_type,
        "file_size": size,
        "file_url": f"/uploads/supplier_contract_attachments/{stored_name}",
        "description": description,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": user.user_id,
    }

    await db.supplier_contracts.update_one(
        {"contract_id": contract_id, "company_id": user.company_id},
        {"$push": {"attachments": attachment},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return attachment


@supplier_contracts_router.delete("/{contract_id}/attachments/{attachment_id}")
async def delete_contract_attachment(
    contract_id: str, attachment_id: str, user: User = Depends(get_current_user)
):
    doc = await db.supplier_contracts.find_one(
        {"contract_id": contract_id, "company_id": user.company_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")
    match = next((a for a in (doc.get("attachments") or []) if a.get("attachment_id") == attachment_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Attachment not found")
    # Best-effort delete of the file on disk
    try:
        (CONTRACT_ATTACHMENTS_DIR / match["file_name"]).unlink(missing_ok=True)
    except Exception:
        pass
    await db.supplier_contracts.update_one(
        {"contract_id": contract_id, "company_id": user.company_id},
        {"$pull": {"attachments": {"attachment_id": attachment_id}},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"deleted": True}


@supplier_contracts_router.get("/{contract_id}/expenses")
async def get_contract_expenses(contract_id: str, user: User = Depends(get_current_user)):
    """Return all payables/expenses/bills recorded against this contract with totals."""
    doc = await db.supplier_contracts.find_one(
        {"contract_id": contract_id, "company_id": user.company_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Contract not found")
    payables = await db.supplier_payables.find(
        {"company_id": user.company_id, "contract_id": contract_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    legacy_expenses = await db.expenses.find(
        {"company_id": user.company_id, "contract_id": contract_id}, {"_id": 0}
    ).sort("expense_date", -1).to_list(1000)
    invoiced = sum(float(p.get("amount", 0) or 0) for p in payables) \
        + sum(float(e.get("amount", 0) or 0) for e in legacy_expenses)
    paid = sum(float(p.get("paid_amount", 0) or 0) for p in payables) \
        + sum(float(e.get("amount", 0) or 0) for e in legacy_expenses if e.get("payment_status") == "Paid")
    return {
        "contract_id": contract_id,
        "payables": payables,
        "expenses": legacy_expenses,
        "invoiced_to_date": round(invoiced, 2),
        "paid_to_date": round(paid, 2),
        "balance_remaining": round((doc.get("total_value") or 0) - invoiced, 2),
    }
