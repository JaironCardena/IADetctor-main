import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { db } from './src/server/database';
import { initTelegramBot, notifyNewTicket, notifyTicketCompleted } from './src/server/telegramBot';
import { sendVerificationCode, sendResultsReadyEmail, sendDelayNotificationEmail } from './src/server/email';

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: '*' } });

const PORT = Number(process.env.SERVER_PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'academix_secret_key_2026';
const ROOT = process.cwd();

// Middleware
app.use(cors());
app.use(express.json());

// Multer storage configs
const originalStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(ROOT, 'uploads', 'originals')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const resultStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(ROOT, 'uploads', 'results')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const uploadOriginal = multer({ storage: originalStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadResults = multer({ storage: resultStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Auth middleware ──
interface AuthRequest extends Request { user?: { userId: string; email: string; role: string } }

function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET) as any;
    next();
  } catch { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}

function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Se requiere rol de administrador' });
  next();
}

function signToken(user: { id: string; email: string; role: string }) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// ── AUTH ROUTES ──
app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const user = await db.createUser(name, email, password);
  if (!user) return res.status(409).json({ error: 'El correo ya está registrado' });
  // Send verification code
  if (user.verificationCode) {
    await sendVerificationCode(email, user.verificationCode, name);
  }
  res.json({ needsVerification: true, email: user.email, message: 'Se envió un código de verificación a tu correo.' });
});

app.post('/api/auth/verify', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Correo y código son requeridos' });
  const result = await db.verifyUser(email, code);
  if (!result.success || !result.user) return res.status(400).json({ error: result.error });
  const token = signToken(result.user);
  res.json({ token, user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role } });
});

app.post('/api/auth/resend-code', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Correo requerido' });
  const result = await db.resendVerificationCode(email);
  if (!result.success) return res.status(400).json({ error: result.error });
  await sendVerificationCode(email, result.code!, result.userName!);
  res.json({ message: 'Código reenviado exitosamente.' });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
  const user = await db.validateUser(email, password);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
  // Check if account is verified (admins are always verified)
  if (!user.isVerified && user.role !== 'admin') {
    // Resend a new code
    const resendResult = await db.resendVerificationCode(email);
    if (resendResult.success && resendResult.code) {
      await sendVerificationCode(email, resendResult.code, resendResult.userName!);
    }
    return res.status(403).json({ error: 'Cuenta no verificada', needsVerification: true, email: user.email });
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/auth/me', auth, async (req: AuthRequest, res: Response) => {
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ── TICKET ROUTES ──
app.post('/api/upload', auth, uploadOriginal.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const ticket = await db.createTicket(user.id, user.name, req.file.originalname, req.file.size, req.file.path);
  io.emit('ticket_created', { ticketId: ticket.id });
  notifyNewTicket(ticket);
  res.json({ ticket });
});

app.get('/api/tickets', auth, async (req: AuthRequest, res: Response) => {
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

app.get('/api/tickets/:id', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  res.json({ ticket });
});

app.post('/api/tickets/:id/results', auth, adminOnly, uploadResults.fields([
  { name: 'plagiarismPdf', maxCount: 1 },
  { name: 'aiPdf', maxCount: 1 },
]), async (req: AuthRequest, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  if (!files?.plagiarismPdf?.[0] || !files?.aiPdf?.[0]) return res.status(400).json({ error: 'Se requieren ambos PDFs (plagiarismPdf y aiPdf)' });
  const ticket = await db.updateTicketResults(req.params.id, files.plagiarismPdf[0].path, files.aiPdf[0].path);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  io.emit('ticket_updated', { ticketId: ticket.id, status: 'completed' });
  notifyTicketCompleted(ticket);
  // Send email notification to the client
  const ticketOwner = await db.getUserById(ticket.userId);
  if (ticketOwner) {
    await sendResultsReadyEmail(ticketOwner.email, ticketOwner.name, ticket.id);
  }
  res.json({ ticket });
});

// ── DELAY NOTIFICATION ──
app.post('/api/tickets/:id/notify-delay', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  const ticketOwner = await db.getUserById(ticket.userId);
  if (ticketOwner) {
    await sendDelayNotificationEmail(ticketOwner.email, ticketOwner.name, ticket.id);
  }
  res.json({ message: 'Notificación de demora enviada.' });
});

// ── DOWNLOAD ROUTES ──
app.get('/api/download/:ticketId/original', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  if (!fs.existsSync(ticket.filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.download(ticket.filePath, ticket.fileName);
});

app.get('/api/download/:ticketId/:type', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  const filePath = req.params.type === 'plagiarism' ? ticket.plagiarismPdfPath : ticket.aiPdfPath;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Reporte aún no disponible' });
  const name = req.params.type === 'plagiarism' ? `Reporte_Plagio_${ticket.id}.pdf` : `Reporte_IA_${ticket.id}.pdf`;
  res.download(filePath, name);
});

// ── SERVE STATIC FRONTEND (PRODUCTION) ──
const distPath = path.join(ROOT, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Fallback for React Router (SPA)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// ── SOCKET.IO ──
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`🔌 Cliente desconectado: ${socket.id}`));
});

// ── START ──
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Servidor AcademiX AI corriendo en http://localhost:${PORT}`);
  console.log(`📁 Archivos en: ${path.join(ROOT, 'uploads')}`);
  console.log(`☁️ Base de datos conectada a: Supabase\n`);
  initTelegramBot(io);
});
