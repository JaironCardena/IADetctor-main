import { Router, Response } from 'express';
import { storageService } from '../services/storage';
import fs from 'fs/promises';
import { auth, adminOnly, AuthRequest } from '../middleware/auth.middleware';
import { uploadOriginal, uploadResults } from '../middleware/upload.middleware';
import { db } from '../services/database';
import { notifyNewTicketWhatsapp, notifyTicketCompletedWhatsapp } from '../services/whatsapp';
import { sendResultsReadyEmail, sendDelayNotificationEmail } from '../services/email';
import { requiresAiReport, requiresPlagiarismReport } from '../../shared/constants/ticketRules';

const router = Router();

// ── Upload Document ──
router.post('/upload', auth, uploadOriginal.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Subscription check for regular users (admins bypass)
  let requestedAnalysis: 'plagiarism' | 'ai' | 'both' = 'both';
  let subscription = null;
  if (user.role === 'user') {
    const subStatus = await db.getSubscriptionStatus(user.id);
    const expressCredits = subStatus.expressDetectorCreditsByType || { plagiarism: 0, ai: 0, both: 0 };
    const hasExpressCredits = (subStatus.expressDetectorCredits || 0) > 0;

    if (!subStatus.active && !hasExpressCredits) {
      await fs.unlink(req.file.path).catch(() => undefined);
      return res.status(402).json({ error: 'Requieres una suscripción activa o saldo Express para subir documentos.', requiresSubscription: true });
    }

    if (subStatus.detectorRemaining !== null && subStatus.detectorRemaining <= 0) {
      await fs.unlink(req.file.path).catch(() => undefined);
      return res.status(403).json({
        error: 'No tienes creditos suficientes. Recarga saldo o cambia de plan para seguir subiendo archivos.',
        limitReached: true,
        subscription: subStatus,
      });
    }

    if (subStatus.active) {
      requestedAnalysis = subStatus.planType === 'basic' ? 'plagiarism' : 'both';
    } else if (expressCredits.both > 0) {
      requestedAnalysis = 'both';
    } else if (expressCredits.ai > 0) {
      requestedAnalysis = 'ai';
    } else if (expressCredits.plagiarism > 0) {
      requestedAnalysis = 'plagiarism';
    }

    const isCoveredBySub = subStatus.active && subStatus.detectorLimit !== null && subStatus.detectorUsed < subStatus.detectorLimit;
    if (!isCoveredBySub && hasExpressCredits) {
      await db.consumeExpressDetectorCreditByType(user.id, requestedAnalysis);
    }
  }

  // Upload to MongoDB GridFS
  let storagePath: string;
  try {
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const destPath = `${Date.now()}-${safeName}`;
    storagePath = await storageService.uploadLocalFile('originals', destPath, req.file.path, req.file.mimetype);
  } catch (error) {
    return res.status(500).json({ error: 'Error al guardar el archivo en la nube.' });
  }

  const ticket = await db.createTicket(user.id, user.name, req.file.originalname, req.file.size, storagePath, requestedAnalysis);
  // Socket.IO emit is handled by the main server index
  const io = (req.app as any).io;
  if (io) io.emit('ticket_created', { ticketId: ticket.id });
  notifyNewTicketWhatsapp(ticket);
  if (user.role === 'user') subscription = await db.getSubscriptionStatus(user.id);
  res.json({ ticket, subscription });
});

// ── Get Tickets ──
router.get('/tickets', auth, async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'admin') {
    // Admin sees: their assigned tickets + all completed (shared history)
    const adminTickets = await db.getTicketsForAdmin(req.user!.userId);
    const unassigned = await db.getUnassignedTickets();
    // Merge without duplicates
    const ticketMap = new Map<string, any>();
    [...adminTickets, ...unassigned].forEach(t => ticketMap.set(t.id, t));
    const tickets = Array.from(ticketMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json({ tickets });
  }
  const userTickets = await db.getTicketsByUser(req.user!.userId);
  res.json({ tickets: userTickets });
});

// ── Get Single Ticket ──
router.get('/tickets/:id', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  res.json({ ticket });
});

// ── Upload Results (Admin Only) ──
router.post('/tickets/:id/results', auth, adminOnly, uploadResults.fields([
  { name: 'plagiarismPdf', maxCount: 1 },
  { name: 'aiPdf', maxCount: 1 },
]), async (req: AuthRequest, res: Response) => {
  const existingTicket = await db.getTicketById(req.params.id);
  if (!existingTicket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (existingTicket.assignedAdminId && existingTicket.assignedAdminId !== req.user!.userId) {
    return res.status(403).json({ error: 'Solo el administrador asignado puede completar este ticket.' });
  }
  if (!existingTicket.assignedAdminId) {
    const adminUser = await db.getUserById(req.user!.userId);
    await db.assignTicket(req.params.id, adminUser?.name || req.user!.email, req.user!.userId);
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const plagiarismPdf = files?.plagiarismPdf?.[0];
  const aiPdf = files?.aiPdf?.[0];
  const plagiarismIsRequired = requiresPlagiarismReport(existingTicket.requestedAnalysis);
  if (plagiarismIsRequired && !plagiarismPdf) {
    return res.status(400).json({ error: 'Se requiere el PDF de plagio (plagiarismPdf).' });
  }
  if (!plagiarismIsRequired && plagiarismPdf) {
    return res.status(400).json({ error: 'Este ticket no admite reporte de plagio para el plan o servicio contratado.' });
  }

  const aiIsRequired = requiresAiReport(existingTicket.requestedAnalysis);
  if (aiIsRequired && !aiPdf) {
    return res.status(400).json({ error: 'Este ticket requiere tambien el PDF de IA (aiPdf).' });
  }
  if (!aiIsRequired && aiPdf) {
    return res.status(400).json({ error: 'Este ticket no admite reporte de IA para el plan o servicio contratado.' });
  }

  // Upload to MongoDB GridFS
  let plagiarismStoragePath: string;
  let aiStoragePath: string | null = null;
  try {
    plagiarismStoragePath = '';
    if (plagiarismPdf) {
      const pDestPath = `${req.params.id}/plagiarism-${Date.now()}.pdf`;
      plagiarismStoragePath = await storageService.uploadLocalFile('results', pDestPath, plagiarismPdf.path, 'application/pdf');
    }
    
    if (aiPdf) {
      const aiDestPath = `${req.params.id}/ai-${Date.now()}.pdf`;
      aiStoragePath = await storageService.uploadLocalFile('results', aiDestPath, aiPdf.path, 'application/pdf');
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error al subir los reportes a la nube.' });
  }

  const ticket = await db.updateTicketResults(
    req.params.id,
    plagiarismStoragePath,
    aiStoragePath
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  const io = (req.app as any).io;
  if (io) io.emit('ticket_updated', { ticketId: ticket.id, status: 'completed' });
  notifyTicketCompletedWhatsapp(ticket);
  // Send email notification to the client
  const ticketOwner = await db.getUserById(ticket.userId);
  if (ticketOwner) {
    await sendResultsReadyEmail(ticketOwner.email, ticketOwner.name, ticket.id);
  }
  res.json({ ticket });
});

// ── Delay Notification ──
router.post('/tickets/:id/notify-delay', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  if (ticket.delayNotificationSentAt) {
    return res.json({ message: 'Notificación de demora ya enviada.' });
  }

  const ticketOwner = await db.getUserById(ticket.userId);
  if (ticketOwner) {
    await sendDelayNotificationEmail(ticketOwner.email, ticketOwner.name, ticket.id);
  }
  await db.markTicketDelayNotificationSent(ticket.id, new Date().toISOString());
  res.json({ message: 'Notificación de demora enviada.' });
});

export default router;
