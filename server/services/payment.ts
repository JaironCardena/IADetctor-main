import type { Server as SocketServer } from 'socket.io';
import { db } from './database';
import { env } from '../config/env';
import { sendPaymentApprovedEmail, sendPaymentRejectedEmail } from './email';
import type { Payment, Subscription } from '../../shared/types';

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

  const subscription = await db.createOrExtendSubscription(payment.userId, env.SUBSCRIPTION_DAYS, payment.planType);

  try {
    await sendPaymentApprovedEmail(payment.userEmail, payment.userName, subscription.expiresAt);
  } catch (error) {
    console.error(`Error enviando correo de aprobacion para ${paymentId}:`, error);
  }

  io?.emit('payment_approved', { userId: payment.userId, paymentId });
  io?.emit('admin_payment_updated', { paymentId, status: 'approved' });

  return { ok: true, payment: approved, subscription };
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

  try {
    await sendPaymentRejectedEmail(payment.userEmail, payment.userName, cleanReason);
  } catch (error) {
    console.error(`Error enviando correo de rechazo para ${paymentId}:`, error);
  }

  io?.emit('payment_rejected', { userId: payment.userId, paymentId });
  io?.emit('admin_payment_updated', { paymentId, status: 'rejected' });

  return { ok: true, payment: rejected };
}
