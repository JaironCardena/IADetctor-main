import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  telegramChatId: string | null;
  isVerified: boolean;
  verificationCode: string | null;
  verificationExpiresAt: string | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  fileSize: number;
  filePath: string;
  status: 'pending' | 'processing' | 'completed';
  assignedTo: string | null;
  assignedAdminId: string | null;
  plagiarismPdfPath: string | null;
  aiPdfPath: string | null;
  createdAt: string;
  completedAt: string | null;
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

class Database {
  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    for (const dir of [dataDir, path.join(process.cwd(), 'uploads', 'originals'), path.join(process.cwd(), 'uploads', 'results')]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    
    // Fire-and-forget the seeding. Wait a bit to ensure Supabase is ready.
    setTimeout(() => this.seedAdmins(), 1000);
  }

  // ── Seed multiple admins from ADMIN_ACCOUNTS env ──
  private async seedAdmins() {
    const accountsStr = process.env.ADMIN_ACCOUNTS || '';
    if (!accountsStr) {
      const email = process.env.ADMIN_EMAIL || 'admin@academix.com';
      const pass = process.env.ADMIN_PASSWORD || 'admin123';
      await this.ensureAdmin(email, pass, 'Administrador', null);
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
}

export const db = new Database();
