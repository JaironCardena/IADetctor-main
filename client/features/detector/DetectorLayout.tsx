import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import type { SubscriptionStatus } from '@shared/types/subscription';
import type { RequestedAnalysis } from '@shared/constants/ticketRules';
import { useAuth } from '../auth/AuthContext';
import { DropzoneView } from './DropzoneView';
import { ResultsView } from './ResultsView';
import { TicketProgressRow } from './TicketProgressRow';
import { ExpressDetectorSection } from './ExpressDetectorSection';

const EXPRESS_FEATURE_ENABLED = false;

interface TicketData {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'pending_payment' | 'completed_pending_payment';
  requestedAnalysis: RequestedAnalysis;
  assignedTo: string | null;
  plagiarismPdfPath?: string | null;
  aiPdfPath?: string | null;
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const fetchTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
      }
    } catch {
      // noop
    } finally {
      setLoadingTickets(false);
    }
  }, [token]);

  const fetchSubscriptionStatus = useCallback(async () => {
    if (!token || user?.role !== 'user') return;
    try {
      const res = await fetch('/api/subscription/status', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setSubscriptionStatus(await res.json());
      }
    } catch {
      // noop
    }
  }, [token, user?.role]);

  useEffect(() => {
    fetchTickets();
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus, fetchTickets]);

  useEffect(() => {
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socket.on('ticket_updated', () => { fetchTickets(); fetchSubscriptionStatus(); });
    socket.on('ticket_created', () => { fetchTickets(); fetchSubscriptionStatus(); });
    socket.on('payment_approved', () => { fetchSubscriptionStatus(); });
    socket.on('subscription_or_credit_updated', () => { fetchSubscriptionStatus(); });
    return () => { socket.disconnect(); };
  }, [fetchSubscriptionStatus, fetchTickets]);

  const handleDownload = async (ticketId: string, type: 'plagiarism' | 'ai' | 'humanizer') => {
    if (!token) return;
    const key = `${ticketId}-${type}`;
    setDownloadingId(key);

    try {
      const res = await fetch(`/api/download/${ticketId}/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        alert('El reporte aun no esta disponible. Espera a que el administrador lo suba.');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        type === 'humanizer'
          ? `Texto_Humanizado_${ticketId}.docx`
          : type === 'plagiarism'
            ? `Reporte_Similitud_${ticketId}.pdf`
            : `Reporte_IA_${ticketId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar el reporte.');
    } finally {
      setDownloadingId(null);
    }
  };

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
        if (data.subscription) {
          setSubscriptionStatus(data.subscription);
        }
        await fetchTickets();
        await fetchSubscriptionStatus();
        await refreshSubscription();
        setShowDropzone(false);
        setUploadSuccess(file.name);
        setTimeout(() => setUploadSuccess(null), 4000);
        return;
      }

      const data = await res.json();
      if (res.status === 402 || data.requiresSubscription || data.limitReached) {
        setShowDropzone(false);
        if (data.subscription) {
          setSubscriptionStatus(data.subscription);
        }

        if (data.limitReached) {
          setUploadError(data.error || 'Llegaste al limite de documentos de tu suscripcion.');
        } else if (EXPRESS_FEATURE_ENABLED) {
          setShowPayment(true);
        } else {
          setUploadError(data.error || 'Necesitas una suscripcion activa para subir documentos.');
        }
        return;
      }

      setUploadError(data.error || 'Error al subir el archivo');
    } catch {
      setUploadError('Error de conexion con el servidor');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const analysisLabel = (analysis: RequestedAnalysis) => {
    switch (analysis) {
      case 'plagiarism':
        return 'Reporte de plagio';
      case 'ai':
        return 'Reporte de IA';
      case 'humanizer':
        return 'Humanizador';
      default:
        return 'Reporte completo';
    }
  };

  const openUploadFlow = () => {
    if (user?.role === 'user' && !canUploadWithCredits) {
      if (EXPRESS_FEATURE_ENABLED) {
        setShowPayment(true);
      } else {
        window.location.hash = '#/pricing';
      }
      return;
    }

    if (detectorLimitReached) {
      setUploadError('Llegaste al limite de documentos de tu suscripcion. Renueva o cambia de plan para seguir subiendo archivos.');
      return;
    }

    setShowDropzone(true);
  };

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

  const statusConfig: Record<TicketData['status'], { label: string; color: string; bg: string; border: string }> = {
    pending: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    processing: { label: 'En proceso', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    completed: { label: 'Completado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    pending_payment: { label: 'Pago en revision', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    completed_pending_payment: { label: 'Pago en revision', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  };

  const detectorLimit = subscriptionStatus?.detectorLimit ?? null;
  const detectorUsed = subscriptionStatus?.detectorUsed ?? 0;
  const detectorRemaining = subscriptionStatus?.detectorRemaining ?? null;
  const expressCredits = subscriptionStatus?.expressDetectorCreditsByType || { plagiarism: 0, ai: 0, both: 0 };
  const hasExpressCredits = EXPRESS_FEATURE_ENABLED && (expressCredits.plagiarism + expressCredits.ai + expressCredits.both) > 0;
  const canUploadWithCredits = Boolean(hasActiveSubscription || hasExpressCredits || user?.role === 'admin');
  const detectorPercent = detectorLimit && detectorLimit > 0 ? Math.min(100, (detectorUsed / detectorLimit) * 100) : 0;
  const detectorLimitReached = user?.role === 'user' && hasActiveSubscription && detectorRemaining !== null && detectorRemaining <= 0 && !hasExpressCredits;

  const filtered = tickets.filter((ticket) => {
    if (filter === 'pending' && ticket.status === 'completed') return false;
    if (filter === 'completed' && ticket.status !== 'completed') return false;
    if (!search) return true;

    const query = search.toLowerCase();
    return ticket.fileName.toLowerCase().includes(query) || ticket.id.toLowerCase().includes(query);
  });

  return (
    <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto p-4 md:p-8">
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
        <span>Inicio</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-semibold">Detector de IA y plagio</span>
      </div>

      <div className="ui-section-header">
        <div>
          <h1 className="ui-title-lg">Mis documentos</h1>
          <p className="ui-subtitle mt-1">
            Revisa el estado de cada documento y descarga tus reportes cuando esten listos.
          </p>
        </div>
        <button
          id="upload-document-btn"
          onClick={openUploadFlow}
          disabled={detectorLimitReached}
          className="ui-btn ui-btn-primary text-sm px-5 py-3"
        >
          <UploadCloud className="w-4 h-4" />
          Cargar documento
        </button>
      </div>

      {EXPRESS_FEATURE_ENABLED && showPayment && (
        <ExpressDetectorSection onCancel={() => setShowPayment(false)} />
      )}

      {EXPRESS_FEATURE_ENABLED && user?.role === 'user' && hasExpressCredits && (
        <div className="ui-surface-elevated p-5 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-700">Creditos Express disponibles</h2>
              <p className="text-xs text-slate-400 mt-1">
                Plagio: {expressCredits.plagiarism} · IA: {expressCredits.ai} · Completo: {expressCredits.both}
              </p>
            </div>
            <button onClick={() => setShowDropzone(true)} className="ui-btn ui-btn-primary px-4 py-2.5 text-xs font-bold text-white">
              Usar credito
            </button>
          </div>
        </div>
      )}

      {user?.role === 'user' && hasActiveSubscription && subscriptionStatus?.active && (
        <div className="ui-surface-elevated p-5 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="ui-chip bg-blue-50 border border-blue-100 text-blue-700">
                  Plan {subscriptionStatus.planType === 'basic' ? 'Basico' : subscriptionStatus.planType === 'pro' ? 'Estandar' : 'Premium'}
                </span>
                <span className="text-xs font-semibold text-slate-400">{subscriptionStatus.daysRemaining} dias restantes</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700">Cupo de documentos</h2>
              <p className="text-xs text-slate-400 mt-1">
                {detectorLimit === null ? 'Cupo ilimitado' : `${detectorUsed} de ${detectorLimit} usados · te quedan ${detectorRemaining ?? 0}`}
              </p>
            </div>
            <button
              onClick={() => { window.location.hash = '#/pricing'; }}
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

      {tickets.length > 0 && (
        <div className="ui-surface-elevated p-4 mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                id="user-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o codigo"
                className="ui-input pl-10 pr-4 py-2.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              {([
                ['all', 'Todos'],
                ['pending', 'En curso'],
                ['completed', 'Listos'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`ui-btn px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === value ? 'ui-btn-primary text-white' : 'ui-btn-secondary text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {uploadSuccess && (
        <div className="ui-toast ui-toast-success mb-4 flex items-center gap-3 px-5 py-3.5">
          <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-emerald-800 font-bold text-sm">Documento enviado exitosamente</p>
            <p className="text-emerald-600 text-xs">{uploadSuccess} · Recibiras tus reportes cuando esten listos.</p>
          </div>
          <button onClick={() => setUploadSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadError && (
        <div className="ui-toast ui-toast-error mb-4 flex items-center gap-2 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-600 text-sm font-semibold">{uploadError}</p>
          <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showDropzone && (
        <div className="ui-modal-overlay" onClick={() => !uploading && setShowDropzone(false)}>
          <div className="w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="ui-modal-shell p-6 md:p-8 relative">
              <button
                onClick={() => !uploading && setShowDropzone(false)}
                disabled={uploading}
                className="ui-btn ui-btn-ghost absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
              <h2 className="ui-title-md mb-1">Cargar documento</h2>
              <p className="ui-subtitle mb-6">Sube un archivo para analisis de IA y plagio</p>

              {uploading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                  <p className="text-sm text-slate-500 font-medium">Subiendo documento...</p>
                </div>
              ) : (
                <DropzoneView onFileAccepted={handleFileAccepted} />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="ui-table-shell">
        {loadingTickets ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="ui-empty-state flex flex-col items-center justify-center py-20 px-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center text-blue-400 mb-6">
              <FileText className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">
              {tickets.length === 0 ? 'No tienes documentos aun' : 'Sin resultados'}
            </h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm text-center">
              {tickets.length === 0
                ? 'Sube tu primer documento para iniciar el analisis.'
                : 'No hay documentos que coincidan con tu busqueda actual.'}
            </p>
            {tickets.length === 0 && (
              <button
                onClick={openUploadFlow}
                disabled={detectorLimitReached}
                className="ui-btn ui-btn-primary text-sm px-6 py-3"
              >
                <UploadCloud className="w-4 h-4" />
                Subir primer documento
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((ticket) => {
              const status = statusConfig[ticket.status];
              const canDownload = ticket.status === 'completed';
              const hasPlagiarismReport = Boolean(ticket.plagiarismPdfPath) || ticket.requestedAnalysis !== 'ai';
              const hasAiReport = Boolean(ticket.aiPdfPath) || ticket.requestedAnalysis === 'both' || ticket.requestedAnalysis === 'ai';
              return (
                <div key={ticket.id}>
                  <div className="px-5 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{ticket.fileName}</p>
                          <p className="text-xs text-slate-400 mt-1">{ticket.id} · {formatSize(ticket.fileSize)} · {formatDate(ticket.createdAt)}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${status.bg} ${status.color} ${status.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${ticket.status === 'completed' ? 'bg-emerald-500' : ticket.status === 'processing' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                              {status.label}
                            </span>
                            <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                              {analysisLabel(ticket.requestedAnalysis)}
                            </span>
                            {ticket.assignedTo && ticket.status !== 'completed' && (
                              <span className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500">
                                Admin: {ticket.assignedTo}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {ticket.requestedAnalysis === 'humanizer' ? (
                          <button
                            id={`view-humanizer-${ticket.id}`}
                            onClick={() => handleDownload(ticket.id, 'humanizer')}
                            disabled={!canDownload || downloadingId === `${ticket.id}-humanizer`}
                            className={`ui-btn text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${canDownload ? 'ui-btn-secondary text-blue-600 hover:text-blue-800 cursor-pointer' : 'text-slate-300 cursor-not-allowed'}`}
                          >
                            {downloadingId === `${ticket.id}-humanizer` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Descargar resultado
                          </button>
                        ) : (
                          <>
                            {hasPlagiarismReport && (
                              <button
                                id={`view-similarity-${ticket.id}`}
                                onClick={() => handleDownload(ticket.id, 'plagiarism')}
                                disabled={!canDownload || downloadingId === `${ticket.id}-plagiarism`}
                                className={`ui-btn text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${canDownload ? 'ui-btn-secondary text-blue-600 hover:text-blue-800 cursor-pointer' : 'text-slate-300 cursor-not-allowed'}`}
                              >
                                {downloadingId === `${ticket.id}-plagiarism` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Plagio
                              </button>
                            )}
                            {hasAiReport && (
                              <button
                                id={`view-ai-${ticket.id}`}
                                onClick={() => handleDownload(ticket.id, 'ai')}
                                disabled={!canDownload || downloadingId === `${ticket.id}-ai`}
                                className={`ui-btn text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${canDownload ? 'ui-btn-secondary text-indigo-600 hover:text-indigo-800 cursor-pointer' : 'text-slate-300 cursor-not-allowed'}`}
                              >
                                {downloadingId === `${ticket.id}-ai` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                IA
                              </button>
                            )}
                          </>
                        )}
                        <button
                          id={`details-${ticket.id}`}
                          onClick={() => setSelectedTicket({ id: ticket.id, fileName: ticket.fileName })}
                          className="ui-btn ui-btn-ghost px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500"
                        >
                          Ver detalle
                        </button>
                      </div>
                    </div>
                  </div>
                  <TicketProgressRow
                    ticketId={ticket.id}
                    createdAt={ticket.createdAt}
                    status={ticket.status}
                    assignedTo={ticket.assignedTo}
                    token={token}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
