"""
SMTP email service (Gmail SMTP by default).

Reads from environment:
  SMTP_HOST       (default: smtp.gmail.com)
  SMTP_PORT       (default: 587)
  SMTP_USER       (your Gmail address)
  SMTP_PASSWORD   (Gmail App Password — NOT your regular password)
  SMTP_FROM_NAME  (default: "Kora OS")
  SMTP_FROM_EMAIL (default: same as SMTP_USER)

If SMTP_USER or SMTP_PASSWORD are missing, send_email returns success=False with a
clear "demo mode" message and logs the email instead of crashing the request.
"""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from typing import List, Optional

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))


def _smtp_creds():
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()
    from_name = os.environ.get("SMTP_FROM_NAME", "Kora OS").strip()
    from_email = os.environ.get("SMTP_FROM_EMAIL", user).strip()
    return user, password, from_name, from_email


def is_smtp_configured() -> bool:
    user, password, _, _ = _smtp_creds()
    return bool(user and password)


def send_smtp_email(
    to: List[str],
    subject: str,
    html: str,
    text_fallback: Optional[str] = None,
) -> dict:
    """Synchronous SMTP send. Returns {success, message, recipients}."""
    if not to:
        return {"success": False, "message": "no recipients", "recipients": []}

    user, password, from_name, from_email = _smtp_creds()

    if not user or not password:
        logger.warning("[smtp demo mode] SMTP_USER or SMTP_PASSWORD missing — email NOT sent")
        logger.info(f"[smtp demo mode] would send '{subject}' to {to}")
        return {
            "success": False,
            "message": "SMTP not configured — set SMTP_USER and SMTP_PASSWORD in backend/.env",
            "recipients": to,
            "demo_mode": True,
        }

    msg = MIMEMultipart("alternative")
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject

    if text_fallback:
        msg.attach(MIMEText(text_fallback, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
            server.sendmail(from_email, to, msg.as_string())
        logger.info(f"[smtp] sent '{subject}' to {to}")
        return {"success": True, "message": "sent", "recipients": to}
    except Exception as e:
        logger.exception(f"[smtp] failed sending to {to}: {e}")
        return {"success": False, "message": str(e), "recipients": to}
