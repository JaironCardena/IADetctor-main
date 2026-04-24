import mongoose from 'mongoose';
import type { User } from '../../shared/types/user';

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true, enum: ['user', 'admin'], default: 'user' },
  telegramChatId: { type: String, default: null },
  isVerified: { type: Boolean, default: false },
  verificationCode: { type: String, default: null },
  verificationExpiresAt: { type: String, default: null },
  subscriptionPlan: { type: String, enum: ['basic', 'pro', 'pro_plus', null], default: null },
  expressDetectorCredits: { type: Number, default: 0 },
  expressPlagiarismCredits: { type: Number, default: 0 },
  expressAiCredits: { type: Number, default: 0 },
  expressFullCredits: { type: Number, default: 0 },
  expressHumanizerWords: { type: Number, default: 0 },
  createdAt: { type: String, required: true }
}, {
  timestamps: false,
  versionKey: false
});

export const UserModel = mongoose.model<User & mongoose.Document>('User', UserSchema);
