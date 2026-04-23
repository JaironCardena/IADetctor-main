import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
