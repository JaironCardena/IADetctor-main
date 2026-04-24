import type { RequestedAnalysis } from '../constants/ticketRules';

export type TicketStatus = 'pending' | 'processing' | 'completed' | 'pending_payment' | 'completed_pending_payment';

export interface Ticket {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  fileSize: number;
  filePath: string;
  requestedAnalysis: RequestedAnalysis;
  status: TicketStatus;
  assignedTo: string | null;
  assignedAdminId: string | null;
  plagiarismPdfPath: string | null;
  aiPdfPath: string | null;
  humanizedResultPath: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Lightweight ticket data exposed to the client */
export interface TicketData {
  id: string;
  fileName: string;
  fileSize: number;
  requestedAnalysis: RequestedAnalysis;
  status: TicketStatus;
  assignedTo: string | null;
  createdAt: string;
  completedAt: string | null;
}
