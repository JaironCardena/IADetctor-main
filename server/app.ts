import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import type { ErrorRequestHandler } from 'express';
import routes from './routes';

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Health check ──
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'academix-ai' });
});

// ── API Routes ──
app.use(routes);

const uploadErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo excede el tamano maximo permitido.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'El campo de archivo enviado no es valido.' });
    }
    return res.status(400).json({ error: err.message || 'No se pudo procesar el archivo.' });
  }

  if (err instanceof Error && err.message.startsWith('Solo se permiten')) {
    return res.status(400).json({ error: err.message });
  }

  console.error('Unhandled API error:', err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
};

app.use('/api', uploadErrorHandler);

// ── Serve Static Frontend (Production) ──
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Fallback for React Router (SPA)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

export default app;
