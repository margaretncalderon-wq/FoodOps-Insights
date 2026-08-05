"""
Demo-account data seeder.

When a super-admin creates a demo/influencer/partner account, this module
populates the fresh organisation with realistic, industry-specific sample
data so the user can log in and immediately see the platform in action
(instead of an empty shell).

The seeder is intentionally KEPT MINIMAL — the goal is to unblock a
"first impression" tour, not to build a full realistic dataset. Volumes:
  - events / catering: 5 clients, 3 events, 12 ingredients, 6 recipes, 2 menus
  - agency / consulting: 5 clients, 3 proposals
  - generic: 3 clients, 2 deals/services

All records respect the organisation's industry `terminology` so the sample
Client / Event / Project labels match what the user sees in the UI.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def seed_demo_data(
    db: Any,
    company_id: str,
    industry_type: str,
    admin_user_id: str,
) -> dict:
    """
    Populate the freshly-created organisation with sample data.

    Returns a dict of counts per collection so the caller can surface the
    result in the create-account response toast.
    """
    now = datetime.now(timezone.utc)
    counts: dict = {}

    if industry_type == "events":
        counts.update(await _seed_events(db, company_id, admin_user_id, now))
    elif industry_type in ("agency", "consulting"):
        counts.update(await _seed_agency(db, company_id, admin_user_id, now, industry_type))
    else:
        counts.update(await _seed_generic(db, company_id, admin_user_id, now))

    return counts


# ---------------------------------------------------------------------------
# EVENTS & HOSPITALITY (catering)
# ---------------------------------------------------------------------------
async def _seed_events(db, company_id: str, admin_user_id: str, now: datetime) -> dict:
    counts: dict = {}

    # -- Clients --------------------------------------------------------------
    clients = [
        {"name": "María & Carlos Rodríguez", "email": "maria.rodriguez@example.com", "phone": "+1 809-555-0101", "client_type": "wedding", "notes": "Boda en Casa de Campo, junio."},
        {"name": "Grupo Popular", "email": "eventos@grupopopular.example.com", "phone": "+1 809-555-0102", "client_type": "corporate", "notes": "Cliente corporativo recurrente. Facturación NCF."},
        {"name": "Fundación Sonrisas", "email": "hola@sonrisas.org.example", "phone": "+1 809-555-0103", "client_type": "corporate", "notes": "Gala anual noviembre."},
        {"name": "Andrea Pérez", "email": "andrea.perez@example.com", "phone": "+1 809-555-0104", "client_type": "individual", "notes": "Cumpleaños #50."},
        {"name": "Luis & Patricia Méndez", "email": "luispat@example.com", "phone": "+1 809-555-0105", "client_type": "wedding", "notes": "Wedding planner: Ella Ella."},
    ]
    client_docs = []
    for c in clients:
        client_id = _id("client")
        client_docs.append({
            "client_id": client_id,
            "lead_id": client_id,
            "company_id": company_id,
            "display_name": c["name"],
            "name": c["name"],
            "email": c["email"],
            "phone": c["phone"],
            "client_type": c["client_type"],
            "notes": c["notes"],
            "status": "committed",
            "source": "demo_seed",
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
    if client_docs:
        await db.leads.insert_many(client_docs)
    counts["clients"] = len(client_docs)

    # -- Ingredients ----------------------------------------------------------
    ingredients = [
        {"name": "Salmón fresco", "unit": "kg",   "cost": 12.50, "category": "Proteína"},
        {"name": "Pechuga de pollo", "unit": "kg", "cost": 6.80, "category": "Proteína"},
        {"name": "Solomillo de res", "unit": "kg", "cost": 24.00, "category": "Proteína"},
        {"name": "Camarones jumbo",  "unit": "kg", "cost": 18.50, "category": "Proteína"},
        {"name": "Arroz basmati",    "unit": "kg", "cost": 2.40,  "category": "Grano"},
        {"name": "Quinoa",           "unit": "kg", "cost": 5.90,  "category": "Grano"},
        {"name": "Espárragos verdes","unit": "kg", "cost": 8.20,  "category": "Vegetal"},
        {"name": "Tomate cherry",    "unit": "kg", "cost": 3.10,  "category": "Vegetal"},
        {"name": "Aguacate hass",    "unit": "kg", "cost": 4.20,  "category": "Vegetal"},
        {"name": "Aceite de oliva extra virgen", "unit": "L", "cost": 9.50, "category": "Grasa"},
        {"name": "Mantequilla sin sal", "unit": "kg", "cost": 7.20, "category": "Grasa"},
        {"name": "Queso parmesano reggiano", "unit": "kg", "cost": 22.00, "category": "Lácteo"},
    ]
    ing_docs = []
    ing_by_name: dict = {}
    for ing in ingredients:
        ing_id = _id("ing")
        doc = {
            "ingredient_id": ing_id,
            "company_id": company_id,
            "name": ing["name"],
            "unit": ing["unit"],
            "cost_per_unit": ing["cost"],
            "unit_cost": ing["cost"],
            "current_price": ing["cost"],
            "category": ing["category"],
            "supplier": "Demo Foods S.R.L.",
            "created_by": admin_user_id,
            "created_at": _iso(now),
        }
        ing_docs.append(doc)
        ing_by_name[ing["name"]] = doc
    if ing_docs:
        await db.ingredients.insert_many(ing_docs)
    counts["ingredients"] = len(ing_docs)

    # -- Recipes --------------------------------------------------------------
    def _rec_ing(name: str, qty: float):
        d = ing_by_name.get(name)
        if not d:
            return None
        cost = round(qty * (d.get("cost_per_unit") or 0), 2)
        return {
            "ingredient_id": d["ingredient_id"],
            "ingredient_name": d["name"],
            "name": d["name"],
            "quantity": qty,
            "unit": d["unit"],
            "cost_per_unit": d["cost_per_unit"],
            "cost": cost,
        }

    recipes = [
        {
            "name": "Salmón grillado con espárragos",
            "category": "Plato Fuerte",
            "yield_qty": 10, "yield_unit": "porciones",
            "ings": [("Salmón fresco", 1.6), ("Espárragos verdes", 0.8), ("Aceite de oliva extra virgen", 0.08), ("Mantequilla sin sal", 0.06)],
            "notes": "Servir con reducción de limón y romero.",
        },
        {
            "name": "Solomillo de res con puré trufado",
            "category": "Plato Fuerte",
            "yield_qty": 10, "yield_unit": "porciones",
            "ings": [("Solomillo de res", 1.8), ("Mantequilla sin sal", 0.1), ("Aceite de oliva extra virgen", 0.05)],
            "notes": "Cocción sugerida término medio.",
        },
        {
            "name": "Risotto de camarones al parmesano",
            "category": "Plato Fuerte",
            "yield_qty": 10, "yield_unit": "porciones",
            "ings": [("Camarones jumbo", 1.2), ("Arroz basmati", 0.8), ("Queso parmesano reggiano", 0.15), ("Mantequilla sin sal", 0.08)],
            "notes": "Risotto cremoso, punto al dente.",
        },
        {
            "name": "Ensalada Quinoa & Aguacate",
            "category": "Entrada",
            "yield_qty": 10, "yield_unit": "porciones",
            "ings": [("Quinoa", 0.4), ("Aguacate hass", 0.6), ("Tomate cherry", 0.5), ("Aceite de oliva extra virgen", 0.05)],
            "notes": "Vegana. Aderezo cítrico.",
        },
        {
            "name": "Pollo a la parrilla con hierbas",
            "category": "Plato Fuerte",
            "yield_qty": 10, "yield_unit": "porciones",
            "ings": [("Pechuga de pollo", 1.5), ("Aceite de oliva extra virgen", 0.04), ("Mantequilla sin sal", 0.05)],
            "notes": "Opción sin gluten.",
        },
        {
            "name": "Bruschetta clásica",
            "category": "Aperitivo",
            "yield_qty": 20, "yield_unit": "unidades",
            "ings": [("Tomate cherry", 0.4), ("Aceite de oliva extra virgen", 0.03)],
            "notes": "Pasapalo de bienvenida.",
        },
    ]
    recipe_docs = []
    for r in recipes:
        rec_id = _id("recipe")
        components = [c for c in (_rec_ing(n, q) for n, q in r["ings"]) if c]
        total_cost = round(sum(c["cost"] for c in components), 2)
        recipe_docs.append({
            "recipe_id": rec_id,
            "company_id": company_id,
            "name": r["name"],
            "category": r["category"],
            "yield_quantity": r["yield_qty"],
            "yield_unit": r["yield_unit"],
            "notes": r["notes"],
            "ingredients": components,
            "components": components,
            "total_cost": total_cost,
            "cost_per_portion": round(total_cost / max(1, r["yield_qty"]), 2),
            "tags": [],
            "allergens": [],
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
    if recipe_docs:
        await db.recipes.insert_many(recipe_docs)
    counts["recipes"] = len(recipe_docs)

    # -- Menu -----------------------------------------------------------------
    menu_id = _id("menu")
    menu_doc = {
        "menu_id": menu_id,
        "company_id": company_id,
        "name": "Menú Boda Signature",
        "description": "Menú de bodas de tres tiempos con opciones vegetarianas.",
        "category": "wedding",
        "items": [
            {"recipe_id": recipe_docs[3]["recipe_id"], "recipe_name": recipe_docs[3]["name"], "course": "starter"},
            {"recipe_id": recipe_docs[0]["recipe_id"], "recipe_name": recipe_docs[0]["name"], "course": "main"},
            {"recipe_id": recipe_docs[1]["recipe_id"], "recipe_name": recipe_docs[1]["name"], "course": "main"},
        ],
        "price_per_person": 65,
        "created_by": admin_user_id,
        "created_at": _iso(now),
    }
    await db.menus.insert_one(menu_doc)
    counts["menus"] = 1

    # -- Events (with proposals) ---------------------------------------------
    events_seed = [
        {"client_idx": 0, "days_out": 45, "name": "Boda María & Carlos", "guests": 120, "venue": "Casa de Campo — La Romana", "type": "wedding", "status": "committed"},
        {"client_idx": 1, "days_out": 20, "name": "Cena Anual Grupo Popular", "guests": 200, "venue": "Salón Panorama, Torre Empresarial", "type": "corporate", "status": "scope_drafted"},
        {"client_idx": 3, "days_out": 60, "name": "Cumpleaños 50 · Andrea", "guests": 60, "venue": "Residencia privada, Naco", "type": "birthday", "status": "context_captured"},
    ]
    event_docs = []
    proposal_docs = []
    for ev in events_seed:
        event_id = _id("event")
        client = client_docs[ev["client_idx"]]
        ev_date = now + timedelta(days=ev["days_out"])
        event_docs.append({
            "event_id": event_id,
            "engagement_id": event_id,
            "company_id": company_id,
            "engagement_type": "event",
            "name": ev["name"],
            "client_id": client["client_id"],
            "client_name": client["display_name"],
            "event_date": ev_date.date().isoformat(),
            "guest_count": ev["guests"],
            "venue": ev["venue"],
            "event_type": ev["type"],
            "status": ev["status"],
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
        # Proposal
        prop_id = _id("prop")
        proposal_docs.append({
            "proposal_id": prop_id,
            "company_id": company_id,
            "event_id": event_id,
            "engagement_id": event_id,
            "client_id": client["client_id"],
            "proposal_number": f"PROP-{now.year}-{len(proposal_docs)+1:04d}",
            "status": "draft" if ev["status"] != "committed" else "sent",
            "subtotal": ev["guests"] * 65,
            "total": ev["guests"] * 65,
            "currency": "USD",
            "items": [],
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
    if event_docs:
        await db.events.insert_many(event_docs)
    if proposal_docs:
        await db.proposals.insert_many(proposal_docs)
    counts["events"] = len(event_docs)
    counts["proposals"] = len(proposal_docs)

    return counts


# ---------------------------------------------------------------------------
# AGENCY / CONSULTING (professional services)
# ---------------------------------------------------------------------------
async def _seed_agency(db, company_id: str, admin_user_id: str, now: datetime, industry_type: str) -> dict:
    counts: dict = {}
    is_consulting = industry_type == "consulting"
    project_word = "Proyecto" if not is_consulting else "Engagement"

    clients = [
        {"name": "Banco BHD León", "email": "marketing@bhdleon.example", "phone": "+1 809-555-0201", "client_type": "corporate"},
        {"name": "Startup FreshMarket", "email": "ceo@freshmarket.example", "phone": "+1 809-555-0202", "client_type": "startup"},
        {"name": "Ministerio de Turismo", "email": "prensa@mitur.gob.example", "phone": "+1 809-555-0203", "client_type": "government"},
        {"name": "Fundación Ciudad Verde", "email": "hola@ciudadverde.org.example", "phone": "+1 809-555-0204", "client_type": "nonprofit"},
        {"name": "Grupo Ramos", "email": "marca@ramos.example", "phone": "+1 809-555-0205", "client_type": "corporate"},
    ]
    client_docs = []
    for c in clients:
        cid = _id("client")
        client_docs.append({
            "client_id": cid,
            "lead_id": cid,
            "company_id": company_id,
            "display_name": c["name"],
            "name": c["name"],
            "email": c["email"],
            "phone": c["phone"],
            "client_type": c["client_type"],
            "status": "committed",
            "source": "demo_seed",
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
    await db.leads.insert_many(client_docs)
    counts["clients"] = len(client_docs)

    project_seed = [
        {"client_idx": 0, "name": f"{project_word} Rebranding Digital 2026", "days_out": 30, "value": 45000, "status": "proposal"},
        {"client_idx": 1, "name": f"{project_word} Growth Marketing Q2", "days_out": 15, "value": 18000, "status": "won"},
        {"client_idx": 2, "name": f"{project_word} Estrategia Turismo Sostenible", "days_out": 60, "value": 62000, "status": "discovery"},
    ]
    event_docs = []
    proposal_docs = []
    for ev in project_seed:
        event_id = _id("event")
        client = client_docs[ev["client_idx"]]
        event_docs.append({
            "event_id": event_id,
            "engagement_id": event_id,
            "company_id": company_id,
            "engagement_type": "project",
            "name": ev["name"],
            "client_id": client["client_id"],
            "client_name": client["display_name"],
            "event_date": (now + timedelta(days=ev["days_out"])).date().isoformat(),
            "guest_count": 8,
            "venue": "Remoto",
            "event_type": "consulting" if is_consulting else "implementation",
            "status": ev["status"],
            "estimated_value": ev["value"],
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
        proposal_docs.append({
            "proposal_id": _id("prop"),
            "company_id": company_id,
            "event_id": event_id,
            "engagement_id": event_id,
            "client_id": client["client_id"],
            "proposal_number": f"PROP-{now.year}-{len(proposal_docs)+1:04d}",
            "status": "sent" if ev["status"] != "discovery" else "draft",
            "subtotal": ev["value"],
            "total": ev["value"],
            "currency": "USD",
            "items": [],
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
    await db.events.insert_many(event_docs)
    await db.proposals.insert_many(proposal_docs)
    counts["projects"] = len(event_docs)
    counts["proposals"] = len(proposal_docs)

    return counts


# ---------------------------------------------------------------------------
# GENERIC
# ---------------------------------------------------------------------------
async def _seed_generic(db, company_id: str, admin_user_id: str, now: datetime) -> dict:
    counts: dict = {}

    clients = [
        {"name": "Cliente Uno S.A.", "email": "contact@clienteuno.example", "phone": "+1 809-555-0301", "client_type": "business"},
        {"name": "Cliente Dos SRL", "email": "info@clientedos.example", "phone": "+1 809-555-0302", "client_type": "business"},
        {"name": "Juan Individual", "email": "juan@example.com", "phone": "+1 809-555-0303", "client_type": "individual"},
    ]
    client_docs = []
    for c in clients:
        cid = _id("client")
        client_docs.append({
            "client_id": cid,
            "lead_id": cid,
            "company_id": company_id,
            "display_name": c["name"],
            "name": c["name"],
            "email": c["email"],
            "phone": c["phone"],
            "client_type": c["client_type"],
            "status": "committed",
            "source": "demo_seed",
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
    await db.leads.insert_many(client_docs)
    counts["clients"] = len(client_docs)

    service_seed = [
        {"client_idx": 0, "name": "Servicio Mensual Enero", "days_out": 5, "value": 1500},
        {"client_idx": 1, "name": "Suscripción Anual Premium", "days_out": 12, "value": 12000},
    ]
    event_docs = []
    for ev in service_seed:
        event_id = _id("event")
        client = client_docs[ev["client_idx"]]
        event_docs.append({
            "event_id": event_id,
            "engagement_id": event_id,
            "company_id": company_id,
            "engagement_type": "service",
            "name": ev["name"],
            "client_id": client["client_id"],
            "client_name": client["display_name"],
            "event_date": (now + timedelta(days=ev["days_out"])).date().isoformat(),
            "guest_count": 1,
            "venue": "Ubicación cliente",
            "event_type": "recurring",
            "status": "accepted",
            "estimated_value": ev["value"],
            "created_by": admin_user_id,
            "created_at": _iso(now),
        })
    await db.events.insert_many(event_docs)
    counts["services"] = len(event_docs)

    return counts
