import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { io } from 'socket.io-client';
import { requiresAiReport } from '@shared/constants/ticketRules';

interface Ticket {
  id: string; userId: string; userName: string; fileName: string; fileSize: number;
  requestedAnalysis: 'plagiarism' | 'both';
  status: 'pending' | 'processing' | 'completed';
  assignedTo: string | null;
  createdAt: string; completedAt: string | null;
}

export function AdminDashboard() {
  const { token, user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'processing' | 'completed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Per-ticket file state
  const [ticketFiles, setTicketFiles] = useState<Record<string, { plagiarism: File | null; ai: File | null }>>({});

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setTickets(data.tickets); }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchTickets();
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socket.on('ticket_updated', () => fetchTickets());
    socket.on('ticket_created', () => fetchTickets());
    return () => { socket.disconnect(); };
  }, [fetchTickets]);

  const filtered = tickets.filter(t => {
    if (filter === 'pending' && t.status !== 'pending') return false;
    if (filter === 'processing' && t.status !== 'processing') return false;
    if (filter === 'completed' && t.status !== 'completed') return false;
    if (search) {
      const q = search.toLowerCase();
      return t.id.toLowerCase().includes(q) || t.fileName.toLowerCase().includes(q) || t.userName.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: tickets.length,
    pending: tickets.filter(t => t.status === 'pending').length,
    processing: tickets.filter(t => t.status === 'processing').length,
    completed: tickets.filter(t => t.status === 'completed').length,
  };

  const getTicketFiles = (ticketId: string) => ticketFiles[ticketId] || { plagiarism: null, ai: null };

  const setTicketFile = (ticketId: string, type: 'plagiarism' | 'ai', file: File | null) => {
    setTicketFiles(prev => ({
      ...prev,
      [ticketId]: { ...getTicketFiles(ticketId), [type]: file },
    }));
  };

  const handleUploadResults = async (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    const files = getTicketFiles(ticketId);
    const aiIsRequired = requiresAiReport(ticket.requestedAnalysis);
    if (!files.plagiarism || (aiIsRequired && !files.ai)) {
      setUploadError(aiIsRequired
        ? 'Debes subir ambos reportes (plagio e IA) para este ticket.'
        : 'Debes subir el reporte de plagio para este ticket.');
      return;
    }

    setUploadError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append('plagiarismPdf', files.plagiarism);
    if (files.ai) formData.append('aiPdf', files.ai);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/results`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      if (res.ok) {
        setUploadSuccess(ticketId);
        setTicketFiles(prev => { const n = { ...prev }; delete n[ticketId]; return n; });
        setSelectedTicket(null); fetchTickets();
        setTimeout(() => setUploadSuccess(null), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error || 'No se pudo enviar el resultado del ticket.');
      }
    } catch {
      setUploadError('Error de conexion al enviar los resultados.');
    } finally { setUploading(false); }
  };

  const handleDownloadOriginal = async (ticketId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/download/${ticketId}/original`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }
    } catch {}
  };

  const statusBadge = (status: string) => {
    if (status === 'completed') return <span className="ui-chip ui-chip-status-completed"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Completado</span>;
    if (status === 'processing') return <span className="ui-chip ui-chip-status-processing"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />En proceso</span>;
    return <span className="ui-chip ui-chip-status-pending"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Pendiente</span>;
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatSize = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB';

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h ${mins % 60}m`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  };

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-100 px-4 py-1.5 rounded-full mb-4">
          <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">Panel de {user?.name || 'Admin'}</span>
        </div>
        <h1 className="ui-title-lg">Mis Tickets</h1>
        <p className="ui-subtitle mt-1">Tickets asignados a ti + historial compartido de completados</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-blue-50 text-blue-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.total}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total</p></div>
        </div>
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-amber-50 text-amber-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.pending}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pendientes</p></div>
        </div>
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-blue-50 text-blue-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.processing}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">En proceso</p></div>
        </div>
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-emerald-50 text-emerald-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.completed}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completados</p></div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input id="admin-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por ID, archivo o usuario..."
            className="ui-input pl-10 pr-4 py-3 text-sm" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {([['all', 'Todos'], ['pending', 'Pendientes'], ['processing', 'En proceso'], ['completed', 'Completados']] as const).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`ui-btn px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${filter === f ? 'ui-btn-primary text-white' : 'ui-btn-secondary text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Success toast */}
      {uploadSuccess && (
        <div className="ui-toast ui-toast-success mb-4 flex items-center gap-3 px-5 py-4 animate-fade-in-up">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
          </div>
          <div>
            <p className="text-emerald-800 font-bold text-sm">¡Reportes enviados exitosamente!</p>
            <p className="text-emerald-600 text-xs">Ticket {uploadSuccess} — El cliente ya puede descargar sus reportes.</p>
          </div>
        </div>
      )}
      {uploadError && (
        <div className="ui-toast ui-toast-error mb-4 flex items-center gap-3 px-5 py-4 animate-fade-in-up">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01" /></svg>
          </div>
          <p className="text-red-700 text-sm font-bold">{uploadError}</p>
        </div>
      )}

      {/* Tickets list — split into Active and History */}
      {(() => {
        const activeTickets = filtered.filter(t => t.status !== 'completed');
        const historyTickets = filtered.filter(t => t.status === 'completed');
        return (
      <div className="space-y-6">
        {/* Active Tickets Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Tickets Activos</h2>
            <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-full">{activeTickets.length}</span>
          </div>
          <div className="space-y-3">
          {activeTickets.length === 0 && (
            <div className="ui-empty-state py-10">
              <svg className="w-10 h-10 text-slate-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-slate-400 font-medium text-sm">No tienes tickets activos</p>
              <p className="text-xs text-slate-300 mt-1">Los nuevos tickets aparecerán aquí al confirmarlos en Telegram</p>
            </div>
          )}
          {activeTickets.map(ticket => {
          const files = getTicketFiles(ticket.id);
          const aiIsRequired = requiresAiReport(ticket.requestedAnalysis);
          return (
          <div key={ticket.id} className="ui-surface overflow-hidden transition-all hover:shadow-md">
            {/* Ticket row */}
            <div className="p-5 flex items-center gap-4 cursor-pointer" onClick={() => setSelectedTicket(selectedTicket === ticket.id ? null : ticket.id)}>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl flex items-center justify-center text-blue-600 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <code className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{ticket.id}</code>
                  {statusBadge(ticket.status)}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                    ticket.requestedAnalysis === 'plagiarism'
                      ? 'bg-amber-50 border border-amber-200 text-amber-700'
                      : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                  }`}>
                    {ticket.requestedAnalysis === 'plagiarism' ? 'Solo plagio' : 'Plagio + IA'}
                  </span>
                  {ticket.assignedTo && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-bold">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      {ticket.assignedTo}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-medium">{timeAgo(ticket.createdAt)}</span>
                </div>
                <p className="text-sm font-semibold text-slate-700 truncate">{ticket.fileName}</p>
                <p className="text-xs text-slate-400">{ticket.userName} • {formatSize(ticket.fileSize)} • {formatDate(ticket.createdAt)}</p>
              </div>
              <svg className={`w-5 h-5 text-slate-300 transition-transform flex-shrink-0 ${selectedTicket === ticket.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>

            {/* Expanded detail */}
            {selectedTicket === ticket.id && (
              <div className="px-5 pb-5 pt-2 border-t border-slate-100 animate-fade-in-up">
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => handleDownloadOriginal(ticket.id, ticket.fileName)}
                    className="ui-btn ui-btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Descargar original
                  </button>
                </div>

                {ticket.status === 'completed' ? (
                  <div className="ui-toast ui-toast-success p-4 text-center">
                    <svg className="w-8 h-8 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="font-bold text-emerald-700">Reportes ya enviados</p>
                    <p className="text-xs text-emerald-500 mt-1">Completado: {ticket.completedAt ? formatDate(ticket.completedAt) : ''}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-slate-700">Subir reportes de Turnitin:</p>
                    <p className="text-xs text-slate-400">
                      Requisito del ticket: {aiIsRequired ? 'reporte de plagio + reporte de IA.' : 'solo reporte de plagio.'}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Plagiarism PDF */}
                      <label className={`ui-upload-tile relative flex flex-col items-center gap-2 p-4 ${files.plagiarism ? 'border-blue-400 bg-blue-50/50' : ''}`}>
                        <input type="file" accept=".pdf" className="hidden" onChange={e => setTicketFile(ticket.id, 'plagiarism', e.target.files?.[0] || null)} />
                        <svg className={`w-8 h-8 ${files.plagiarism ? 'text-blue-500' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-xs font-bold text-slate-500">Reporte de Plagio (Similitud)</span>
                        {files.plagiarism && <span className="text-[10px] text-blue-500 font-medium truncate max-w-full">✓ {files.plagiarism.name}</span>}
                      </label>
                      {/* AI PDF */}
                      <label className={`ui-upload-tile relative flex flex-col items-center gap-2 p-4 ${files.ai ? 'border-indigo-400 bg-indigo-50/50' : ''}`}>
                        <input type="file" accept=".pdf" className="hidden" onChange={e => setTicketFile(ticket.id, 'ai', e.target.files?.[0] || null)} />
                        <svg className={`w-8 h-8 ${files.ai ? 'text-indigo-500' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        <span className="text-xs font-bold text-slate-500">Reporte de IA Generativa {aiIsRequired ? '' : '(Opcional)'}</span>
                        {files.ai && <span className="text-[10px] text-indigo-500 font-medium truncate max-w-full">✓ {files.ai.name}</span>}
                      </label>
                    </div>
                    <button onClick={() => handleUploadResults(ticket.id)} disabled={!files.plagiarism || (aiIsRequired && !files.ai) || uploading}
                      className="ui-btn ui-btn-primary w-full text-white font-bold py-3 flex items-center justify-center gap-2">
                      {uploading ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Subiendo reportes...</>
                      ) : (
                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Enviar Reportes al Cliente</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
          </div>
        </div>

        {/* History Section */}
        {historyTickets.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 pt-4 border-t border-slate-100">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Historial Completado</h2>
              <span className="text-xs bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded-full">{historyTickets.length}</span>
              <span className="text-[10px] text-slate-400 ml-1">compartido entre admins</span>
            </div>
            <div className="space-y-3">
            {historyTickets.map(ticket => {
              return (
              <div key={ticket.id} className="ui-surface-muted overflow-hidden transition-all hover:shadow-sm opacity-85 hover:opacity-100">
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setSelectedTicket(selectedTicket === ticket.id ? null : ticket.id)}>
                  <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 flex-shrink-0">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <code className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded">{ticket.id}</code>
                      <span className="ui-chip ui-chip-status-completed text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Completado
                      </span>
                      {ticket.assignedTo && (
                        <span className="text-[10px] text-violet-500 font-medium">por {ticket.assignedTo}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-600 truncate">{ticket.fileName}</p>
                    <p className="text-xs text-slate-400">{ticket.userName} • {formatSize(ticket.fileSize)} • {ticket.completedAt ? formatDate(ticket.completedAt) : ''}</p>
                  </div>
                  <svg className={`w-4 h-4 text-slate-300 transition-transform flex-shrink-0 ${selectedTicket === ticket.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
                {selectedTicket === ticket.id && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-50 animate-fade-in-up">
                    <div className="ui-toast ui-toast-success p-3 text-center">
                      <p className="font-bold text-emerald-700 text-sm">Reportes enviados</p>
                      <p className="text-xs text-emerald-500 mt-0.5">{ticket.completedAt ? formatDate(ticket.completedAt) : ''}</p>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
        );
      })()}
    </main>
  );
}
