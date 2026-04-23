import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import type { User, Ticket, Subscription, Payment } from '../../shared/types';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

class Database {
  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    for (const dir of [dataDir, path.join(process.cwd(), 'uploads', 'originals'), path.join(process.cwd(), 'uploads', 'results'), path.join(process.cwd(), 'uploads', 'vouchers')]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    
    // Fire-and-forget the seeding. Wait a bit to ensure Supabase is ready.
    setTimeout(() => this.seedAdmins(), 1000);
  }

  // ── Seed multiple admins from ADMIN_ACCOUNTS env ──
  private async seedAdmins() {
    const accountsStr = env.ADMIN_ACCOUNTS;
    if (!accountsStr) {
      await this.ensureAdmin(env.ADMIN_EMAIL, env.ADMIN_PASSWORD, 'Administrador', null);
      return;
    }

    const accounts = accountsStr.split(',').map(s => s.trim()).filter(Boolean);
    for (const account of accounts) {
      const parts = account.split(':');
      if (parts.length < 3) continue;
      const [email, password, name, chatId] = parts;
      await this.ensureAdmin(email.trim(), password.trim(), name.trim(), chatId?.trim() || null);
    }
  }

  private async ensureAdmin(email: string, password: string, name: string, telegramChatId: string | null) {
    const { data: existing } = await supabase.from('users').select('*').eq('email', email).single();
    if (existing) {
      if (existing.telegramChatId !== telegramChatId) {
        await supabase.from('users').update({ telegramChatId }).eq('id', existing.id);
        console.log(`🔄 Admin actualizado: ${email} → chatId: ${telegramChatId}`);
      }
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    const admin: User = { 
      id: uuidv4(), 
      name, 
      email, 
      passwordHash: hash, 
      role: 'admin', 
      telegramChatId, 
      isVerified: true,
      verificationCode: null,
      verificationExpiresAt: null,
      createdAt: new Date().toISOString() 
    };
    await supabase.from('users').insert(admin);
    console.log(`👤 Admin creado: ${email} (${name}) — chatId: ${telegramChatId}`);
  }

  async createUser(name: string, email: string, password: string): Promise<User | null> {
    const { data: existing } = await supabase.from('users').select('*').eq('email', email).single();
    if (existing) return null;
    
    const hash = await bcrypt.hash(password, 10);
    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    const user = { 
      id: uuidv4(), 
      name, 
      email, 
      passwordHash: hash, 
      role: 'user', 
      telegramChatId: null,
      isVerified: false,
      verificationCode,
      verificationExpiresAt,
      createdAt: new Date().toISOString() 
    };
    const { data, error } = await supabase.from('users').insert(user).select().single();
    if (error) return null;
    return data as User;
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user as User;
  }

  async verifyUser(email: string, code: string): Promise<{ success: boolean; error?: string; user?: User }> {
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    if (!user) return { success: false, error: 'Usuario no encontrado' };
    if (user.isVerified) return { success: true, user: user as User };
    if (user.verificationCode !== code) return { success: false, error: 'Código incorrecto' };
    if (user.verificationExpiresAt && new Date(user.verificationExpiresAt) < new Date()) {
      return { success: false, error: 'El código ha expirado. Solicita uno nuevo.' };
    }
    const { data, error } = await supabase.from('users').update({
      isVerified: true,
      verificationCode: null,
      verificationExpiresAt: null,
    }).eq('id', user.id).select().single();
    if (error) return { success: false, error: 'Error al verificar' };
    return { success: true, user: data as User };
  }

  async resendVerificationCode(email: string): Promise<{ success: boolean; code?: string; userName?: string; error?: string }> {
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    if (!user) return { success: false, error: 'Usuario no encontrado' };
    if (user.isVerified) return { success: false, error: 'La cuenta ya está verificada' };
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await supabase.from('users').update({ verificationCode: code, verificationExpiresAt: expiresAt }).eq('id', user.id);
    return { success: true, code, userName: user.name };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data } = await supabase.from('users').select('*').eq('email', email).single();
    return data as User || undefined;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const { data } = await supabase.from('users').select('*').eq('id', id).single();
    return data as User || undefined;
  }

  async getAdminByTelegramChatId(chatId: string): Promise<User | undefined> {
    const { data } = await supabase.from('users').select('*').eq('role', 'admin').eq('telegramChatId', chatId).single();
    return data as User || undefined;
  }

  async getAdminChatIds(): Promise<string[]> {
    const { data } = await supabase.from('users').select('telegramChatId').eq('role', 'admin').not('telegramChatId', 'is', null);
    return (data || []).map(row => row.telegramChatId);
  }

  async createTicket(userId: string, userName: string, fileName: string, fileSize: number, filePath: string): Promise<Ticket> {
    const id = 'TK-' + uuidv4().split('-')[0].toUpperCase();
    const ticket: Ticket = { 
      id, userId, userName, fileName, fileSize, filePath, 
      status: 'pending', assignedTo: null, assignedAdminId: null, 
      plagiarismPdfPath: null, aiPdfPath: null, 
      createdAt: new Date().toISOString(), completedAt: null 
    };
    await supabase.from('tickets').insert(ticket);
    return ticket;
  }

  async getTicketById(id: string): Promise<Ticket | undefined> {
    const { data } = await supabase.from('tickets').select('*').eq('id', id).single();
    return data as Ticket || undefined;
  }

  async getTicketsByUser(userId: string): Promise<Ticket[]> {
    const { data } = await supabase.from('tickets').select('*').eq('userId', userId).order('createdAt', { ascending: false });
    return (data as Ticket[]) || [];
  }

  async getAllTickets(): Promise<Ticket[]> {
    const { data } = await supabase.from('tickets').select('*').order('createdAt', { ascending: false });
    return (data as Ticket[]) || [];
  }

  async getTicketsForAdmin(adminUserId: string): Promise<Ticket[]> {
    const { data } = await supabase.from('tickets').select('*').or(`assignedAdminId.eq.${adminUserId},status.eq.completed`).order('createdAt', { ascending: false });
    return (data as Ticket[]) || [];
  }

  async getUnassignedTickets(): Promise<Ticket[]> {
    const { data } = await supabase.from('tickets').select('*').eq('status', 'pending').is('assignedAdminId', null).order('createdAt', { ascending: false });
    return (data as Ticket[]) || [];
  }

  async updateTicketStatus(ticketId: string, status: 'pending' | 'processing' | 'completed'): Promise<Ticket | null> {
    const { data, error } = await supabase.from('tickets').update({ status }).eq('id', ticketId).select().single();
    if (error) return null;
    return data as Ticket;
  }

  async assignTicket(ticketId: string, adminName: string, adminId: string): Promise<Ticket | null> {
    const { data, error } = await supabase.from('tickets').update({
      assignedTo: adminName,
      assignedAdminId: adminId,
      status: 'processing'
    }).eq('id', ticketId).select().single();
    if (error) return null;
    return data as Ticket;
  }

  async unassignTicket(ticketId: string): Promise<Ticket | null> {
    const { data, error } = await supabase.from('tickets').update({
      assignedTo: null,
      assignedAdminId: null,
      status: 'pending'
    }).eq('id', ticketId).select().single();
    if (error) return null;
    return data as Ticket;
  }

  async updateTicketResults(ticketId: string, plagiarismPath: string, aiPath: string): Promise<Ticket | null> {
    const { data, error } = await supabase.from('tickets').update({
      plagiarismPdfPath: plagiarismPath,
      aiPdfPath: aiPath,
      status: 'completed',
      completedAt: new Date().toISOString()
    }).eq('id', ticketId).select().single();
    if (error) return null;
    return data as Ticket;
  }

  // ═══════════════════════════════════════════════════════
  // ── SUBSCRIPTION & PAYMENT METHODS ────────────────────
  // ═══════════════════════════════════════════════════════

  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('userId', userId)
      .gte('expiresAt', now)
      .order('expiresAt', { ascending: false })
      .limit(1)
      .single();
    return data as Subscription || null;
  }

  async getSubscriptionStatus(userId: string): Promise<{ active: boolean; expiresAt: string | null; daysRemaining: number }> {
    const sub = await this.getActiveSubscription(userId);
    if (!sub) return { active: false, expiresAt: null, daysRemaining: 0 };
    const remaining = Math.ceil((new Date(sub.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { active: true, expiresAt: sub.expiresAt, daysRemaining: Math.max(0, remaining) };
  }

  async createOrExtendSubscription(userId: string, days: number): Promise<Subscription> {
    // Check if user already has an active subscription
    const existing = await this.getActiveSubscription(userId);
    let newExpiresAt: Date;

    if (existing) {
      // Extend: add days from the current expiration
      newExpiresAt = new Date(existing.expiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      // Update existing subscription
      const { data } = await supabase
        .from('subscriptions')
        .update({ expiresAt: newExpiresAt.toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      console.log(`🔄 Suscripción extendida para userId ${userId}: +${days} días → ${newExpiresAt.toISOString()}`);
      return data as Subscription;
    } else {
      // Create new subscription starting now
      newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      const sub: Subscription = {
        id: uuidv4(),
        userId,
        expiresAt: newExpiresAt.toISOString(),
        createdAt: new Date().toISOString(),
      };
      await supabase.from('subscriptions').insert(sub);
      console.log(`✅ Nueva suscripción creada para userId ${userId}: ${days} días → ${newExpiresAt.toISOString()}`);
      return sub;
    }
  }

  async createPayment(userId: string, userName: string, userEmail: string, voucherPath: string, amount: number): Promise<Payment> {
    const payment: Payment = {
      id: 'PAY-' + uuidv4().split('-')[0].toUpperCase(),
      userId,
      userName,
      userEmail,
      voucherPath,
      amount,
      status: 'pending',
      reviewedBy: null,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    };
    await supabase.from('payments').insert(payment);
    return payment;
  }

  async getPaymentById(id: string): Promise<Payment | null> {
    const { data } = await supabase.from('payments').select('*').eq('id', id).single();
    return data as Payment || null;
  }

  async approvePayment(paymentId: string, adminName: string): Promise<Payment | null> {
    const { data, error } = await supabase.from('payments').update({
      status: 'approved',
      reviewedBy: adminName,
      reviewedAt: new Date().toISOString(),
    }).eq('id', paymentId).eq('status', 'pending').select().single();
    if (error || !data) return null;
    return data as Payment;
  }

  async rejectPayment(paymentId: string, adminName: string, reason: string): Promise<Payment | null> {
    const { data, error } = await supabase.from('payments').update({
      status: 'rejected',
      reviewedBy: adminName,
      rejectionReason: reason,
      reviewedAt: new Date().toISOString(),
    }).eq('id', paymentId).eq('status', 'pending').select().single();
    if (error || !data) return null;
    return data as Payment;
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    const { data } = await supabase.from('payments').select('*').eq('userId', userId).order('createdAt', { ascending: false });
    return (data as Payment[]) || [];
  }

  async getPendingPayments(): Promise<Payment[]> {
    const { data } = await supabase.from('payments').select('*').eq('status', 'pending').order('createdAt', { ascending: false });
    return (data as Payment[]) || [];
  }
}

export const db = new Database();
