import type { Server as SocketServer } from 'socket.io';
import { db } from './database';
import { env } from '../config/env';
import { sendPaymentRejectedEmail, sendSubscriptionWelcomeEmail } from './email';
import { TicketModel } from '../models/Ticket';
import type { Payment, Subscription } from '../../shared/types';
import type { RequestedAnalysis } from '../../shared/constants/ticketRules';

export type PublicAdminPayment = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planType: Payment['planType'];
  amount: number;
  status: Payment['status'];
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type PaymentApprovalResult =
  | { ok: true; payment: Payment; subscription: Subscription }
  | { ok: false; status: number; error: string; payment?: Payment };

export type PaymentRejectionResult =
  | { ok: true; payment: Payment }
  | { ok: false; status: number; error: string; payment?: Payment };

export function toPublicAdminPayment(payment: Payment): PublicAdminPayment {
  return {
    id: payment.id,
    userId: payment.userId,
    userName: payment.userName,
    userEmail: payment.userEmail,
    planType: payment.planType,
    amount: payment.amount,
    status: payment.status,
    reviewedBy: payment.reviewedBy,
    rejectionReason: payment.rejectionReason,
    createdAt: payment.createdAt,
    reviewedAt: payment.reviewedAt,
  };
}

export async function approvePayment(
  paymentId: string,
  adminName: string,
  io?: SocketServer | null
): Promise<PaymentApprovalResult> {
  const payment = await db.getPaymentById(paymentId);
  if (!payment) return { ok: false, status: 404, error: 'Pago no encontrado' };
  if (payment.status !== 'pending') {
    return { ok: false, status: 409, error: `Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`, payment };
  }

  const approved = await db.approvePayment(paymentId, adminName);
  if (!approved) return { ok: false, status: 500, error: 'Error al aprobar el pago.' };

  let subscription: Subscription | undefined;
  let activatedMessage = '';

  // Handle different payment types
  if (payment.planType === 'express_humanizer') {
    const wordsBought = payment.metadata?.words || 0;
    activatedMessage = `Resultado express liberado (${wordsBought} palabras facturadas)`;

    const pendingTicket = await TicketModel.findOne({ userId: payment.userId, requestedAnalysis: 'humanizer', status: { $in: ['pending_payment', 'completed_pending_payment'] } }).sort({ createdAt: -1 });
    if (pendingTicket) {
      const newStatus = pendingTicket.status === 'completed_pending_payment' ? 'completed' : 'pending';
      await TicketModel.updateOne({ id: pendingTicket.id }, { status: newStatus });
      io?.emit('ticket_updated', { ticketId: pendingTicket.id, status: newStatus });
    }
  } else if (['express_plagiarism', 'express_ai', 'express_full'].includes(payment.planType)) {
    const creditsBought = payment.metadata?.credits || 1;
    const requestedAnalysis: Extract<RequestedAnalysis, 'plagiarism' | 'ai' | 'both'> =
      payment.planType === 'express_plagiarism'
        ? 'plagiarism'
        : payment.planType === 'express_ai'
          ? 'ai'
          : 'both';
    await db.addExpressDetectorCreditsByType(payment.userId, requestedAnalysis, creditsBought);
    activatedMessage = `Credito express activado para ${requestedAnalysis === 'both' ? 'plagio + IA' : requestedAnalysis === 'ai' ? 'IA' : 'plagio'}`;
  } else {
    subscription = await db.createOrExtendSubscription(payment.userId, env.SUBSCRIPTION_DAYS, payment.planType as 'basic' | 'pro' | 'pro_plus');
    activatedMessage = `Suscripcion activa hasta ${subscription.expiresAt}`;
    try {
      await sendSubscriptionWelcomeEmail(
        payment.userEmail,
        payment.userName,
        subscription.planType,
        subscription.createdAt,
        subscription.expiresAt
      );
    } catch (error) {
      console.error(`Error enviando correo de aprobacion para ${paymentId}:`, error);
    }
  }

  io?.emit('payment_approved', { userId: payment.userId, paymentId });
  io?.emit('admin_payment_updated', { paymentId, status: 'approved' });
  io?.emit('subscription_or_credit_updated', { userId: payment.userId, paymentId });

  return { ok: true, payment: { ...approved, metadata: { ...(approved.metadata || {}), activatedMessage } } as Payment, subscription: subscription || {} as Subscription };
}

export async function rejectPayment(
  paymentId: string,
  adminName: string,
  reason: string,
  io?: SocketServer | null
): Promise<PaymentRejectionResult> {
  const cleanReason = reason.trim();
  if (!cleanReason) return { ok: false, status: 400, error: 'Debes indicar el motivo del rechazo.' };

  const payment = await db.getPaymentById(paymentId);
  if (!payment) return { ok: false, status: 404, error: 'Pago no encontrado' };
  if (payment.status !== 'pending') {
    return { ok: false, status: 409, error: `Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`, payment };
  }

  const rejected = await db.rejectPayment(paymentId, adminName, cleanReason);
  if (!rejected) return { ok: false, status: 500, error: 'Error al rechazar el pago.' };

  if (payment.planType === 'express_humanizer') {
    const pendingTicket = await TicketModel.findOne({ userId: payment.userId, requestedAnalysis: 'humanizer', status: { $in: ['pending_payment', 'completed_pending_payment'] } }).sort({ createdAt: -1 });
    if (pendingTicket) {
      // Revert or delete the ticket since payment was rejected? Or just leave it as pending_payment.
      // Usually, we can just delete it or leave it. Leaving it is fine.
    }
  }

  try {
    await sendPaymentRejectedEmail(payment.userEmail, payment.userName, cleanReason);
  } catch (error) {
    console.error(`Error enviando correo de rechazo para ${paymentId}:`, error);
  }

  io?.emit('payment_rejected', { userId: payment.userId, paymentId });
  io?.emit('admin_payment_updated', { paymentId, status: 'rejected' });

  return { ok: true, payment: rejected };
}
