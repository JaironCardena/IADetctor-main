export type PlanType = 'basic' | 'pro' | 'pro_plus';
export type PaymentServiceType = PlanType | 'express_plagiarism' | 'express_ai' | 'express_full' | 'express_humanizer';

export interface Subscription {
  id: string;
  userId: string;
  planType: PlanType;
  expiresAt: string;
  createdAt: string;
  renewalReminderSentAt: string | null;
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planType: PaymentServiceType;
  voucherPath: string;
  amount: number;
  status: PaymentStatus;
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  metadata?: any;
}

export interface BankAccount {
  id: string;
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
  detectorLimit: number | null;
  detectorUsed: number;
  detectorRemaining: number | null;
  // Humanizer limits (from plan settings)
  humanizerWordLimit: number | null;
  humanizerSubmissionLimit: number | null;
  // Humanizer usage tracking
  humanizerUsed: number;
  humanizerWordsUsed: number;
  humanizerSubmissionsRemaining: number | null;
  humanizerWordsRemaining: number | null;
  expressDetectorCredits?: number;
  expressDetectorCreditsByType?: {
    plagiarism: number;
    ai: number;
    both: number;
  };
  expressHumanizerWords?: number;
}

export interface PlanSettings {
  price: string;
  detectorDocumentLimit: number;
  humanizerWordLimit: number;
  humanizerSubmissionLimit: number;
}

export type SubscriptionSettings = Record<PlanType, PlanSettings>;

export interface SystemSubscriptionSettings {
  plans: SubscriptionSettings;
  bankAccounts: BankAccount[];
}
