import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);
const FROM_EMAIL = env.RESEND_FROM_EMAIL;

/**
 * Sends a 6-digit verification code to the user's email.
 */
export async function sendVerificationCode(toEmail: string, code: string, userName: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `🔐 Tu código de verificación — AcademiX AI`,
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 32px; border-radius: 20px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 24px; margin: 0 0 4px 0; font-weight: 800;">Academi<span style="opacity: 0.9;">X</span> AI</h1>
            <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">Verificación de cuenta</p>
          </div>
          
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center;">
            <p style="color: #475569; font-size: 15px; margin: 0 0 8px 0;">Hola <strong>${userName}</strong>,</p>
            <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0;">Ingresa este código para verificar tu cuenta:</p>
            
            <div style="background: linear-gradient(135deg, #f0f4ff, #eef2ff); border: 2px dashed #818cf8; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
              <span style="font-family: 'Courier New', monospace; font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #3b82f6;">${code}</span>
            </div>
            
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              ⏱ Este código expira en <strong>10 minutos</strong>.<br>
              Si no solicitaste esta verificación, ignora este correo.
            </p>
          </div>
          
          <p style="text-align: center; color: #cbd5e1; font-size: 11px; margin-top: 20px;">
            © ${new Date().getFullYear()} AcademiX AI — Detección académica inteligente
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Error enviando correo de verificación:', error);
      return false;
    }
    console.log(`📧 Código de verificación enviado a ${toEmail}`);
    return true;
  } catch (err) {
    console.error('❌ Error de Resend:', err);
    return false;
  }
}

/**
 * Sends an email notifying the user their results are ready.
 */
export async function sendResultsReadyEmail(toEmail: string, userName: string, ticketId: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `✅ Tus resultados están listos — ${ticketId}`,
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; border-radius: 20px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 24px; margin: 0 0 4px 0; font-weight: 800;">Academi<span style="opacity: 0.9;">X</span> AI</h1>
            <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">Resultados disponibles</p>
          </div>
          
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center;">
            <div style="width: 56px; height: 56px; background: #ecfdf5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 28px;">✅</div>
            <p style="color: #1e293b; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">¡Hola ${userName}!</p>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 20px 0;">Los reportes de análisis de tu documento ya están disponibles.</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Ticket</p>
              <p style="color: #3b82f6; font-size: 18px; font-weight: 700; font-family: monospace; margin: 0;">${ticketId}</p>
            </div>
            
            <p style="color: #64748b; font-size: 14px; margin: 0 0 24px 0;">
              📊 <strong>Reporte de Similitud (Plagio)</strong><br>
              🤖 <strong>Reporte de Detección de IA</strong>
            </p>
            
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">
              Ingresa a tu cuenta para descargar los reportes.
            </p>
          </div>
          
          <p style="text-align: center; color: #cbd5e1; font-size: 11px; margin-top: 20px;">
            © ${new Date().getFullYear()} AcademiX AI — Detección académica inteligente
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Error enviando correo de resultados:', error);
      return false;
    }
    console.log(`📧 Notificación de resultados enviada a ${toEmail} (${ticketId})`);
    return true;
  } catch (err) {
    console.error('❌ Error de Resend:', err);
    return false;
  }
}

/**
 * Sends an email notifying high demand delay.
 */
export async function sendDelayNotificationEmail(toEmail: string, userName: string, ticketId: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `⏳ Tu análisis está en cola — ${ticketId}`,
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; border-radius: 20px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 24px; margin: 0 0 4px 0; font-weight: 800;">Academi<span style="opacity: 0.9;">X</span> AI</h1>
            <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">Notificación de estado</p>
          </div>
          
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center;">
            <div style="width: 56px; height: 56px; background: #fffbeb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 28px;">⏳</div>
            <p style="color: #1e293b; font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">Hola ${userName},</p>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 20px 0;">Tu análisis está tomando más tiempo de lo habitual debido a <strong>alta demanda</strong> en nuestros servidores.</p>
            
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <p style="color: #92400e; font-size: 13px; margin: 0;">
                🔔 <strong>No te preocupes</strong> — tu documento está seguro y siendo procesado.<br><br>
                Te enviaremos un correo en cuanto tus resultados estén listos.
              </p>
            </div>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">Ticket: <strong style="color: #3b82f6; font-family: monospace;">${ticketId}</strong></p>
            </div>
          </div>
          
          <p style="text-align: center; color: #cbd5e1; font-size: 11px; margin-top: 20px;">
            © ${new Date().getFullYear()} AcademiX AI — Detección académica inteligente
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Error enviando correo de demora:', error);
      return false;
    }
    console.log(`📧 Notificación de demora enviada a ${toEmail} (${ticketId})`);
    return true;
  } catch (err) {
    console.error('❌ Error de Resend:', err);
    return false;
  }
}
