import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import app from './app';
import { env } from './config/env';
import { db } from './services/database';
import { initTelegramBot } from './services/telegram';
import { storageService } from './services/storage';
import { processSubscriptionRenewalReminders } from './services/subscriptionReminders';

const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: '*' } });

(app as any).io = io;

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Cliente desconectado: ${socket.id}`));
});

async function startServer() {
  await db.ready;

  httpServer.listen(env.PORT, () => {
    console.log(`\nServidor AcademiX AI corriendo en http://localhost:${env.PORT}`);
    console.log(`Archivos temporales en: ${path.join(process.cwd(), 'uploads')}`);
    console.log('Base de datos: MongoDB Atlas + GridFS\n');
    initTelegramBot(io);
    void processSubscriptionRenewalReminders();

    setInterval(() => {
      storageService.cleanupExpiredFiles();
    }, 60 * 60 * 1000);

    setInterval(() => {
      void processSubscriptionRenewalReminders();
    }, 60 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});
