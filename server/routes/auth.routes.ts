import { Router, Request, Response } from 'express';
import { auth, signToken, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../services/database';
import { sendVerificationCode } from '../services/email';

const router = Router();

async function buildPublicAuthUser(user: {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  subscriptionPlan: 'basic' | 'pro' | 'pro_plus' | null;
}) {
  const subStatus = user.role === 'user' ? await db.getSubscriptionStatus(user.id) : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    subscriptionPlan: subStatus?.planType ?? user.subscriptionPlan ?? null,
    subscriptionExpiresAt: subStatus?.expiresAt ?? null
  };
}

router.post('/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres' });

  const user = await db.createUser(name, email, password);
  if (!user) return res.status(409).json({ error: 'El correo ya esta registrado' });

  if (user.verificationCode) {
    await sendVerificationCode(email, user.verificationCode, name);
  }
  res.json({ needsVerification: true, email: user.email, message: 'Se envio un codigo de verificacion a tu correo.' });
});

router.post('/verify', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Correo y codigo son requeridos' });

  const result = await db.verifyUser(email, code);
  if (!result.success || !result.user) return res.status(400).json({ error: result.error });

  const token = signToken(result.user);
  const publicUser = await buildPublicAuthUser(result.user);
  res.json({ token, user: publicUser });
});

router.post('/resend-code', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Correo requerido' });

  const result = await db.resendVerificationCode(email);
  if (!result.success) return res.status(400).json({ error: result.error });

  await sendVerificationCode(email, result.code!, result.userName!);
  res.json({ message: 'Codigo reenviado exitosamente.' });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contrasena son requeridos' });

  const user = await db.validateUser(email, password);
  if (!user) return res.status(401).json({ error: 'Credenciales invalidas' });

  if (!user.isVerified && user.role !== 'admin') {
    const resendResult = await db.resendVerificationCode(email);
    if (resendResult.success && resendResult.code) {
      await sendVerificationCode(email, resendResult.code, resendResult.userName!);
    }
    return res.status(403).json({ error: 'Cuenta no verificada', needsVerification: true, email: user.email });
  }

  const token = signToken(user);
  const publicUser = await buildPublicAuthUser(user);
  res.json({ token, user: publicUser });
});

router.get('/me', auth, async (req: AuthRequest, res: Response) => {
  const user = await db.getUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const publicUser = await buildPublicAuthUser(user);
  res.json({ user: publicUser });
});

export default router;
