import mongoose from 'mongoose';
import type { Subscription } from '../../shared/types/subscription';

const SubscriptionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  planType: { type: String, required: true, enum: ['basic', 'pro', 'pro_plus'] },
  expiresAt: { type: String, required: true },
  createdAt: { type: String, required: true },
  renewalReminderSentAt: { type: String, default: null },
}, {
  timestamps: false,
  versionKey: false
});

export const SubscriptionModel = mongoose.model<Subscription & mongoose.Document>('Subscription', SubscriptionSchema);
