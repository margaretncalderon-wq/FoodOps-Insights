"""
Scheduler: jobs que corren periódicamente.
- Daily 9am EST: notify admins of sales performance alerts (inactivity / below goal).
"""
import logging
import os
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import db
from routers.notifications import notify_org_admins

logger = logging.getLogger(__name__)
_scheduler = None


async def _run_vacation_anniversary_reset():
    """Daily job: reset vacation days for employees whose hire_date anniversary is today (with unlimited carryover)."""
    try:
        from routers.people_ops import run_daily_vacation_anniversary_reset  # late import
        count = await run_daily_vacation_anniversary_reset()
        logger.info(f"[scheduler] vacation anniversary reset done: {count} employees processed")
    except Exception as e:
        logger.exception(f"[scheduler] vacation anniversary reset failed: {e}")


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


async def _send_culinary_digests():
    """Hourly: scan companies with enabled digest settings, dispatch when day_of_week+hour matches.
    Frequency 'biweekly' fires only on even ISO weeks; 'monthly' fires only on the 1st-7th of the month.
    """
    try:
        from routers.culinary_digest import dispatch_digest, _get_settings
        from dependencies import User  # User model for instantiation
    except Exception as e:
        logger.warning(f"[scheduler] culinary digest import failed: {e}")
        return

    now = datetime.now(timezone.utc)
    # Convert to local tz (best-effort — uses scheduler tz which is the company default)
    local_now = now  # treat naive comparison since cron runs every hour, ±1h tolerance is fine
    cur_dow = local_now.weekday()  # 0=Mon..6=Sun
    cur_hour = local_now.hour

    settings_cursor = db.culinary_digest_settings.find({"enabled": True}, {"_id": 0})
    sent = 0
    skipped = 0
    async for s in settings_cursor:
        try:
            if int(s.get("day_of_week", 0)) != cur_dow:
                skipped += 1
                continue
            if int(s.get("hour", 8)) != cur_hour:
                skipped += 1
                continue
            freq = s.get("frequency", "weekly")
            if freq == "biweekly":
                iso_week = local_now.isocalendar()[1]
                if iso_week % 2 != 0:
                    skipped += 1
                    continue
            elif freq == "monthly":
                if local_now.day > 7:
                    skipped += 1
                    continue
            # We need a "user" to call dispatch_digest. Pick an admin for the company.
            company_id = s["company_id"]
            admin = await db.users.find_one(
                {"company_id": company_id, "role": {"$in": ["owner", "admin"]}},
                {"_id": 0, "user_id": 1, "company_id": 1, "role": 1, "email": 1, "name": 1, "created_at": 1},
            )
            if not admin:
                logger.warning(f"[scheduler] no admin for {company_id}, skipping digest")
                skipped += 1
                continue
            admin.setdefault("created_at", datetime.now(timezone.utc))
            admin.setdefault("name", admin.get("email", "scheduler"))
            user_obj = User(**admin)
            await dispatch_digest(company_id, user_obj, s)
            sent += 1
        except Exception as e:
            logger.exception(f"[scheduler] digest dispatch failed for {s.get('company_id')}: {e}")
    if sent or skipped:
        logger.info(f"[scheduler] culinary-digest hourly tick: sent={sent} skipped={skipped}")


async def _send_overtime_digests():
    """Send OT digest emails. Runs every Monday 8am.
    Determines per-company frequency and skips if not due."""
    try:
        from routers.people_ops import overtime_report
        from utils.email_sender import send_email
        from datetime import date as date_cls
        
        schedules = await db.ot_email_schedule.find({"enabled": True}, {"_id": 0}).to_list(500)
        today = date_cls.today()
        
        for sched in schedules:
            try:
                freq = sched.get("frequency", "biweekly")
                # Decide whether to send today
                # weekly → every Monday
                # biweekly → Mondays of weeks 1 and 3 of month (days 1-7 and 15-21)
                # monthly → Monday closest to 1st of month
                should_send = False
                if freq == "weekly":
                    should_send = True
                elif freq == "biweekly":
                    should_send = today.day <= 7 or 15 <= today.day <= 21
                elif freq == "monthly":
                    should_send = today.day <= 7
                if not should_send:
                    continue
                
                company_id = sched["company_id"]
                recipients = sched.get("recipients") or []
                if not recipients:
                    # default: company admins
                    admins = await db.users.find(
                        {"company_id": company_id, "role": {"$in": ["owner", "admin", "hr"]}, "email": {"$exists": True}},
                        {"_id": 0, "email": 1}
                    ).to_list(20)
                    recipients = [a["email"] for a in admins if a.get("email")]
                if not recipients:
                    continue
                
                # Fake a User object for the call
                admin = await db.users.find_one(
                    {"company_id": company_id, "role": {"$in": ["owner", "admin", "hr"]}},
                    {"_id": 0, "user_id": 1, "company_id": 1, "role": 1, "email": 1, "name": 1, "created_at": 1},
                )
                if not admin:
                    continue
                admin.setdefault("created_at", datetime.now(timezone.utc))
                admin.setdefault("name", admin.get("email", "scheduler"))
                from models.auth import User
                user_obj = User(**admin)
                
                # Get the previous period
                if freq == "weekly":
                    ref_date = (today - timedelta(days=7)).isoformat()
                elif freq == "biweekly":
                    ref_date = (today - timedelta(days=14)).isoformat()
                else:
                    ref_date = (today.replace(day=1) - timedelta(days=1)).isoformat()
                
                report = await overtime_report(period=freq, date=ref_date, status=None, user=user_obj)
                
                if not report.get("rows"):
                    continue
                
                # Build a simple HTML email
                rows_html = ""
                for r in report["rows"]:
                    rows_html += f"""
                    <tr>
                        <td style="padding:8px;border:1px solid #ddd">{r.get('employee_name', '-')}</td>
                        <td style="padding:8px;border:1px solid #ddd;text-align:right">{r.get('total_hours', 0)}h</td>
                        <td style="padding:8px;border:1px solid #ddd;text-align:right">RD${r.get('estimated_amount', 0):,.2f}</td>
                    </tr>"""
                
                t = report["totals"]
                html = f"""
                <h2 style="color:#6D28D9">Reporte de Horas Extras — {report['label']}</h2>
                <p><strong>Rango:</strong> {report['start_date']} → {report['end_date']}</p>
                <p><strong>Total empleados con OT:</strong> {t.get('employees', 0)}<br>
                <strong>Total horas:</strong> {t.get('total_hours', 0)}<br>
                <strong>Total estimado:</strong> RD${t.get('estimated_amount', 0):,.2f}</p>
                <table style="border-collapse:collapse;width:100%;margin-top:16px">
                    <thead>
                        <tr style="background:#6D28D9;color:white">
                            <th style="padding:8px;text-align:left">Empleado</th>
                            <th style="padding:8px;text-align:right">Horas</th>
                            <th style="padding:8px;text-align:right">Monto</th>
                        </tr>
                    </thead>
                    <tbody>{rows_html}</tbody>
                </table>
                <p style="color:#666;font-size:12px;margin-top:24px">Generado automáticamente por Kora OS · People Ops</p>
                """
                
                subject = f"[Kora OS] Reporte HE — {report['label']}"
                try:
                    for rec in recipients:
                        send_email(rec, subject, html)
                except Exception as ex:
                    logger.warning(f"[scheduler] OT digest email failed: {ex}")
                
                await db.ot_email_schedule.update_one(
                    {"company_id": company_id},
                    {"$set": {"last_sent_at": datetime.now(timezone.utc).isoformat()}}
                )
            except Exception as e:
                logger.exception(f"[scheduler] OT digest per-company failed: {e}")
    except Exception as e:
        logger.exception(f"[scheduler] OT digests dispatch failed: {e}")


async def _send_overdue_delivery_note_alerts():
    """Daily 08:15 local: notify org admins about delivery notes that just crossed
    into overdue (expected_return_date < today AND status still pending/partial).

    Idempotent per (company_id, note_id, day) via `overdue_notes_log` collection —
    an admin won't get spammed the same alert multiple times per day, but they'll
    get re-notified the next day if the note is still out. Keeps ops accountable
    without noise.
    """
    from routers.notifications import notify_org_admins  # late import

    try:
        today = datetime.now(timezone.utc).date()
        today_key = today.isoformat()
        today_str = today.strftime("%Y-%m-%d")

        # Find delivery notes still out with a return date already in the past.
        # We only scan pending/partial — returned notes are done.
        overdue_cursor = db.delivery_notes.find(
            {
                "status": {"$in": ["pending", "partial"]},
                "expected_return_date": {"$lt": today_str, "$ne": None},
            },
            {"_id": 0},
        )
        total_sent = 0
        async for note in overdue_cursor:
            company_id = note.get("company_id")
            note_id = note.get("note_id")
            if not company_id or not note_id:
                continue

            # Idempotency guard: one alert per (company, note, day)
            already = await db.overdue_notes_log.find_one({
                "company_id": company_id,
                "note_id": note_id,
                "day": today_key,
            })
            if already:
                continue

            # Days overdue for a more actionable message
            try:
                dl = datetime.strptime(str(note["expected_return_date"])[:10], "%Y-%m-%d").date()
                days_overdue = (today - dl).days
            except Exception:
                days_overdue = None

            # Enrich with event name for context
            event_name = ""
            if note.get("event_id"):
                ev = await db.events.find_one(
                    {"event_id": note["event_id"], "company_id": company_id},
                    {"_id": 0, "event_name": 1, "name": 1},
                )
                if ev:
                    event_name = ev.get("event_name") or ev.get("name") or ""

            note_number = note.get("note_number") or note_id[-8:]
            title = f"⏰ Conduce vencido: {note_number}"
            msg_parts = [f"Retorno esperado {note['expected_return_date']}"]
            if days_overdue and days_overdue > 0:
                msg_parts.append(f"hace {days_overdue}d")
            if event_name:
                msg_parts.append(f"· {event_name}")
            message = " · ".join(msg_parts)

            await notify_org_admins(
                org_id=company_id,
                notification_type="delivery_note_overdue",
                title=title,
                message=message,
                link=f"/ops-supplies/checkin?note_id={note_id}",
                metadata={"note_id": note_id, "days_overdue": days_overdue},
                priority="high",
            )

            await db.overdue_notes_log.insert_one({
                "company_id": company_id,
                "note_id": note_id,
                "day": today_key,
                "days_overdue": days_overdue,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            total_sent += 1

        logger.info(f"[scheduler] overdue-delivery-notes tick: sent={total_sent}")
    except Exception as e:
        logger.exception(f"[scheduler] overdue-delivery-notes failed: {e}")


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
    # Hourly tick — culinary digest dispatcher (Sprint 5)
    _scheduler.add_job(
        _send_culinary_digests,
        trigger=CronTrigger(minute=5),  # 5 min past every hour to avoid clash with weekly @8:00
        id="culinary_digest_dispatcher",
        replace_existing=True,
        misfire_grace_time=600,
    )
    # Monday 8:30am — OT digest emails (weekly/biweekly/monthly per company prefs)
    _scheduler.add_job(
        _send_overtime_digests,
        trigger=CronTrigger(day_of_week="mon", hour=8, minute=30),
        id="ot_digest_dispatcher",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    # Daily 00:30 local — Vacation anniversary reset (People Ops)
    _scheduler.add_job(
        _run_vacation_anniversary_reset,
        trigger=CronTrigger(hour=0, minute=30),
        id="vacation_anniversary_reset",
        replace_existing=True,
        misfire_grace_time=6 * 3600,
    )
    # Daily 08:15 local — Overdue Delivery Notes alerts (Resource Management)
    _scheduler.add_job(
        _send_overdue_delivery_note_alerts,
        trigger=CronTrigger(hour=8, minute=15),
        id="overdue_delivery_notes_dispatcher",
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
