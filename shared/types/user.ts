import { PlanType } from './subscription';

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
  subscriptionPlan: PlanType | null;
  expressDetectorCredits?: number;
  expressPlagiarismCredits?: number;
  expressAiCredits?: number;
  expressFullCredits?: number;
  expressHumanizerWords?: number;
  createdAt: string;
}

/** Lightweight user object returned to the client (no sensitive fields) */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  subscriptionPlan: PlanType | null;
  subscriptionExpiresAt: string | null;
  expressDetectorCredits?: number;
  expressPlagiarismCredits?: number;
  expressAiCredits?: number;
  expressFullCredits?: number;
  expressHumanizerWords?: number;
}
