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

/** Lightweight user object returned to the client (no sensitive fields) */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  subscriptionExpiresAt: string | null;
}
