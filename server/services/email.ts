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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPlanDisplayName(planType: 'basic' | 'pro' | 'pro_plus'): string {
  switch (planType) {
    case 'basic':
      return 'Basico';
    case 'pro':
      return 'Premium';
    case 'pro_plus':
      return 'Premium Plus';
    default:
      return planType;
  }
}

function getPlanFeatures(planType: 'basic' | 'pro' | 'pro_plus'): string[] {
  switch (planType) {
    case 'basic':
      return [
        'Acceso al detector de IA y plagio segun el limite de tu plan',
        'Acceso al humanizador segun el limite de tu plan',
        'Soporte y seguimiento desde tu panel',
      ];
    case 'pro':
      return [
        'Mas documentos disponibles en detector',
        'Mayor capacidad en el humanizador',
        'Uso continuo durante toda la vigencia del plan',
      ];
    case 'pro_plus':
      return [
        'Capacidad ampliada para detector y humanizador',
        'Mayor margen para trabajo academico intensivo',
        'Acceso completo durante toda la vigencia del plan',
      ];
    default:
      return ['Acceso a los servicios incluidos en tu plan'];
  }
}

function renderFeatureList(items: string[]): string {
  return items.map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('');
}

export async function sendSubscriptionWelcomeEmail(
  toEmail: string,
  userName: string,
  planType: 'basic' | 'pro' | 'pro_plus',
  startsAt: string,
  expiresAt: string
): Promise<boolean> {
  const planName = getPlanDisplayName(planType);
  const startsAtLabel = formatDateTime(startsAt);
  const expiresAtLabel = formatDateTime(expiresAt);
  const features = renderFeatureList(getPlanFeatures(planType));

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `Bienvenido a tu plan ${planName} - AcademiX AI`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
          <div style="background: linear-gradient(135deg, #0f172a, #1d4ed8); border-radius: 20px; padding: 28px; color: white; margin-bottom: 20px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.8;">Suscripcion activada</p>
            <h1 style="margin: 0; font-size: 28px;">Bienvenido a ${planName}</h1>
          </div>
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 28px;">
            <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px;">Hola <strong>${userName}</strong>, tu suscripcion fue activada correctamente con este correo.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin-bottom: 18px;">
              <p style="margin: 0 0 8px 0; color: #0f172a; font-weight: 700;">Resumen del plan</p>
              <p style="margin: 0 0 6px 0; color: #475569;">Plan: <strong>${planName}</strong></p>
              <p style="margin: 0 0 6px 0; color: #475569;">Inicio: <strong>${startsAtLabel}</strong></p>
              <p style="margin: 0; color: #475569;">Vence: <strong>${expiresAtLabel}</strong></p>
            </div>
            <div style="margin-bottom: 18px;">
              <p style="margin: 0 0 10px 0; color: #0f172a; font-weight: 700;">Lo que incluye</p>
              <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 14px;">${features}</ul>
            </div>
            <p style="margin: 0; color: #64748b; font-size: 13px;">Te enviaremos un recordatorio antes del vencimiento para que puedas renovar a tiempo.</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('Error enviando correo de bienvenida de suscripcion:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error de Resend:', err);
    return false;
  }
}

export async function sendSubscriptionRenewalReminderEmail(
  toEmail: string,
  userName: string,
  planType: 'basic' | 'pro' | 'pro_plus',
  expiresAt: string
): Promise<boolean> {
  const planName = getPlanDisplayName(planType);
  const expiresAtLabel = formatDateTime(expiresAt);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `Tu plan ${planName} vence pronto - AcademiX AI`,
      html: `
        <div style="font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
          <div style="background: linear-gradient(135deg, #7c2d12, #ea580c); border-radius: 20px; padding: 28px; color: white; margin-bottom: 20px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.85;">Recordatorio de renovacion</p>
            <h1 style="margin: 0; font-size: 28px;">Tu plan vence en 2 dias</h1>
          </div>
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 28px;">
            <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px;">Hola <strong>${userName}</strong>, tu plan <strong>${planName}</strong> sigue activo, pero vence pronto.</p>
            <div style="background: #fff7ed; border: 1px solid #fdba74; border-radius: 14px; padding: 18px; margin-bottom: 18px;">
              <p style="margin: 0; color: #9a3412;">Vencimiento programado: <strong>${expiresAtLabel}</strong></p>
            </div>
            <p style="margin: 0 0 12px 0; color: #475569; font-size: 14px;">Si todavia no has renovado, realiza tu pago antes de esa fecha para no perder acceso al detector y al humanizador.</p>
            <p style="margin: 0; color: #64748b; font-size: 13px;">Si ya renovaste y el nuevo pago fue aprobado, puedes ignorar este mensaje.</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('Error enviando recordatorio de renovacion:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error de Resend:', err);
    return false;
  }
}

/**
 * Sends email confirming payment was approved with subscription expiration date.
 */
export async function sendPaymentApprovedEmail(toEmail: string, userName: string, expiresAt: string): Promise<boolean> {
  const expirationDate = new Date(expiresAt).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `✅ Pago aprobado — AcademiX AI`,
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; border-radius: 20px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 24px; margin: 0 0 4px 0; font-weight: 800;">Academi<span style="opacity: 0.9;">X</span> AI</h1>
            <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">Pago confirmado</p>
          </div>
          
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 32px;">💳</div>
            <p style="color: #1e293b; font-size: 20px; font-weight: 800; margin: 0 0 8px 0;">¡Pago realizado!</p>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 24px 0;">Hola <strong>${userName}</strong>, tu pago ha sido verificado y aprobado correctamente.</p>
            
            <div style="background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 2px solid #6ee7b7; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
              <p style="color: #065f46; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Suscripción activa hasta</p>
              <p style="color: #047857; font-size: 24px; font-weight: 800; margin: 0; font-family: monospace;">${expirationDate}</p>
            </div>
            
            <p style="color: #64748b; font-size: 13px; margin: 0 0 16px 0;">
              Ya puedes subir documentos para análisis de <strong>IA y Plagio</strong>, y utilizar el <strong>Humanizador de textos</strong>.
            </p>
            
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              Recuerda renovar tu suscripción antes de la fecha de vencimiento para no perder acceso.
            </p>
          </div>
          
          <p style="text-align: center; color: #cbd5e1; font-size: 11px; margin-top: 20px;">
            © ${new Date().getFullYear()} AcademiX AI — Detección académica inteligente
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Error enviando correo de pago aprobado:', error);
      return false;
    }
    console.log(`📧 Confirmación de pago enviada a ${toEmail}`);
    return true;
  } catch (err) {
    console.error('❌ Error de Resend:', err);
    return false;
  }
}

/**
 * Sends email notifying payment was rejected with a reason.
 */
export async function sendPaymentRejectedEmail(toEmail: string, userName: string, reason: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `❌ Pago rechazado — AcademiX AI`,
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 32px; border-radius: 20px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 24px; margin: 0 0 4px 0; font-weight: 800;">Academi<span style="opacity: 0.9;">X</span> AI</h1>
            <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0;">Pago no aprobado</p>
          </div>
          
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #fef2f2, #fee2e2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 32px;">❌</div>
            <p style="color: #1e293b; font-size: 20px; font-weight: 800; margin: 0 0 8px 0;">Pago rechazado</p>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 24px 0;">Hola <strong>${userName}</strong>, lamentamos informarte que tu pago no fue aprobado.</p>
            
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: left;">
              <p style="color: #991b1b; font-size: 11px; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Motivo del rechazo</p>
              <p style="color: #dc2626; font-size: 14px; font-weight: 600; margin: 0;">${reason}</p>
            </div>
            
            <p style="color: #64748b; font-size: 13px; margin: 0;">
              Por favor verifica los datos de tu transferencia e intenta nuevamente. Si crees que es un error, contacta al soporte.
            </p>
          </div>
          
          <p style="text-align: center; color: #cbd5e1; font-size: 11px; margin-top: 20px;">
            © ${new Date().getFullYear()} AcademiX AI — Detección académica inteligente
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('❌ Error enviando correo de pago rechazado:', error);
      return false;
    }
    console.log(`📧 Notificación de pago rechazado enviada a ${toEmail}`);
    return true;
  } catch (err) {
    console.error('❌ Error de Resend:', err);
    return false;
  }
}
