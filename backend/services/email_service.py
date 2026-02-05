# services/email_service.py - Email service using Resend
import os
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Check if Resend is configured
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

# Only import resend if API key is configured
if RESEND_API_KEY:
    import resend
    resend.api_key = RESEND_API_KEY


def is_email_configured() -> bool:
    """Check if email service is properly configured"""
    return bool(RESEND_API_KEY)


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    from_email: Optional[str] = None
) -> dict:
    """
    Send an email using Resend API
    Returns dict with status and email_id or error
    """
    if not is_email_configured():
        logger.warning("Email service not configured - RESEND_API_KEY missing")
        return {"status": "skipped", "reason": "Email service not configured"}
    
    params = {
        "from": from_email or SENDER_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_content
    }
    
    try:
        # Run sync SDK in thread to keep FastAPI non-blocking
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent successfully to {to_email}")
        return {
            "status": "success",
            "email_id": email.get("id")
        }
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return {
            "status": "error",
            "error": str(e)
        }


# ============== EMAIL TEMPLATES ==============

def get_welcome_email_html(user_name: str, company_name: str, plan_name: str = "Free") -> str:
    """Generate welcome email HTML for new users"""
    return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #3A4D3F 0%, #2a3d2f 100%); padding: 40px 40px 30px; text-align: center;">
                            <h1 style="color: #E5DCC5; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                                Kora OS
                            </h1>
                            <p style="color: #a3b18a; margin: 8px 0 0; font-size: 14px;">
                                Business Management Platform
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="color: #1a1f1a; margin: 0 0 20px; font-size: 24px; font-weight: 600;">
                                ¡Bienvenido/a, {user_name}! 🎉
                            </h2>
                            
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Tu cuenta en <strong>Kora OS</strong> ha sido creada exitosamente. 
                                Ya puedes comenzar a gestionar tu negocio de manera más eficiente.
                            </p>
                            
                            <!-- Plan Info Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8faf8; border-radius: 8px; margin: 24px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="color: #3A4D3F; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">
                                            Tu Plan
                                        </p>
                                        <p style="color: #1a1f1a; font-size: 20px; font-weight: 700; margin: 0 0 12px;">
                                            Plan {plan_name}
                                        </p>
                                        <p style="color: #6b7a6a; font-size: 14px; margin: 0;">
                                            Empresa: <strong>{company_name}</strong>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                                Con tu Plan {plan_name} tienes acceso a:
                            </p>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding: 8px 0;">
                                        <span style="color: #3A4D3F; font-size: 18px;">✓</span>
                                        <span style="color: #4a5568; font-size: 15px; margin-left: 12px;">Gestión de clientes y leads</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;">
                                        <span style="color: #3A4D3F; font-size: 18px;">✓</span>
                                        <span style="color: #4a5568; font-size: 15px; margin-left: 12px;">Creación de eventos y propuestas</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;">
                                        <span style="color: #3A4D3F; font-size: 18px;">✓</span>
                                        <span style="color: #4a5568; font-size: 15px; margin-left: 12px;">Dashboard de Business Clarity</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;">
                                        <span style="color: #3A4D3F; font-size: 18px;">✓</span>
                                        <span style="color: #4a5568; font-size: 15px; margin-left: 12px;">Demand Studio para marketing</span>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="https://ourkora.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #3A4D3F 0%, #2a3d2f 100%); color: #E5DCC5; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                                            Ir al Dashboard →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #6b7a6a; font-size: 14px; line-height: 1.6; margin: 24px 0 0; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                                ¿Necesitas ayuda? Responde a este email y te asistiremos.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8faf8; padding: 24px 40px; text-align: center;">
                            <p style="color: #6b7a6a; font-size: 13px; margin: 0;">
                                © 2026 Kora OS. Todos los derechos reservados.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""


async def send_welcome_email(
    to_email: str,
    user_name: str,
    company_name: str,
    plan_name: str = "Free"
) -> dict:
    """Send welcome email to new user"""
    html_content = get_welcome_email_html(user_name, company_name, plan_name)
    return await send_email(
        to_email=to_email,
        subject=f"¡Bienvenido/a a Kora OS, {user_name}! 🎉",
        html_content=html_content
    )
