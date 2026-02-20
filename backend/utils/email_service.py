# utils/email_service.py - Email notification service using Resend
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

# Try to import resend, but don't fail if not installed
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False
    logger.warning("Resend library not installed. Email notifications will be logged only.")


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    from_email: Optional[str] = None
) -> dict:
    """
    Send an email using Resend API.
    If RESEND_API_KEY is not configured, logs the email instead.
    
    Returns:
        dict with 'success' boolean and 'message' or 'error'
    """
    sender = from_email or SENDER_EMAIL
    
    # Log the email attempt
    logger.info(f"Email notification: To={to_email}, Subject={subject}")
    
    # Check if Resend is configured
    if not RESEND_API_KEY:
        logger.warning(f"[DEMO MODE] Email not sent - RESEND_API_KEY not configured")
        logger.info(f"[DEMO MODE] Would send email:\n  To: {to_email}\n  Subject: {subject}\n  Content: {html_content[:200]}...")
        return {
            "success": True,
            "message": "Email logged (demo mode - no API key)",
            "demo_mode": True
        }
    
    if not RESEND_AVAILABLE:
        logger.warning(f"[DEMO MODE] Resend library not installed")
        return {
            "success": True,
            "message": "Email logged (demo mode - resend not installed)",
            "demo_mode": True
        }
    
    try:
        resend.api_key = RESEND_API_KEY
        
        result = resend.Emails.send({
            "from": sender,
            "to": [to_email],
            "subject": subject,
            "html": html_content
        })
        
        logger.info(f"Email sent successfully to {to_email}, id={result.get('id')}")
        return {
            "success": True,
            "message": "Email sent",
            "email_id": result.get("id"),
            "demo_mode": False
        }
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "demo_mode": False
        }


async def send_lead_assignment_notification(
    owner_email: str,
    owner_name: str,
    lead_name: str,
    lead_email: Optional[str],
    lead_phone: Optional[str],
    lead_source: str,
    assigned_by: str,
    company_name: str = "Kora OS"
) -> dict:
    """
    Send notification email when a lead is assigned to a sales person.
    """
    subject = f"Nuevo Lead Asignado: {lead_name}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #3A4D3F 0%, #5a7d5f 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
            .lead-card {{ background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 16px 0; }}
            .label {{ font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }}
            .value {{ font-size: 16px; font-weight: 500; color: #111827; }}
            .badge {{ display: inline-block; padding: 4px 12px; background: #dbeafe; color: #1d4ed8; border-radius: 12px; font-size: 12px; font-weight: 500; }}
            .cta {{ display: inline-block; margin-top: 16px; padding: 12px 24px; background: #3A4D3F; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }}
            .footer {{ margin-top: 20px; font-size: 12px; color: #9ca3af; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0; font-size: 20px;">Nuevo Lead Asignado</h1>
                <p style="margin: 8px 0 0 0; opacity: 0.9;">Tienes un nuevo prospecto para contactar</p>
            </div>
            <div class="content">
                <p>Hola <strong>{owner_name}</strong>,</p>
                <p>Se te ha asignado un nuevo lead. Aquí están los detalles:</p>
                
                <div class="lead-card">
                    <div style="margin-bottom: 12px;">
                        <div class="label">Nombre</div>
                        <div class="value">{lead_name}</div>
                    </div>
                    {f'<div style="margin-bottom: 12px;"><div class="label">Email</div><div class="value"><a href="mailto:{lead_email}">{lead_email}</a></div></div>' if lead_email else ''}
                    {f'<div style="margin-bottom: 12px;"><div class="label">Teléfono</div><div class="value"><a href="tel:{lead_phone}">{lead_phone}</a></div></div>' if lead_phone else ''}
                    <div>
                        <div class="label">Fuente</div>
                        <div><span class="badge">{lead_source}</span></div>
                    </div>
                </div>
                
                <p style="font-size: 14px; color: #6b7280;">Asignado por: {assigned_by}</p>
                
                <a href="#" class="cta">Ver Lead en {company_name}</a>
                
                <div class="footer">
                    <p>Este es un mensaje automático de {company_name}.</p>
                    <p>Si tienes preguntas, contacta a tu administrador.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    return await send_email(
        to_email=owner_email,
        subject=subject,
        html_content=html_content
    )
