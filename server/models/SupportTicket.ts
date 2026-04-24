import mongoose from 'mongoose';
import type { SupportTicket } from '../../shared/types/support';

const SupportTicketSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, required: true, enum: ['pending', 'in_progress', 'closed'], default: 'pending' },
  channel: { type: String, required: true, enum: ['whatsapp'], default: 'whatsapp' },
  createdAt: { type: String, required: true },
}, {
  timestamps: false,
  versionKey: false,
});

SupportTicketSchema.index({ createdAt: -1 });

export const SupportTicketModel = mongoose.models.SupportTicket as mongoose.Model<SupportTicket & mongoose.Document>
  || mongoose.model<SupportTicket & mongoose.Document>('SupportTicket', SupportTicketSchema);
