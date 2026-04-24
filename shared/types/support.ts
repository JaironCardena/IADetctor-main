export type SupportTicketStatus = 'pending' | 'in_progress' | 'closed';
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
  createdAt: string;
}
