import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { initTelegramBot } from './services/telegram';
import { storageService } from './services/storage';
import path from 'path';

const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: '*' } });

// Attach Socket.IO to Express app so routes can emit events
(app as any).io = io;

// ── Socket.IO ──
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`🔌 Cliente desconectado: ${socket.id}`));
});

// ── Start Server ──
httpServer.listen(env.PORT, () => {
  console.log(`\n🚀 Servidor AcademiX AI corriendo en http://localhost:${env.PORT}`);
  console.log(`📁 Archivos en: ${path.join(process.cwd(), 'uploads')}`);
  console.log(`☁️ Base de datos conectada a: Supabase\n`);
  initTelegramBot(io);

  // Setup cron job for deleting expired files (every hour)
  setInterval(() => {
    storageService.cleanupExpiredFiles();
  }, 60 * 60 * 1000);
});
