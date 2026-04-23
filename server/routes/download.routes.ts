import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { auth, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../services/database';
import { storageService, BucketName } from '../services/storage';

const router = Router();

// ── Resolve a stored file path to an actual local path ──
// Stored paths may be absolute from a different server (e.g. /opt/render/project/src/uploads/results/...).
// We try the stored path first, then fall back to looking in the local uploads directories.
function resolveFilePath(storedPath: string, ...subdirs: string[]): string | null {
  // 1. Try the stored path as-is
  if (fs.existsSync(storedPath)) return storedPath;

  // 2. Extract the basename and look in local upload directories
  const basename = path.basename(storedPath);
  for (const subdir of subdirs) {
    const localPath = path.join(process.cwd(), 'uploads', subdir, basename);
    if (fs.existsSync(localPath)) return localPath;
  }

  // 3. Try relative to cwd (in case stored path is relative)
  const cwdPath = path.join(process.cwd(), storedPath);
  if (fs.existsSync(cwdPath)) return cwdPath;

  return null;
}

async function handleDownload(res: Response, storedPath: string, bucket: BucketName, localDirs: string[], downloadName: string) {
  // If it looks like a local absolute path or relative path, try to resolve locally first
  if (storedPath.startsWith('/') || storedPath.startsWith('C:') || storedPath.includes('\\') || storedPath.includes('uploads/')) {
    const resolved = resolveFilePath(storedPath, ...localDirs);
    if (resolved) {
      return res.download(resolved, downloadName);
    }
  }

  // Otherwise, it's a Supabase storage path
  const url = await storageService.getSignedUrl(bucket, storedPath);
  if (url) {
    return res.redirect(url); // Redirect the client to the signed URL
  }

  return res.status(404).json({ error: 'El archivo no se encontró. Es posible que el servidor se haya reiniciado y los archivos locales se perdieron.' });
}

// ── Download Original ──
router.get('/:ticketId/original', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });

  await handleDownload(res, ticket.filePath, 'originals', ['originals'], ticket.fileName);
});

// ── Download Report (plagiarism or ai) ──
router.get('/:ticketId/:type', auth, async (req: AuthRequest, res: Response) => {
  const ticket = await db.getTicketById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  if (req.user!.role !== 'admin' && ticket.userId !== req.user!.userId) return res.status(403).json({ error: 'Acceso denegado' });
  if (req.params.type !== 'plagiarism' && req.params.type !== 'ai') {
    return res.status(400).json({ error: 'Tipo de reporte no valido' });
  }
  if (req.params.type === 'ai' && ticket.requestedAnalysis === 'plagiarism') {
    return res.status(404).json({ error: 'Este ticket no incluye reporte de IA' });
  }
  const storedPath = req.params.type === 'plagiarism' ? ticket.plagiarismPdfPath : ticket.aiPdfPath;
  if (!storedPath) return res.status(404).json({ error: 'Reporte aún no disponible' });

  const name = req.params.type === 'plagiarism' ? `Reporte_Plagio_${ticket.id}.pdf` : `Reporte_IA_${ticket.id}.pdf`;
  await handleDownload(res, storedPath, 'results', ['results'], name);
});

export default router;
