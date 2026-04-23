import { Router, Response } from 'express';
import fs from 'fs/promises';
import { auth, adminOnly, AuthRequest } from '../middleware/auth.middleware';
import { uploadOriginal, uploadResults } from '../middleware/upload.middleware';
import { db } from '../services/database';
import { notifyNewTicket, notifyTicketCompleted } from '../services/telegram';
import { sendResultsReadyEmail, sendDelayNotificationEmail } from '../services/email';
import { requiresAiReport } from '../../shared/constants/ticketRules';

const router = Router();

// ── Upload Document ──
router.post('/upload', auth, uploadOriginal.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Subscription check for regular users (admins bypass)
  let requestedAnalysis: 'plagiarism' | 'both' = 'both';
  let subscription = null;
  if (user.role === 'user') {
    const subStatus = await db.getSubscriptionStatus(user.id);
    if (!subStatus.active) {
      return res.status(402).json({ error: 'Requieres una suscripción activa para subir documentos.', requiresSubscription: true });
    }
    if (subStatus.detectorRemaining !== null && subStatus.detectorRemaining <= 0) {
      await fs.unlink(req.file.path).catch(() => undefined);
      return res.status(403).json({
        error: 'Llegaste al limite de documentos de tu suscripcion. Renueva o cambia de plan para seguir subiendo archivos.',
        limitReached: true,
        subscription: subStatus,
      });
    }
    requestedAnalysis = subStatus.planType === 'basic' ? 'plagiarism' : 'both';
  }

  const ticket = await db.createTicket(user.id, user.name, req.file.originalname, req.file.size, req.file.path, requestedAnalysis);
  // Socket.IO emit is handled by the main server index
  const io = (req.app as any).io;
  if (io) io.emit('ticket_created', { ticketId: ticket.id });
  notifyNewTicket(ticket);
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
  if (!plagiarismPdf) {
    return res.status(400).json({ error: 'Se requiere el PDF de plagio (plagiarismPdf).' });
  }

  const aiIsRequired = requiresAiReport(existingTicket.requestedAnalysis);
  if (aiIsRequired && !aiPdf) {
    return res.status(400).json({ error: 'Este ticket requiere tambien el PDF de IA (aiPdf).' });
  }

  const ticket = await db.updateTicketResults(
    req.params.id,
    plagiarismPdf.path,
    aiPdf?.path ?? null
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  const io = (req.app as any).io;
  if (io) io.emit('ticket_updated', { ticketId: ticket.id, status: 'completed' });
  notifyTicketCompleted(ticket);
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
  const ticketOwner = await db.getUserById(ticket.userId);
  if (ticketOwner) {
    await sendDelayNotificationEmail(ticketOwner.email, ticketOwner.name, ticket.id);
  }
  res.json({ message: 'Notificación de demora enviada.' });
});

export default router;
