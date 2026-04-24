import mongoose from 'mongoose';
import type { BankAccount, SubscriptionSettings } from '../../shared/types/subscription';

const PlanSettingsSchema = new mongoose.Schema({
  price: { type: String, required: true },
  detectorDocumentLimit: { type: Number, required: true },
  humanizerWordLimit: { type: Number, required: true },
  humanizerSubmissionLimit: { type: Number, required: true }
}, { _id: false });

const BankAccountSchema = new mongoose.Schema({
  id: { type: String, required: true },
  bankName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  accountHolder: { type: String, required: true },
  accountType: { type: String, required: true },
}, { _id: false });

const SystemSettingsSchema = new mongoose.Schema({
  settingsId: { type: String, required: true, unique: true, default: 'global' },
  basic: { type: PlanSettingsSchema, required: true },
  pro: { type: PlanSettingsSchema, required: true },
  pro_plus: { type: PlanSettingsSchema, required: true },
  bankAccounts: { type: [BankAccountSchema], default: [] },
}, {
  timestamps: false,
  versionKey: false
});

export interface SystemSettingsDocument extends SubscriptionSettings, mongoose.Document {
  settingsId: string;
  bankAccounts: BankAccount[];
}

export const SystemSettingsModel = mongoose.models.SystemSettings as mongoose.Model<SystemSettingsDocument>
  || mongoose.model<SystemSettingsDocument>('SystemSettings', SystemSettingsSchema);
