import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import { db } from './database';
import { env } from '../config/env';
import { sendPaymentApprovedEmail, sendPaymentRejectedEmail } from './email';
import type { Ticket, Payment, User } from '../../shared/types';
import type { Server as SocketServer } from 'socket.io';

let bot: TelegramBot | null = null;
let io: SocketServer | null = null;
let adminChatIds: string[] = [];
let roundRobinIndex = 0;
const escalationTimers: Map<string, NodeJS.Timeout> = new Map();
const ticketAssignment: Map<string, number> = new Map();
const escalationAttempts: Map<string, number> = new Map();
// Track admins waiting to provide rejection reason: chatId → paymentId
const pendingRejectionReason: Map<string, string> = new Map();

const ESCALATION_MINUTES = env.ESCALATION_TIMEOUT_MINUTES;

// ─── Helpers ────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':    return '🟡 Pendiente';
    case 'processing': return '🔵 En proceso';
    case 'completed':  return '✅ Completado';
    default:           return status;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d ${hrs % 24}h`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Build Ticket Card ─────────────────────────────────────
function buildTicketCard(ticket: Ticket): string {
  return [
    `┌─────────────────────────┐`,
    `│  🆔  \`${ticket.id}\``,
    `├─────────────────────────┤`,
    `│  📄  *${ticket.fileName}*`,
    `│  👤  ${ticket.userName}`,
    `│  📐  ${formatSize(ticket.fileSize)}`,
    `│  📌  ${statusLabel(ticket.status)}`,
    ticket.assignedTo ? `│  🛡️  Asignado a: *${ticket.assignedTo}*` : null,
    `│  🕐  ${formatDate(ticket.createdAt)}`,
    ticket.completedAt ? `│  ✅  ${formatDate(ticket.completedAt)}` : null,
    `└─────────────────────────┘`,
  ].filter(Boolean).join('\n');
}

// ─── Inline Keyboards ──────────────────────────────────────
function ticketActionsKeyboard(ticketId: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirmar recepción', callback_data: `confirm_${ticketId}` },
        { text: '📊 Ver estado', callback_data: `status_${ticketId}` },
      ],
      [
        { text: '🔄 Reasignar a otro admin', callback_data: `reassign_${ticketId}` },
      ],
    ],
  };
}

function reassignConfirmKeyboard(ticketId: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Sí, reasignar', callback_data: `doreassign_${ticketId}` },
        { text: '❌ Cancelar', callback_data: `cancelreassign_${ticketId}` },
      ],
    ],
  };
}

function ticketStatusKeyboard(ticketId: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirmar', callback_data: `confirm_${ticketId}` },
        { text: '🔙 Cerrar', callback_data: `close` },
      ],
    ],
  };
}

// ─── Init Bot ───────────────────────────────────────────────
export async function initTelegramBot(socketIo?: SocketServer) {
  if (socketIo) io = socketIo;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'TU_TOKEN_DEL_BOT') {
    console.log('⚠️  TELEGRAM_BOT_TOKEN no configurado — bot desactivado');
    return;
  }

  // Read admin chat IDs from DB (linked to user accounts)
  adminChatIds = await db.getAdminChatIds();

  if (adminChatIds.length === 0) {
    console.log('⚠️  No hay admins con telegramChatId — configura ADMIN_ACCOUNTS en .env');
  } else {
    console.log(`📱 Admins de Telegram vinculados: ${adminChatIds.length}`);
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Bot de Telegram iniciado (polling)');

  // ── /start ──
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    const isAdmin = adminChatIds.includes(chatId);

    bot!.sendMessage(chatId, [
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `   🎓 *AcademiX AI — Panel Bot*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `¡Hola! 👋 Bienvenido al sistema de`,
      `notificaciones de AcademiX AI.`,
      ``,
      `🔑 *Tu Chat ID:* \`${chatId}\``,
      isAdmin ? `✅ *Estado:* Administrador verificado` : `⚠️ *Estado:* No registrado como admin`,
      ``,
      !isAdmin ? `_Agrega tu ID en \`.env\` → \`TELEGRAM\\_ADMIN\\_CHAT\\_IDS\`_` : '',
      ``,
      `📋 *Comandos disponibles:*`,
      ``,
      `  /tickets  →  📋 Ver tickets pendientes`,
      `  /estado ID  →  📊 Estado de un ticket`,
      `  /confirmar ID  →  ✅ Confirmar ticket`,
      `  /ayuda  →  ❓ Ayuda y soporte`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].filter(s => s !== undefined).join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Ver tickets pendientes', callback_data: 'list_tickets' }],
          [{ text: '❓ Ayuda', callback_data: 'help' }],
        ],
      },
    });
  });

  // ── /ayuda ──
  bot.onText(/\/ayuda/, (msg) => {
    const chatId = msg.chat.id.toString();
    sendHelpMessage(chatId);
  });

  // ── /tickets ──
  bot.onText(/\/tickets/, async (msg) => {
    const chatId = msg.chat.id.toString();
    if (!adminChatIds.includes(chatId)) {
      bot!.sendMessage(chatId, '🚫 *Acceso denegado*\n\nNo tienes permisos de administrador.', { parse_mode: 'Markdown' });
      return;
    }
    await sendTicketList(chatId);
  });

  // ── /confirmar ID ──
  bot.onText(/\/confirmar\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (!adminChatIds.includes(chatId)) {
      bot!.sendMessage(chatId, '🚫 *Acceso denegado*', { parse_mode: 'Markdown' });
      return;
    }
    await handleConfirm(chatId, match![1].trim().toUpperCase());
  });

  // ── /estado ID ──
  bot.onText(/\/estado\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    await handleStatus(chatId, match![1].trim().toUpperCase());
  });

  // ── Callback Query Handler (Inline Buttons) ──
  bot.on('callback_query', async (query) => {
    if (!query.data || !query.message) return;
    const chatId = query.message.chat.id.toString();
    const data = query.data;

    // Acknowledge the button press immediately
    bot!.answerCallbackQuery(query.id);

    // ── Confirm ticket ──
    if (data.startsWith('confirm_')) {
      const ticketId = data.replace('confirm_', '');
      if (!adminChatIds.includes(chatId)) {
        bot!.sendMessage(chatId, '🚫 *Acceso denegado*', { parse_mode: 'Markdown' });
        return;
      }
      await handleConfirm(chatId, ticketId);
      return;
    }

    // ── Status check ──
    if (data.startsWith('status_')) {
      const ticketId = data.replace('status_', '');
      await handleStatus(chatId, ticketId);
      return;
    }

    // ── Reassign request → show confirmation ──
    if (data.startsWith('reassign_')) {
      const ticketId = data.replace('reassign_', '');
      if (!adminChatIds.includes(chatId)) {
        bot!.sendMessage(chatId, '🚫 *Acceso denegado*', { parse_mode: 'Markdown' });
        return;
      }
      const ticket = await db.getTicketById(ticketId);
      if (!ticket) {
        bot!.sendMessage(chatId, `❌ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
        return;
      }

      // Show confirmation prompt with buttons
      bot!.sendMessage(chatId, [
        `🔄 *¿Reasignar ticket?*`,
        ``,
        `🆔 \`${ticketId}\``,
        `📄 *${ticket.fileName}*`,
        ``,
        `El ticket será enviado al siguiente`,
        `administrador disponible.`,
        ``,
        `_¿Confirmas la reasignación?_`,
      ].join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: reassignConfirmKeyboard(ticketId),
      });
      return;
    }

    // ── Confirm reassignment ──
    if (data.startsWith('doreassign_')) {
      const ticketId = data.replace('doreassign_', '');
      if (!adminChatIds.includes(chatId)) return;
      await handleReassign(chatId, ticketId);
      return;
    }

    // ── Cancel reassignment ──
    if (data.startsWith('cancelreassign_')) {
      bot!.editMessageText('❎ Reasignación cancelada.', {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      return;
    }

    // ── List tickets ──
    if (data === 'list_tickets') {
      if (!adminChatIds.includes(chatId)) {
        bot!.sendMessage(chatId, '🚫 *Acceso denegado*', { parse_mode: 'Markdown' });
        return;
      }
      await sendTicketList(chatId);
      return;
    }

    // ── Help ──
    if (data === 'help') {
      sendHelpMessage(chatId);
      return;
    }

    // ── Approve Payment ──
    if (data.startsWith('approve_pay_')) {
      const paymentId = data.replace('approve_pay_', '');
      if (!adminChatIds.includes(chatId)) return;
      await handleApprovePayment(chatId, paymentId);
      return;
    }

    // ── Reject Payment ──
    if (data.startsWith('reject_pay_')) {
      const paymentId = data.replace('reject_pay_', '');
      if (!adminChatIds.includes(chatId)) return;
      pendingRejectionReason.set(chatId, paymentId);
      bot!.sendMessage(chatId, [
        `📝 *¿Cuál es el motivo del rechazo?*`,
        ``,
        `Escribe el motivo y se lo enviaremos al usuario por correo.`,
      ].join('\n'), { parse_mode: 'Markdown' });
      return;
    }

    // ── Close (delete message) ──
    if (data === 'close') {
      bot!.deleteMessage(chatId, query.message.message_id.toString()).catch(() => {});
      return;
    }
  });

  // ── Text message handler (for rejection reasons) ──
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id.toString();
    const paymentId = pendingRejectionReason.get(chatId);
    if (!paymentId) return;
    pendingRejectionReason.delete(chatId);
    await handleRejectPayment(chatId, paymentId, msg.text.trim());
  });
}

// ─── Action Handlers ────────────────────────────────────────
async function handleConfirm(chatId: string, ticketId: string) {
  if (!bot) return;
  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    bot.sendMessage(chatId, `❌ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }
  if (ticket.status === 'completed') {
    bot.sendMessage(chatId, [
      `ℹ️ *Ticket ya completado*`,
      ``,
      `🆔 \`${ticketId}\``,
      `📄 ${ticket.fileName}`,
      `✅ Completado: ${formatDate(ticket.completedAt!)}`,
    ].join('\n'), { parse_mode: 'Markdown' });
    return;
  }

  // Cancel escalation timer and clean up tracking
  const timer = escalationTimers.get(ticketId);
  if (timer) { clearTimeout(timer); escalationTimers.delete(ticketId); }
  ticketAssignment.delete(ticketId);
  escalationAttempts.delete(ticketId);

  // Look up the web admin account linked to this Telegram chatId
  const adminUser = await db.getAdminByTelegramChatId(chatId);
  const adminName = adminUser?.name || 'Admin';
  const adminUserId = adminUser?.id || chatId;

  // Mark ticket as 'processing' and assign to this admin's userId
  await db.assignTicket(ticketId, adminName, adminUserId);

  // Emit socket event so web dashboards update in real-time
  if (io) io.emit('ticket_updated', { ticketId, status: 'processing', assignedTo: adminName });

  bot.sendMessage(chatId, [
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  ✅ *TICKET CONFIRMADO*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    buildTicketCard(ticket),
    ``,
    `👤 *Asignado a:* ${adminName}`,
    ``,
    `📝 *Próximos pasos:*`,
    ``,
    `  1️⃣  Descarga el archivo adjunto`,
    `  2️⃣  Procésalo en Turnitin`,
    `  3️⃣  Genera los 2 PDFs de resultado`,
    `  4️⃣  Súbelos en tu Panel Admin web`,
    ``,
    `🌐 _Inicia sesión como \`${adminUser?.email || 'admin'}\`_`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

async function handleStatus(chatId: string, ticketId: string) {
  if (!bot) return;
  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    bot.sendMessage(chatId, `❌ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  const elapsed = timeAgo(ticket.createdAt);

  bot.sendMessage(chatId, [
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  📊 *ESTADO DEL TICKET*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    buildTicketCard(ticket),
    ``,
    `⏳ Tiempo transcurrido: *${elapsed}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: ticketStatusKeyboard(ticketId),
  });
}

async function handleReassign(chatId: string, ticketId: string) {
  if (!bot) return;
  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    bot.sendMessage(chatId, `❌ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  if (adminChatIds.length <= 1) {
    bot.sendMessage(chatId, [
      `⚠️ *No se puede reasignar*`,
      ``,
      `Solo hay un administrador registrado.`,
      `Agrega más IDs en \`.env\` para habilitar la reasignación.`,
    ].join('\n'), { parse_mode: 'Markdown' });
    return;
  }

  // Find the next admin that is NOT the current one
  const currentIndex = adminChatIds.indexOf(chatId);
  let nextIndex = (currentIndex + 1) % adminChatIds.length;
  if (adminChatIds[nextIndex] === chatId && adminChatIds.length > 1) {
    nextIndex = (nextIndex + 1) % adminChatIds.length;
  }
  const nextAdmin = adminChatIds[nextIndex];

  // Cancel existing escalation timer
  const existingTimer = escalationTimers.get(ticketId);
  if (existingTimer) { clearTimeout(existingTimer); escalationTimers.delete(ticketId); }

  // Unassign from current admin in DB
  await db.unassignTicket(ticketId);
  if (io) io.emit('ticket_updated', { ticketId, status: 'pending', assignedTo: null });

  // Notify the new admin
  sendTicketNotification(nextAdmin, ticket, false);

  // Start a new escalation timer for the newly assigned admin
  ticketAssignment.set(ticketId, nextIndex);
  escalationAttempts.set(ticketId, 0);
  startEscalationChain(ticketId, ticket, nextIndex);

  // Confirm to current admin
  bot.sendMessage(chatId, [
    `✅ *Ticket reasignado correctamente*`,
    ``,
    `🆔 \`${ticketId}\``,
    `📄 ${ticket.fileName}`,
    ``,
    `➡️ Enviado al administrador #${nextIndex + 1}`,
    `El ticket ya no está bajo tu responsabilidad.`,
    ``,
    `_Si no confirma en ${ESCALATION_MINUTES} min,_`,
    `_se reasignará automáticamente._`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

async function sendTicketList(chatId: string) {
  if (!bot) return;
  const allTickets = await db.getAllTickets();
  const pending = allTickets.filter(t => t.status !== 'completed');

  if (pending.length === 0) {
    bot.sendMessage(chatId, [
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  📋 *TICKETS PENDIENTES*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `  🎉 ¡No hay tickets pendientes!`,
      `  Todo está al día.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n'), { parse_mode: 'Markdown' });
    return;
  }

  // Send summary header
  bot.sendMessage(chatId, [
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  📋 *TICKETS PENDIENTES*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `  📊 Total: *${pending.length}* ticket${pending.length > 1 ? 's' : ''}`,
    `  🟡 Pendientes: *${pending.filter(t => t.status === 'pending').length}*`,
    `  🔵 En proceso: *${pending.filter(t => t.status === 'processing').length}*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n'), { parse_mode: 'Markdown' });

  // Send each ticket as individual card with action buttons
  for (const ticket of pending.slice(0, 10)) {
    const elapsed = timeAgo(ticket.createdAt);
    bot.sendMessage(chatId, [
      buildTicketCard(ticket),
      `  ⏳ ${elapsed}`,
    ].join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: ticketActionsKeyboard(ticket.id),
    });
  }

  if (pending.length > 10) {
    bot.sendMessage(chatId, `_... y ${pending.length - 10} ticket(s) más._`, { parse_mode: 'Markdown' });
  }
}

function sendHelpMessage(chatId: string) {
  if (!bot) return;
  bot.sendMessage(chatId, [
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `  ❓ *AYUDA — AcademiX AI*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📖 *Flujo de trabajo:*`,
    ``,
    `  1️⃣  Un cliente sube un documento`,
    `  2️⃣  Recibes la notificación aquí`,
    `  3️⃣  Confirmas con el botón ✅`,
    `  4️⃣  Descargas el archivo adjunto`,
    `  5️⃣  Procesas en Turnitin`,
    `  6️⃣  Subes resultados en el Panel Web`,
    ``,
    `⚡ *Acciones rápidas:*`,
    ``,
    `  • Usa los *botones* en cada notificación`,
    `  • /tickets para ver la lista completa`,
    `  • Reasigna tickets con un botón`,
    ``,
    `⏱ *Escalación automática:*`,
    `  Si no confirmas en *${ESCALATION_MINUTES} min*,`,
    `  el ticket se reasigna automáticamente.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

// ─── Notifications ──────────────────────────────────────────

export function notifyNewTicket(ticket: Ticket) {
  if (!bot || adminChatIds.length === 0) return;

  const adminIndex = roundRobinIndex % adminChatIds.length;
  const primaryAdmin = adminChatIds[adminIndex];
  roundRobinIndex++;

  // Track this assignment
  ticketAssignment.set(ticket.id, adminIndex);
  escalationAttempts.set(ticket.id, 0);

  sendTicketNotification(primaryAdmin, ticket, true);

  // Start escalation chain (will auto-escalate through all admins)
  startEscalationChain(ticket.id, ticket, adminIndex);
}

function startEscalationChain(ticketId: string, ticket: Ticket, currentAdminIndex: number) {
  if (!bot || adminChatIds.length <= 1) return;

  const timer = setTimeout(async () => {
    // Check if ticket was already confirmed/completed
    const freshTicket = await db.getTicketById(ticketId);
    if (!freshTicket || freshTicket.status !== 'pending') {
      escalationTimers.delete(ticketId);
      ticketAssignment.delete(ticketId);
      escalationAttempts.delete(ticketId);
      return;
    }

    const attempts = (escalationAttempts.get(ticketId) || 0) + 1;
    escalationAttempts.set(ticketId, attempts);

    // If we've already tried all admins, send alert to ALL
    if (attempts >= adminChatIds.length) {
      escalationTimers.delete(ticketId);
      ticketAssignment.delete(ticketId);
      escalationAttempts.delete(ticketId);
      for (const chatId of adminChatIds) {
        bot!.sendMessage(chatId, [
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `  🚨 *ALERTA CRÍTICA*`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ``,
          `🆔 \`${ticketId}\``,
          `📄 *${ticket.fileName}*`,
          `👤 ${ticket.userName}`,
          ``,
          `⚠️ *Ningún administrador confirmó*`,
          `*este ticket después de ${attempts} intentos.*`,
          ``,
          `Por favor, alguien confirme URGENTE.`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ].join('\n'), {
          parse_mode: 'Markdown',
          reply_markup: ticketActionsKeyboard(ticketId),
        });
      }
      return;
    }

    const previousAdmin = adminChatIds[currentAdminIndex];
    const nextIndex = (currentAdminIndex + 1) % adminChatIds.length;
    const nextAdmin = adminChatIds[nextIndex];

    // Notify previous admin it was escalated
    bot!.sendMessage(previousAdmin, [
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  ⏰ *TICKET ESCALADO*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🆔 \`${ticketId}\``,
      `📄 *${ticket.fileName}*`,
      ``,
      `⚠️ No confirmaste en ${ESCALATION_MINUTES} min.`,
      `➡️ Reasignado al admin #${nextIndex + 1}.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n'), { parse_mode: 'Markdown' });

    // Send to the next admin
    sendTicketNotification(nextAdmin, ticket, false);

    // Update assignment tracking
    ticketAssignment.set(ticketId, nextIndex);

    // Start timer for the NEXT admin (chain continues)
    escalationTimers.delete(ticketId);
    startEscalationChain(ticketId, ticket, nextIndex);

  }, ESCALATION_MINUTES * 60 * 1000);

  escalationTimers.set(ticketId, timer);
}

function sendTicketNotification(chatId: string, ticket: Ticket, isPrimary: boolean) {
  if (!bot) return;

  const header = isPrimary
    ? [
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `  🆕 *NUEVO TICKET ASIGNADO*`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ]
    : [
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `  🔄 *TICKET REASIGNADO*`,
        `  ⚠️ *Requiere atención urgente*`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ];

  const footer = isPrimary
    ? [
        `⏱ Tienes *${ESCALATION_MINUTES} minutos* para confirmar`,
        `o el ticket será escalado automáticamente.`,
      ]
    : [
        `⚠️ *Ticket escalado por falta de respuesta.*`,
        `Por favor confirma lo antes posible.`,
      ];

  bot.sendMessage(chatId, [
    ...header,
    ``,
    buildTicketCard(ticket),
    ``,
    ...footer,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: ticketActionsKeyboard(ticket.id),
  });

  // Send the attached file
  if (fs.existsSync(ticket.filePath)) {
    bot.sendDocument(chatId, ticket.filePath, {
      caption: `📎 Documento original — \`${ticket.id}\``,
      parse_mode: 'Markdown',
    });
  }
}

export function notifyTicketCompleted(ticket: Ticket) {
  if (!bot) return;
  for (const chatId of adminChatIds) {
    bot.sendMessage(chatId, [
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  ✅ *TICKET COMPLETADO*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      buildTicketCard(ticket),
      ``,
      `🎉 Los resultados han sido enviados`,
      `al cliente exitosamente.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

// ═══════════════════════════════════════════════════════════
// ── PAYMENT NOTIFICATIONS & HANDLERS ─────────────────────
// ═══════════════════════════════════════════════════════════

function paymentActionsKeyboard(paymentId: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Validar pago', callback_data: `approve_pay_${paymentId}` },
        { text: '❌ Rechazar pago', callback_data: `reject_pay_${paymentId}` },
      ],
    ],
  };
}

export function notifyNewPayment(payment: Payment, user: User) {
  if (!bot || adminChatIds.length === 0) return;

  const price = env.SUBSCRIPTION_PRICE;

  for (const chatId of adminChatIds) {
    bot.sendMessage(chatId, [
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  💳 *NUEVO PAGO RECIBIDO*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🆔 \`${payment.id}\``,
      `👤 *${user.name}*`,
      `📧 ${user.email}`,
      `💰 Monto: *$${price}*`,
      `📅 Enviado: ${formatDate(payment.createdAt)}`,
      ``,
      `⚠️ *Verifica el comprobante adjunto*`,
      `y valida o rechaza este pago.`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: paymentActionsKeyboard(payment.id),
    });

    // Send the voucher image
    if (fs.existsSync(payment.voucherPath)) {
      bot.sendDocument(chatId, payment.voucherPath, {
        caption: `📎 Comprobante de pago — \`${payment.id}\``,
        parse_mode: 'Markdown',
      });
    }
  }
}

async function handleApprovePayment(chatId: string, paymentId: string) {
  if (!bot) return;

  const adminUser = await db.getAdminByTelegramChatId(chatId);
  const adminName = adminUser?.name || 'Admin';

  const payment = await db.getPaymentById(paymentId);
  if (!payment) {
    bot.sendMessage(chatId, `❌ Pago \`${paymentId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }
  if (payment.status !== 'pending') {
    bot.sendMessage(chatId, `ℹ️ Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`, { parse_mode: 'Markdown' });
    return;
  }

  // Approve payment in DB
  const approved = await db.approvePayment(paymentId, adminName);
  if (!approved) {
    bot.sendMessage(chatId, `❌ Error al aprobar el pago.`, { parse_mode: 'Markdown' });
    return;
  }

  // Create/extend subscription
  const days = env.SUBSCRIPTION_DAYS;
  const subscription = await db.createOrExtendSubscription(payment.userId, days);

  // Send email to user
  await sendPaymentApprovedEmail(payment.userEmail, payment.userName, subscription.expiresAt);

  // Notify ALL admins
  const expirationDate = new Date(subscription.expiresAt).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  for (const id of adminChatIds) {
    bot.sendMessage(id, [
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  ✅ *PAGO VALIDADO*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🆔 \`${paymentId}\``,
      `👤 ${payment.userName}`,
      `📧 ${payment.userEmail}`,
      `💰 $${payment.amount}`,
      ``,
      `✅ *Validado por:* ${adminName}`,
      `📅 Suscripción activa hasta: *${expirationDate}*`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

async function handleRejectPayment(chatId: string, paymentId: string, reason: string) {
  if (!bot) return;

  const adminUser = await db.getAdminByTelegramChatId(chatId);
  const adminName = adminUser?.name || 'Admin';

  const payment = await db.getPaymentById(paymentId);
  if (!payment) {
    bot.sendMessage(chatId, `❌ Pago \`${paymentId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }
  if (payment.status !== 'pending') {
    bot.sendMessage(chatId, `ℹ️ Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`, { parse_mode: 'Markdown' });
    return;
  }

  // Reject payment in DB
  const rejected = await db.rejectPayment(paymentId, adminName, reason);
  if (!rejected) {
    bot.sendMessage(chatId, `❌ Error al rechazar el pago.`, { parse_mode: 'Markdown' });
    return;
  }

  // Send email to user
  await sendPaymentRejectedEmail(payment.userEmail, payment.userName, reason);

  // Notify ALL admins
  for (const id of adminChatIds) {
    bot.sendMessage(id, [
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  ❌ *PAGO RECHAZADO*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🆔 \`${paymentId}\``,
      `👤 ${payment.userName}`,
      `📧 ${payment.userEmail}`,
      ``,
      `❌ *Rechazado por:* ${adminName}`,
      `📝 *Motivo:* ${reason}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

