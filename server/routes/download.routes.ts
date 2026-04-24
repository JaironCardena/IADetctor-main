import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { auth, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../services/database';
import { storageService, BucketName } from '../services/storage';
import { env } from '../config/env';

const router = Router();

function resolveFilePath(storedPath: string, ...subdirs: string[]): string | null {
  if (fs.existsSync(storedPath)) return storedPath;

  const basename = path.basename(storedPath);
  for (const subdir of subdirs) {
    const localPath = path.join(process.cwd(), 'uploads', subdir, basename);
    if (fs.existsSync(localPath)) return localPath;
  }

  const cwdPath = path.join(process.cwd(), storedPath);
  if (fs.existsSync(cwdPath)) return cwdPath;

  return null;
}

async function handleDownload(
  res: Response,
  storedPath: string,
  bucket: BucketName,
  localDirs: string[],
  downloadName: string
) {
  if (storedPath.startsWith('/') || storedPath.startsWith('C:') || storedPath.includes('\\') || storedPath.includes('uploads/')) {
    const resolved = resolveFilePath(storedPath, ...localDirs);
    if (resolved) {
      return res.download(resolved, downloadName);
    }
  }

  const url = await storageService.getSignedUrl(bucket, storedPath);
  if (url) {
    return res.redirect(url);
  }

  return res.status(404).json({ error: 'El archivo no se encontro.' });
}

router.get('/storage', async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { bucket: BucketName; filePath: string };
    const ext = path.extname(decoded.filePath).toLowerCase();

    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    }

    res.setHeader('Content-Disposition', `inline; filename="${path.basename(decoded.filePath)}"`);
    await storageService.streamFile(decoded.bucket, decoded.filePath, res);
  } catch (err) {
    console.error('Error in /storage download:', err);
    return res.status(401).json({ error: 'URL expirada o invalida' });
  }
});

router.get('/:ticketId/original', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  await handleDownload(res, ticket.filePath, 'originals', ['originals'], ticket.fileName);
});

router.get('/:ticketId/:type', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  if (req.params.type !== 'plagiarism' && req.params.type !== 'ai' && req.params.type !== 'humanizer') {
    return res.status(400).json({ error: 'Tipo de reporte no valido' });
  }

  if (req.params.type === 'humanizer') {
    if (!ticket.humanizedResultPath) {
      return res.status(404).json({ error: 'Resultado de humanizador aun no disponible' });
    }

    return handleDownload(
      res,
      ticket.humanizedResultPath,
      'results',
      ['results'],
      `Texto_Humanizado_${ticket.id}.docx`
    );
  }

  const isAi = req.params.type === 'ai';
  const storedPath = isAi ? ticket.aiPdfPath : ticket.plagiarismPdfPath;

  if (!storedPath) {
    if (isAi && (ticket.requestedAnalysis === 'plagiarism' || ticket.requestedAnalysis === 'humanizer')) {
      return res.status(404).json({ error: 'Este ticket no incluye reporte de IA' });
    }

    if (!isAi && (ticket.requestedAnalysis === 'ai' || ticket.requestedAnalysis === 'humanizer')) {
      return res.status(404).json({ error: 'Este ticket no incluye reporte de plagio' });
    }

    return res.status(404).json({ error: 'Reporte aun no disponible' });
  }

  await handleDownload(
    res,
    storedPath,
    'results',
    ['results'],
    isAi ? `Reporte_IA_${ticket.id}.pdf` : `Reporte_Plagio_${ticket.id}.pdf`
  );
});

export default router;
