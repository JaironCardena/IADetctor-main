import { Router, Response } from 'express';
import { auth, adminOnly, AuthRequest } from '../middleware/auth.middleware';
import { uploadOriginal, uploadResults } from '../middleware/upload.middleware';
import { db } from '../services/database';
import { notifyNewTicket, notifyTicketCompleted } from '../services/telegram';
import { sendResultsReadyEmail, sendDelayNotificationEmail } from '../services/email';

const router = Router();

// ── Upload Document ──
router.post('/upload', auth, uploadOriginal.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const ticket = await db.createTicket(user.id, user.name, req.file.originalname, req.file.size, req.file.path);
  // Socket.IO emit is handled by the main server index
  const io = (req.app as any).io;
  if (io) io.emit('ticket_created', { ticketId: ticket.id });
  notifyNewTicket(ticket);
  res.json({ ticket });
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
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  if (!files?.plagiarismPdf?.[0] || !files?.aiPdf?.[0]) return res.status(400).json({ error: 'Se requieren ambos PDFs (plagiarismPdf y aiPdf)' });
  const ticket = await db.updateTicketResults(req.params.id, files.plagiarismPdf[0].path, files.aiPdf[0].path);
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
