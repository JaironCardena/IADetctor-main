import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { DropzoneView } from './DropzoneView';
import { ResultsView } from './ResultsView';
import { TicketProgressRow } from './TicketProgressRow';
import { PaymentModal } from '../subscription/PaymentModal';
import { io } from 'socket.io-client';
import type { SubscriptionStatus } from '@shared/types/subscription';

interface TicketData {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed';
  requestedAnalysis: 'plagiarism' | 'both';
  assignedTo: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function DetectorLayout() {
  const { token, user, hasActiveSubscription, refreshSubscription } = useAuth();
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [showDropzone, setShowDropzone] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<{ id: string; fileName: string } | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'processing' | 'completed'>('all');

  // Download a report PDF
  const handleDownload = async (ticketId: string, type: 'plagiarism' | 'ai') => {
    if (!token) return;
    const key = `${ticketId}-${type}`;
    setDownloadingId(key);
    try {
      const res = await fetch(`/api/download/${ticketId}/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'plagiarism'
          ? `Reporte_Similitud_${ticketId}.pdf`
          : `Reporte_IA_${ticketId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('El reporte aún no está disponible. Espera a que el administrador lo suba.');
      }
    } catch {
      alert('Error al descargar el reporte.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Fetch user tickets
  const fetchTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
      }
    } catch {} finally {
      setLoadingTickets(false);
    }
  }, [token]);

  const fetchSubscriptionStatus = useCallback(async () => {
    if (!token || user?.role !== 'user') return;
    try {
      const res = await fetch('/api/subscription/status', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSubscriptionStatus(await res.json());
    } catch {}
  }, [token, user?.role]);

  useEffect(() => {
    fetchTickets();
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus, fetchTickets]);

  // Socket.IO — listen for ticket updates
  useEffect(() => {
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socket.on('ticket_updated', () => { fetchTickets(); fetchSubscriptionStatus(); });
    socket.on('ticket_created', () => { fetchTickets(); fetchSubscriptionStatus(); });
    socket.on('payment_approved', () => { fetchSubscriptionStatus(); });
    return () => { socket.disconnect(); };
  }, [fetchSubscriptionStatus, fetchTickets]);

  const handleFileAccepted = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.subscription) setSubscriptionStatus(data.subscription);
        await fetchTickets();
        await fetchSubscriptionStatus();
        await refreshSubscription();
        setShowDropzone(false);
        setUploadSuccess(file.name);
        setTimeout(() => setUploadSuccess(null), 4000);
      } else {
        const data = await res.json();
        if (res.status === 402 || data.requiresSubscription || data.limitReached) {
          setShowDropzone(false);
          if (data.subscription) setSubscriptionStatus(data.subscription);
          if (data.limitReached) {
            setUploadError(data.error || 'Llegaste al limite de documentos de tu suscripcion.');
          } else {
            setShowPayment(true);
          }
        } else {
          setUploadError(data.error || 'Error al subir el archivo');
        }
      }
    } catch {
      setUploadError('Error de conexión con el servidor');
    } finally {
      setUploading(false);
    }
  };

  // If viewing results for a specific ticket
  if (selectedTicket) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto p-4 md:p-8">
        <ResultsView
          fileName={selectedTicket.fileName}
          ticketId={selectedTicket.id}
          onReset={() => setSelectedTicket(null)}
        />
      </main>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    processing: { label: 'En proceso', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    completed: { label: 'Completado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'text-red-500';
    if (ext === 'doc' || ext === 'docx') return 'text-blue-500';
    return 'text-slate-400';
  };

  // Stats and filtering
  const stats = {
    total: tickets.length,
    pending: tickets.filter(t => t.status === 'pending' || t.status === 'processing').length,
    completed: tickets.filter(t => t.status === 'completed').length,
  };

  const filtered = tickets.filter(t => {
    if (filter === 'pending' && t.status === 'completed') return false;
    if (filter === 'processing' && t.status !== 'processing') return false;
    if (filter === 'completed' && t.status !== 'completed') return false;
    if (search) {
      const q = search.toLowerCase();
      return t.fileName.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
    }
    return true;
  });

  const detectorLimit = subscriptionStatus?.detectorLimit ?? null;
  const detectorUsed = subscriptionStatus?.detectorUsed ?? 0;
  const detectorRemaining = subscriptionStatus?.detectorRemaining ?? null;
  const detectorPercent = detectorLimit && detectorLimit > 0 ? Math.min(100, (detectorUsed / detectorLimit) * 100) : 0;
  const detectorLimitReached = user?.role === 'user' && hasActiveSubscription && detectorRemaining !== null && detectorRemaining <= 0;

  return (
    <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto p-4 md:p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-2 animate-fade-in-up">
        <span>Inicio</span>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
        <span className="text-slate-700 font-semibold">Detector de IA y Plagio</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        <div>
          <h1 className="ui-title-lg text-2xl md:text-3xl">
            Mis Documentos
          </h1>
          <p className="ui-subtitle mt-1">
            {tickets.length} documento{tickets.length !== 1 ? 's' : ''} enviado{tickets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          id="upload-document-btn"
          onClick={() => {
            if (user?.role === 'user' && !hasActiveSubscription) {
              setShowPayment(true);
            } else if (detectorLimitReached) {
              setUploadError('Llegaste al limite de documentos de tu suscripcion. Renueva o cambia de plan para seguir subiendo archivos.');
            } else {
              setShowDropzone(true);
            }
          }}
          disabled={detectorLimitReached}
          className="ui-btn ui-btn-primary flex items-center gap-2 text-white font-semibold text-sm px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Cargar Documento
        </button>
      </div>

      {user?.role === 'user' && hasActiveSubscription && subscriptionStatus?.active && (
        <div className="ui-surface-elevated p-5 mb-6 animate-fade-in-up" style={{ animationDelay: '0.11s' }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="ui-chip bg-blue-50 border border-blue-100 text-blue-700">
                  Plan {subscriptionStatus.planType === 'basic' ? 'Basica' : subscriptionStatus.planType === 'pro' ? 'Pro' : 'Pro+'}
                </span>
                <span className="text-xs font-semibold text-slate-400">{subscriptionStatus.daysRemaining} dias restantes</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700">Cupo de documentos</h2>
              <p className="text-xs text-slate-400 mt-1">
                {detectorLimit === null ? 'Cupo ilimitado' : `${detectorUsed} de ${detectorLimit} usados · te quedan ${detectorRemaining ?? 0}`}
              </p>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              className={`ui-btn px-4 py-2.5 text-xs font-bold ${detectorLimitReached ? 'ui-btn-primary text-white' : 'ui-btn-secondary text-slate-600'}`}
            >
              {detectorLimitReached ? 'Renovar plan' : 'Cambiar o renovar'}
            </button>
          </div>
          {detectorLimit !== null && (
            <div className="mt-4 h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${detectorLimitReached ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${detectorPercent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Stats Cards */}
      {tickets.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6 animate-fade-in-up" style={{ animationDelay: '0.12s' }}>
          <div className="ui-stat-card p-4 flex items-center gap-3">
            <div className="ui-icon-wrap w-10 h-10 rounded-lg bg-blue-50 text-blue-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div><p className="text-xl font-extrabold text-slate-800">{stats.total}</p><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total</p></div>
          </div>
          <div className="ui-stat-card p-4 flex items-center gap-3">
            <div className="ui-icon-wrap w-10 h-10 rounded-lg bg-amber-50 text-amber-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div><p className="text-xl font-extrabold text-slate-800">{stats.pending}</p><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">En análisis</p></div>
          </div>
          <div className="ui-stat-card p-4 flex items-center gap-3">
            <div className="ui-icon-wrap w-10 h-10 rounded-lg bg-emerald-50 text-emerald-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div><p className="text-xl font-extrabold text-slate-800">{stats.completed}</p><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Completados</p></div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      {tickets.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-5 animate-fade-in-up" style={{ animationDelay: '0.14s' }}>
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input id="user-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre de archivo..."
              className="ui-input pl-10 pr-4 py-2.5 text-sm" />
          </div>
          <div className="flex gap-2">
            {([['all', 'Todos'], ['pending', 'En análisis'], ['completed', 'Listos']] as const).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`ui-btn px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === f ? 'ui-btn-primary text-white' : 'ui-btn-secondary text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upload Success Toast */}
      {uploadSuccess && (
        <div className="ui-toast ui-toast-success mb-4 flex items-center gap-3 px-5 py-3.5 animate-fade-in-up">
          <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
          </div>
          <div>
            <p className="text-emerald-800 font-bold text-sm">¡Documento enviado exitosamente!</p>
            <p className="text-emerald-600 text-xs">{uploadSuccess} — Recibirás tus reportes en ~15 minutos.</p>
          </div>
          <button onClick={() => setUploadSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Upload Error */}
      {uploadError && (
        <div className="ui-toast ui-toast-error mb-4 flex items-center gap-2 px-4 py-3 animate-fade-in-up">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-600 text-sm font-semibold">{uploadError}</p>
          <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal onClose={() => setShowPayment(false)} />
      )}

      {/* Dropzone Modal Overlay */}
      {showDropzone && (
        <div className="ui-modal-overlay" onClick={() => !uploading && setShowDropzone(false)}>
          <div className="w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="ui-modal-shell p-6 md:p-8 relative">
              {/* Close button */}
              <button
                onClick={() => !uploading && setShowDropzone(false)}
                disabled={uploading}
                className="ui-btn ui-btn-ghost absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <h2 className="ui-title-md mb-1">Cargar Documento</h2>
              <p className="ui-subtitle mb-6">Sube un archivo para análisis de IA y plagio</p>

              {uploading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <p className="text-sm text-slate-500 font-medium">Subiendo documento...</p>
                </div>
              ) : (
                <DropzoneView onFileAccepted={handleFileAccepted} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="ui-table-shell animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        {loadingTickets ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="ui-empty-state flex flex-col items-center justify-center py-20 px-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center text-blue-400 mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">
              {tickets.length === 0 ? 'No tienes documentos aún' : 'Sin resultados'}
            </h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm">
              {tickets.length === 0
                ? 'Sube tu primer documento para obtener un análisis detallado de similitud y detección de IA.'
                : 'No hay documentos que coincidan con tu búsqueda o filtro actual.'}
            </p>
            {tickets.length === 0 && (
              <button
                onClick={() => {
                  if (user?.role === 'user' && !hasActiveSubscription) {
                    setShowPayment(true);
                  } else if (detectorLimitReached) {
                    setUploadError('Llegaste al limite de documentos de tu suscripcion. Renueva o cambia de plan para seguir subiendo archivos.');
                  } else {
                    setShowDropzone(true);
                  }
                }}
                disabled={detectorLimitReached}
                className="ui-btn ui-btn-primary flex items-center gap-2 text-white font-semibold text-sm px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Subir primer documento
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="ui-table-head grid grid-cols-12 gap-4 px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-5">Documento</div>
              <div className="col-span-2 text-center">Estado</div>
              <div className="col-span-2 text-center">Fecha</div>
              <div className="col-span-3 text-right">Acciones</div>
            </div>

            {/* Table rows */}
            {filtered.map((ticket, index) => {
              const status = statusConfig[ticket.status] || statusConfig.pending;
              const iconColor = getFileIcon(ticket.fileName);
              return (
                <React.Fragment key={ticket.id}>
                  <div
                    className="ui-table-row grid grid-cols-12 gap-4 px-6 py-4 items-center group animate-fade-in-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    {/* Document name */}
                    <div className="col-span-5 flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 ${iconColor}`}>
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{ticket.fileName}</p>
                        <p className="text-xs text-slate-400">{formatSize(ticket.fileSize)} • {ticket.id}</p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="col-span-2 flex flex-col items-center justify-center gap-0.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${status.bg} ${status.color} ${status.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ticket.status === 'completed' ? 'bg-emerald-500' : ticket.status === 'processing' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                        {status.label}
                      </span>
                      {ticket.assignedTo && ticket.status !== 'completed' && (
                        <span className="text-[10px] text-violet-500 font-medium mt-0.5">
                          🛡️ {ticket.assignedTo}
                        </span>
                      )}
                    </div>

                    {/* Date */}
                    <div className="col-span-2 text-center text-sm text-slate-500">
                      {formatDate(ticket.createdAt)}
                    </div>

                    {/* Actions */}
                    <div className="col-span-3 flex items-center justify-end gap-2">
                      <button
                        id={`view-similarity-${ticket.id}`}
                        onClick={() => handleDownload(ticket.id, 'plagiarism')}
                        disabled={ticket.status !== 'completed' || downloadingId === `${ticket.id}-plagiarism`}
                        title={ticket.status !== 'completed' ? 'Disponible cuando el análisis esté completado' : 'Descargar reporte de similitud'}
                        className={`ui-btn text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          ticket.status === 'completed'
                            ? 'ui-btn-secondary text-blue-600 hover:text-blue-800 cursor-pointer'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                      >
                        {downloadingId === `${ticket.id}-plagiarism` ? (
                          <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        )}
                        Similitud
                      </button>
                      {ticket.requestedAnalysis !== 'plagiarism' && (
                        <button
                          id={`view-ai-${ticket.id}`}
                          onClick={() => handleDownload(ticket.id, 'ai')}
                          disabled={ticket.status !== 'completed' || downloadingId === `${ticket.id}-ai`}
                          title={ticket.status !== 'completed' ? 'Disponible cuando el análisis esté completado' : 'Descargar reporte de IA'}
                          className={`ui-btn text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            ticket.status === 'completed'
                              ? 'ui-btn-secondary text-indigo-600 hover:text-indigo-800 cursor-pointer'
                              : 'text-slate-300 cursor-not-allowed'
                          }`}
                        >
                          {downloadingId === `${ticket.id}-ai` ? (
                            <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          )}
                          IA
                        </button>
                      )}
                      <button
                        id={`details-${ticket.id}`}
                        onClick={() => setSelectedTicket({ id: ticket.id, fileName: ticket.fileName })}
                        title="Ver detalles"
                        className="ui-btn ui-btn-ghost w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-slate-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* Progress / deletion row */}
                  <TicketProgressRow ticketId={ticket.id} createdAt={ticket.createdAt} status={ticket.status} assignedTo={ticket.assignedTo} token={token} />
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {/* Trust badges */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
        {[
          { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Verificación Turnitin' },
          { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Cifrado AES-256' },
          { icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'Detección GPT/IA' },
        ].map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-slate-400">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
