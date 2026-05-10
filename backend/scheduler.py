"""
Scheduler: jobs que corren periódicamente.
- Daily 9am EST: notify admins of sales performance alerts (inactivity / below goal).
"""
import logging
import os
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import db
from routers.notifications import notify_org_admins

logger = logging.getLogger(__name__)
_scheduler = None


async def _send_daily_performance_alerts():
    """Run for every company that has comm logs / leads, notify admins of inactivity & below_goal."""
    from routers.crm import _period_bounds, SCORE_WEIGHTS  # late import to avoid circular

    try:
        # Find every company with sales activity in last 30 days
        thirty_days_ago = (datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)).isoformat()
        from datetime import timedelta
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

        active_companies = await db.leads.distinct("company_id", {"created_at": {"$gte": thirty_days_ago}})
        active_companies += await db.comm_logs.distinct("company_id", {"created_at": {"$gte": thirty_days_ago}})
        company_ids = list(set(active_companies))
        logger.info(f"[scheduler] daily-alerts running for {len(company_ids)} companies")

        today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        total_sent = 0

        for company_id in company_ids:
            try:
                # Find admins
                admins = await db.users.find(
                    {"company_id": company_id, "role": {"$in": ["admin", "owner", "manager"]}},
                    {"_id": 0, "user_id": 1},
                ).to_list(50)
                if not admins:
                    continue

                # Compute current week alerts inline
                now = datetime.now(timezone.utc)
                _period_bounds("week", 0, now)  # validate granularity

                # Gather salespeople activity (last 3 days for inactivity check)
                three_days_ago = (now - timedelta(days=3)).isoformat()
                comm_logs = await db.comm_logs.find(
                    {"company_id": company_id, "created_at": {"$gte": three_days_ago}},
                    {"_id": 0, "owner_id": 1, "created_at": 1},
                ).to_list(20000)
                leads_recent = await db.leads.find(
                    {"company_id": company_id, "created_at": {"$gte": three_days_ago}},
                    {"_id": 0, "owner_id": 1, "created_at": 1},
                ).to_list(20000)

                # All salespeople (users with role sales/admin/manager)
                sales_users = await db.users.find(
                    {"company_id": company_id, "role": {"$in": ["sales", "admin", "manager", "owner"]}},
                    {"_id": 0, "user_id": 1, "name": 1, "email": 1},
                ).to_list(200)

                inactive_count = 0
                for u in sales_users:
                    uid = u["user_id"]
                    name = u.get("name") or u.get("email", "").split("@")[0]
                    recent_count = sum(1 for c in comm_logs if c.get("owner_id") == uid)
                    recent_count += sum(1 for ld in leads_recent if ld.get("owner_id") == uid)
                    if recent_count == 0:
                        # Idempotency: only one notif per (owner, type, day)
                        already = await db.alert_notifications_log.find_one({
                            "company_id": company_id,
                            "owner_id": uid,
                            "type": "inactivity",
                            "day": today_key,
                        })
                        if already:
                            continue
                        await notify_org_admins(
                            org_id=company_id,
                            notification_type="sales_inactivity",
                            title="⚠️ Vendedor inactivo",
                            message=f"{name} sin actividad en 3+ días",
                            link="/client-engagement/crm/sales-report",
                            metadata={"owner_id": uid, "alert_type": "inactivity"},
                        )
                        await db.alert_notifications_log.insert_one({
                            "company_id": company_id,
                            "owner_id": uid,
                            "type": "inactivity",
                            "day": today_key,
                            "created_at": now.isoformat(),
                        })
                        inactive_count += 1
                        total_sent += 1

                logger.info(f"[scheduler] company {company_id}: notified {inactive_count} inactivity")
            except Exception as e:
                logger.exception(f"[scheduler] company {company_id} error: {e}")

        logger.info(f"[scheduler] daily-alerts done — total_sent={total_sent}")
    except Exception as e:
        logger.exception(f"[scheduler] daily-alerts top-level error: {e}")


async def _send_weekly_newsletter_all_companies():
    """Saturday 8am: send weekly Performance newsletter via SMTP to all org admins."""
    from routers.crm import _send_weekly_newsletter_for_company
    try:
        from datetime import timedelta
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        # Companies that have any sales activity in the last 30 days
        active = set()
        active.update(await db.leads.distinct("company_id", {"created_at": {"$gte": thirty_days_ago}}))
        active.update(await db.comm_logs.distinct("company_id", {"created_at": {"$gte": thirty_days_ago}}))
        # Plus any company with users (for first-week emptiness)
        users_companies = await db.users.distinct("company_id", {"role": {"$in": ["admin", "owner", "manager"]}})
        active.update(users_companies)
        company_ids = [c for c in active if c]
        logger.info(f"[scheduler] weekly-newsletter running for {len(company_ids)} companies")
        ok = 0
        for cid in company_ids:
            try:
                res = await _send_weekly_newsletter_for_company(cid)
                if res.get("ok"):
                    ok += 1
            except Exception as e:
                logger.exception(f"[scheduler] newsletter for {cid} failed: {e}")
        logger.info(f"[scheduler] weekly-newsletter done — {ok}/{len(company_ids)} companies sent")
    except Exception as e:
        logger.exception(f"[scheduler] weekly-newsletter top-level error: {e}")


def start_scheduler():
    """Initialize and start the global scheduler (idempotent)."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    # Default to America/Santo_Domingo if not set; fall back to UTC if unavailable.
    tz = os.environ.get("APP_TIMEZONE", "America/Santo_Domingo")
    try:
        _scheduler = AsyncIOScheduler(timezone=tz)
    except Exception:
        _scheduler = AsyncIOScheduler(timezone="UTC")
        tz = "UTC"

    # Daily 9:00 local time — alerts
    _scheduler.add_job(
        _send_daily_performance_alerts,
        trigger=CronTrigger(hour=9, minute=0),
        id="daily_sales_alerts",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    # Saturday 8:00 local time — weekly newsletter
    _scheduler.add_job(
        _send_weekly_newsletter_all_companies,
        trigger=CronTrigger(day_of_week="sat", hour=8, minute=0),
        id="weekly_performance_newsletter",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.start()
    logger.info(f"[scheduler] started in tz={tz} — jobs: {[j.id for j in _scheduler.get_jobs()]}")
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
