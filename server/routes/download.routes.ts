import { Router, Response } from 'express';
import fs from 'fs';
import { auth, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../services/database';

const router = Router();

// ── Download Original ──
router.get('/:ticketId/original', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  if (!fs.existsSync(ticket.filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.download(ticket.filePath, ticket.fileName);
});

// ── Download Report (plagiarism or ai) ──
router.get('/:ticketId/:type', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  const filePath = req.params.type === 'plagiarism' ? ticket.plagiarismPdfPath : ticket.aiPdfPath;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Reporte aún no disponible' });
  const name = req.params.type === 'plagiarism' ? `Reporte_Plagio_${ticket.id}.pdf` : `Reporte_IA_${ticket.id}.pdf`;
  res.download(filePath, name);
});

export default router;
