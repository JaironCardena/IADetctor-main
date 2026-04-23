export interface Subscription {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  voucherPath: string;
  amount: number;
  status: PaymentStatus;
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
}

export interface SubscriptionStatus {
  active: boolean;
  expiresAt: string | null;
  daysRemaining: number;
}
