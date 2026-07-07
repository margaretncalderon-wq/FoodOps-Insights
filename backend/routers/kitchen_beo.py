"""
Kitchen BEO (Banquet Event Order) — Sprint 2 of Culinary Intelligence Phase 2.

Structured for the chef, grouped by service slot (tanda). Source of truth
is the proposal's order_items (what was actually confirmed/sold).

Extracted from server.py in the refactor sprint. LOGIC UNCHANGED.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timezone, date as _date
from hashlib import sha256
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from config import db
from dependencies import get_current_user
from models.auth import User
from routers.buffet_factors import _resolve_buffet_factor


kitchen_beo_router = APIRouter(prefix="/kitchen-beo", tags=["Kitchen BEO"])


@kitchen_beo_router.get("/event/{event_id}")
async def get_kitchen_beo(event_id: str, user: User = Depends(get_current_user)):
    """Kitchen BEO (Banquet Event Order) — structured for the chef.

    Source of truth: the proposal's `order_items` (what was actually
    confirmed/sold), NOT the original `plated_menus.courses` template.
    Items are grouped into **tandas** by `(event_date, section_title,
    section_time)`. For multi-day events (`event_dates`), each date becomes
    its own block and tandas live inside.

    For every item that has a `loaded_from_course_id`, we resolve the recipe
    and scale ingredients by guest_count × buffet factor. Items without a
    recipe link are still surfaced as line entries so the chef sees them
    (e.g. "80x Jugo Galón"). Prices are intentionally omitted from this
    payload — cocina no necesita ver costos.
    """
    event = await db.events.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0},
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    guest_count = int(event.get("guest_count") or event.get("num_guests") or 1)
    if guest_count <= 0:
        guest_count = 1

    proposal = await db.proposals.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0, "proposal_id": 1},
        sort=[("created_at", -1)],
    )

    # Pre-resolve menu (used for menu_type → buffet factor)
    menu = None
    menu_type = "plated"
    if event.get("menu_id"):
        menu = await db.plated_menus.find_one(
            {"menu_id": event["menu_id"], "company_id": user.company_id},
            {"_id": 0, "menu_type": 1, "name": 1, "courses": 1},
        )
        if menu:
            menu_type = menu.get("menu_type", "plated")

    # Pull all order_items for this proposal — these are what the kitchen
    # actually produces.
    items: list = []
    if proposal:
        items = await db.order_items.find(
            {
                "proposal_id": proposal["proposal_id"],
                "company_id": user.company_id,
            },
            {
                "_id": 0,
                "description": 1,
                "section_title": 1,
                "section_time": 1,
                "section_end_time": 1,
                "event_date": 1,
                "quantity": 1,
                "item_type": 1,
                "loaded_from_course_id": 1,
                "loaded_from_recipe_id": 1,
                "sort_order": 1,
            },
        ).to_list(2000)

    # Compute calendar_dates the same way the orchestration calendar does
    def _norm_date(value):
        if not value:
            return None
        if isinstance(value, str):
            return value[:10] if len(value) >= 10 else None
        try:
            return value.isoformat()[:10]
        except Exception:
            return None

    def _expand_event_dates(ev):
        dates: set = set()
        explicit_dates = []
        for d in ev.get("event_dates") or []:
            nd = _norm_date(d)
            if nd:
                explicit_dates.append(nd)
                dates.add(nd)
        primary = _norm_date(ev.get("event_date"))
        if primary:
            dates.add(primary)
        # Only expand consecutively when no explicit event_dates list is provided
        # (otherwise we'd fill in skipped days the user explicitly omitted).
        if explicit_dates:
            return sorted(dates)
        end = _norm_date(ev.get("end_date"))
        if primary and end and end > primary:
            try:
                cur = _date.fromisoformat(primary)
                stop = _date.fromisoformat(end)
                while cur <= stop:
                    dates.add(cur.isoformat())
                    cur = _date.fromordinal(cur.toordinal() + 1)
            except Exception:
                pass
        return sorted(dates)

    calendar_dates = _expand_event_dates(event)
    if not calendar_dates:
        calendar_dates = [None]  # un-scheduled event → single "TBD" block

    # Bucket items by (date, section_time) — the SERVICE SLOT (tanda).
    # We intentionally ignore `section_title` here so all items being
    # served at the same time end up on the SAME kitchen sheet, regardless
    # of category (Bocadillos, Bebidas, Desechables, etc.). The kitchen
    # cares about "what do I plate at 08:15", not menu structure.
    #
    # Items with NO section_time (Desechables, Alquileres, Logística, etc.)
    # are MERGED into the earliest tanda of their day so the kitchen sees
    # them on the same sheet — otherwise they get printed on a separate
    # "no-time" sheet that the user often doesn't realize exists.
    bucket: dict = defaultdict(list)
    floating_by_date: dict = defaultdict(list)
    for it in items:
        d = _norm_date(it.get("event_date")) or (calendar_dates[0] if calendar_dates else None)
        t = (it.get("section_time") or "").strip()
        te = (it.get("section_end_time") or "").strip()
        if t:
            key = (d, t, te)
            bucket[key].append(it)
        else:
            floating_by_date[d].append(it)

    # Attach floating items: if the date has any timed tandas, merge into the
    # earliest. Otherwise create a single no-time tanda for the date.
    for d, floats in floating_by_date.items():
        timed_keys = sorted([k for k in bucket.keys() if k[0] == d and k[1]],
                            key=lambda k: k[1])
        if timed_keys:
            bucket[timed_keys[0]].extend(floats)
        else:
            bucket[(d, "", "")].extend(floats)

    # Fetch the company's configured item-type order so items sort the same
    # way they do in the editor (Bebidas first, then Bocadillos, etc.).
    co = await db.companies.find_one(
        {"company_id": user.company_id},
        {"_id": 0, "proposal_item_types": 1, "primary_color": 1, "logo_url": 1},
    )
    type_order = {
        t.get("type_key"): idx
        for idx, t in enumerate(((co or {}).get("proposal_item_types") or []))
        if t.get("type_key")
    }
    def _type_ordinal(it_type):
        return type_order.get(it_type, 999)

    # Pre-fetch every recipe we'll need (one round-trip)
    recipe_ids = list({i.get("loaded_from_recipe_id") for i in items if i.get("loaded_from_recipe_id")})
    recipes_by_id: dict = {}
    if recipe_ids:
        async for r in db.recipes.find(
            {"recipe_id": {"$in": recipe_ids}, "company_id": user.company_id},
            {"_id": 0},
        ):
            recipes_by_id[r["recipe_id"]] = r

    allergens_set: set = set()
    dietary_set: set = set()

    async def _build_tanda(key, tanda_items):
        d, t, te = key
        # Sort by company's configured item_type order, then sort_order,
        # then description. Result: Bebidas → Bocadillos → Desechables, etc.
        tanda_items.sort(key=lambda i: (
            _type_ordinal(i.get("item_type") or ""),
            int(i.get("sort_order") or 0),
            i.get("description") or "",
        ))
        tanda_allergens: set = set()
        tanda_dietary: set = set()
        recipes_out: list = []
        extras_out: list = []  # items without a recipe link
        for it in tanda_items:
            qty = float(it.get("quantity") or 0)
            rid = it.get("loaded_from_recipe_id")
            recipe = recipes_by_id.get(rid) if rid else None
            if not recipe:
                extras_out.append({
                    "description": it.get("description"),
                    "quantity": qty,
                    "item_type": it.get("item_type"),
                })
                continue
            factor = await _resolve_buffet_factor(recipe, user.company_id, menu_type)
            # `quantity` on the order_item is already total portions sold for
            # this tanda (since fan-out is per-date). Scale up by the buffet
            # factor so cocina prepares enough.
            portions_required = qty * factor if qty > 0 else 0
            yield_qty = float(recipe.get("portions_per_yield") or recipe.get("yield_quantity") or 1) or 1
            scale_factor = portions_required / yield_qty if yield_qty else 0

            scaled_ingredients = []
            for ing in (recipe.get("ingredients") or []):
                base_qty = float(ing.get("quantity") or 0)
                scaled_ingredients.append({
                    "name": ing.get("name") or ing.get("item_name") or "?",
                    "quantity": round(base_qty * scale_factor, 3),
                    "unit": ing.get("unit") or "unit",
                })
            for a in (recipe.get("allergens") or []):
                tanda_allergens.add(a); allergens_set.add(a)
            for dt in (recipe.get("dietary_tags") or []):
                tanda_dietary.add(dt); dietary_set.add(dt)
            recipes_out.append({
                "recipe_id": rid,
                "recipe_name": recipe.get("name"),
                "description": it.get("description"),
                "category": recipe.get("category"),
                "portions_required": round(portions_required, 3),
                "yield_unit": recipe.get("yield_unit", "portion"),
                "consumption_factor": round(factor, 3),
                "prep_time_minutes": recipe.get("prep_time") or recipe.get("prep_time_minutes") or 0,
                "cook_time_minutes": recipe.get("cook_time") or recipe.get("cook_time_minutes") or 0,
                "allergens": recipe.get("allergens") or [],
                "dietary_tags": recipe.get("dietary_tags") or [],
                "ingredients": scaled_ingredients,
                "presentation_notes": recipe.get("presentation_notes"),
                "chef_notes": recipe.get("chef_notes"),
            })
        return {
            "tanda_key": f"{d or 'tbd'}|{t}",
            "date": d,
            "section_title": None,
            "section_time": t or None,
            "section_end_time": te or None,
            "guest_count": guest_count,
            "recipes": recipes_out,
            "extras": extras_out,
            "allergens": sorted(tanda_allergens),
            "dietary_tags": sorted(tanda_dietary),
        }

    # Build the day → tandas structure
    days_map: dict = defaultdict(list)
    for key, tanda_items in bucket.items():
        tanda = await _build_tanda(key, tanda_items)
        days_map[tanda["date"]].append(tanda)

    # Sort tandas inside each day by time (None last)
    days_out: list = []
    for d in calendar_dates:
        tandas = days_map.get(d, [])
        # Also catch tandas whose date matches even when calendar_dates didn't
        # include them (shouldn't happen but defensive)
        tandas.sort(key=lambda x: ((x.get("section_time") or "99:99"), (x.get("section_title") or "")))
        days_out.append({
            "date": d,
            "tandas": tandas,
            "tanda_count": len(tandas),
        })
    # Append any orphan dates not in calendar_dates (defensive)
    for d, tandas in days_map.items():
        if d in calendar_dates:
            continue
        tandas.sort(key=lambda x: ((x.get("section_time") or "99:99"), (x.get("section_title") or "")))
        days_out.append({"date": d, "tandas": tandas, "tanda_count": len(tandas)})

    # Build a content-hash snapshot — the kitchen UI compares it against the
    # last printed snapshot to detect post-print changes. We normalize numeric
    # values to 4-decimal floats so 12 and 12.0 (or float-precision noise from
    # buffet-factor scaling) don't produce phantom drift.
    def _norm_num(x):
        try:
            return round(float(x or 0), 4)
        except (TypeError, ValueError):
            return 0.0

    snap_input = []
    for day in days_out:
        for tanda in day["tandas"]:
            snap_input.append((
                tanda.get("date") or "",
                tanda.get("section_title") or "",
                tanda.get("section_time") or "",
                tanda.get("section_end_time") or "",
                int(tanda.get("guest_count") or 0),
                tuple(sorted([(r.get("recipe_id") or r.get("description") or "", _norm_num(r.get("portions_required")))
                              for r in tanda["recipes"]])),
                tuple(sorted([(e.get("description") or "", _norm_num(e.get("quantity"))) for e in tanda["extras"]])),
            ))
    snapshot_hash = sha256(repr(snap_input).encode("utf-8")).hexdigest()[:16]

    # Look up the most recent print log entry for this event so the UI can
    # show "Última impresión: 2h" + "⚠ cambios desde la última impresión".
    last_print = await db.kitchen_beo_print_log.find_one(
        {"event_id": event_id, "company_id": user.company_id},
        {"_id": 0},
        sort=[("printed_at", -1)],
    )
    changed_since_print = bool(last_print and last_print.get("snapshot_hash") != snapshot_hash)

    # Brand color for cohesive print rendering. Falls back to a neutral
    # dark if the org never picked one.
    primary_color = (co or {}).get("primary_color") or "#1a1a1a"
    logo_url = (co or {}).get("logo_url") or None

    return {
        "event_id": event_id,
        "event_name": event.get("name"),
        "calendar_dates": calendar_dates,
        "guest_count": guest_count,
        "venue": event.get("venue"),
        "menu_name": (menu or {}).get("name"),
        "menu_type": menu_type,
        "primary_color": primary_color,
        "logo_url": logo_url,
        "allergens_aggregate": sorted(allergens_set),
        "dietary_tags_aggregate": sorted(dietary_set),
        "days": days_out,
        "totals": {
            "days_count": len(days_out),
            "tandas_count": sum(d["tanda_count"] for d in days_out),
            "recipes_count": sum(len(t["recipes"]) for d in days_out for t in d["tandas"]),
        },
        "snapshot_hash": snapshot_hash,
        "last_print": last_print,
        "changed_since_print": changed_since_print,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@kitchen_beo_router.post("/event/{event_id}/mark-printed")
async def mark_kitchen_beo_printed(
    event_id: str,
    payload: dict = Body(default={}),
    user: User = Depends(get_current_user),
):
    """Persist that the BEO was printed at this moment with the given
    snapshot hash. The UI calls this from the Print button so that next
    time the BEO is opened we can flag if the content drifted."""
    event = await db.events.find_one({"event_id": event_id, "company_id": user.company_id}, {"_id": 0, "event_id": 1, "name": 1})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    snapshot_hash = ((payload or {}).get("snapshot_hash") or "").strip()
    if not snapshot_hash:
        # Caller didn't include a hash — compute the current one server-side
        # so changed_since_print stays accurate (and doesn't get stuck at True).
        try:
            current = await get_kitchen_beo(event_id, user)
            snapshot_hash = current.get("snapshot_hash") or ""
        except Exception:
            snapshot_hash = ""
    log_id = f"beolog_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.kitchen_beo_print_log.insert_one({
        "log_id": log_id,
        "event_id": event_id,
        "event_name": event.get("name"),
        "company_id": user.company_id,
        "printed_at": now_iso,
        "printed_by_user_id": user.user_id,
        "printed_by_name": user.name,
        "snapshot_hash": snapshot_hash,
        "scope": (payload or {}).get("scope") or "single",
    })
    return {"success": True, "log_id": log_id, "printed_at": now_iso}


@kitchen_beo_router.get("/batch")
async def list_kitchen_beo_batch(
    start_date: str,
    end_date: str,
    include_stages: Optional[str] = "Won,Committed,Confirmed",
    user: User = Depends(get_current_user),
):
    """Returns one BEO payload per confirmed event in the given date range.
    Used by the batch-print screen to render N hojas at once.

    Each entry also carries `changed_since_print` so the UI can flag drift.
    """
    stages = [s.strip() for s in (include_stages or "").split(",") if s.strip()]
    base_query = {"company_id": user.company_id}
    if stages:
        base_query["$or"] = [
            {"stage": {"$in": stages}},
            {"operational_status": {"$in": stages}},
        ]
    events = await db.events.find(base_query, {"_id": 0}).to_list(500)

    # Filter by date overlap with [start_date, end_date]
    def _norm(v):
        if isinstance(v, str):
            return v[:10] if len(v) >= 10 else None
        try:
            return v.isoformat()[:10]
        except Exception:
            return None

    def _event_dates(ev):
        out = set()
        for d in ev.get("event_dates") or []:
            n = _norm(d)
            if n:
                out.add(n)
        n = _norm(ev.get("event_date"))
        if n:
            out.add(n)
        return sorted(out)

    qstart = start_date[:10]
    qend = end_date[:10]
    filtered: list = []
    for ev in events:
        eds = _event_dates(ev)
        if not eds:
            continue
        # Include the event ONLY if at least one of its actual event dates
        # falls inside [qstart, qend]. Previously this used span-overlap
        # semantics, which surfaced an event with dates [Mar 5, Mar 7, Mar 10]
        # for a window of just [Mar 6, Mar 6] even though it has no kitchen
        # activity on Mar 6.
        if any(qstart <= d <= qend for d in eds):
            filtered.append(ev)

    # Generate a BEO for each event (reusing the single-event endpoint logic)
    sheets: list = []
    for ev in filtered:
        try:
            beo = await get_kitchen_beo(ev["event_id"], user)
            sheets.append(beo)
        except HTTPException:
            continue

    sheets.sort(key=lambda b: (b.get("calendar_dates") or ["9999"])[0])
    return {
        "start_date": qstart,
        "end_date": qend,
        "sheets_count": len(sheets),
        "sheets": sheets,
    }
