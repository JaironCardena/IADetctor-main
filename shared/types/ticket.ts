export type TicketStatus = 'pending' | 'processing' | 'completed';

export interface Ticket {
  id: string;
  userId: string;
  userName: string;
  fileName: string;
  fileSize: number;
  filePath: string;
  status: TicketStatus;
  assignedTo: string | null;
  assignedAdminId: string | null;
  plagiarismPdfPath: string | null;
  aiPdfPath: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Lightweight ticket data exposed to the client */
export interface TicketData {
  id: string;
  fileName: string;
  fileSize: number;
  status: TicketStatus;
  assignedTo: string | null;
  createdAt: string;
  completedAt: string | null;
}
