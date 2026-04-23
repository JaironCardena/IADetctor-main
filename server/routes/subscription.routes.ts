import { Router, Response } from 'express';
import { auth, AuthRequest } from '../middleware/auth.middleware';
import { uploadVoucher } from '../middleware/upload.middleware';
import { db } from '../services/database';
import { env } from '../config/env';
import { notifyNewPayment } from '../services/telegram';
import type { BankAccount } from '../../shared/types';

const router = Router();

// ── Get Subscription Status ──
router.get('/subscription/status', auth, async (req: AuthRequest, res: Response) => {
  const status = await db.getSubscriptionStatus(req.user!.userId);
  res.json(status);
});

// ── Get Bank Accounts & Prices ──
router.get('/subscription/bank-accounts', auth, async (_req: AuthRequest, res: Response) => {
  try {
    const accounts: BankAccount[] = JSON.parse(env.BANK_ACCOUNTS);
    const prices = {
      basic: env.PLAN_BASIC_PRICE,
      pro: env.PLAN_PRO_PRICE,
      pro_plus: env.PLAN_PRO_PLUS_PRICE
    };
    const days = env.SUBSCRIPTION_DAYS;
    res.json({ accounts, prices, days });
  } catch {
    res.json({ accounts: [], prices: { basic: '5.00', pro: '10.00', pro_plus: '15.00' }, days: 30 });
  }
});

// ── Submit Payment (Upload Voucher) ──
router.post('/subscription/pay', auth, uploadVoucher.single('voucher'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Debes subir una imagen del comprobante de pago.' });

  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Los administradores no necesitan suscripción.' });

  const planType = req.body.planType;
  if (!['basic', 'pro', 'pro_plus'].includes(planType)) {
    return res.status(400).json({ error: 'Debes seleccionar un plan válido (Básica, Pro o Pro+).' });
  }

  const amount = planType === 'basic' ? parseFloat(env.PLAN_BASIC_PRICE) : 
                 planType === 'pro' ? parseFloat(env.PLAN_PRO_PRICE) : parseFloat(env.PLAN_PRO_PLUS_PRICE);

  const payment = await db.createPayment(user.id, user.name, user.email, planType, req.file.path, amount);

  // Notify all admins via Telegram
  notifyNewPayment(payment, user);

  res.json({ payment: { id: payment.id, status: payment.status, createdAt: payment.createdAt } });
});

// ── Get Payment History ──
router.get('/subscription/payments', auth, async (req: AuthRequest, res: Response) => {
  const payments = await db.getPaymentsByUser(req.user!.userId);
  // Don't expose file paths to client
  const sanitized = payments.map(p => ({
    id: p.id,
    planType: p.planType,
    amount: p.amount,
    status: p.status,
    reviewedBy: p.reviewedBy,
    rejectionReason: p.rejectionReason,
    createdAt: p.createdAt,
    reviewedAt: p.reviewedAt,
  }));
  res.json({ payments: sanitized });
});

export default router;
