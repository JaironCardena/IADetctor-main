import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  user?: { userId: string; email: string; role: string };
}

export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(header.split(' ')[1], env.JWT_SECRET) as any;
    next();
  } catch { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Se requiere rol de administrador' });
  next();
}

export function signToken(user: { id: string; email: string; role: string }) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, env.JWT_SECRET, { expiresIn: '7d' });
}
