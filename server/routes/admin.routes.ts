import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { auth, adminOnly, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../services/database';
import { approvePayment, rejectPayment, toPublicAdminPayment } from '../services/payment';
import { getPricesFromSettings, getSubscriptionSettings, saveSubscriptionSettings } from '../services/subscriptionSettings';

const router = Router();

router.get('/subscription-settings', auth, adminOnly, async (_req: AuthRequest, res: Response) => {
  const plans = await getSubscriptionSettings();
  res.json({ plans, prices: getPricesFromSettings(plans) });
});

router.put('/subscription-settings', auth, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const plans = await saveSubscriptionSettings(req.body?.plans || req.body?.prices || req.body || {});
    const prices = getPricesFromSettings(plans);
    (req.app as any).io?.emit('subscription_prices_updated', { plans, prices });
    res.json({ plans, prices });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'No se pudieron guardar los precios.',
    });
  }
});

router.get('/payments', auth, adminOnly, async (req: AuthRequest, res: Response) => {
  const status = req.query.status === 'all' ? 'all' : 'pending';
  const payments = await db.getPayments(status);
  res.json({ payments: payments.map(toPublicAdminPayment) });
});

router.get('/payments/:id/voucher', auth, adminOnly, async (req: AuthRequest, res: Response) => {
  const payment = await db.getPaymentById(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  if (!payment.voucherPath || !fs.existsSync(payment.voucherPath)) {
    return res.status(404).json({ error: 'Comprobante no encontrado' });
  }

  res.download(payment.voucherPath, path.basename(payment.voucherPath));
});

router.post('/payments/:id/approve', auth, adminOnly, async (req: AuthRequest, res: Response) => {
  const admin = await db.getUserById(req.user!.userId);
  const result = await approvePayment(req.params.id, admin?.name || req.user!.email, (req.app as any).io);
  if (result.ok === false) return res.status(result.status).json({ error: result.error });

  res.json({
    payment: toPublicAdminPayment(result.payment),
    subscription: result.subscription,
  });
});

router.post('/payments/:id/reject', auth, adminOnly, async (req: AuthRequest, res: Response) => {
  const admin = await db.getUserById(req.user!.userId);
  const result = await rejectPayment(req.params.id, admin?.name || req.user!.email, String(req.body?.reason || ''), (req.app as any).io);
  if (result.ok === false) return res.status(result.status).json({ error: result.error });

  res.json({ payment: toPublicAdminPayment(result.payment) });
});

export default router;
