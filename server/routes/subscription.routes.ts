import { Router, Response } from 'express';
import { storageService } from '../services/storage';
import { auth, AuthRequest } from '../middleware/auth.middleware';
import { uploadVoucher } from '../middleware/upload.middleware';
import { db } from '../services/database';
import { env } from '../config/env';
import { notifyNewPayment } from '../services/telegram';
import { getPricesFromSettings, getSubscriptionSettings } from '../services/subscriptionSettings';
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
    const settings = await getSubscriptionSettings();
    const prices = getPricesFromSettings(settings);
    const days = env.SUBSCRIPTION_DAYS;
    res.json({ accounts, prices, limits: settings, plans: settings, days });
  } catch {
    const settings = await getSubscriptionSettings();
    res.json({ accounts: [], prices: getPricesFromSettings(settings), limits: settings, plans: settings, days: 30 });
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

  const prices = getPricesFromSettings(await getSubscriptionSettings());
  const amount = parseFloat(prices[planType as keyof typeof prices]);

  // Upload voucher to Supabase Storage
  let storagePath: string;
  try {
    const destPath = `${user.id}-${Date.now()}-${req.file.originalname}`;
    storagePath = await storageService.uploadLocalFile('vouchers', destPath, req.file.path, req.file.mimetype);
  } catch (error) {
    return res.status(500).json({ error: 'Error al subir el comprobante a la nube.' });
  }

  const payment = await db.createPayment(user.id, user.name, user.email, planType, storagePath, amount);

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
