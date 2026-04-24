import TelegramBot from 'node-telegram-bot-api';
import type { Server as SocketServer } from 'socket.io';
import { db } from './database';
import { env } from '../config/env';
import { approvePayment, rejectPayment } from './payment';
import { storageService } from './storage';
import type { Payment, Ticket, User } from '../../shared/types';
import type { RequestedAnalysis } from '../../shared/constants/ticketRules';

let bot: TelegramBot | null = null;
let io: SocketServer | null = null;
let adminChatIds: string[] = [];
const pendingRejectionReason = new Map<string, string>();
const escalationTimers = new Map<string, NodeJS.Timeout>();
const ticketAssignment = new Map<string, number>();
let roundRobinIndex = 0;
const ESCALATION_MINUTES = env.ESCALATION_TIMEOUT_MINUTES;

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
      return 'Solo reporte de plagio';
    case 'ai':
      return 'Solo reporte de IA';
    case 'humanizer':
      return 'Humanizador express';
    default:
      return 'Reporte completo (plagio + IA)';
  }
}

function paymentLabel(planType: Payment['planType']): string {
  switch (planType) {
    case 'basic':
      return 'Suscripcion basica';
    case 'pro':
      return 'Suscripcion pro';
    case 'pro_plus':
      return 'Suscripcion pro+';
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

function ticketActionsKeyboard(ticketId: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Confirmar ticket', callback_data: `confirm_${ticketId}` },
        { text: 'Ver estado', callback_data: `status_${ticketId}` },
      ],
      [
        { text: 'Asignar a otro admin', callback_data: `reassign_${ticketId}` },
      ],
    ],
  };
}

function paymentActionsKeyboard(paymentId: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Aprobar pago', callback_data: `approve_pay_${paymentId}` },
        { text: 'Rechazar pago', callback_data: `reject_pay_${paymentId}` },
      ],
    ],
  };
}

async function refreshAdminChatIds() {
  adminChatIds = await db.getAdminChatIds();
}

function isCurrentAssignedChat(ticketId: string, chatId: string): boolean {
  const assignedIndex = ticketAssignment.get(ticketId);
  if (assignedIndex === undefined) return true;
  return adminChatIds[assignedIndex] === chatId;
}

async function sendStoredFile(
  chatId: string,
  bucket: 'originals' | 'vouchers',
  filePath: string,
  filename: string,
  caption: string
) {
  if (!bot || !filePath) return;

  try {
    const buffer = await storageService.getFileBuffer(bucket, filePath);
    if (!buffer) {
      console.error(`Telegram: no se pudo leer ${bucket}/${filePath}`);
      return;
    }

    await bot.sendDocument(chatId, buffer, { caption, parse_mode: 'Markdown' }, { filename });
  } catch (error) {
    console.error(`Telegram: error enviando ${bucket}/${filePath}:`, error);
  }
}

function buildTicketMessage(ticket: Ticket): string {
  return [
    `NUEVO TICKET`,
    ``,
    `ID: \`${ticket.id}\``,
    `Documento: *${ticket.fileName}*`,
    `Usuario: ${ticket.userName}`,
    `Tamano: ${formatSize(ticket.fileSize)}`,
    `Servicio: *${requestedAnalysisLabel(ticket.requestedAnalysis)}*`,
    `Estado: ${statusLabel(ticket.status)}`,
    `Fecha: ${formatDate(ticket.createdAt)}`,
  ].join('\n');
}

function clearEscalationTimer(ticketId: string) {
  const timer = escalationTimers.get(ticketId);
  if (timer) {
    clearTimeout(timer);
    escalationTimers.delete(ticketId);
  }
}

function getNextAdminIndex(currentIndex: number): number {
  if (adminChatIds.length === 0) return -1;
  return (currentIndex + 1) % adminChatIds.length;
}

async function sendTicketToAdmin(chatId: string, ticket: Ticket, escalated: boolean) {
  if (!bot) return;

  const header = escalated ? 'TICKET REASIGNADO POR FALTA DE RESPUESTA' : 'NUEVO TICKET ASIGNADO';
  await bot.sendMessage(chatId, [
    header,
    ``,
    buildTicketMessage(ticket),
    ``,
    `Si no confirmas en ${ESCALATION_MINUTES} minutos se notificara al siguiente admin.`,
  ].join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: ticketActionsKeyboard(ticket.id),
  });

  await sendStoredFile(chatId, 'originals', ticket.filePath, ticket.fileName, `Documento original - \`${ticket.id}\``);
}

function scheduleEscalation(ticketId: string, currentAdminIndex: number) {
  clearEscalationTimer(ticketId);

  if (!bot || adminChatIds.length <= 1) return;

  const timer = setTimeout(async () => {
    const ticket = await db.getTicketById(ticketId);
    if (!ticket || ticket.status !== 'pending') {
      clearEscalationTimer(ticketId);
      return;
    }

    const nextIndex = getNextAdminIndex(currentAdminIndex);
    if (nextIndex === -1) return;

    ticketAssignment.set(ticketId, nextIndex);
    const nextChatId = adminChatIds[nextIndex];
    await sendTicketToAdmin(nextChatId, ticket, true);
    scheduleEscalation(ticketId, nextIndex);
  }, ESCALATION_MINUTES * 60 * 1000);

  escalationTimers.set(ticketId, timer);
}

async function handleConfirmTicket(chatId: string, ticketId: string, messageId?: number) {
  if (!bot) return;

  const admin = await db.getAdminByTelegramChatId(chatId);
  if (!admin) {
    await bot.sendMessage(chatId, 'No tienes permisos de administrador.');
    return;
  }

  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    await bot.sendMessage(chatId, `Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  if (ticket.status !== 'pending') {
    await bot.sendMessage(chatId, `El ticket \`${ticketId}\` ya no esta pendiente.`, { parse_mode: 'Markdown' });
    return;
  }

  if (!isCurrentAssignedChat(ticketId, chatId)) {
    await bot.sendMessage(chatId, 'Este ticket ya fue reasignado a otro administrador.');
    return;
  }

  const updated = await db.assignTicket(ticketId, admin.name, admin.id);
  if (!updated) {
    await bot.sendMessage(chatId, `No se pudo asignar el ticket \`${ticketId}\`.`, { parse_mode: 'Markdown' });
    return;
  }

  io?.emit('ticket_updated', { ticketId, status: 'processing', assignedTo: admin.name });
  clearEscalationTimer(ticketId);

  if (messageId) {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => undefined);
  }

  await bot.sendMessage(chatId, [
    `TICKET CONFIRMADO`,
    ``,
    `ID: \`${ticketId}\``,
    `Asignado a: *${admin.name}*`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

async function handleReassignTicket(chatId: string, ticketId: string, messageId?: number) {
  if (!bot) return;

  if (adminChatIds.length <= 1) {
    await bot.sendMessage(chatId, 'No hay otro admin disponible para reasignar.');
    return;
  }

  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    await bot.sendMessage(chatId, `Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  if (ticket.status !== 'pending') {
    await bot.sendMessage(chatId, `El ticket \`${ticketId}\` ya no esta disponible para reasignacion.`, { parse_mode: 'Markdown' });
    return;
  }

  if (!isCurrentAssignedChat(ticketId, chatId)) {
    await bot.sendMessage(chatId, 'Este ticket ya fue reasignado a otro administrador.');
    return;
  }

  const currentIndex = ticketAssignment.get(ticketId) ?? adminChatIds.indexOf(chatId);
  const nextIndex = getNextAdminIndex(currentIndex);
  if (nextIndex === -1) {
    await bot.sendMessage(chatId, 'No se pudo calcular el siguiente admin.');
    return;
  }

  clearEscalationTimer(ticketId);
  ticketAssignment.set(ticketId, nextIndex);

  const nextChatId = adminChatIds[nextIndex];
  await sendTicketToAdmin(nextChatId, ticket, true);
  scheduleEscalation(ticketId, nextIndex);

  if (messageId) {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => undefined);
  }

  await bot.sendMessage(chatId, [
    `TICKET REASIGNADO`,
    ``,
    `ID: \`${ticket.id}\``,
    `Se notifico al siguiente administrador disponible.`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

async function handleTicketStatus(chatId: string, ticketId: string) {
  if (!bot) return;

  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    await bot.sendMessage(chatId, `Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  await bot.sendMessage(chatId, [
    `ESTADO DEL TICKET`,
    ``,
    `ID: \`${ticket.id}\``,
    `Documento: *${ticket.fileName}*`,
    `Estado: *${statusLabel(ticket.status)}*`,
    ticket.assignedTo ? `Asignado a: *${ticket.assignedTo}*` : 'Sin asignar',
    `Fecha: ${formatDate(ticket.createdAt)}`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

async function handleApprovePayment(chatId: string, paymentId: string, messageId?: number) {
  if (!bot) return;

  const adminUser = await db.getAdminByTelegramChatId(chatId);
  const adminName = adminUser?.name || 'Admin';
  const payment = await db.getPaymentById(paymentId);

  if (!payment) {
    await bot.sendMessage(chatId, `Pago \`${paymentId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  if (payment.status !== 'pending') {
    await bot.sendMessage(chatId, `Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`);
    return;
  }

  const result = await approvePayment(paymentId, adminName, io);
  if (result.ok === false) {
    await bot.sendMessage(chatId, result.error);
    return;
  }

  if (messageId) {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => undefined);
  }

  const activationMessage = String(result.payment.metadata?.activatedMessage || 'Pago aprobado');
  const expirationDate = result.subscription?.expiresAt
    ? new Date(result.subscription.expiresAt).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  for (const id of adminChatIds) {
    await bot.sendMessage(id, [
      `PAGO APROBADO`,
      ``,
      `ID: \`${payment.id}\``,
      `Usuario: ${payment.userName}`,
      `Servicio: *${paymentLabel(payment.planType)}*`,
      `Monto: *$${payment.amount.toFixed(2)}*`,
      `Validado por: *${adminName}*`,
      expirationDate ? `Vence: *${expirationDate}*` : activationMessage,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

async function handleRejectPayment(chatId: string, paymentId: string, reason: string, messageId?: number) {
  if (!bot) return;

  const adminUser = await db.getAdminByTelegramChatId(chatId);
  const adminName = adminUser?.name || 'Admin';
  const payment = await db.getPaymentById(paymentId);

  if (!payment) {
    await bot.sendMessage(chatId, `Pago \`${paymentId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  if (payment.status !== 'pending') {
    await bot.sendMessage(chatId, `Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`);
    return;
  }

  const result = await rejectPayment(paymentId, adminName, reason, io);
  if (result.ok === false) {
    await bot.sendMessage(chatId, result.error);
    return;
  }

  if (messageId) {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => undefined);
  }

  for (const id of adminChatIds) {
    await bot.sendMessage(id, [
      `PAGO RECHAZADO`,
      ``,
      `ID: \`${payment.id}\``,
      `Usuario: ${payment.userName}`,
      `Servicio: *${paymentLabel(payment.planType)}*`,
      `Rechazado por: *${adminName}*`,
      `Motivo: ${reason}`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

async function sendPendingTickets(chatId: string) {
  if (!bot) return;

  const tickets = await db.getAllTickets();
  const pending = tickets.filter(ticket => ticket.status === 'pending');

  if (pending.length === 0) {
    await bot.sendMessage(chatId, 'No hay tickets pendientes.');
    return;
  }

  await bot.sendMessage(chatId, `Tickets pendientes: ${pending.length}`);

  for (const ticket of pending.slice(0, 10)) {
    await bot.sendMessage(chatId, buildTicketMessage(ticket), {
      parse_mode: 'Markdown',
      reply_markup: ticketActionsKeyboard(ticket.id),
    });
  }
}

export async function initTelegramBot(socketIo?: SocketServer) {
  if (socketIo) io = socketIo;
  if (bot) return;

  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'TU_TOKEN_DEL_BOT') {
    console.log('TELEGRAM_BOT_TOKEN no configurado. Bot desactivado.');
    return;
  }

  await refreshAdminChatIds();
  bot = new TelegramBot(token, { polling: true });

  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
  });

  bot.onText(/\/start/, async (msg) => {
    await refreshAdminChatIds();
    const chatId = String(msg.chat.id);
    const isAdmin = adminChatIds.includes(chatId);

    await bot!.sendMessage(chatId, [
      `AcademiX AI Bot`,
      ``,
      `Chat ID: \`${chatId}\``,
      isAdmin ? 'Estado: administrador vinculado' : 'Estado: chat no vinculado como administrador',
      ``,
      `Comandos:`,
      `/tickets`,
      `/estado ID`,
      `/confirmar ID`,
    ].join('\n'), { parse_mode: 'Markdown' });
  });

  bot.onText(/\/tickets/, async (msg) => {
    const chatId = String(msg.chat.id);
    if (!adminChatIds.includes(chatId)) {
      await bot!.sendMessage(chatId, 'No tienes permisos de administrador.');
      return;
    }
    await sendPendingTickets(chatId);
  });

  bot.onText(/\/estado\s+(.+)/, async (msg, match) => {
    const chatId = String(msg.chat.id);
    await handleTicketStatus(chatId, String(match?.[1] || '').trim().toUpperCase());
  });

  bot.onText(/\/confirmar\s+(.+)/, async (msg, match) => {
    const chatId = String(msg.chat.id);
    if (!adminChatIds.includes(chatId)) {
      await bot!.sendMessage(chatId, 'No tienes permisos de administrador.');
      return;
    }
    await handleConfirmTicket(chatId, String(match?.[1] || '').trim().toUpperCase());
  });

  bot.on('callback_query', async (query) => {
    if (!bot || !query.data || !query.message) return;

    const chatId = String(query.message.chat.id);
    const messageId = query.message.message_id;
    await bot.answerCallbackQuery(query.id).catch(() => undefined);

    if (!adminChatIds.includes(chatId)) {
      await bot.sendMessage(chatId, 'No tienes permisos de administrador.');
      return;
    }

    if (query.data.startsWith('confirm_')) {
      await handleConfirmTicket(chatId, query.data.replace('confirm_', ''), messageId);
      return;
    }

    if (query.data.startsWith('status_')) {
      await handleTicketStatus(chatId, query.data.replace('status_', ''));
      return;
    }

    if (query.data.startsWith('reassign_')) {
      await handleReassignTicket(chatId, query.data.replace('reassign_', ''), messageId);
      return;
    }

    if (query.data.startsWith('approve_pay_')) {
      await handleApprovePayment(chatId, query.data.replace('approve_pay_', ''), messageId);
      return;
    }

    if (query.data.startsWith('reject_pay_')) {
      const paymentId = query.data.replace('reject_pay_', '');
      pendingRejectionReason.set(chatId, paymentId);
      await bot.sendMessage(chatId, `Escribe el motivo del rechazo para el pago \`${paymentId}\`.`, { parse_mode: 'Markdown' });
    }
  });

  bot.on('message', async (msg) => {
    if (!bot || !msg.text || msg.text.startsWith('/')) return;

    const chatId = String(msg.chat.id);
    const paymentId = pendingRejectionReason.get(chatId);
    if (!paymentId) return;

    pendingRejectionReason.delete(chatId);
    await handleRejectPayment(chatId, paymentId, msg.text.trim());
  });

  console.log('Bot de Telegram iniciado.');
}

export function notifyNewTicket(ticket: Ticket) {
  if (!bot || adminChatIds.length === 0) return;

  const adminIndex = roundRobinIndex % adminChatIds.length;
  roundRobinIndex += 1;
  ticketAssignment.set(ticket.id, adminIndex);

  void sendTicketToAdmin(adminChatIds[adminIndex], ticket, false);
  scheduleEscalation(ticket.id, adminIndex);
}

export function notifyTicketCompleted(ticket: Ticket) {
  if (!bot || adminChatIds.length === 0) return;

  clearEscalationTimer(ticket.id);
  ticketAssignment.delete(ticket.id);

  for (const chatId of adminChatIds) {
    void bot.sendMessage(chatId, [
      `TICKET COMPLETADO`,
      ``,
      `ID: \`${ticket.id}\``,
      `Documento: *${ticket.fileName}*`,
      `Usuario: ${ticket.userName}`,
      `Servicio: *${requestedAnalysisLabel(ticket.requestedAnalysis)}*`,
      `Completado: ${ticket.completedAt ? formatDate(ticket.completedAt) : formatDate(new Date().toISOString())}`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

export function notifyNewPayment(payment: Payment, user: User) {
  if (!bot || adminChatIds.length === 0) return;

  for (const chatId of adminChatIds) {
    void bot.sendMessage(chatId, [
      `NUEVO PAGO RECIBIDO`,
      ``,
      `ID: \`${payment.id}\``,
      `Usuario: *${user.name}*`,
      `Correo: ${user.email}`,
      `Servicio: *${paymentLabel(payment.planType)}*`,
      `Monto: *$${payment.amount.toFixed(2)}*`,
      `Enviado: ${formatDate(payment.createdAt)}`,
      ``,
      `Verifica el comprobante adjunto y valida o rechaza este pago.`,
    ].join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: paymentActionsKeyboard(payment.id),
    });

    void sendStoredFile(chatId, 'vouchers', payment.voucherPath, `comprobante-${payment.id}`, `Comprobante de pago - \`${payment.id}\``);
  }
}
