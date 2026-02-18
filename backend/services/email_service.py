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


# ============== TRIAL ENDING EMAIL ==============

def get_trial_ending_email_html(user_name: str, days_remaining: int, monthly_cost: float, modules: list) -> str:
    """Generate trial ending notification email HTML"""
    modules_html = "".join([f"""
        <tr>
            <td style="padding: 8px 0;">
                <span style="color: #3A4D3F; font-size: 18px;">•</span>
                <span style="color: #4a5568; font-size: 15px; margin-left: 12px;">{m}</span>
            </td>
        </tr>
    """ for m in modules])
    
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
                        <td style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 40px 40px 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
                                ⏰ Tu período de prueba termina pronto
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hola <strong>{user_name}</strong>,
                            </p>
                            
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Tu período de prueba gratuita de <strong>{days_remaining} día(s)</strong> está por terminar. 
                                Para continuar disfrutando de todos los beneficios de Kora OS, necesitas agregar un método de pago.
                            </p>
                            
                            <!-- Plan Info Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; margin: 24px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="color: #92400E; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">
                                            Tu suscripción actual
                                        </p>
                                        <p style="color: #78350F; font-size: 24px; font-weight: 700; margin: 0 0 12px;">
                                            ${monthly_cost}/mes
                                        </p>
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            {modules_html}
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="https://ourkora.com/settings?tab=billing" style="display: inline-block; background: linear-gradient(135deg, #3A4D3F 0%, #2a3d2f 100%); color: #E5DCC5; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                                            Agregar método de pago →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #6b7a6a; font-size: 14px; line-height: 1.6; margin: 24px 0 0; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                                Si no deseas continuar, no necesitas hacer nada. Tu cuenta se mantendrá activa con acceso limitado.
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


async def send_trial_ending_email(
    to_email: str,
    user_name: str,
    days_remaining: int,
    monthly_cost: float,
    modules: list
) -> dict:
    """Send trial ending notification email"""
    html_content = get_trial_ending_email_html(user_name, days_remaining, monthly_cost, modules)
    return await send_email(
        to_email=to_email,
        subject=f"⏰ Tu período de prueba termina en {days_remaining} día(s)",
        html_content=html_content
    )


# ============== PASSWORD RESET EMAIL ==============

def get_password_reset_email_html(user_name: str, reset_link: str) -> str:
    """Generate password reset email HTML"""
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
                            <h1 style="color: #E5DCC5; margin: 0; font-size: 28px; font-weight: 700;">
                                🔐 Restablecer Contraseña
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hola <strong>{user_name}</strong>,
                            </p>
                            
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Recibimos una solicitud para restablecer la contraseña de tu cuenta en Kora OS.
                                Haz clic en el botón de abajo para crear una nueva contraseña.
                            </p>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="{reset_link}" style="display: inline-block; background: linear-gradient(135deg, #3A4D3F 0%, #2a3d2f 100%); color: #E5DCC5; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                                            Restablecer Contraseña →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #6b7a6a; font-size: 14px; line-height: 1.6; margin: 24px 0 0; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                                Este enlace expirará en 1 hora. Si no solicitaste este cambio, puedes ignorar este email.
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


async def send_password_reset_email(
    to_email: str,
    user_name: str,
    reset_link: str
) -> dict:
    """Send password reset email"""
    html_content = get_password_reset_email_html(user_name, reset_link)
    return await send_email(
        to_email=to_email,
        subject="🔐 Restablecer contraseña - Kora OS",
        html_content=html_content
    )


# ============== PAYMENT CONFIRMATION EMAIL ==============

def get_payment_confirmation_email_html(user_name: str, amount: float, plan_details: str, invoice_id: str) -> str:
    """Generate payment confirmation email HTML"""
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
                        <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 40px 40px 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
                                ✅ Pago Confirmado
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hola <strong>{user_name}</strong>,
                            </p>
                            
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Hemos recibido tu pago exitosamente. Gracias por confiar en Kora OS.
                            </p>
                            
                            <!-- Payment Details Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ECFDF5; border: 1px solid #10B981; border-radius: 8px; margin: 24px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <span style="color: #065F46; font-size: 14px;">Factura #</span>
                                                </td>
                                                <td style="padding: 8px 0; text-align: right;">
                                                    <span style="color: #065F46; font-size: 14px; font-weight: 600;">{invoice_id}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <span style="color: #065F46; font-size: 14px;">Plan</span>
                                                </td>
                                                <td style="padding: 8px 0; text-align: right;">
                                                    <span style="color: #065F46; font-size: 14px; font-weight: 600;">{plan_details}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 12px 0; border-top: 1px solid #10B981;">
                                                    <span style="color: #065F46; font-size: 16px; font-weight: 700;">Total</span>
                                                </td>
                                                <td style="padding: 12px 0; text-align: right; border-top: 1px solid #10B981;">
                                                    <span style="color: #065F46; font-size: 20px; font-weight: 700;">${amount}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="https://ourkora.com/settings?tab=billing" style="display: inline-block; background: linear-gradient(135deg, #3A4D3F 0%, #2a3d2f 100%); color: #E5DCC5; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                                            Ver historial de pagos →
                                        </a>
                                    </td>
                                </tr>
                            </table>
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


async def send_payment_confirmation_email(
    to_email: str,
    user_name: str,
    amount: float,
    plan_details: str,
    invoice_id: str
) -> dict:
    """Send payment confirmation email"""
    html_content = get_payment_confirmation_email_html(user_name, amount, plan_details, invoice_id)
    return await send_email(
        to_email=to_email,
        subject="✅ Pago confirmado - Kora OS",
        html_content=html_content
    )


# ============== CONTRACT/DOCUMENT SEND EMAIL ==============

def get_contract_email_html(
    client_name: str,
    event_name: str,
    event_date: str,
    document_type: str,
    portal_link: str,
    company_name: str,
    company_color: str = "#3A4D3F",
    total_amount: float = 0,
    requires_signature: bool = True
) -> str:
    """Generate contract/document email HTML"""
    doc_type_display = {
        "contract": {"en": "Contract", "es": "Contrato"},
        "quote": {"en": "Proposal", "es": "Propuesta"},
        "invoice": {"en": "Invoice", "es": "Factura"},
    }
    doc_name = doc_type_display.get(document_type, {"en": "Document", "es": "Documento"})
    
    signature_text = """
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
            Por favor revisa el documento y fírmalo digitalmente haciendo clic en el botón de abajo.
        </p>
    """ if requires_signature else """
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
            Por favor revisa el documento haciendo clic en el botón de abajo.
        </p>
    """
    
    amount_section = f"""
        <tr>
            <td style="padding: 8px 0;">
                <span style="color: #065F46; font-size: 14px;">Total</span>
            </td>
            <td style="padding: 8px 0; text-align: right;">
                <span style="color: #065F46; font-size: 18px; font-weight: 700;">${total_amount:,.2f}</span>
            </td>
        </tr>
    """ if total_amount > 0 else ""
    
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
                        <td style="background: linear-gradient(135deg, {company_color} 0%, {company_color}dd 100%); padding: 40px 40px 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                                {company_name}
                            </h1>
                            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">
                                {doc_name["es"]} para tu evento
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="color: #1a1f1a; margin: 0 0 20px; font-size: 24px; font-weight: 600;">
                                ¡Hola {client_name}! 📄
                            </h2>
                            
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Te enviamos el <strong>{doc_name["es"].lower()}</strong> para tu evento.
                            </p>
                            
                            {signature_text}
                            
                            <!-- Event Info Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8faf8; border-radius: 8px; margin: 24px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="color: {company_color}; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px;">
                                            Detalles del Evento
                                        </p>
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <span style="color: #6b7a6a; font-size: 14px;">Evento</span>
                                                </td>
                                                <td style="padding: 8px 0; text-align: right;">
                                                    <span style="color: #1a1f1a; font-size: 14px; font-weight: 600;">{event_name}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0;">
                                                    <span style="color: #6b7a6a; font-size: 14px;">Fecha</span>
                                                </td>
                                                <td style="padding: 8px 0; text-align: right;">
                                                    <span style="color: #1a1f1a; font-size: 14px; font-weight: 600;">{event_date}</span>
                                                </td>
                                            </tr>
                                            {amount_section}
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="{portal_link}" style="display: inline-block; background: linear-gradient(135deg, {company_color} 0%, {company_color}dd 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                                            {"Revisar y Firmar →" if requires_signature else "Ver Documento →"}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #6b7a6a; font-size: 14px; line-height: 1.6; margin: 24px 0 0; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                                ¿Tienes alguna pregunta? Responde a este email y te ayudaremos.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8faf8; padding: 24px 40px; text-align: center;">
                            <p style="color: #6b7a6a; font-size: 13px; margin: 0;">
                                Powered by Kora OS
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


async def send_contract_email(
    to_email: str,
    client_name: str,
    event_name: str,
    event_date: str,
    document_type: str,
    portal_link: str,
    company_name: str,
    company_color: str = "#3A4D3F",
    total_amount: float = 0,
    requires_signature: bool = True,
    pdf_attachment: bytes = None,
    pdf_filename: str = None
) -> dict:
    """Send contract/document email to client with optional PDF attachment"""
    html_content = get_contract_email_html(
        client_name=client_name,
        event_name=event_name,
        event_date=event_date,
        document_type=document_type,
        portal_link=portal_link,
        company_name=company_name,
        company_color=company_color,
        total_amount=total_amount,
        requires_signature=requires_signature
    )
    
    doc_type_display = {
        "contract": "Contrato",
        "quote": "Propuesta",
        "invoice": "Factura",
    }
    doc_name = doc_type_display.get(document_type, "Documento")
    
    subject = f"📄 {doc_name} - {event_name} | {company_name}"
    
    if not is_email_configured():
        logger.warning("Email service not configured - RESEND_API_KEY missing")
        return {"status": "skipped", "reason": "Email service not configured"}
    
    params = {
        "from": SENDER_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_content
    }
    
    # Add PDF attachment if provided
    if pdf_attachment and pdf_filename:
        import base64
        params["attachments"] = [{
            "filename": pdf_filename,
            "content": base64.b64encode(pdf_attachment).decode("utf-8")
        }]
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Contract email sent successfully to {to_email}")
        return {
            "status": "success",
            "email_id": email.get("id")
        }
    except Exception as e:
        logger.error(f"Failed to send contract email to {to_email}: {str(e)}")
        return {
            "status": "error",
            "error": str(e)
        }
