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
  onWhatsApp?: (...jid: string[]) => Promise<Array<{ exists?: boolean; jid: string }> | undefined>;
  signalRepository?: {
    lidMapping?: {
      getPNForLID: (lid: string) => Promise<string | null>;
    };
  };
};

type PendingAdminAction =
  | { type: 'approve_payment'; id: string; adminNumber: string; expiresAt: number }
  | { type: 'reject_payment'; id: string; reason: string; adminNumber: string; expiresAt: number }
  | { type: 'resolve_support'; id: string; adminNumber: string; expiresAt: number };
type PendingAdminActionInput =
  | { type: 'approve_payment'; id: string; adminNumber: string }
  | { type: 'reject_payment'; id: string; reason: string; adminNumber: string }
  | { type: 'resolve_support'; id: string; adminNumber: string };

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
const pendingAdminActions = new Map<string, PendingAdminAction>();
let roundRobinIndex = 0;
const ESCALATION_MINUTES = env.ESCALATION_TIMEOUT_MINUTES;
const ADMIN_ACTION_CONFIRM_MS = 2 * 60 * 1000;
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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function jidUser(jid: string): string {
  return String(jid || '').split('@')[0] || '';
}

function isPhoneNumberJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us');
}

function isLidJid(jid: string): boolean {
  return jid.endsWith('@lid');
}

function getMessageJidCandidates(key: any): string[] {
  return uniqueStrings([
    key?.remoteJid,
    key?.remoteJidAlt,
    key?.participant,
    key?.participantAlt,
  ]);
}

async function resolvePhoneFromJid(jid: string): Promise<string | null> {
  if (!jid) return null;

  if (isPhoneNumberJid(jid)) {
    const normalized = normalizeWhatsappNumber(jidUser(jid));
    return normalized || null;
  }

  if (isLidJid(jid) && sock?.signalRepository?.lidMapping?.getPNForLID) {
    for (const candidate of [jid, jidUser(jid)]) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(candidate);
        const normalized = normalizeWhatsappNumber(pn || '');
        if (normalized) return normalized;
      } catch {
        // Older or partial sessions may not have a LID mapping yet.
      }
    }
  }

  return null;
}

async function resolveAdminFromJids(jids: string[]): Promise<{ number: string; matchedJid: string } | null> {
  const candidates = uniqueStrings(jids);

  for (const candidate of candidates) {
    const directPhone = await resolvePhoneFromJid(candidate);
    if (!directPhone) continue;

    const matched = adminNumbers.find(number => normalizeWhatsappNumber(number) === directPhone);
    if (matched) {
      return { number: normalizeWhatsappNumber(matched), matchedJid: candidate };
    }
  }

  return null;
}

async function resolveJidFromNumber(number: string): Promise<string | null> {
  const normalized = normalizeWhatsappNumber(number);
  if (!normalized) return null;
  const fallbackJid = jidFromNumber(normalized);

  if (!sock?.onWhatsApp) return fallbackJid;

  try {
    const result = await sock.onWhatsApp(normalized);
    const match = result?.find(item => item.exists && item.jid);
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

function isCurrentAssignedNumber(ticketId: string, adminNumber: string): boolean {
  const assignedIndex = ticketAssignment.get(ticketId);
  if (assignedIndex === undefined) return true;
  return normalizeWhatsappNumber(adminNumbers[assignedIndex]) === normalizeWhatsappNumber(adminNumber);
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
    `Comandos rapidos:`,
    `Tomar: confirm ${ticket.id}`,
    `Detalle: ver ${ticket.id}`,
    `Reasignar: reassign ${ticket.id}`,
    '',
    `Abrir tomar: ${buildCommandLink(`confirm ${ticket.id}`)}`,
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
    'Responder al usuario:',
    buildSupportReplyLink(ticket, adminName),
    '',
    'Comandos:',
    `Detalle: ver ${ticket.id}`,
    `Resolver: resolver ${ticket.id}`,
    `Reasignar: reasignar ${ticket.id}`,
    `Nota: nota ${ticket.id}`,
    '',
    'Resolver requiere confirmar con SI.',
    '---',
  ].join('\n');
}

function truncateText(text: string, maxLength = 120): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function normalizeEntityId(input: string): string {
  let id = String(input || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  for (const prefix of ['TICK', 'PAY', 'TK']) {
    if (id.startsWith(prefix) && !id.startsWith(`${prefix}-`)) {
      id = `${prefix}-${id.slice(prefix.length)}`;
      break;
    }
  }
  return id;
}

function buildAdminMenu(): string {
  return [
    'MENU ADMIN - AcademiX AI',
    '',
    'Consultas:',
    'menu / ayuda - ver esta guia',
    'pendientes - tickets activos',
    'pagos - pagos pendientes',
    'soporte - soporte abierto',
    'ver ID - detalle de TK-..., PAY-... o TICK-...',
    '',
    'Tickets:',
    'confirm TK-... - tomar ticket',
    'reassign TK-... - reasignar ticket',
    '',
    'Pagos:',
    'aprobar PAY-... - pide confirmacion',
    'rechazar PAY-... motivo - pide confirmacion',
    '',
    'Soporte:',
    'resolver TICK-... - pide confirmacion',
    'nota TICK-... - agregar nota interna',
    'reasignar TICK-... - reasignar soporte',
  ].join('\n');
}

function formatTicketLine(ticket: Ticket): string {
  return `${ticket.id} | ${statusLabel(ticket.status)} | ${requestedAnalysisLabel(ticket.requestedAnalysis)} | ${ticket.userName} | ${truncateText(ticket.fileName, 45)}`;
}

function formatPaymentLine(payment: Payment): string {
  return `${payment.id} | $${payment.amount.toFixed(2)} | ${paymentLabel(payment.planType)} | ${payment.userName}`;
}

function formatSupportLine(ticket: SupportTicket): string {
  return `${ticket.id} | ${supportStatusLabel(ticket.status)} | ${ticket.name} | ${truncateText(ticket.message, 55)}`;
}

function formatTicketDetail(ticket: Ticket): string {
  return [
    'DETALLE DE TICKET',
    '',
    `ID: ${ticket.id}`,
    `Documento: ${ticket.fileName}`,
    `Usuario: ${ticket.userName}`,
    `Tamano: ${formatSize(ticket.fileSize)}`,
    `Servicio: ${requestedAnalysisLabel(ticket.requestedAnalysis)}`,
    `Estado: ${statusLabel(ticket.status)}`,
    ticket.assignedTo ? `Asignado a: ${ticket.assignedTo}` : 'Asignado a: sin asignar',
    `Creado: ${formatDate(ticket.createdAt)}`,
    ticket.completedAt ? `Completado: ${formatDate(ticket.completedAt)}` : null,
    '',
    ticket.status === 'pending' ? `Tomar: confirm ${ticket.id}` : null,
    ticket.status === 'pending' ? `Reasignar: reassign ${ticket.id}` : null,
  ].filter(Boolean).join('\n');
}

function formatPaymentDetail(payment: Payment): string {
  return [
    'DETALLE DE PAGO',
    '',
    `ID: ${payment.id}`,
    `Usuario: ${payment.userName}`,
    `Correo: ${payment.userEmail}`,
    `Servicio: ${paymentLabel(payment.planType)}`,
    `Monto: $${payment.amount.toFixed(2)}`,
    `Estado: ${payment.status}`,
    `Enviado: ${formatDate(payment.createdAt)}`,
    payment.reviewedBy ? `Revisado por: ${payment.reviewedBy}` : null,
    payment.rejectionReason ? `Motivo rechazo: ${payment.rejectionReason}` : null,
    '',
    payment.status === 'pending' ? `Aprobar: aprobar ${payment.id}` : null,
    payment.status === 'pending' ? `Rechazar: rechazar ${payment.id} motivo` : null,
  ].filter(Boolean).join('\n');
}

function formatSupportDetail(ticket: SupportTicket): string {
  return [
    'DETALLE DE SOPORTE',
    '',
    `ID: ${ticket.id}`,
    `Usuario: ${ticket.name}`,
    `Correo: ${ticket.email}`,
    `Telefono: ${ticket.phone}`,
    `Estado: ${supportStatusLabel(ticket.status)}`,
    ticket.assignedTo ? `Asignado a: ${ticket.assignedTo}` : 'Asignado a: sin asignar',
    `Creado: ${formatDate(ticket.createdAt)}`,
    '',
    'Problema:',
    ticket.message,
    ticket.internalNotes.length > 0 ? '' : null,
    ticket.internalNotes.length > 0 ? `Notas: ${ticket.internalNotes.length}` : null,
    '',
    ticket.status !== 'resolved' ? `Resolver: resolver ${ticket.id}` : null,
    ticket.status !== 'resolved' ? `Nota: nota ${ticket.id}` : null,
  ].filter(Boolean).join('\n');
}

async function sendActiveTicketsList(jid: string) {
  const tickets = await db.getActiveTickets();
  if (tickets.length === 0) {
    await sendText(jid, 'No hay tickets activos ahora mismo.');
    return;
  }

  await sendText(jid, [
    `TICKETS ACTIVOS (${tickets.length})`,
    '',
    ...tickets.slice(0, 10).map(formatTicketLine),
    tickets.length > 10 ? '' : null,
    tickets.length > 10 ? `Mostrando 10 de ${tickets.length}. Usa ver TK-... para detalle.` : null,
    '',
    'Comandos: ver TK-..., confirm TK-..., reassign TK-...',
  ].filter(Boolean).join('\n'));
}

async function sendPendingPaymentsList(jid: string) {
  const payments = await db.getPendingPayments();
  if (payments.length === 0) {
    await sendText(jid, 'No hay pagos pendientes ahora mismo.');
    return;
  }

  await sendText(jid, [
    `PAGOS PENDIENTES (${payments.length})`,
    '',
    ...payments.slice(0, 10).map(formatPaymentLine),
    payments.length > 10 ? '' : null,
    payments.length > 10 ? `Mostrando 10 de ${payments.length}. Usa ver PAY-... para detalle.` : null,
    '',
    'Comandos: ver PAY-..., aprobar PAY-..., rechazar PAY-... motivo',
  ].filter(Boolean).join('\n'));
}

async function sendOpenSupportList(jid: string) {
  const tickets = await db.getOpenSupportTickets();
  if (tickets.length === 0) {
    await sendText(jid, 'No hay tickets de soporte abiertos.');
    return;
  }

  await sendText(jid, [
    `SOPORTE ABIERTO (${tickets.length})`,
    '',
    ...tickets.slice(0, 10).map(formatSupportLine),
    tickets.length > 10 ? '' : null,
    tickets.length > 10 ? `Mostrando 10 de ${tickets.length}. Usa ver TICK-... para detalle.` : null,
    '',
    'Comandos: ver TICK-..., resolver TICK-..., nota TICK-...',
  ].filter(Boolean).join('\n'));
}

async function handleViewEntity(jid: string, rawId: string) {
  const id = normalizeEntityId(rawId);
  if (!id) {
    await sendText(jid, 'Indica un ID. Ejemplo: ver TK-123ABC, ver PAY-123ABC o ver TICK-123ABC.');
    return;
  }

  if (id.startsWith('TK-')) {
    const ticket = await db.getTicketById(id);
    await sendText(jid, ticket ? formatTicketDetail(ticket) : `No encontre el ticket ${id}.`);
    return;
  }

  if (id.startsWith('PAY-')) {
    const payment = await db.getPaymentById(id);
    await sendText(jid, payment ? formatPaymentDetail(payment) : `No encontre el pago ${id}.`);
    return;
  }

  if (id.startsWith('TICK-')) {
    const ticket = await db.getSupportTicketById(id);
    await sendText(jid, ticket ? formatSupportDetail(ticket) : `No encontre el soporte ${id}.`);
    return;
  }

  await sendText(jid, `No reconozco el tipo de ID "${rawId}". Usa TK-..., PAY-... o TICK-...`);
}

function canonicalCommand(command: string): string {
  const normalized = String(command || '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    menu: 'menu',
    help: 'menu',
    ayuda: 'menu',
    comandos: 'menu',
    pendientes: 'pending_tickets',
    tickets: 'pending_tickets',
    ticket: 'pending_tickets',
    pagos: 'pending_payments',
    payments: 'pending_payments',
    soporte: 'open_support',
    support: 'open_support',
    ver: 'view',
    view: 'view',
    detalle: 'view',
    info: 'view',
    estado: 'view',
    status: 'view',
    confirm: 'confirm_ticket',
    confirmar: 'confirm_ticket',
    tomar: 'confirm_ticket',
    claim: 'confirm_ticket',
    reassign: 'reassign',
    reasignar: 'reassign',
    approve: 'approve_payment',
    aprobar: 'approve_payment',
    reject: 'reject_payment',
    rechazar: 'reject_payment',
    support_reassign: 'support_reassign',
    supportresolve: 'resolve_support',
    support_resolve: 'resolve_support',
    resolver: 'resolve_support',
    resolve: 'resolve_support',
    support_note: 'support_note',
    nota: 'support_note',
    note: 'support_note',
    test_send_santiago: 'test_send_santiago',
  };

  return aliases[normalized] || normalized;
}

function setPendingAdminAction(key: string, action: PendingAdminActionInput): PendingAdminAction {
  const pending = { ...action, expiresAt: Date.now() + ADMIN_ACTION_CONFIRM_MS } as PendingAdminAction;
  pendingAdminActions.set(key, pending);
  return pending;
}

function pendingActionDescription(action: PendingAdminAction): string {
  if (action.type === 'approve_payment') return `aprobar el pago ${action.id}`;
  if (action.type === 'reject_payment') return `rechazar el pago ${action.id} con motivo: ${action.reason}`;
  return `resolver el ticket de soporte ${action.id}`;
}

async function askCriticalConfirmation(jid: string, key: string, action: PendingAdminActionInput) {
  const pending = setPendingAdminAction(key, action);
  await sendText(jid, [
    `Confirmas ${pendingActionDescription(pending)}?`,
    '',
    'Responde SI para ejecutar o NO para cancelar.',
    'Esta confirmacion expira en 2 minutos.',
  ].join('\n'));
}

async function executePendingAdminAction(jid: string, action: PendingAdminAction) {
  if (action.type === 'approve_payment') {
    await handleApprovePayment(jid, action.id, action.adminNumber);
    return;
  }
  if (action.type === 'reject_payment') {
    await handleRejectPayment(jid, action.id, action.reason, action.adminNumber);
    return;
  }
  await handleSupportResolve(jid, action.id, action.adminNumber);
}

async function handlePendingAdminConfirmation(jid: string, key: string, text: string): Promise<boolean> {
  const pending = pendingAdminActions.get(key);
  if (!pending) return false;

  const answer = text.trim().toLowerCase();
  if (Date.now() > pending.expiresAt) {
    pendingAdminActions.delete(key);
    await sendText(jid, 'La confirmacion expiro. Repite el comando para intentarlo de nuevo.');
    return true;
  }

  if (['si', 's', 'yes', 'y'].includes(answer)) {
    pendingAdminActions.delete(key);
    await executePendingAdminAction(jid, pending);
    return true;
  }

  if (['no', 'n', 'cancelar', 'cancel'].includes(answer)) {
    pendingAdminActions.delete(key);
    await sendText(jid, `Cancelado: ${pendingActionDescription(pending)}.`);
    return true;
  }

  await sendText(jid, `Tienes una accion pendiente: ${pendingActionDescription(pending)}. Responde SI o NO.`);
  return true;
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

async function handleConfirm(jid: string, ticketId: string, adminNumber: string) {
  const selectedAdmin = await getAdminUserByWhatsappNumber(adminNumber);
  if (!selectedAdmin) {
    await sendText(jid, 'No tienes permisos de administrador.');
    return;
  }

  if (!isCurrentAssignedNumber(ticketId, adminNumber)) {
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

async function handleReassign(jid: string, ticketId: string, adminNumber: string) {
  if (!isCurrentAssignedNumber(ticketId, adminNumber)) {
    await sendText(jid, 'Este ticket ya fue reasignado a otro administrador.');
    return;
  }

  const ticket = await db.getTicketById(ticketId);
  if (!ticket || ticket.status !== 'pending') {
    await sendText(jid, `El ticket ${ticketId} ya no esta disponible para reasignacion.`);
    return;
  }

  const currentIndex = ticketAssignment.get(ticketId)
    ?? adminNumbers.findIndex(number => normalizeWhatsappNumber(number) === normalizeWhatsappNumber(adminNumber));
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

async function handleSupportReassign(jid: string, ticketId: string, adminNumber: string) {
  const ticket = await db.getSupportTicketById(ticketId);
  if (!ticket) {
    await sendText(jid, `Ticket de soporte ${ticketId} no encontrado.`);
    return;
  }
  if (ticket.status === 'resolved') {
    await sendText(jid, `El ticket ${ticketId} ya esta resuelto.`);
    return;
  }

  const currentPhone = adminNumber;
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

async function handleSupportResolve(jid: string, ticketId: string, adminNumber: string) {
  const ticket = await db.getSupportTicketById(ticketId);
  if (!ticket) {
    await sendText(jid, `Ticket de soporte ${ticketId} no encontrado.`);
    return;
  }

  const currentPhone = adminNumber;
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

async function handleApprovePayment(jid: string, paymentId: string, adminNumber: string) {
  const result = await approvePayment(paymentId, adminNumber, io);
  if (result.ok === false) {
    await sendText(jid, result.error);
    return;
  }

  await sendText(jid, `Pago ${paymentId} aprobado. ${String(result.payment.metadata?.activatedMessage || '')}`.trim());
}

async function handleRejectPayment(jid: string, paymentId: string, reason: string, adminNumber: string) {
  const result = await rejectPayment(paymentId, adminNumber, reason, io);
  if (result.ok === false) {
    await sendText(jid, result.error);
    return;
  }

  await sendText(jid, `Pago ${paymentId} rechazado.`);
}

async function handleIncomingMessage(message: string, jid: string, jidCandidates: string[] = []) {
  const text = message.trim();
  if (!text) return;

  const candidates = uniqueStrings([jid, ...jidCandidates]);
  const adminContext = await resolveAdminFromJids(candidates);
  console.log(
    `WhatsApp: mensaje recibido de ${jid}; candidatos=${candidates.join(',') || 'ninguno'}; admin=${adminContext?.number || 'no_resuelto'}`
  );

  if (!adminContext) {
    return;
  }

  const adminKey = adminContext.number;
  if (await handlePendingAdminConfirmation(jid, adminKey, text)) {
    return;
  }

  const pendingPaymentId = pendingPaymentRejectionReason.get(adminKey);
  if (pendingPaymentId) {
    pendingPaymentRejectionReason.delete(adminKey);
    await askCriticalConfirmation(jid, adminKey, {
      type: 'reject_payment',
      id: pendingPaymentId,
      reason: text,
      adminNumber: adminContext.number,
    });
    return;
  }

  const pendingSupportTicketId = pendingSupportNote.get(jid);
  if (pendingSupportTicketId) {
    pendingSupportNote.delete(jid);
    const updated = await db.addSupportTicketNote(pendingSupportTicketId, `${formatDate(new Date().toISOString())} - ${text}`);
    await sendText(jid, updated ? `Nota agregada al ticket ${pendingSupportTicketId}.` : `No se pudo agregar la nota al ticket ${pendingSupportTicketId}.`);
    return;
  }

  const [rawCommand, rawId = '', ...rest] = text.replace(/\s+/g, ' ').split(' ');
  const normalizedCommand = canonicalCommand(rawCommand);
  const normalizedId = normalizeEntityId(rawId);

  if (normalizeEntityId(rawCommand).match(/^(TK|PAY|TICK)-/)) {
    await handleViewEntity(jid, rawCommand);
    return;
  }

  if (normalizedCommand === 'menu') {
    await sendText(jid, buildAdminMenu());
    return;
  }

  if (normalizedCommand === 'pending_tickets') {
    await sendActiveTicketsList(jid);
    return;
  }

  if (normalizedCommand === 'pending_payments') {
    await sendPendingPaymentsList(jid);
    return;
  }

  if (normalizedCommand === 'open_support') {
    await sendOpenSupportList(jid);
    return;
  }

  if (normalizedCommand === 'view') {
    await handleViewEntity(jid, normalizedId);
    return;
  }

  if (normalizedCommand === 'confirm_ticket' && normalizedId) {
    await handleConfirm(jid, normalizedId, adminContext.number);
    return;
  }

  if (normalizedCommand === 'reassign' && normalizedId) {
    if (normalizedId.startsWith('TICK-')) {
      await handleSupportReassign(jid, normalizedId, adminContext.number);
    } else {
      await handleReassign(jid, normalizedId, adminContext.number);
    }
    return;
  }

  if (normalizedCommand === 'support_reassign' && normalizedId) {
    await handleSupportReassign(jid, normalizedId, adminContext.number);
    return;
  }

  if (normalizedCommand === 'resolve_support' && normalizedId) {
    await askCriticalConfirmation(jid, adminKey, {
      type: 'resolve_support',
      id: normalizedId,
      adminNumber: adminContext.number,
    });
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

  if (normalizedCommand === 'approve_payment' && normalizedId) {
    await askCriticalConfirmation(jid, adminKey, {
      type: 'approve_payment',
      id: normalizedId,
      adminNumber: adminContext.number,
    });
    return;
  }

  if (normalizedCommand === 'reject_payment' && normalizedId && rest.length > 0) {
    await askCriticalConfirmation(jid, adminKey, {
      type: 'reject_payment',
      id: normalizedId,
      reason: rest.join(' '),
      adminNumber: adminContext.number,
    });
    return;
  }

  if (normalizedCommand === 'reject_payment' && normalizedId) {
    pendingPaymentRejectionReason.set(adminKey, normalizedId);
    await sendText(jid, `Escribe el motivo del rechazo para el pago ${normalizedId}.`);
    return;
  }

  await sendText(jid, [
    'No reconozco ese comando.',
    '',
    'Prueba con: menu, pendientes, pagos, soporte o ver ID.',
  ].join('\n'));
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

    const baileys = await import('baileys');
    const sessionDir = await resolveSessionDir();
    await fs.mkdir(sessionDir, { recursive: true });
    console.log(`WhatsApp: usando sesion en ${sessionDir}`);
    const { state, saveCreds } = await baileys.useMultiFileAuthState(sessionDir);
    const { version } = await baileys.fetchLatestBaileysVersion();
    const makeWASocket = baileys.default || baileys.makeWASocket;

    sock = makeWASocket({
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
      const statusCode = update.lastDisconnect?.error?.output?.statusCode;
      console.log(`WhatsApp: connection.update connection=${update.connection || 'n/a'} statusCode=${statusCode ?? 'n/a'}`);
      if (update.qr) {
        console.log('\nEscanea este QR con el WhatsApp del numero bot en Dispositivos vinculados:\n');
        qrcode.generate(update.qr, { small: true });
      }
      if (update.connection === 'open') {
        whatsappReady = true;
        console.log(`Bot de WhatsApp iniciado para ${normalizeWhatsappNumber(env.WHATSAPP_BOT_NUMBER)}.`);
      }
      if (update.connection === 'close' && statusCode !== baileys.DisconnectReason.loggedOut) {
        whatsappReady = false;
        sock = null;
        setTimeout(() => void initWhatsAppBot(io || undefined), 5000);
      }
      if (update.connection === 'close' && statusCode === baileys.DisconnectReason.loggedOut) {
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
        const jidCandidates = getMessageJidCandidates(item.key);
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
            await handleIncomingMessage(text, jid, jidCandidates);
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
        `Detalle: ver ${payment.id}`,
        `Aprobar: aprobar ${payment.id}`,
        `Rechazar: rechazar ${payment.id} motivo`,
        '',
        'Aprobar o rechazar requiere responder SI para confirmar.',
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
