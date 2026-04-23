import { Router, Request, Response } from 'express';
import { auth, adminOnly, signToken, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../services/database';
import { sendVerificationCode } from '../services/email';

const router = Router();

// ── Register ──
router.post('/register', async (req: Request, res: Response) => {
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

// ── Verify ──
router.post('/verify', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Correo y código son requeridos' });
  const result = await db.verifyUser(email, code);
  if (!result.success || !result.user) return res.status(400).json({ error: result.error });
  const token = signToken(result.user);
  res.json({ token, user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role } });
});

// ── Resend Code ──
router.post('/resend-code', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Correo requerido' });
  const result = await db.resendVerificationCode(email);
  if (!result.success) return res.status(400).json({ error: result.error });
  await sendVerificationCode(email, result.code!, result.userName!);
  res.json({ message: 'Código reenviado exitosamente.' });
});

// ── Login ──
router.post('/login', async (req: Request, res: Response) => {
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

// ── Get Current User ──
router.get('/me', auth, async (req: AuthRequest, res: Response) => {
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

export default router;
