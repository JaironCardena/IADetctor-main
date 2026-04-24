import mongoose from 'mongoose';
import type { Ticket } from '../../shared/types/ticket';

const TicketSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  filePath: { type: String, required: true },
  requestedAnalysis: { type: String, required: true, enum: ['plagiarism', 'ai', 'both', 'humanizer'] },
  status: { type: String, required: true, enum: ['pending', 'processing', 'completed', 'pending_payment', 'completed_pending_payment'], default: 'pending' },
  assignedTo: { type: String, default: null },
  assignedAdminId: { type: String, default: null },
  plagiarismPdfPath: { type: String, default: null },
  aiPdfPath: { type: String, default: null },
  humanizedResultPath: { type: String, default: null },
  createdAt: { type: String, required: true },
  completedAt: { type: String, default: null },
  delayNotificationSentAt: { type: String, default: null }
}, {
  timestamps: false,
  versionKey: false
});

export const TicketModel = mongoose.model<Ticket & mongoose.Document>('Ticket', TicketSchema);
