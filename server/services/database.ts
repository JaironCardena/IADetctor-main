import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { ensureSubscriptionSettings, getSubscriptionSettings } from './subscriptionSettings';
import type { User, Ticket, Subscription, Payment } from '../../shared/types';
import type { PlanType, SubscriptionStatus } from '../../shared/types/subscription';
import { UserModel } from '../models/User';
import { TicketModel } from '../models/Ticket';
import { SubscriptionModel } from '../models/Subscription';
import { PaymentModel } from '../models/Payment';

class Database {
  public readonly ready: Promise<void>;

  constructor() {
    for (const dir of [
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'uploads', 'originals'),
      path.join(process.cwd(), 'uploads', 'results'),
      path.join(process.cwd(), 'uploads', 'vouchers'),
    ]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    this.ready = this.connect();
  }

  private async connect() {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(env.MONGODB_URI, {
          dbName: env.MONGODB_DB
        });
      } else if (mongoose.connection.readyState === 2) {
        await mongoose.connection.asPromise();
      }

      await Promise.all([
        UserModel.init(),
        TicketModel.init(),
        SubscriptionModel.init(),
        PaymentModel.init(),
      ]);
      await ensureSubscriptionSettings();
      await this.seedAdmins();
      
      const dbName = mongoose.connection.name;
      console.log(`Conectado a MongoDB Atlas - Base de datos: ${dbName}`);
    } catch (err) {
      console.error('Error conectando a MongoDB Atlas:', err);
      throw err;
    }
  }

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
    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      if (existing.telegramChatId !== telegramChatId) {
        await UserModel.updateOne({ id: existing.id }, { telegramChatId });
        console.log(`Admin actualizado: ${email} -> chatId: ${telegramChatId}`);
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
      subscriptionPlan: null,
      isVerified: true,
      verificationCode: null,
      verificationExpiresAt: null,
      createdAt: new Date().toISOString(),
    };
    await UserModel.create(admin);
    console.log(`Admin creado: ${email} (${name})`);
  }

  async createUser(name: string, email: string, password: string): Promise<User | null> {
    const existing = await UserModel.findOne({ email }).lean();
    if (existing) return null;

    const hash = await bcrypt.hash(password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const user: User = {
      id: uuidv4(),
      name,
      email,
      passwordHash: hash,
      role: 'user',
      telegramChatId: null,
      subscriptionPlan: null,
      isVerified: false,
      verificationCode,
      verificationExpiresAt,
      createdAt: new Date().toISOString(),
    };

    const doc = await UserModel.create(user);
    return doc.toObject() as User;
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await UserModel.findOne({ email }).lean();
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user as User;
  }

  async verifyUser(email: string, code: string): Promise<{ success: boolean; error?: string; user?: User }> {
    const user = await UserModel.findOne({ email }).lean();
    if (!user) return { success: false, error: 'Usuario no encontrado' };
    if (user.isVerified) return { success: true, user: user as User };
    if (user.verificationCode !== code) return { success: false, error: 'Codigo incorrecto' };
    if (user.verificationExpiresAt && new Date(user.verificationExpiresAt) < new Date()) {
      return { success: false, error: 'El codigo ha expirado. Solicita uno nuevo.' };
    }

    const updatedUser = await UserModel.findOneAndUpdate(
      { id: user.id },
      { $set: { isVerified: true, verificationCode: null, verificationExpiresAt: null } },
      { new: true }
    ).lean();

    if (!updatedUser) return { success: false, error: 'Error al verificar' };
    return { success: true, user: updatedUser as User };
  }

  async resendVerificationCode(email: string): Promise<{ success: boolean; code?: string; userName?: string; error?: string }> {
    const user = await UserModel.findOne({ email }).lean();
    if (!user) return { success: false, error: 'Usuario no encontrado' };
    if (user.isVerified) return { success: false, error: 'La cuenta ya esta verificada' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await UserModel.updateOne({ id: user.id }, { verificationCode: code, verificationExpiresAt: expiresAt });
    return { success: true, code, userName: user.name };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = await UserModel.findOne({ email }).lean();
    return user ? (user as User) : undefined;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const user = await UserModel.findOne({ id }).lean();
    return user ? (user as User) : undefined;
  }

  async getAdminByTelegramChatId(chatId: string): Promise<User | undefined> {
    const user = await UserModel.findOne({ role: 'admin', telegramChatId: chatId }).lean();
    return user ? (user as User) : undefined;
  }

  async getAdminChatIds(): Promise<string[]> {
    const admins = await UserModel.find({ role: 'admin', telegramChatId: { $ne: null } }, { telegramChatId: 1 }).lean();
    return admins.map(a => a.telegramChatId!).filter(Boolean);
  }

  async createTicket(
    userId: string,
    userName: string,
    fileName: string,
    fileSize: number,
    filePath: string,
    requestedAnalysis: 'plagiarism' | 'both' = 'both'
  ): Promise<Ticket> {
    const id = 'TK-' + uuidv4().split('-')[0].toUpperCase();
    const ticket: Ticket = {
      id,
      userId,
      userName,
      fileName,
      fileSize,
      filePath,
      requestedAnalysis,
      status: 'pending',
      assignedTo: null,
      assignedAdminId: null,
      plagiarismPdfPath: null,
      aiPdfPath: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    await TicketModel.create(ticket);
    return ticket;
  }

  async getTicketById(id: string): Promise<Ticket | undefined> {
    const ticket = await TicketModel.findOne({ id }).lean();
    return ticket ? (ticket as Ticket) : undefined;
  }

  async getTicketsByUser(userId: string): Promise<Ticket[]> {
    const tickets = await TicketModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return tickets as Ticket[];
  }

  async countTicketsByUserSince(userId: string, since: string): Promise<number> {
    return TicketModel.countDocuments({ userId, createdAt: { $gte: since } });
  }

  async getAllTickets(): Promise<Ticket[]> {
    const tickets = await TicketModel.find().sort({ createdAt: -1 }).lean();
    return tickets as Ticket[];
  }

  async getTicketsForAdmin(adminUserId: string): Promise<Ticket[]> {
    const tickets = await TicketModel.find({
      $or: [{ assignedAdminId: adminUserId }, { status: 'completed' }],
    }).sort({ createdAt: -1 }).lean();
    return tickets as Ticket[];
  }

  async getUnassignedTickets(): Promise<Ticket[]> {
    const tickets = await TicketModel.find({ status: 'pending', assignedAdminId: null }).sort({ createdAt: -1 }).lean();
    return tickets as Ticket[];
  }

  async updateTicketStatus(ticketId: string, status: 'pending' | 'processing' | 'completed'): Promise<Ticket | null> {
    const updated = await TicketModel.findOneAndUpdate({ id: ticketId }, { status }, { new: true }).lean();
    return updated ? (updated as Ticket) : null;
  }

  async assignTicket(ticketId: string, adminName: string, adminId: string): Promise<Ticket | null> {
    const updated = await TicketModel.findOneAndUpdate(
      { id: ticketId },
      { assignedTo: adminName, assignedAdminId: adminId, status: 'processing' },
      { new: true }
    ).lean();
    return updated ? (updated as Ticket) : null;
  }

  async unassignTicket(ticketId: string): Promise<Ticket | null> {
    const updated = await TicketModel.findOneAndUpdate(
      { id: ticketId },
      { assignedTo: null, assignedAdminId: null, status: 'pending' },
      { new: true }
    ).lean();
    return updated ? (updated as Ticket) : null;
  }

  async updateTicketResults(ticketId: string, plagiarismPath: string, aiPath: string | null): Promise<Ticket | null> {
    const updated = await TicketModel.findOneAndUpdate(
      { id: ticketId },
      {
        plagiarismPdfPath: plagiarismPath,
        aiPdfPath: aiPath,
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
      { new: true }
    ).lean();
    return updated ? (updated as Ticket) : null;
  }

  async getTicketsOlderThan(dateString: string): Promise<Ticket[]> {
    const tickets = await TicketModel.find({ createdAt: { $lt: dateString } }).lean();
    return tickets as Ticket[];
  }

  async clearTicketFiles(ticketId: string): Promise<void> {
    await TicketModel.updateOne({ id: ticketId }, { filePath: '', plagiarismPdfPath: null, aiPdfPath: null });
  }

  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const now = new Date().toISOString();
    const subscription = await SubscriptionModel.findOne({ userId, expiresAt: { $gte: now } })
      .sort({ expiresAt: -1 })
      .lean();
    return subscription ? (subscription as Subscription) : null;
  }

  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    const sub = await this.getActiveSubscription(userId);
    if (!sub) {
      return {
        active: false,
        planType: null,
        expiresAt: null,
        daysRemaining: 0,
        detectorLimit: null,
        detectorUsed: 0,
        detectorRemaining: null,
        humanizerWordLimit: null,
        humanizerSubmissionLimit: null,
      };
    }

    const settings = await getSubscriptionSettings();
    const planSettings = settings[sub.planType];
    const detectorLimit = planSettings.detectorDocumentLimit;
    const detectorUsed = await this.countTicketsByUserSince(userId, sub.createdAt);
    const remaining = Math.ceil((new Date(sub.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return {
      active: true,
      planType: sub.planType,
      expiresAt: sub.expiresAt,
      daysRemaining: Math.max(0, remaining),
      detectorLimit,
      detectorUsed,
      detectorRemaining: Math.max(0, detectorLimit - detectorUsed),
      humanizerWordLimit: planSettings.humanizerWordLimit || null,
      humanizerSubmissionLimit: planSettings.humanizerSubmissionLimit || null,
    };
  }

  async createOrExtendSubscription(userId: string, days: number, planType: PlanType): Promise<Subscription> {
    const existing = await this.getActiveSubscription(userId);
    let newExpiresAt: Date;

    if (existing) {
      if (existing.planType === planType) {
        newExpiresAt = new Date(existing.expiresAt);
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
      } else {
        newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
      }

      const usageStartsAt = new Date().toISOString();
      const updated = await SubscriptionModel.findOneAndUpdate(
        { id: existing.id },
        { expiresAt: newExpiresAt.toISOString(), planType, createdAt: usageStartsAt },
        { new: true }
      ).lean();

      await UserModel.updateOne({ id: userId }, { subscriptionPlan: planType });
      return updated as Subscription;
    }

    newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + days);
    const sub: Subscription = {
      id: uuidv4(),
      userId,
      planType,
      expiresAt: newExpiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
    await SubscriptionModel.create(sub);
    await UserModel.updateOne({ id: userId }, { subscriptionPlan: planType });
    return sub;
  }

  async createPayment(userId: string, userName: string, userEmail: string, planType: PlanType, voucherPath: string, amount: number): Promise<Payment> {
    const payment: Payment = {
      id: 'PAY-' + uuidv4().split('-')[0].toUpperCase(),
      userId,
      userName,
      userEmail,
      planType,
      voucherPath,
      amount,
      status: 'pending',
      reviewedBy: null,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    };
    await PaymentModel.create(payment);
    return payment;
  }

  async getPaymentById(id: string): Promise<Payment | null> {
    const payment = await PaymentModel.findOne({ id }).lean();
    return payment ? (payment as Payment) : null;
  }

  async approvePayment(paymentId: string, adminName: string): Promise<Payment | null> {
    const updated = await PaymentModel.findOneAndUpdate(
      { id: paymentId, status: 'pending' },
      { status: 'approved', reviewedBy: adminName, reviewedAt: new Date().toISOString() },
      { new: true }
    ).lean();
    return updated ? (updated as Payment) : null;
  }

  async rejectPayment(paymentId: string, adminName: string, reason: string): Promise<Payment | null> {
    const updated = await PaymentModel.findOneAndUpdate(
      { id: paymentId, status: 'pending' },
      { status: 'rejected', reviewedBy: adminName, rejectionReason: reason, reviewedAt: new Date().toISOString() },
      { new: true }
    ).lean();
    return updated ? (updated as Payment) : null;
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    const payments = await PaymentModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return payments as Payment[];
  }

  async getPayments(status: 'pending' | 'all' = 'pending'): Promise<Payment[]> {
    const query = status === 'pending' ? { status: 'pending' } : {};
    const payments = await PaymentModel.find(query).sort({ createdAt: -1 }).lean();
    return payments as Payment[];
  }

  async getPendingPayments(): Promise<Payment[]> {
    const payments = await PaymentModel.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
    return payments as Payment[];
  }
}

export const db = new Database();
