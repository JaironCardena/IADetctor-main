export type SupportTicketStatus = 'pending' | 'in_progress' | 'resolved';
export type SupportTicketChannel = 'whatsapp';

export interface SupportTicket {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: SupportTicketStatus;
  channel: SupportTicketChannel;
  assignedTo: string | null;
  assignedAdminNumber: string | null;
  internalNotes: string[];
  createdAt: string;
  resolvedAt: string | null;
}
