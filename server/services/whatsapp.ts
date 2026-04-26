import path from 'path';
import fs from 'fs/promises';
import { fork, type ChildProcess } from 'child_process';
import type { Server as SocketServer } from 'socket.io';
import qrcode from 'qrcode-terminal';
import { env } from '../config/env';
import { db } from './database';
import { approvePayment, rejectPayment } from './payment';
import { storageService } from './storage';
import type { Payment, Ticket, User } from '../../shared/types';
import type { RequestedAnalysis } from '../../shared/constants/ticketRules';
import type { SupportTicket } from '../../shared/types/support';

type BaileysSocket = {
  ev: {
    on: (event: string, handler: (...args: any[]) => void) => void;
  };
  sendMessage: (jid: string, content: any) => Promise<any>;
  onWhatsApp?: (jid: string) => Promise<Array<{ exists?: boolean; jid: string }>>;
};

const silentLogger = {
  level: 'silent',
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
  child: () => silentLogger,
};

let sock: BaileysSocket | null = null;
let io: SocketServer | null = null;
let whatsappReady = false;
let whatsappConnecting = false;
let whatsappWorker: ChildProcess | null = null;
let whatsappWorkerRestartTimer: NodeJS.Timeout | null = null;
let adminNumbers: string[] = [];
const escalationTimers = new Map<string, NodeJS.Timeout>();
const ticketAssignment = new Map<string, number>();
const pendingPaymentRejectionReason = new Map<string, string>();
const pendingSupportNote = new Map<string, string>();
let roundRobinIndex = 0;
const ESCALATION_MINUTES = env.ESCALATION_TIMEOUT_MINUTES;
let processErrorGuardsInstalled = false;

function getSessionDir(): string {
  return path.isAbsolute(env.WHATSAPP_SESSION_DIR)
    ? env.WHATSAPP_SESSION_DIR
    : path.join(process.cwd(), env.WHATSAPP_SESSION_DIR);
}

function getSessionPointerPath(): string {
  return `${getSessionDir()}.active`;
}

async function resolveSessionDir(): Promise<string> {
  try {
    const stored = (await fs.readFile(getSessionPointerPath(), 'utf8')).trim();
    if (stored) return stored;
  } catch {}
  return getSessionDir();
}

async function createFreshSessionDir(): Promise<string> {
  const baseDir = getSessionDir();
  const freshDir = `${baseDir}-${Date.now()}`;
  await fs.mkdir(freshDir, { recursive: true });
  await fs.writeFile(getSessionPointerPath(), freshDir, 'utf8');
  return freshDir;
}

function ensureProcessErrorGuards() {
  if (processErrorGuardsInstalled) return;
  processErrorGuardsInstalled = true;

  process.on('unhandledRejection', (reason) => {
    console.error('Proceso: promesa rechazada no manejada:', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('Proceso: excepcion no capturada:', error);
  });
}

function isWorkerProcess(): boolean {
  return process.env.WHATSAPP_WORKER === 'true';
}

function sendWorkerMessage(message: any) {
  if (!env.WHATSAPP_ENABLED) return;
  if (!whatsappWorker || !whatsappWorker.connected) {
    console.warn('WhatsApp: worker no disponible; se omitio la notificacion.');
    return;
  }

  try {
    whatsappWorker.send(message);
  } catch (error) {
    console.error('WhatsApp: no se pudo enviar mensaje al worker:', error);
  }
}

function normalizeWhatsappNumber(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('5930')) return `${digits.slice(0, 3)}${digits.slice(4)}`;
  return digits;
}

function jidFromNumber(number: string): string {
  return `${normalizeWhatsappNumber(number)}@s.whatsapp.net`;
}

async function resolveJidFromNumber(number: string): Promise<string | null> {
  const normalized = normalizeWhatsappNumber(number);
  if (!normalized) return null;
  const fallbackJid = jidFromNumber(normalized);

  if (!sock?.onWhatsApp) return fallbackJid;

  try {
    const result = await sock.onWhatsApp(normalized);
    const match = result.find(item => item.exists && item.jid);
    if (match?.jid) return match.jid;
    console.error(`WhatsApp: el numero ${normalized} no aparece registrado en WhatsApp.`);
    return null;
  } catch (error) {
    console.error(`WhatsApp: no se pudo resolver JID para ${normalized}:`, error);
    return fallbackJid;
  }
}

function whatsappLinkToNumber(number: string, message: string): string {
  return `https://wa.me/${normalizeWhatsappNumber(number)}?text=${encodeURIComponent(message)}`;
}

function buildCommandLink(command: string): string {
  const target = normalizeWhatsappNumber(env.WHATSAPP_BOT_NUMBER);
  return `https://wa.me/${target}?text=${encodeURIComponent(command)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function requestedAnalysisLabel(requestedAnalysis: RequestedAnalysis): string {
  switch (requestedAnalysis) {
    case 'plagiarism':
      return 'Solo plagio';
    case 'ai':
      return 'Solo IA';
    case 'humanizer':
      return 'Humanizador express';
    default:
      return 'Plagio + IA';
  }
}

function paymentLabel(planType: Payment['planType']): string {
  switch (planType) {
    case 'basic':
      return 'Suscripcion basica';
    case 'pro':
      return 'Suscripcion estandar';
    case 'pro_plus':
      return 'Suscripcion premium';
    case 'express_plagiarism':
      return 'Express plagio';
    case 'express_ai':
      return 'Express IA';
    case 'express_full':
      return 'Express completo';
    case 'express_humanizer':
      return 'Express humanizador';
    default:
      return planType;
  }
}

function statusLabel(status: Ticket['status']): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'processing':
      return 'En proceso';
    case 'completed':
      return 'Completado';
    case 'pending_payment':
      return 'Pendiente de pago';
    case 'completed_pending_payment':
      return 'Resultado listo, pago pendiente';
    default:
      return status;
  }
}

async function refreshAdminNumbers() {
  adminNumbers = env.WHATSAPP_ADMIN_NUMBERS
    .split(',')
    .map(number => normalizeWhatsappNumber(number))
    .filter(Boolean);
}

async function getAdminUserByWhatsappNumber(number: string) {
  const normalized = normalizeWhatsappNumber(number);
  const configuredAdmins = (env.ADMIN_ACCOUNTS || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  const adminIndex = adminNumbers.findIndex(item => normalizeWhatsappNumber(item) === normalized);
  const account = adminIndex >= 0 ? configuredAdmins[adminIndex] : null;
  const email = account?.split(':')[0]?.trim();
  if (!email) return undefined;
  return db.getUserByEmail(email);
}

function getNextAdminIndex(currentIndex: number): number {
  if (adminNumbers.length === 0) return -1;
  return (currentIndex + 1) % adminNumbers.length;
}

function clearEscalationTimer(ticketId: string) {
  const timer = escalationTimers.get(ticketId);
  if (timer) {
    clearTimeout(timer);
    escalationTimers.delete(ticketId);
  }
}

function isCurrentAssignedNumber(ticketId: string, jid: string): boolean {
  const assignedIndex = ticketAssignment.get(ticketId);
  if (assignedIndex === undefined) return true;
  return jidFromNumber(adminNumbers[assignedIndex]) === jid;
}

function buildTicketMessage(ticket: Ticket, escalated = false): string {
  return [
    escalated ? 'TICKET REASIGNADO' : 'NUEVO TICKET ASIGNADO',
    '',
    `ID: ${ticket.id}`,
    `Documento: ${ticket.fileName}`,
    `Usuario: ${ticket.userName}`,
    `Tamano: ${formatSize(ticket.fileSize)}`,
    `Servicio: ${requestedAnalysisLabel(ticket.requestedAnalysis)}`,
    `Estado: ${statusLabel(ticket.status)}`,
    `Fecha: ${formatDate(ticket.createdAt)}`,
    '',
    `Comandos:`,
    `Aprobar: ${buildCommandLink(`confirm ${ticket.id}`)}`,
    `Estado: ${buildCommandLink(`status ${ticket.id}`)}`,
    `Reasignar: ${buildCommandLink(`reassign ${ticket.id}`)}`,
    '',
    `Si no respondes en ${ESCALATION_MINUTES} minutos se enviara al siguiente admin.`,
  ].join('\n');
}

function getConfiguredAdminAccount(index: number): { email: string; name: string } | null {
  const configuredAdmins = (env.ADMIN_ACCOUNTS || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const account = configuredAdmins[index];
  if (!account) return null;

  const [email, _password, name] = account.split(':').map(part => part?.trim());
  if (!email) return null;
  return { email, name: name || email };
}

async function getAdminDisplayNameByIndex(index: number): Promise<string> {
  const account = getConfiguredAdminAccount(index);
  if (!account) return `Admin ${index + 1}`;
  const user = await db.getUserByEmail(account.email);
  return user?.name || account.name;
}

function buildSupportReplyLink(ticket: SupportTicket, adminName: string): string {
  const message = [
    `Hola, te saluda el administrador ${adminName} de AcademiX AI.`,
    'Te escribo para ayudarte con tu solicitud:',
    '',
    ticket.message,
    '',
    'Estoy aqui para ayudarte.',
  ].join('\n');

  return whatsappLinkToNumber(ticket.phone, message);
}

function supportStatusLabel(status: SupportTicket['status']): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'in_progress':
      return 'En proceso';
    case 'resolved':
      return 'Resuelto';
    default:
      return status;
  }
}

function buildSupportTicketMessage(ticket: SupportTicket, adminName: string, reassigned = false): string {
  return [
    reassigned ? 'TICKET DE SOPORTE REASIGNADO' : 'NUEVO TICKET DE SOPORTE',
    '',
    `ID: ${ticket.id}`,
    `Usuario: ${ticket.name}`,
    `Correo: ${ticket.email}`,
    `Telefono: ${ticket.phone}`,
    `Estado: ${supportStatusLabel(ticket.status)}`,
    `Fecha: ${formatDate(ticket.createdAt)}`,
    '',
    'Problema:',
    ticket.message,
    '',
    '---',
    'ACCIONES:',
    '',
    'Reasignar ticket:',
    buildCommandLink(`support_reassign ${ticket.id}`),
    '',
    'Responder al usuario:',
    buildSupportReplyLink(ticket, adminName),
    '',
    'Marcar como resuelto:',
    buildCommandLink(`support_resolve ${ticket.id}`),
    '',
    'Agregar nota interna:',
    buildCommandLink(`support_note ${ticket.id}`),
    '---',
  ].join('\n');
}

async function sendStoredFile(jid: string, bucket: 'originals' | 'vouchers', filePath: string, filename: string, caption: string) {
  if (!sock || !whatsappReady || !filePath) return;

  try {
    const buffer = await storageService.getFileBuffer(bucket, filePath);
    if (!buffer) return;

    await sock.sendMessage(jid, {
      document: buffer,
      mimetype: bucket === 'vouchers' ? 'image/jpeg' : 'application/octet-stream',
      fileName: filename,
      caption,
    });
  } catch (error) {
    console.error(`WhatsApp: error enviando ${bucket}/${filePath}:`, error);
  }
}

async function sendText(jid: string, text: string): Promise<boolean> {
  if (!sock || !whatsappReady) return false;
  try {
    await sock.sendMessage(jid, { text });
    return true;
  } catch (error) {
    console.error(`WhatsApp: error enviando texto a ${jid}:`, error);
    return false;
  }
}

async function sendTextToNumber(number: string, text: string): Promise<boolean> {
  const jid = await resolveJidFromNumber(number);
  if (!jid) return false;
  console.log(`WhatsApp: enviando texto a ${normalizeWhatsappNumber(number)} usando JID ${jid}`);
  return sendText(jid, text);
}

async function sendTicketToAdmin(number: string, ticket: Ticket, escalated: boolean) {
  const jid = await resolveJidFromNumber(number);
  if (!jid) return;
  await sendText(jid, buildTicketMessage(ticket, escalated));
  await sendStoredFile(jid, 'originals', ticket.filePath, ticket.fileName, `Documento original ${ticket.id}`);
}

function scheduleEscalation(ticketId: string, currentAdminIndex: number) {
  clearEscalationTimer(ticketId);
  if (!sock || adminNumbers.length <= 1) return;

  const timer = setTimeout(async () => {
    try {
      const ticket = await db.getTicketById(ticketId);
      if (!ticket || ticket.status !== 'pending') {
        clearEscalationTimer(ticketId);
        return;
      }

      const nextIndex = getNextAdminIndex(currentAdminIndex);
      if (nextIndex === -1) return;

      ticketAssignment.set(ticketId, nextIndex);
      await sendTicketToAdmin(adminNumbers[nextIndex], ticket, true);
      scheduleEscalation(ticketId, nextIndex);
    } catch (error) {
      console.error(`WhatsApp: error escalando ticket ${ticketId}:`, error);
    }
  }, ESCALATION_MINUTES * 60 * 1000);

  escalationTimers.set(ticketId, timer);
}

async function handleConfirm(jid: string, ticketId: string) {
  const phone = jid.split('@')[0];
  const selectedAdmin = await getAdminUserByWhatsappNumber(phone);
  if (!selectedAdmin) {
    await sendText(jid, 'No tienes permisos de administrador.');
    return;
  }

  if (!isCurrentAssignedNumber(ticketId, jid)) {
    await sendText(jid, 'Este ticket ya fue reasignado a otro administrador.');
    return;
  }

  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    await sendText(jid, `Ticket ${ticketId} no encontrado.`);
    return;
  }
  if (ticket.status !== 'pending') {
    await sendText(jid, `El ticket ${ticketId} ya no esta pendiente.`);
    return;
  }

  await db.assignTicket(ticketId, selectedAdmin.name, selectedAdmin.id);
  io?.emit('ticket_updated', { ticketId, status: 'processing', assignedTo: selectedAdmin.name });
  clearEscalationTimer(ticketId);
  await sendText(jid, `Ticket ${ticketId} confirmado y asignado a ${selectedAdmin.name}.`);
}

async function handleStatus(jid: string, ticketId: string) {
  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    await sendText(jid, `Ticket ${ticketId} no encontrado.`);
    return;
  }

  await sendText(jid, [
    `ESTADO DEL TICKET`,
    '',
    `ID: ${ticket.id}`,
    `Documento: ${ticket.fileName}`,
    `Estado: ${statusLabel(ticket.status)}`,
    ticket.assignedTo ? `Asignado a: ${ticket.assignedTo}` : 'Sin asignar',
    `Fecha: ${formatDate(ticket.createdAt)}`,
  ].join('\n'));
}

async function handleReassign(jid: string, ticketId: string) {
  if (!isCurrentAssignedNumber(ticketId, jid)) {
    await sendText(jid, 'Este ticket ya fue reasignado a otro administrador.');
    return;
  }

  const ticket = await db.getTicketById(ticketId);
  if (!ticket || ticket.status !== 'pending') {
    await sendText(jid, `El ticket ${ticketId} ya no esta disponible para reasignacion.`);
    return;
  }

  const currentIndex = ticketAssignment.get(ticketId) ?? adminNumbers.findIndex(number => jidFromNumber(number) === jid);
  const nextIndex = getNextAdminIndex(currentIndex);
  if (nextIndex === -1) {
    await sendText(jid, 'No hay otro admin disponible.');
    return;
  }

  clearEscalationTimer(ticketId);
  ticketAssignment.set(ticketId, nextIndex);
  await sendTicketToAdmin(adminNumbers[nextIndex], ticket, true);
  scheduleEscalation(ticketId, nextIndex);
  await sendText(jid, `Ticket ${ticketId} reasignado al siguiente administrador.`);
}

async function sendSupportTicketToAdmin(adminIndex: number, ticket: SupportTicket, reassigned = false) {
  if (!sock || adminNumbers.length === 0) return;

  const adminNumber = adminNumbers[adminIndex];
  const adminName = await getAdminDisplayNameByIndex(adminIndex);
  const updated = await db.assignSupportTicket(ticket.id, adminName, adminNumber);
  const currentTicket = updated || ticket;
  const sent = await sendTextToNumber(adminNumber, buildSupportTicketMessage(currentTicket, adminName, reassigned));
  if (!sent) {
    console.error(`WhatsApp: soporte ${ticket.id} fue asignado a ${adminName} (${normalizeWhatsappNumber(adminNumber)}), pero no se pudo entregar el mensaje.`);
  }
}

async function handleSupportReassign(jid: string, ticketId: string) {
  const ticket = await db.getSupportTicketById(ticketId);
  if (!ticket) {
    await sendText(jid, `Ticket de soporte ${ticketId} no encontrado.`);
    return;
  }
  if (ticket.status === 'resolved') {
    await sendText(jid, `El ticket ${ticketId} ya esta resuelto.`);
    return;
  }

  const currentPhone = jid.split('@')[0];
  const senderIsAdmin = adminNumbers.some(number => normalizeWhatsappNumber(number) === normalizeWhatsappNumber(currentPhone));
  if (!senderIsAdmin) {
    await sendText(jid, 'No tienes permisos de administrador.');
    return;
  }

  if (adminNumbers.length <= 1) {
    await sendText(jid, 'No hay otro administrador configurado para reasignar.');
    return;
  }

  const assignedIndex = ticket.assignedAdminNumber
    ? adminNumbers.findIndex(number => normalizeWhatsappNumber(number) === normalizeWhatsappNumber(ticket.assignedAdminNumber || ''))
    : -1;
  const senderIndex = adminNumbers.findIndex(number => normalizeWhatsappNumber(number) === normalizeWhatsappNumber(currentPhone));
  const currentIndex = assignedIndex >= 0 ? assignedIndex : senderIndex;
  const nextIndex = getNextAdminIndex(currentIndex >= 0 ? currentIndex : 0);
  if (nextIndex === -1 || nextIndex === currentIndex) {
    await sendText(jid, 'No se pudo calcular otro administrador para reasignar.');
    return;
  }

  await sendSupportTicketToAdmin(nextIndex, ticket, true);
  const nextAdminName = await getAdminDisplayNameByIndex(nextIndex);
  await sendText(jid, `Ticket ${ticket.id} reasignado a ${nextAdminName}.`);
}

async function handleSupportResolve(jid: string, ticketId: string) {
  const ticket = await db.getSupportTicketById(ticketId);
  if (!ticket) {
    await sendText(jid, `Ticket de soporte ${ticketId} no encontrado.`);
    return;
  }

  const currentPhone = jid.split('@')[0];
  if (ticket.assignedAdminNumber && normalizeWhatsappNumber(ticket.assignedAdminNumber) !== normalizeWhatsappNumber(currentPhone)) {
    await sendText(jid, 'Este ticket de soporte esta asignado a otro administrador.');
    return;
  }

  const updated = await db.resolveSupportTicket(ticketId);
  await sendText(jid, updated ? `Ticket ${ticketId} marcado como resuelto.` : `No se pudo resolver el ticket ${ticketId}.`);
}

async function handleSupportNote(jid: string, ticketId: string) {
  const ticket = await db.getSupportTicketById(ticketId);
  if (!ticket) {
    await sendText(jid, `Ticket de soporte ${ticketId} no encontrado.`);
    return;
  }

  pendingSupportNote.set(jid, ticketId);
  await sendText(jid, `Escribe la nota interna para el ticket ${ticketId}.`);
}

async function handleApprovePayment(jid: string, paymentId: string) {
  const result = await approvePayment(paymentId, jid.split('@')[0], io);
  if (result.ok === false) {
    await sendText(jid, result.error);
    return;
  }

  await sendText(jid, `Pago ${paymentId} aprobado. ${String(result.payment.metadata?.activatedMessage || '')}`.trim());
}

async function handleRejectPayment(jid: string, paymentId: string, reason: string) {
  const result = await rejectPayment(paymentId, jid.split('@')[0], reason, io);
  if (result.ok === false) {
    await sendText(jid, result.error);
    return;
  }

  await sendText(jid, `Pago ${paymentId} rechazado.`);
}

async function handleIncomingMessage(message: string, jid: string) {
  const text = message.trim();
  if (!text) return;

  if (!adminNumbers.some(number => jidFromNumber(number) === jid)) {
    return;
  }

  const pendingPaymentId = pendingPaymentRejectionReason.get(jid);
  if (pendingPaymentId) {
    pendingPaymentRejectionReason.delete(jid);
    await handleRejectPayment(jid, pendingPaymentId, text);
    return;
  }

  const pendingSupportTicketId = pendingSupportNote.get(jid);
  if (pendingSupportTicketId) {
    pendingSupportNote.delete(jid);
    const updated = await db.addSupportTicketNote(pendingSupportTicketId, `${formatDate(new Date().toISOString())} - ${text}`);
    await sendText(jid, updated ? `Nota agregada al ticket ${pendingSupportTicketId}.` : `No se pudo agregar la nota al ticket ${pendingSupportTicketId}.`);
    return;
  }

  const [command, id, ...rest] = text.split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  const normalizedId = String(id || '').trim().toUpperCase();

  if (normalizedCommand === 'confirm' && normalizedId) {
    await handleConfirm(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'status' && normalizedId) {
    await handleStatus(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'reassign' && normalizedId) {
    await handleReassign(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'support_reassign' && normalizedId) {
    await handleSupportReassign(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'support_resolve' && normalizedId) {
    await handleSupportResolve(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'support_note' && normalizedId) {
    await handleSupportNote(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'test_send_santiago') {
    const ok = await sendTextToNumber('0992061812', `Prueba directa del bot AcademiX AI: ${formatDate(new Date().toISOString())}`);
    await sendText(jid, ok ? 'Prueba enviada a Santiago.' : 'No se pudo enviar la prueba a Santiago. Revisa logs del JID.');
    return;
  }

  if (normalizedCommand === 'approve' && normalizedId) {
    await handleApprovePayment(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'reject' && normalizedId && rest.length > 0) {
    await handleRejectPayment(jid, normalizedId, rest.join(' '));
    return;
  }

  if (normalizedCommand === 'reject' && normalizedId) {
    pendingPaymentRejectionReason.set(jid, normalizedId);
    await sendText(jid, `Escribe el motivo del rechazo para el pago ${normalizedId}.`);
  }
}

async function startWhatsAppBotInProcess(socketIo?: SocketServer) {
  if (socketIo) io = socketIo;
  if (sock || whatsappConnecting || !env.WHATSAPP_ENABLED) return;
  ensureProcessErrorGuards();
  whatsappConnecting = true;

  try {
    await refreshAdminNumbers();
    if (adminNumbers.length === 0) {
      console.log('WHATSAPP_ADMIN_NUMBERS no configurado. Bot de WhatsApp desactivado.');
      return;
    }

    const baileys = await import('@whiskeysockets/baileys');
    const sessionDir = await resolveSessionDir();
    await fs.mkdir(sessionDir, { recursive: true });
    console.log(`WhatsApp: usando sesion en ${sessionDir}`);
    const { state, saveCreds } = await baileys.useMultiFileAuthState(sessionDir);
    const { version } = await baileys.fetchLatestBaileysVersion();

    sock = baileys.makeWASocket({
      auth: state,
      version,
      browser: ['AcademiX AI', 'Chrome', '1.0.0'],
      logger: silentLogger,
    });

    sock.ev.on('creds.update', () => {
      void fs.mkdir(sessionDir, { recursive: true })
        .then(() => saveCreds())
        .catch(error => console.error(`WhatsApp: no se pudieron guardar credenciales en ${sessionDir}:`, error));
    });
    sock.ev.on('connection.update', (update: any) => {
      if (update.qr) {
        console.log('\nEscanea este QR con el WhatsApp del numero bot en Dispositivos vinculados:\n');
        qrcode.generate(update.qr, { small: true });
      }
      if (update.connection === 'open') {
        whatsappReady = true;
        console.log(`Bot de WhatsApp iniciado para ${normalizeWhatsappNumber(env.WHATSAPP_BOT_NUMBER)}.`);
      }
      if (update.connection === 'close' && update.lastDisconnect?.error?.output?.statusCode !== baileys.DisconnectReason.loggedOut) {
        whatsappReady = false;
        sock = null;
        setTimeout(() => void initWhatsAppBot(io || undefined), 5000);
      }
      if (update.connection === 'close' && update.lastDisconnect?.error?.output?.statusCode === baileys.DisconnectReason.loggedOut) {
        whatsappReady = false;
        sock = null;
        console.error('La sesion de WhatsApp se cerro. Creando una sesion nueva para generar QR.');
        void createFreshSessionDir()
          .then((freshDir) => {
            console.log(`WhatsApp: nueva sesion preparada en ${freshDir}`);
            setTimeout(() => void initWhatsAppBot(io || undefined), 1000);
          })
          .catch(error => console.error('No se pudo preparar una sesion nueva de WhatsApp:', error));
      }
    });

    sock.ev.on('messages.upsert', async (event: any) => {
      const messages = event?.messages || [];
      for (const item of messages) {
        if (item.key?.fromMe) continue;
        const jid = item.key?.remoteJid;
        const text =
          item.message?.buttonsResponseMessage?.selectedButtonId ||
          item.message?.templateButtonReplyMessage?.selectedId ||
          item.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
          item.message?.conversation ||
          item.message?.extendedTextMessage?.text ||
          '';
        if (jid && text) {
          try {
            await handleIncomingMessage(text, jid);
          } catch (error) {
            console.error('WhatsApp: error procesando mensaje entrante:', error);
          }
        }
      }
    });
  } catch (error) {
    console.error('No se pudo iniciar Baileys. Instala dependencias y revisa la sesion de WhatsApp.', error);
  } finally {
    whatsappConnecting = false;
  }
}

function notifyNewTicketWhatsappInProcess(ticket: Ticket) {
  if (!sock || adminNumbers.length === 0) return;

  const adminIndex = roundRobinIndex % adminNumbers.length;
  roundRobinIndex += 1;
  ticketAssignment.set(ticket.id, adminIndex);
  void sendTicketToAdmin(adminNumbers[adminIndex], ticket, false)
    .catch(error => console.error(`WhatsApp: error notificando ticket ${ticket.id}:`, error));
  scheduleEscalation(ticket.id, adminIndex);
}

function notifyTicketCompletedWhatsappInProcess(ticket: Ticket) {
  if (!sock || adminNumbers.length === 0) return;

  clearEscalationTimer(ticket.id);
  ticketAssignment.delete(ticket.id);

  for (const number of adminNumbers) {
    void sendText(jidFromNumber(number), [
      'TICKET COMPLETADO',
      '',
      `ID: ${ticket.id}`,
      `Documento: ${ticket.fileName}`,
      `Usuario: ${ticket.userName}`,
      `Servicio: ${requestedAnalysisLabel(ticket.requestedAnalysis)}`,
      `Completado: ${ticket.completedAt ? formatDate(ticket.completedAt) : formatDate(new Date().toISOString())}`,
    ].join('\n')).catch(error => console.error(`WhatsApp: error notificando ticket completado ${ticket.id}:`, error));
  }
}

function notifyNewPaymentWhatsappInProcess(payment: Payment, user: User) {
  if (!sock || adminNumbers.length === 0) return;

  for (const number of adminNumbers) {
    const jid = jidFromNumber(number);
    void sendText(
      jid,
      [
        'NUEVO PAGO RECIBIDO',
        '',
        `ID: ${payment.id}`,
        `Usuario: ${user.name}`,
        `Correo: ${user.email}`,
        `Servicio: ${paymentLabel(payment.planType)}`,
        `Monto: $${payment.amount.toFixed(2)}`,
        `Enviado: ${formatDate(payment.createdAt)}`,
        '',
        'Comandos:',
        `Aprobar: ${buildCommandLink(`approve ${payment.id}`)}`,
        `Rechazar: ${buildCommandLink(`reject ${payment.id}`)}`,
        '',
        'Si eliges rechazar, el bot te pedira el motivo en el siguiente mensaje.',
      ].join('\n'),
    ).catch(error => console.error(`WhatsApp: error notificando pago ${payment.id}:`, error));
    void sendStoredFile(jid, 'vouchers', payment.voucherPath, `comprobante-${payment.id}`, `Comprobante ${payment.id}`)
      .catch(error => console.error(`WhatsApp: error enviando comprobante ${payment.id}:`, error));
  }
}

function notifyNewSupportTicketWhatsappInProcess(ticket: SupportTicket) {
  if (!sock || adminNumbers.length === 0) return;

  const adminIndex = roundRobinIndex % adminNumbers.length;
  roundRobinIndex += 1;
  void sendSupportTicketToAdmin(adminIndex, ticket, false)
    .catch(error => console.error(`WhatsApp: error notificando soporte ${ticket.id}:`, error));
}

function scheduleWorkerRestart() {
  if (whatsappWorkerRestartTimer || !env.WHATSAPP_ENABLED) return;
  whatsappWorkerRestartTimer = setTimeout(() => {
    whatsappWorkerRestartTimer = null;
    void initWhatsAppBot(io || undefined);
  }, 5000);
}

export async function initWhatsAppBot(socketIo?: SocketServer) {
  if (socketIo) io = socketIo;
  if (!env.WHATSAPP_ENABLED) return;

  if (isWorkerProcess()) {
    await startWhatsAppBotInProcess(socketIo);
    return;
  }

  if (whatsappWorker && !whatsappWorker.killed) return;

  const workerPath = new URL(import.meta.url);
  whatsappWorker = fork(workerPath, [], {
    env: { ...process.env, WHATSAPP_WORKER: 'true' },
    execArgv: ['--import', 'tsx'],
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  console.log(`WhatsApp: worker iniciado con PID ${whatsappWorker.pid}.`);

  whatsappWorker.on('exit', (code, signal) => {
    console.error(`WhatsApp: worker finalizo. code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    whatsappWorker = null;
    scheduleWorkerRestart();
  });

  whatsappWorker.on('error', (error) => {
    console.error('WhatsApp: error del worker:', error);
  });
}

export function notifyNewTicketWhatsapp(ticket: Ticket) {
  if (isWorkerProcess()) return notifyNewTicketWhatsappInProcess(ticket);
  sendWorkerMessage({ type: 'newTicket', ticket });
}

export function notifyTicketCompletedWhatsapp(ticket: Ticket) {
  if (isWorkerProcess()) return notifyTicketCompletedWhatsappInProcess(ticket);
  sendWorkerMessage({ type: 'ticketCompleted', ticket });
}

export function notifyNewPaymentWhatsapp(payment: Payment, user: User) {
  if (isWorkerProcess()) return notifyNewPaymentWhatsappInProcess(payment, user);
  sendWorkerMessage({ type: 'newPayment', payment, user });
}

export function notifyNewSupportTicketWhatsapp(ticket: SupportTicket) {
  if (isWorkerProcess()) return notifyNewSupportTicketWhatsappInProcess(ticket);
  sendWorkerMessage({ type: 'newSupportTicket', ticket });
}

if (isWorkerProcess()) {
  ensureProcessErrorGuards();

  db.ready
    .then(() => startWhatsAppBotInProcess())
    .catch(error => {
      console.error('WhatsApp: no se pudo iniciar worker:', error);
      process.exitCode = 1;
    });

  process.on('message', (message: any) => {
    try {
      switch (message?.type) {
        case 'newTicket':
          notifyNewTicketWhatsappInProcess(message.ticket);
          break;
        case 'ticketCompleted':
          notifyTicketCompletedWhatsappInProcess(message.ticket);
          break;
        case 'newPayment':
          notifyNewPaymentWhatsappInProcess(message.payment, message.user);
          break;
        case 'newSupportTicket':
          notifyNewSupportTicketWhatsappInProcess(message.ticket);
          break;
      }
    } catch (error) {
      console.error('WhatsApp: error procesando mensaje IPC:', error);
    }
  });
}
