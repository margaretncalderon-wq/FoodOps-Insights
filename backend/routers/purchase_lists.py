"""Purchase List endpoints — extracted from routers/inventory.py in P2 refactor. LOGIC UNCHANGED.

Contains:
- List purchase lists (with optional event_id filter)
- Generate purchase list from event menu (auto-diff against inventory)
- Create / update status / delete purchase lists
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from config import db
from dependencies import get_current_user
from models.auth import User
from models.purchase_lists import PurchaseList, PurchaseListCreate, PurchaseListItem


logger = logging.getLogger(__name__)
purchase_list_router = APIRouter(prefix="/purchase-lists", tags=["Purchase Lists"])



@purchase_list_router.get("")
async def get_purchase_lists(event_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all purchase lists, optionally filtered by event"""
    query = {"company_id": user.company_id}
    if event_id:
        query["event_id"] = event_id
    
    lists = await db.purchase_lists.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for pl in lists:
        for field in ["created_at", "updated_at"]:
            if pl.get(field) and isinstance(pl[field], str):
                pl[field] = datetime.fromisoformat(pl[field])
    return lists

@purchase_list_router.get("/event/{event_id}/generate")
async def generate_purchase_list(event_id: str, user: User = Depends(get_current_user)):
    """Generate a purchase list for an event based on order items"""
    # Get event
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get proposal and order items
    proposal = await db.proposals.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0})
    if not proposal:
        return {"items_by_supplier": {}, "total_items": 0, "message": "No proposal found"}
    
    order_items = await db.order_items.find(
        {"proposal_id": proposal["proposal_id"], "company_id": user.company_id, "item_type": "Food"},
        {"_id": 0}
    ).to_list(500)
    
    # Gather required ingredients from recipes/menus
    required_ingredients = {}
    guest_count = event.get("guest_count", 1)
    
    for order_item in order_items:
        quantity = order_item.get("quantity", 1)
        
        # Check if linked to a recipe
        recipe_id = order_item.get("recipe_id")
        if recipe_id:
            recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
            if recipe:
                recipe_yield = recipe.get("yield_quantity", 1)
                multiplier = quantity / recipe_yield
                
                for ing in recipe.get("ingredients", []):
                    if ing.get("item_type") == "ingredient":
                        item_id = ing.get("item_id") or ing.get("ingredient_id")
                        needed_qty = ing.get("quantity", 0) * multiplier
                        if item_id in required_ingredients:
                            required_ingredients[item_id]["required_qty"] += needed_qty
                        else:
                            required_ingredients[item_id] = {
                                "inventory_item_id": item_id,
                                "item_name": ing.get("item_name", "Unknown"),
                                "unit": ing.get("unit", "unit"),
                                "required_qty": needed_qty
                            }
        
        # Check if linked to a menu
        menu_id = order_item.get("menu_id")
        if menu_id:
            menu = await db.menus.find_one({"menu_id": menu_id, "company_id": user.company_id}, {"_id": 0})
            if menu:
                for menu_item in menu.get("items", []):
                    recipe_id = menu_item.get("recipe_id")
                    if recipe_id:
                        recipe = await db.recipes.find_one({"recipe_id": recipe_id, "company_id": user.company_id}, {"_id": 0})
                        if recipe:
                            portions = menu_item.get("portions_per_guest", 1) * quantity
                            recipe_yield = recipe.get("yield_quantity", 1)
                            multiplier = portions / recipe_yield
                            
                            for ing in recipe.get("ingredients", []):
                                if ing.get("item_type") == "ingredient":
                                    item_id = ing.get("item_id")
                                    needed_qty = ing.get("quantity", 0) * multiplier
                                    if item_id in required_ingredients:
                                        required_ingredients[item_id]["required_qty"] += needed_qty
                                    else:
                                        required_ingredients[item_id] = {
                                            "inventory_item_id": item_id,
                                            "item_name": ing.get("item_name", "Unknown"),
                                            "unit": ing.get("unit", "unit"),
                                            "required_qty": needed_qty
                                        }
    
    # Compare with current stock and group by supplier
    items_by_supplier = {}
    
    for item_id, req in required_ingredients.items():
        # Get current inventory
        inv_item = await db.ingredients.find_one(
            {"ingredient_id": item_id, "company_id": user.company_id},
            {"_id": 0}
        )
        
        in_stock = inv_item.get("stock_quantity", 0) if inv_item else 0
        to_purchase = max(0, req["required_qty"] - in_stock)
        
        supplier_id = inv_item.get("preferred_supplier_id", "no_supplier") if inv_item else "no_supplier"
        
        # Get supplier name
        supplier_name = "No Supplier"
        if supplier_id and supplier_id != "no_supplier":
            supplier = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
            if supplier:
                supplier_name = supplier.get("name", "Unknown")
        
        if supplier_id not in items_by_supplier:
            items_by_supplier[supplier_id] = {
                "supplier_id": supplier_id,
                "supplier_name": supplier_name,
                "items": [],
                "total_cost": 0
            }
        
        unit_cost = inv_item.get("cost_per_unit", 0) if inv_item else 0
        total_cost = to_purchase * unit_cost
        
        status = "InStock" if to_purchase == 0 else ("Short" if in_stock > 0 else "Unknown")
        
        items_by_supplier[supplier_id]["items"].append({
            "inventory_item_id": item_id,
            "item_name": req["item_name"],
            "unit": req["unit"],
            "required_qty": round(req["required_qty"], 2),
            "in_stock_qty": round(in_stock, 2),
            "to_purchase_qty": round(to_purchase, 2),
            "unit_cost": unit_cost,
            "total_cost": round(total_cost, 2),
            "status": status
        })
        items_by_supplier[supplier_id]["total_cost"] += total_cost
    
    return {
        "event_id": event_id,
        "event_name": event.get("name"),
        "items_by_supplier": items_by_supplier,
        "total_items": len(required_ingredients)
    }

@purchase_list_router.post("")
async def create_purchase_list(data: dict, user: User = Depends(get_current_user)):
    """Save a purchase list for an event"""
    now = datetime.now(timezone.utc)
    purchase_list_id = f"pl_{uuid.uuid4().hex[:12]}"
    
    # Check if event is closed
    event = await db.events.find_one(
        {"event_id": data.get("event_id"), "company_id": user.company_id},
        {"_id": 0}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot create purchase list for closed event")
    
    purchase_list_doc = {
        "purchase_list_id": purchase_list_id,
        "company_id": user.company_id,
        "event_id": data.get("event_id"),
        "supplier_id": data.get("supplier_id"),
        "supplier_name": data.get("supplier_name"),
        "items": data.get("items", []),
        "total_cost": data.get("total_cost", 0),
        "status": "Draft",
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.purchase_lists.insert_one(purchase_list_doc)
    del purchase_list_doc["_id"]
    purchase_list_doc["created_at"] = now
    purchase_list_doc["updated_at"] = now
    
    return purchase_list_doc

@purchase_list_router.put("/{purchase_list_id}/status")
async def update_purchase_list_status(purchase_list_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update purchase list status (Draft, Ordered, Received)"""
    now = datetime.now(timezone.utc)
    
    pl = await db.purchase_lists.find_one(
        {"purchase_list_id": purchase_list_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Purchase list not found")
    
    # Check if event is closed
    event = await db.events.find_one(
        {"event_id": pl.get("event_id"), "company_id": user.company_id},
        {"_id": 0}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot modify purchase list for closed event")
    
    new_status = data.get("status", pl.get("status"))
    
    await db.purchase_lists.update_one(
        {"purchase_list_id": purchase_list_id},
        {"$set": {"status": new_status, "updated_at": now.isoformat()}}
    )
    
    # If marked as Received, optionally create Purchase transactions
    if new_status == "Received" and data.get("create_transactions", False):
        for item in pl.get("items", []):
            if item.get("to_purchase_qty", 0) > 0:
                transaction_doc = {
                    "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
                    "company_id": user.company_id,
                    "inventory_item_id": item.get("inventory_item_id"),
                    "event_id": pl.get("event_id"),
                    "transaction_type": "Purchase",
                    "quantity": item.get("to_purchase_qty", 0),
                    "unit_cost": item.get("unit_cost", 0),
                    "notes": f"From Purchase List {purchase_list_id}",
                    "created_at": now.isoformat(),
                    "created_by": user.user_id
                }
                await db.inventory_transactions.insert_one(transaction_doc)
                
                # Update stock
                await db.ingredients.update_one(
                    {"ingredient_id": item.get("inventory_item_id"), "company_id": user.company_id},
                    {"$inc": {"stock_quantity": item.get("to_purchase_qty", 0)}}
                )
    
    return {"message": "Purchase list updated", "status": new_status}

@purchase_list_router.delete("/{purchase_list_id}")
async def delete_purchase_list(purchase_list_id: str, user: User = Depends(get_current_user)):
    """Delete a purchase list"""
    pl = await db.purchase_lists.find_one(
        {"purchase_list_id": purchase_list_id, "company_id": user.company_id},
        {"_id": 0}
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Purchase list not found")
    
    # Check if event is closed
    event = await db.events.find_one(
        {"event_id": pl.get("event_id"), "company_id": user.company_id},
        {"_id": 0}
    )
    if event and event.get("operational_status") == "Closed":
        raise HTTPException(status_code=400, detail="Cannot delete purchase list for closed event")
    
    await db.purchase_lists.delete_one({"purchase_list_id": purchase_list_id})
    return {"message": "Purchase list deleted"}
