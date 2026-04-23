export type PlanType = 'basic' | 'pro' | 'pro_plus';

export interface Subscription {
  id: string;
  userId: string;
  planType: PlanType;
  expiresAt: string;
  createdAt: string;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planType: PlanType;
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
  planType: PlanType | null;
  expiresAt: string | null;
  daysRemaining: number;
}
