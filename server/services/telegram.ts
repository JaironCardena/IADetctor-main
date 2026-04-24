import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import { db } from './database';
import { env } from '../config/env';
import { approvePayment, rejectPayment } from './payment';
import type { Ticket, Payment, User } from '../../shared/types';
import type { Server as SocketServer } from 'socket.io';

let bot: TelegramBot | null = null;
let io: SocketServer | null = null;
let adminChatIds: string[] = [];
let roundRobinIndex = 0;
const escalationTimers: Map<string, NodeJS.Timeout> = new Map();
const ticketAssignment: Map<string, number> = new Map();
const escalationAttempts: Map<string, number> = new Map();
// Track admins waiting to provide rejection reason: chatId â†’ paymentId
const pendingRejectionReason: Map<string, string> = new Map();

const ESCALATION_MINUTES = env.ESCALATION_TIMEOUT_MINUTES;

const CP1252_BYTES: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86,
  '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

const MOJIBAKE_MARKERS = /[ÂÃâðÅ]/;

function mojibakeScore(text: string): number {
  return (text.match(/[ÂÃâðÅ]|�/g) || []).length;
}

function decodeUtf8Mojibake(text: string): string {
  if (!MOJIBAKE_MARKERS.test(text)) return text;

  const bytes: number[] = [];
  for (const char of text) {
    const mapped = CP1252_BYTES[char];
    const code = char.charCodeAt(0);

    if (mapped !== undefined) {
      bytes.push(mapped);
    } else if (code <= 0xff) {
      bytes.push(code);
    } else {
      return text;
    }
  }

  const decoded = Buffer.from(bytes).toString('utf8');
  if (decoded.includes('�')) return text;
  return mojibakeScore(decoded) <= mojibakeScore(text) ? decoded : text;
}

function sanitizeTelegramPayload<T>(payload: T): T {
  if (typeof payload === 'string') return decodeUtf8Mojibake(payload) as T;
  if (Array.isArray(payload)) return payload.map(item => sanitizeTelegramPayload(item)) as T;
  if (payload && typeof payload === 'object') {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, sanitizeTelegramPayload(value)])
    ) as T;
  }
  return payload;
}

function installTelegramTextSanitizer(botInstance: TelegramBot) {
  const originalSendMessage = botInstance.sendMessage.bind(botInstance);
  const originalEditMessageText = botInstance.editMessageText.bind(botInstance);
  const originalSendDocument = botInstance.sendDocument.bind(botInstance);

  (botInstance as any).sendMessage = (chatId: TelegramBot.ChatId, text: string, options?: TelegramBot.SendMessageOptions) =>
    originalSendMessage(chatId, sanitizeTelegramPayload(text), sanitizeTelegramPayload(options));

  (botInstance as any).editMessageText = (text: string, options?: TelegramBot.EditMessageTextOptions) =>
    originalEditMessageText(sanitizeTelegramPayload(text), sanitizeTelegramPayload(options));

  (botInstance as any).sendDocument = (
    chatId: TelegramBot.ChatId,
    doc: string | Buffer,
    options?: TelegramBot.SendDocumentOptions,
    fileOptions?: TelegramBot.FileOptions,
  ) => originalSendDocument(chatId, doc, sanitizeTelegramPayload(options), fileOptions);
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':    return 'ðŸŸ¡ Pendiente';
    case 'processing': return 'ðŸ”µ En proceso';
    case 'completed':  return 'âœ… Completado';
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

// â”€â”€â”€ Build Ticket Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildTicketCard(ticket: Ticket): string {
  return [
    `â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”`,
    `â”‚  ðŸ†”  \`${ticket.id}\``,
    `â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤`,
    `â”‚  ðŸ“„  *${ticket.fileName}*`,
    `â”‚  ðŸ‘¤  ${ticket.userName}`,
    `â”‚  ðŸ“  ${formatSize(ticket.fileSize)}`,
    ticket.requestedAnalysis === 'plagiarism' ? `â”‚  âš ï¸  *SOLO REPORTE DE PLAGIO*` : `â”‚  âœ¨  *PLAGIO + IA*`,
    `â”‚  ðŸ“Œ  ${statusLabel(ticket.status)}`,
    ticket.assignedTo ? `â”‚  ðŸ›¡ï¸  Asignado a: *${ticket.assignedTo}*` : null,
    `â”‚  ðŸ•  ${formatDate(ticket.createdAt)}`,
    ticket.completedAt ? `â”‚  âœ…  ${formatDate(ticket.completedAt)}` : null,
    `â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜`,
  ].filter(Boolean).join('\n');
}

// â”€â”€â”€ Inline Keyboards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        { text: 'âœ… Confirmar', callback_data: `confirm_${ticketId}` },
        { text: 'ðŸ”™ Cerrar', callback_data: `close` },
      ],
    ],
  };
}

// â”€â”€â”€ Init Bot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function initTelegramBot(socketIo?: SocketServer) {
  if (socketIo) io = socketIo;
  if (bot) {
    console.log('Telegram bot ya iniciado; se reutiliza la instancia existente.');
    return;
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'TU_TOKEN_DEL_BOT') {
    console.log('âš ï¸  TELEGRAM_BOT_TOKEN no configurado â€” bot desactivado');
    return;
  }

  // Read admin chat IDs from DB (linked to user accounts)
  adminChatIds = await db.getAdminChatIds();

  if (adminChatIds.length === 0) {
    console.log('âš ï¸  No hay admins con telegramChatId â€” configura ADMIN_ACCOUNTS en .env');
  } else {
    console.log(`ðŸ“± Admins de Telegram vinculados: ${adminChatIds.length}`);
  }

  bot = new TelegramBot(token, { polling: true });
  installTelegramTextSanitizer(bot);
  bot.on('polling_error', (error: Error & { code?: string; response?: { statusCode?: number; body?: { error_code?: number; description?: string } } }) => {
    const statusCode = error.response?.statusCode || error.response?.body?.error_code;
    const description = error.response?.body?.description || error.message;
    if (statusCode === 409 || description?.includes('terminated by other getUpdates request')) {
      console.error('Telegram bot: ya hay otra instancia usando polling. Cierra el otro servidor/bot para evitar conflictos.');
      return;
    }
    console.error('Telegram bot polling error:', description);
  });
  console.log('ðŸ¤– Bot de Telegram iniciado (polling)');

  // â”€â”€ /start â”€â”€
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id.toString();
    const isAdmin = adminChatIds.includes(chatId);

    bot!.sendMessage(chatId, [
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `   ðŸŽ“ *AcademiX AI â€” Panel Bot*`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      `Â¡Hola! ðŸ‘‹ Bienvenido al sistema de`,
      `notificaciones de AcademiX AI.`,
      ``,
      `ðŸ”‘ *Tu Chat ID:* \`${chatId}\``,
      isAdmin ? `âœ… *Estado:* Administrador verificado` : `âš ï¸ *Estado:* No registrado como admin`,
      ``,
      !isAdmin ? `_Vincula tu cuenta en \`.env\` usando \`ADMIN\\_ACCOUNTS\`_` : '',
      ``,
      `ðŸ“‹ *Comandos disponibles:*`,
      ``,
      `  /tickets  â†’  ðŸ“‹ Ver tickets pendientes`,
      `  /estado ID  â†’  ðŸ“Š Estado de un ticket`,
      `  /confirmar ID  â†’  âœ… Confirmar ticket`,
      `  /ayuda  â†’  â“ Ayuda y soporte`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ].filter(s => s !== undefined).join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ðŸ“‹ Ver tickets pendientes', callback_data: 'list_tickets' }],
          [{ text: 'â“ Ayuda', callback_data: 'help' }],
        ],
      },
    });
  });

  // â”€â”€ /ayuda â”€â”€
  bot.onText(/\/ayuda/, (msg) => {
    const chatId = msg.chat.id.toString();
    sendHelpMessage(chatId);
  });

  // â”€â”€ /tickets â”€â”€
  bot.onText(/\/tickets/, async (msg) => {
    const chatId = msg.chat.id.toString();
    if (!adminChatIds.includes(chatId)) {
      bot!.sendMessage(chatId, 'ðŸš« *Acceso denegado*\n\nNo tienes permisos de administrador.', { parse_mode: 'Markdown' });
      return;
    }
    await sendTicketList(chatId);
  });

  // â”€â”€ /confirmar ID â”€â”€
  bot.onText(/\/confirmar\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (!adminChatIds.includes(chatId)) {
      bot!.sendMessage(chatId, 'ðŸš« *Acceso denegado*', { parse_mode: 'Markdown' });
      return;
    }
    await handleConfirm(chatId, match![1].trim().toUpperCase());
  });

  // â”€â”€ /estado ID â”€â”€
  bot.onText(/\/estado\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    await handleStatus(chatId, match![1].trim().toUpperCase());
  });

  // â”€â”€ Callback Query Handler (Inline Buttons) â”€â”€
  bot.on('callback_query', async (query) => {
    if (!query.data || !query.message) return;
    const chatId = query.message.chat.id.toString();
    const data = query.data;

    // Acknowledge the button press immediately
    bot!.answerCallbackQuery(query.id).catch(() => {});

    // â”€â”€ Confirm ticket â”€â”€
    if (data.startsWith('confirm_')) {
      const ticketId = data.replace('confirm_', '');
      if (!adminChatIds.includes(chatId)) {
        bot!.sendMessage(chatId, 'ðŸš« *Acceso denegado*', { parse_mode: 'Markdown' });
        return;
      }
      await handleConfirm(chatId, ticketId);
      return;
    }

    // â”€â”€ Status check â”€â”€
    if (data.startsWith('status_')) {
      const ticketId = data.replace('status_', '');
      await handleStatus(chatId, ticketId);
      return;
    }

    // â”€â”€ Reassign request â†’ show confirmation â”€â”€
    if (data.startsWith('reassign_')) {
      const ticketId = data.replace('reassign_', '');
      if (!adminChatIds.includes(chatId)) {
        bot!.sendMessage(chatId, 'ðŸš« *Acceso denegado*', { parse_mode: 'Markdown' });
        return;
      }
      const ticket = await db.getTicketById(ticketId);
      if (!ticket) {
        bot!.sendMessage(chatId, `âŒ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
        return;
      }

      const text = [
        `🔄 *¿Reasignar ticket?*`,
        ``,
        `ID \`${ticketId}\``,
        `📄 *${ticket.fileName}*`,
        ``,
        `El ticket será enviado al siguiente`,
        `administrador disponible.`,
        ``,
        `_¿Confirmas la reasignación?_`,
      ].join('\n');
      const options = { parse_mode: 'Markdown' as const, reply_markup: reassignConfirmKeyboard(ticketId) };
      await bot!.editMessageText(text, {
        ...options,
        chat_id: chatId,
        message_id: query.message.message_id,
      }).catch(() => bot!.sendMessage(chatId, text, options));
      return;
    }

    // â”€â”€ Confirm reassignment â”€â”€
    if (data.startsWith('doreassign_')) {
      const ticketId = data.replace('doreassign_', '');
      if (!adminChatIds.includes(chatId)) return;
      await handleReassign(chatId, ticketId, query.message.message_id);
      return;
    }

    // â”€â”€ Cancel reassignment â”€â”€
    if (data.startsWith('cancelreassign_')) {
      bot!.editMessageText('❌ Reasignación cancelada.', {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      return;
    }

    // â”€â”€ List tickets â”€â”€
    if (data === 'list_tickets') {
      if (!adminChatIds.includes(chatId)) {
        bot!.sendMessage(chatId, 'ðŸš« *Acceso denegado*', { parse_mode: 'Markdown' });
        return;
      }
      await sendTicketList(chatId);
      return;
    }

    // â”€â”€ Help â”€â”€
    if (data === 'help') {
      sendHelpMessage(chatId);
      return;
    }

    // â”€â”€ Approve Payment â”€â”€
    if (data.startsWith('approve_pay_')) {
      const paymentId = data.replace('approve_pay_', '');
      if (!adminChatIds.includes(chatId)) return;
      await handleApprovePayment(chatId, paymentId, query.message.message_id);
      return;
    }

    // â”€â”€ Reject Payment â”€â”€
    if (data.startsWith('reject_pay_')) {
      const paymentId = data.replace('reject_pay_', '');
      if (!adminChatIds.includes(chatId)) return;
      pendingRejectionReason.set(chatId, `${paymentId}|${query.message.message_id}`);
      bot!.sendMessage(chatId, [
        `ðŸ“ *Â¿CuÃ¡l es el motivo del rechazo?*`,
        ``,
        `Escribe el motivo y se lo enviaremos al usuario por correo.`,
      ].join('\n'), { parse_mode: 'Markdown' });
      return;
    }

    // â”€â”€ Close (delete message) â”€â”€
    if (data === 'close') {
      bot!.deleteMessage(chatId, query.message.message_id.toString()).catch(() => {});
      return;
    }
  });

  // â”€â”€ Text message handler (for rejection reasons) â”€â”€
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id.toString();
    const pendingData = pendingRejectionReason.get(chatId);
    if (!pendingData) return;
    pendingRejectionReason.delete(chatId);
    
    const [paymentId, messageId] = pendingData.split('|');
    await handleRejectPayment(chatId, paymentId, msg.text.trim(), parseInt(messageId, 10));
  });
}

// â”€â”€â”€ Action Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function handleConfirm(chatId: string, ticketId: string) {
  if (!bot) return;
  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    bot.sendMessage(chatId, `âŒ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }
  if (ticket.status === 'completed') {
    bot.sendMessage(chatId, [
      `â„¹ï¸ *Ticket ya completado*`,
      ``,
      `ðŸ†” \`${ticketId}\``,
      `ðŸ“„ ${ticket.fileName}`,
      `âœ… Completado: ${formatDate(ticket.completedAt!)}`,
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
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    `  âœ… *TICKET CONFIRMADO*`,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ``,
    buildTicketCard(ticket),
    ``,
    `ðŸ‘¤ *Asignado a:* ${adminName}`,
    ``,
    `ðŸ“ *PrÃ³ximos pasos:*`,
    ``,
    `  1ï¸âƒ£  Descarga el archivo adjunto`,
    `  2ï¸âƒ£  ProcÃ©salo en Turnitin`,
    `  3ï¸âƒ£  Genera los 2 PDFs de resultado`,
    `  4ï¸âƒ£  SÃºbelos en tu Panel Admin web`,
    ``,
    `ðŸŒ _Inicia sesiÃ³n como \`${adminUser?.email || 'admin'}\`_`,
    ``,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

async function handleStatus(chatId: string, ticketId: string) {
  if (!bot) return;
  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    bot.sendMessage(chatId, `âŒ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  const elapsed = timeAgo(ticket.createdAt);

  bot.sendMessage(chatId, [
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    `  ðŸ“Š *ESTADO DEL TICKET*`,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ``,
    buildTicketCard(ticket),
    ``,
    `â³ Tiempo transcurrido: *${elapsed}*`,
    ``,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
  ].join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: ticketStatusKeyboard(ticketId),
  });
}

async function handleReassign(chatId: string, ticketId: string, messageId?: number) {
  if (!bot) return;
  const ticket = await db.getTicketById(ticketId);
  if (!ticket) {
    bot.sendMessage(chatId, `âŒ Ticket \`${ticketId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }

  if (adminChatIds.length <= 1) {
    bot.sendMessage(chatId, [
      `⚠️ *No se puede reasignar*`,
      ``,
      `Solo hay un administrador registrado.`,
      `Agrega mas administradores en \`.env\` con \`ADMIN_ACCOUNTS\` para habilitar la reasignación.`,
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
  const text = [
    `✅ *Ticket reasignado correctamente*`,
    ``,
    `ID \`${ticketId}\``,
    `📄 ${ticket.fileName}`,
    ``,
    `➡️ Enviado al administrador #${nextIndex + 1}`,
    `El ticket ya no está bajo tu responsabilidad.`,
    ``,
    `_Si no confirma en ${ESCALATION_MINUTES} min,_`,
    `_se reasignará automáticamente._`,
  ].join('\n');
  const options = { parse_mode: 'Markdown' as const };
  if (messageId) {
    await bot.editMessageText(text, { ...options, chat_id: chatId, message_id: messageId }).catch(() => bot.sendMessage(chatId, text, options));
  } else {
    bot.sendMessage(chatId, text, options);
  }
}

async function sendTicketList(chatId: string) {
  if (!bot) return;
  const allTickets = await db.getAllTickets();
  const pending = allTickets.filter(t => t.status !== 'completed');

  if (pending.length === 0) {
    bot.sendMessage(chatId, [
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `  ðŸ“‹ *TICKETS PENDIENTES*`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      `  ðŸŽ‰ Â¡No hay tickets pendientes!`,
      `  Todo estÃ¡ al dÃ­a.`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ].join('\n'), { parse_mode: 'Markdown' });
    return;
  }

  // Send summary header
  bot.sendMessage(chatId, [
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    `  ðŸ“‹ *TICKETS PENDIENTES*`,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ``,
    `  ðŸ“Š Total: *${pending.length}* ticket${pending.length > 1 ? 's' : ''}`,
    `  ðŸŸ¡ Pendientes: *${pending.filter(t => t.status === 'pending').length}*`,
    `  ðŸ”µ En proceso: *${pending.filter(t => t.status === 'processing').length}*`,
    ``,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
  ].join('\n'), { parse_mode: 'Markdown' });

  // Send each ticket as individual card with action buttons
  for (const ticket of pending.slice(0, 10)) {
    const elapsed = timeAgo(ticket.createdAt);
    bot.sendMessage(chatId, [
      buildTicketCard(ticket),
      `  â³ ${elapsed}`,
    ].join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: ticketActionsKeyboard(ticket.id),
    });
  }

  if (pending.length > 10) {
    bot.sendMessage(chatId, `_... y ${pending.length - 10} ticket(s) mÃ¡s._`, { parse_mode: 'Markdown' });
  }
}

function sendHelpMessage(chatId: string) {
  if (!bot) return;
  bot.sendMessage(chatId, [
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    `  â“ *AYUDA â€” AcademiX AI*`,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ``,
    `ðŸ“– *Flujo de trabajo:*`,
    ``,
    `  1ï¸âƒ£  Un cliente sube un documento`,
    `  2ï¸âƒ£  Recibes la notificaciÃ³n aquÃ­`,
    `  3ï¸âƒ£  Confirmas con el botÃ³n âœ…`,
    `  4ï¸âƒ£  Descargas el archivo adjunto`,
    `  5ï¸âƒ£  Procesas en Turnitin`,
    `  6ï¸âƒ£  Subes resultados en el Panel Web`,
    ``,
    `âš¡ *Acciones rÃ¡pidas:*`,
    ``,
    `  â€¢ Usa los *botones* en cada notificaciÃ³n`,
    `  â€¢ /tickets para ver la lista completa`,
    `  â€¢ Reasigna tickets con un botÃ³n`,
    ``,
    `â± *EscalaciÃ³n automÃ¡tica:*`,
    `  Si no confirmas en *${ESCALATION_MINUTES} min*,`,
    `  el ticket se reasigna automÃ¡ticamente.`,
    ``,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
  ].join('\n'), { parse_mode: 'Markdown' });
}

// â”€â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
          `  ðŸš¨ *ALERTA CRÃTICA*`,
          `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
          ``,
          `ðŸ†” \`${ticketId}\``,
          `ðŸ“„ *${ticket.fileName}*`,
          `ðŸ‘¤ ${ticket.userName}`,
          ``,
          `âš ï¸ *NingÃºn administrador confirmÃ³*`,
          `*este ticket despuÃ©s de ${attempts} intentos.*`,
          ``,
          `Por favor, alguien confirme URGENTE.`,
          ``,
          `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
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
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `  â° *TICKET ESCALADO*`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      `ðŸ†” \`${ticketId}\``,
      `ðŸ“„ *${ticket.fileName}*`,
      ``,
      `âš ï¸ No confirmaste en ${ESCALATION_MINUTES} min.`,
      `âž¡ï¸ Reasignado al admin #${nextIndex + 1}.`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
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
        `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
        `  ðŸ†• *NUEVO TICKET ASIGNADO*`,
        `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ]
    : [
        `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
        `  ðŸ”„ *TICKET REASIGNADO*`,
        `  âš ï¸ *Requiere atenciÃ³n urgente*`,
        `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ];

  const footer = isPrimary
    ? [
        `â± Tienes *${ESCALATION_MINUTES} minutos* para confirmar`,
        `o el ticket serÃ¡ escalado automÃ¡ticamente.`,
      ]
    : [
        `âš ï¸ *Ticket escalado por falta de respuesta.*`,
        `Por favor confirma lo antes posible.`,
      ];

  bot.sendMessage(chatId, [
    ...header,
    ``,
    buildTicketCard(ticket),
    ``,
    ...footer,
    ``,
    `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
  ].join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: ticketActionsKeyboard(ticket.id),
  });

  // Send the attached file
  if (fs.existsSync(ticket.filePath)) {
    bot.sendDocument(chatId, ticket.filePath, {
      caption: `ðŸ“Ž Documento original â€” \`${ticket.id}\``,
      parse_mode: 'Markdown',
    }).catch((error) => {
      console.error(`Error enviando documento de ticket ${ticket.id} a ${chatId}:`, error);
    });
  }
}

export function notifyTicketCompleted(ticket: Ticket) {
  if (!bot) return;
  for (const chatId of adminChatIds) {
    bot.sendMessage(chatId, [
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `  âœ… *TICKET COMPLETADO*`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      buildTicketCard(ticket),
      ``,
      `ðŸŽ‰ Los resultados han sido enviados`,
      `al cliente exitosamente.`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â”€â”€ PAYMENT NOTIFICATIONS & HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function paymentActionsKeyboard(paymentId: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'âœ… Validar pago', callback_data: `approve_pay_${paymentId}` },
        { text: 'âŒ Rechazar pago', callback_data: `reject_pay_${paymentId}` },
      ],
    ],
  };
}

export function notifyNewPayment(payment: Payment, user: User) {
  if (!bot || adminChatIds.length === 0) return;

  for (const chatId of adminChatIds) {
    bot.sendMessage(chatId, [
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `  ðŸ’³ *NUEVO PAGO RECIBIDO*`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      `ðŸ†” \`${payment.id}\``,
      `ðŸ‘¤ *${user.name}*`,
      `ðŸ“§ ${user.email}`,
      `ðŸ“¦ Plan Solicitado: *${payment.planType.toUpperCase()}*`,
      `ðŸ’° Monto: *$${payment.amount}*`,
      `ðŸ“… Enviado: ${formatDate(payment.createdAt)}`,
      ``,
      `âš ï¸ *Verifica el comprobante adjunto*`,
      `y valida o rechaza este pago.`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ].join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: paymentActionsKeyboard(payment.id),
    });

    // Send the voucher image
    if (fs.existsSync(payment.voucherPath)) {
      bot.sendDocument(chatId, payment.voucherPath, {
        caption: `ðŸ“Ž Comprobante de pago â€” \`${payment.id}\``,
        parse_mode: 'Markdown',
      }).catch((error) => {
        console.error(`Error enviando comprobante ${payment.id} a ${chatId}:`, error);
      });
    }
  }
}

async function handleApprovePayment(chatId: string, paymentId: string, messageId?: number) {
  if (!bot) return;

  const adminUser = await db.getAdminByTelegramChatId(chatId);
  const adminName = adminUser?.name || 'Admin';

  const payment = await db.getPaymentById(paymentId);
  if (!payment) {
    bot.sendMessage(chatId, `âŒ Pago \`${paymentId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }
  if (payment.status !== 'pending') {
    if (messageId) {
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
    }
    bot.sendMessage(chatId, `â„¹ï¸ Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`, { parse_mode: 'Markdown' });
    return;
  }

  const result = await approvePayment(paymentId, adminName, io);
  if (result.ok === false) {
    bot.sendMessage(chatId, `âŒ ${result.error}`, { parse_mode: 'Markdown' });
    return;
  }

  // Remove buttons from the message that triggered this
  if (messageId) {
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
  }

  // Notify ALL admins
  const subscription = result.subscription;
  const expirationDate = new Date(subscription.expiresAt).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  for (const id of adminChatIds) {
    bot.sendMessage(id, [
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `  âœ… *PAGO VALIDADO*`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      `ðŸ†” \`${paymentId}\``,
      `ðŸ‘¤ ${payment.userName}`,
      `ðŸ“§ ${payment.userEmail}`,
      `ðŸ’° $${payment.amount}`,
      ``,
      `âœ… *Validado por:* ${adminName}`,
      `ðŸ“… SuscripciÃ³n activa hasta: *${expirationDate}*`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}

async function handleRejectPayment(chatId: string, paymentId: string, reason: string, messageId?: number) {
  if (!bot) return;

  const adminUser = await db.getAdminByTelegramChatId(chatId);
  const adminName = adminUser?.name || 'Admin';

  const payment = await db.getPaymentById(paymentId);
  if (!payment) {
    bot.sendMessage(chatId, `âŒ Pago \`${paymentId}\` no encontrado.`, { parse_mode: 'Markdown' });
    return;
  }
  if (payment.status !== 'pending') {
    if (messageId) {
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
    }
    bot.sendMessage(chatId, `â„¹ï¸ Este pago ya fue ${payment.status === 'approved' ? 'aprobado' : 'rechazado'}.`, { parse_mode: 'Markdown' });
    return;
  }

  const result = await rejectPayment(paymentId, adminName, reason, io);
  if (result.ok === false) {
    bot.sendMessage(chatId, `âŒ ${result.error}`, { parse_mode: 'Markdown' });
    return;
  }

  // Remove buttons from the message
  if (messageId) {
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => {});
  }

  // Notify ALL admins
  for (const id of adminChatIds) {
    bot.sendMessage(id, [
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      `  âŒ *PAGO RECHAZADO*`,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
      ``,
      `ðŸ†” \`${paymentId}\``,
      `ðŸ‘¤ ${payment.userName}`,
      `ðŸ“§ ${payment.userEmail}`,
      ``,
      `âŒ *Rechazado por:* ${adminName}`,
      `ðŸ“ *Motivo:* ${reason}`,
      ``,
      `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`,
    ].join('\n'), { parse_mode: 'Markdown' });
  }
}


