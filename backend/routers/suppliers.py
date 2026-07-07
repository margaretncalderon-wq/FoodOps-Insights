"""Supplier endpoints — extracted from server.py in the refactor sprint. LOGIC UNCHANGED."""
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from config import db
from dependencies import get_current_user
from models.auth import User
from models.suppliers import (
    Supplier,
    SupplierCreate,
    SupplierExtendedUpdate,
    SupplierItemCreate,
)


suppliers_router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@suppliers_router.get("", response_model=List[Supplier])
async def get_suppliers(user: User = Depends(get_current_user)):
    suppliers = await db.suppliers.find({"company_id": user.company_id}, {"_id": 0}).sort("name", 1).to_list(1000)
    for s in suppliers:
        if isinstance(s.get("created_at"), str):
            s["created_at"] = datetime.fromisoformat(s["created_at"])
        if "delivery_days" not in s:
            s["delivery_days"] = []
        if "minimum_order" not in s:
            s["minimum_order"] = 0.0
        if "payment_terms" not in s:
            s["payment_terms"] = "net30"
    return suppliers


@suppliers_router.post("", response_model=Supplier)
async def create_supplier(data: SupplierCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    supplier_id = f"sup_{uuid.uuid4().hex[:12]}"

    supplier_doc = {
        "supplier_id": supplier_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.suppliers.insert_one(supplier_doc)
    del supplier_doc["_id"]
    supplier_doc["created_at"] = now
    return Supplier(**supplier_doc)


@suppliers_router.get("/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, user: User = Depends(get_current_user)):
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id, "company_id": user.company_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if isinstance(supplier.get("created_at"), str):
        supplier["created_at"] = datetime.fromisoformat(supplier["created_at"])
    return Supplier(**supplier)


@suppliers_router.put("/{supplier_id}", response_model=Supplier)
async def update_supplier(supplier_id: str, data: SupplierCreate, user: User = Depends(get_current_user)):
    result = await db.suppliers.update_one(
        {"supplier_id": supplier_id, "company_id": user.company_id},
        {"$set": data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return await get_supplier(supplier_id, user)


@suppliers_router.delete("/{supplier_id}")
async def delete_supplier(supplier_id: str, user: User = Depends(get_current_user)):
    result = await db.suppliers.delete_one({"supplier_id": supplier_id, "company_id": user.company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted"}


# Supplier Items (SKU mapping)
@suppliers_router.post("/items")
async def create_supplier_item(data: SupplierItemCreate, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    item_id = f"si_{uuid.uuid4().hex[:12]}"

    item_doc = {
        "item_id": item_id,
        "company_id": user.company_id,
        **data.model_dump(),
        "created_at": now.isoformat()
    }
    await db.supplier_items.insert_one(item_doc)
    del item_doc["_id"]
    return item_doc


@suppliers_router.get("/items/by-ingredient/{ingredient_id}")
async def get_supplier_items_for_ingredient(ingredient_id: str, user: User = Depends(get_current_user)):
    items = await db.supplier_items.find({"company_id": user.company_id, "ingredient_id": ingredient_id}, {"_id": 0}).to_list(100)
    return items


@suppliers_router.put("/{supplier_id}/extended")
async def update_supplier_extended(supplier_id: str, data: SupplierExtendedUpdate, user: User = Depends(get_current_user)):
    """Update extended supplier fields (payment terms, credit)"""
    update_data = {}
    if data.company_name is not None:
        update_data["company_name"] = data.company_name
    if data.payment_terms is not None:
        update_data["payment_terms"] = data.payment_terms
    if data.has_credit is not None:
        update_data["has_credit"] = data.has_credit
    if data.credit_limit is not None:
        update_data["credit_limit"] = data.credit_limit
    if data.usual_delivery_days is not None:
        update_data["usual_delivery_days"] = data.usual_delivery_days
    if data.tax_id is not None:
        update_data["tax_id"] = data.tax_id

    if not update_data:
        return {"message": "No updates provided"}

    result = await db.suppliers.update_one(
        {"supplier_id": supplier_id, "company_id": user.company_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Updated"}
