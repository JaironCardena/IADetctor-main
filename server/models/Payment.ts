import mongoose from 'mongoose';
import type { Payment } from '../../shared/types/subscription';

const PaymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  planType: { type: String, required: true, enum: ['basic', 'pro', 'pro_plus', 'express_plagiarism', 'express_ai', 'express_full', 'express_humanizer'] },
  voucherPath: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: String, default: null },
  rejectionReason: { type: String, default: null },
  createdAt: { type: String, required: true },
  reviewedAt: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: false,
  versionKey: false
});

export const PaymentModel = mongoose.model<Payment & mongoose.Document>('Payment', PaymentSchema);
