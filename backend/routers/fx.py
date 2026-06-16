# routers/fx.py
# Live FX conversion service. Caches daily rates from open.er-api.com (free, no key).

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone, timedelta
import httpx

from config import db
from models.auth import User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/fx", tags=["FX"])

FX_API_URL = "https://open.er-api.com/v6/latest/{base}"
FX_CACHE_COLLECTION = "fx_rates_cache"
CACHE_TTL_HOURS = 24


async def _fetch_rates_for_base(base: str) -> Optional[dict]:
    """Fetch fresh rates from upstream, persist to cache. Returns the rates dict or None on failure."""
    base = base.upper()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(FX_API_URL.format(base=base))
            if res.status_code != 200:
                return None
            data = res.json()
            if data.get("result") != "success":
                return None
            doc = {
                "base": base,
                "rates": data.get("rates", {}),
                "time_last_update_utc": data.get("time_last_update_utc"),
                "time_next_update_utc": data.get("time_next_update_utc"),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
            await db[FX_CACHE_COLLECTION].update_one(
                {"base": base},
                {"$set": doc},
                upsert=True,
            )
            return doc
    except Exception as e:
        print(f"FX fetch failed for {base}: {e}")
        return None


async def get_cached_rates(base: str) -> Optional[dict]:
    """Returns cached rates for base. Triggers a refresh if cache is stale (>24h) or missing."""
    base = base.upper()
    cached = await db[FX_CACHE_COLLECTION].find_one({"base": base}, {"_id": 0})
    
    needs_refresh = True
    if cached and cached.get("fetched_at"):
        try:
            fetched = datetime.fromisoformat(cached["fetched_at"])
            if datetime.now(timezone.utc) - fetched < timedelta(hours=CACHE_TTL_HOURS):
                needs_refresh = False
        except Exception:
            pass
    
    if needs_refresh:
        fresh = await _fetch_rates_for_base(base)
        if fresh:
            return fresh
    
    return cached


async def convert_amount(amount: float, from_currency: str, to_currency: str) -> dict:
    """Convert amount between two currencies. Returns {converted, rate, from, to, as_of}."""
    from_currency = (from_currency or "USD").upper()
    to_currency = (to_currency or "USD").upper()
    
    if from_currency == to_currency:
        return {
            "converted": round(float(amount), 2),
            "rate": 1.0,
            "from": from_currency,
            "to": to_currency,
            "as_of": datetime.now(timezone.utc).isoformat(),
            "source": "identity",
        }
    
    rates_doc = await get_cached_rates(from_currency)
    if not rates_doc:
        # Try reverse direction (some bases not supported)
        rates_doc = await get_cached_rates(to_currency)
        if not rates_doc:
            raise HTTPException(status_code=503, detail=f"FX rates unavailable for {from_currency}/{to_currency}")
        rate_to_from = rates_doc["rates"].get(from_currency)
        if not rate_to_from:
            raise HTTPException(status_code=400, detail=f"Currency {from_currency} not found in rates")
        rate = 1.0 / rate_to_from
    else:
        rate = rates_doc["rates"].get(to_currency)
        if rate is None:
            raise HTTPException(status_code=400, detail=f"Currency {to_currency} not found in rates")
    
    converted = round(float(amount) * rate, 2)
    return {
        "converted": converted,
        "rate": round(rate, 6),
        "from": from_currency,
        "to": to_currency,
        "as_of": rates_doc.get("time_last_update_utc") or rates_doc.get("fetched_at"),
        "source": "open.er-api.com",
    }


@router.get("/convert")
async def fx_convert(
    amount: float = Query(..., ge=0),
    from_currency: str = Query(..., alias="from", min_length=3, max_length=3),
    to_currency: str = Query(..., alias="to", min_length=3, max_length=3),
    user: User = Depends(get_current_user),
):
    """Convert an amount between two currencies using cached daily rates."""
    return await convert_amount(amount, from_currency, to_currency)


@router.get("/rates")
async def fx_rates(
    base: str = Query("USD", min_length=3, max_length=3),
    user: User = Depends(get_current_user),
):
    """Get all rates for a base currency."""
    base = base.upper()
    doc = await get_cached_rates(base)
    if not doc:
        raise HTTPException(status_code=503, detail="FX rates currently unavailable")
    return {
        "base": doc["base"],
        "rates": doc["rates"],
        "as_of": doc.get("time_last_update_utc") or doc.get("fetched_at"),
        "next_update": doc.get("time_next_update_utc"),
        "source": "open.er-api.com",
    }


@router.post("/refresh")
async def fx_refresh(
    base: str = Query("USD", min_length=3, max_length=3),
    user: User = Depends(get_current_user),
):
    """Force a refresh of rates for a base currency. Admin-only."""
    if user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    doc = await _fetch_rates_for_base(base)
    if not doc:
        raise HTTPException(status_code=503, detail="Upstream FX service unavailable")
    return {"message": "Refreshed", "base": doc["base"], "as_of": doc.get("time_last_update_utc")}
