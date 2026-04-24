import { Router, Response } from 'express';
import { z } from 'zod';
import { storageService } from '../services/storage';
import { auth, AuthRequest } from '../middleware/auth.middleware';
import { uploadVoucher } from '../middleware/upload.middleware';
import { db } from '../services/database';
import { env } from '../config/env';
import { notifyNewPaymentWhatsapp, notifyNewSupportTicketWhatsapp } from '../services/whatsapp';
import { getPricesFromSettings, getSubscriptionSettings, getSystemSubscriptionSettings } from '../services/subscriptionSettings';

const router = Router();

const supportTicketSchema = z.object({
  name: z.string().trim().min(3, 'Ingresa tu nombre completo.').max(120, 'El nombre es demasiado largo.'),
  email: z.string().trim().email('Ingresa un correo valido.').max(160, 'El correo es demasiado largo.'),
  phone: z.string().trim().regex(/^\+?[0-9\s()\-]{7,20}$/, 'Ingresa un telefono valido.'),
  message: z.string().trim().min(10, 'Describe tu problema con mas detalle.').max(2000, 'El mensaje es demasiado largo.'),
});

// ── Get Subscription Status ──
router.get('/subscription/status', auth, async (req: AuthRequest, res: Response) => {
  const status = await db.getSubscriptionStatus(req.user!.userId);
  res.json(status);
});

router.get('/account/summary', auth, async (req: AuthRequest, res: Response) => {
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const subscription = user.role === 'user' ? await db.getActiveSubscription(user.id) : null;
  const status = await db.getSubscriptionStatus(user.id);
  const tickets = await db.getTicketsByUser(user.id);
  const humanizerHistory = await db.getHumanizerUsageByUser(user.id);
  const humanizerUsage = await db.getCurrentMonthHumanizerUsage(user.id);

  const reports = tickets.reduce(
    (acc, ticket) => {
      if (ticket.plagiarismPdfPath) acc.plagiarism += 1;
      if (ticket.aiPdfPath) acc.ai += 1;
      return acc;
    },
    { plagiarism: 0, ai: 0 }
  );

  res.json({
    user: {
      name: user.name,
      email: user.email,
    },
    subscription: {
      planType: status.planType,
      active: status.active,
      startedAt: subscription?.createdAt ?? null,
      expiresAt: status.expiresAt,
      daysRemaining: status.daysRemaining,
    },
    usage: {
      documentsUploaded: tickets.length,
      plagiarismReports: reports.plagiarism,
      aiReports: reports.ai,
      humanizedWordsThisMonth: humanizerUsage.totalWords,
      humanizerMonthlyLimit: status.humanizerWordLimit,
    },
    history: [
      ...tickets.map(ticket => ({
        id: ticket.id,
        fileName: ticket.fileName,
        uploadedAt: ticket.createdAt,
        serviceType: ticket.requestedAnalysis,
        status: ticket.status,
      })),
      ...humanizerHistory.map(item => ({
        id: item.id,
        fileName: item.mode === 'file' ? 'Archivo humanizado' : 'Texto pegado',
        uploadedAt: item.createdAt,
        serviceType: 'humanizer' as const,
        status: 'completed' as const,
      })),
    ].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()),
  });
});

router.get('/support/whatsapp', auth, async (_req: AuthRequest, res: Response) => {
  res.json({ number: env.WHATSAPP_BOT_NUMBER });
});

router.post('/support/tickets', auth, async (req: AuthRequest, res: Response) => {
  const parsed = supportTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Revisa los datos del formulario.',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const ticket = await db.createSupportTicket({
    userId: req.user!.userId,
    ...parsed.data,
  });

  notifyNewSupportTicketWhatsapp(ticket);

  res.status(201).json({
    ticket,
    message: 'Tu solicitud fue enviada correctamente. Un administrador se pondrá en contacto contigo.',
  });
});

// ── Get Bank Accounts & Prices ──
router.get('/subscription/bank-accounts', auth, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getSystemSubscriptionSettings();
    const prices = getPricesFromSettings(settings.plans);
    const days = env.SUBSCRIPTION_DAYS;
    res.json({ accounts: settings.bankAccounts, prices, limits: settings.plans, plans: settings.plans, days });
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
  const validPlans = ['basic', 'pro', 'pro_plus', 'express_plagiarism', 'express_ai', 'express_full', 'express_humanizer'];
  if (!validPlans.includes(planType)) {
    return res.status(400).json({ error: 'Debes seleccionar un servicio válido.' });
  }

  let amount = 0;
  let metadata: any = {};

  if (planType.startsWith('express_')) {
    // For express, client provides amount and metadata
    amount = parseFloat(req.body.amount || '0');
    if (amount <= 0) return res.status(400).json({ error: 'Monto inválido para servicio express.' });
    try {
      metadata = JSON.parse(req.body.metadata || '{}');
    } catch {
      return res.status(400).json({ error: 'Metadatos inválidos.' });
    }
  } else {
    // For standard plans, get price from settings
    const prices = getPricesFromSettings(await getSubscriptionSettings());
    amount = parseFloat(prices[planType as keyof typeof prices]);
  }

  // Upload voucher to MongoDB GridFS
  let storagePath: string;
  try {
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const destPath = `${user.id}-${Date.now()}-${safeName}`;
    storagePath = await storageService.uploadLocalFile('vouchers', destPath, req.file.path, req.file.mimetype);
  } catch (error) {
    return res.status(500).json({ error: 'Error al subir el comprobante a la nube.' });
  }

  const payment = await db.createPayment(user.id, user.name, user.email, planType, storagePath, amount, metadata);

  notifyNewPaymentWhatsapp(payment, user);

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
