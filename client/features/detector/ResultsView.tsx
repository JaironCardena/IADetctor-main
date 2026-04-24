import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { RequestedAnalysis } from '@shared/constants/ticketRules';

interface ResultsViewProps {
  fileName: string;
  ticketId: string | null;
  onReset: () => void;
}

type ViewMode = 'cards' | 'plagiarism-pdf' | 'ai-pdf';

export function ResultsView({ fileName, ticketId, onReset }: ResultsViewProps) {
  const { token } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showConfetti, setShowConfetti] = useState(true);
  const [ticketStatus, setTicketStatus] = useState<'pending' | 'processing' | 'completed'>('pending');
  const [requestedAnalysis, setRequestedAnalysis] = useState<RequestedAnalysis>('both');
  const [hasPlagiarismReport, setHasPlagiarismReport] = useState(true);
  const [hasAiReport, setHasAiReport] = useState(true);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Check if results are available
  useEffect(() => {
    if (!ticketId || !token) return;
    const check = async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setTicketStatus(data.ticket.status === 'completed' ? 'completed' : data.ticket.status === 'processing' ? 'processing' : 'pending');
          setRequestedAnalysis(data.ticket.requestedAnalysis);
          setHasPlagiarismReport(Boolean(data.ticket.plagiarismPdfPath) || data.ticket.requestedAnalysis !== 'ai');
          setHasAiReport(Boolean(data.ticket.aiPdfPath) || data.ticket.requestedAnalysis === 'both' || data.ticket.requestedAnalysis === 'ai');
        }
      } catch {}
    };
    check();
    const i = setInterval(check, 5000);
    return () => clearInterval(i);
  }, [ticketId, token]);

  const handleDownload = async (type: 'plagiarism' | 'ai') => {
    if (!ticketId || !token) return;
    setDownloadError(null);
    try {
      const res = await fetch(`/api/download/${ticketId}/${type}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'plagiarism' ? `Reporte_Plagio_${ticketId}.pdf` : `Reporte_IA_${ticketId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json().catch(() => ({}));
        setDownloadError(data.error || 'No se pudo descargar el reporte.');
      }
    } catch { setDownloadError('Error de conexión al descargar el reporte.'); }
  };

  if (viewMode === 'plagiarism-pdf' || viewMode === 'ai-pdf') {
    const isPlagiarism = viewMode === 'plagiarism-pdf';
    return (
      <div className="flex-1 flex flex-col items-center w-full p-4 md:p-8 ">
        <div className="w-full max-w-4xl mb-4">
          <div className="ui-surface flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <button id="back-to-results" onClick={() => setViewMode('cards')} className="ui-btn ui-btn-secondary w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h2 className="font-bold text-slate-800">{isPlagiarism ? 'Reporte de Similitud (Turnitin)' : 'Reporte de IA Generativa'}</h2>
                <p className="text-xs text-slate-400">{fileName} {ticketId && `• ${ticketId}`}</p>
              </div>
            </div>
            <button id={`download-${isPlagiarism ? 'plagiarism' : 'ai'}-report`} onClick={() => handleDownload(isPlagiarism ? 'plagiarism' : 'ai')} disabled={ticketStatus !== 'completed'}
              className="ui-btn ui-btn-primary flex items-center gap-2 text-white font-semibold text-sm px-5 py-2.5 disabled:opacity-40">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Descargar PDF
            </button>
          </div>
        </div>

        <div className="w-full max-w-4xl flex-1 min-h-[600px] pdf-viewer-container rounded-2xl overflow-hidden">
          <div className="w-full h-full min-h-[600px] ui-surface flex flex-col items-center justify-center gap-6 p-8">
            {ticketStatus === 'completed' ? (
              <div className="text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isPlagiarism ? 'bg-blue-50 text-blue-500' : 'bg-indigo-50 text-indigo-500'}`}>
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">Reporte disponible</h3>
                <p className="text-sm text-slate-400">Haz clic en "Descargar PDF" para obtener tu reporte completo.</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 " fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">Reporte en proceso</h3>
                <p className="text-sm text-slate-400">El administrador está procesando tu documento. Se actualizará automáticamente.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-12 w-full  relative">
      {/* Confetti */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="absolute w-2 h-2 rounded-full" style={{ left: '50%', top: '30%', backgroundColor: ['#3b82f6', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'][i % 6], animation: `particle-float ${1.5 + Math.random()}s ease-out forwards`, animationDelay: `${i * 0.05}s`, '--x': `${(Math.random() - 0.5) * 300}px`, '--y': `${(Math.random() - 0.5) * 300}px` } as React.CSSProperties} />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="w-full max-w-3xl text-center mb-10 relative z-10">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-1.5 rounded-full mb-6">
          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Análisis completado</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-3 tracking-tight">
          Tus resultados están{' '}
          <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">listos</span>
        </h1>
        <p className="text-slate-400 font-medium">
          Descarga o visualiza los reportes de plagio e IA generativa para <span className="text-slate-600 font-semibold">{fileName}</span>
        </p>
        {ticketId && (
          <div className="mt-3 inline-flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-1.5 rounded-full">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket:</span>
            <code className="text-sm font-mono font-bold text-blue-600">{ticketId}</code>
          </div>
        )}
        <div className="w-full max-w-md mx-auto mt-6">
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-400 to-teal-400 h-full rounded-full w-full transition-all duration-1000" />
          </div>
          <p className="text-xs text-emerald-500 font-bold text-right mt-1">100% Finalizado</p>
        </div>
      </div>

      {/* Report cards */}
      {downloadError && (
        <div className="ui-toast ui-toast-error mb-5 max-w-3xl w-full text-sm font-semibold relative z-10">{downloadError}</div>
      )}

      <div className={`w-full max-w-4xl grid grid-cols-1 ${hasPlagiarismReport && hasAiReport ? 'md:grid-cols-2' : ''} gap-6 mb-10 relative z-10`}>
        {/* Turnitin card */}
        {hasPlagiarismReport && (
        <div className="ui-surface-elevated p-8 flex flex-col items-center text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
          <div className="relative mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            {ticketStatus === 'completed' && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              </div>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Reporte de Similitud</h2>
          <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-3">Turnitin® Verified</p>
          <p className="text-sm text-slate-400 mb-6 flex-grow">Análisis exhaustivo contra bases de datos académicas globales e internet.</p>
          <div className="w-full space-y-2">
            <button id="view-plagiarism-report" onClick={() => setViewMode('plagiarism-pdf')}
              className="ui-btn ui-btn-secondary w-full text-blue-600 font-semibold py-3 px-6 flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Visualizar
            </button>
            <button id="download-plagiarism-pdf" onClick={() => handleDownload('plagiarism')} disabled={ticketStatus !== 'completed'}
              className="ui-btn ui-btn-primary w-full text-white font-semibold py-3 px-6 flex items-center justify-center gap-2 disabled:opacity-40">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {ticketStatus === 'completed' ? 'Descargar PDF' : 'Esperando reporte...'}
            </button>
          </div>
        </div>
        )}

        {/* AI card */}
        {hasAiReport && (
        <div className="ui-surface-elevated p-8 flex flex-col items-center text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
          <div className="relative mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-50 to-violet-100 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </div>
            {ticketStatus === 'completed' && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              </div>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Reporte de IA Generativa</h2>
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-3">Deep Learning Analysis</p>
          <p className="text-sm text-slate-400 mb-6 flex-grow">Evaluación detallada de probabilidad de texto generado por modelos GPT, Claude, Gemini.</p>
          <div className="w-full space-y-2">
            <button id="view-ai-report" onClick={() => setViewMode('ai-pdf')}
              className="ui-btn ui-btn-secondary w-full text-indigo-600 font-semibold py-3 px-6 flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Visualizar
            </button>
            <button id="download-ai-pdf" onClick={() => handleDownload('ai')} disabled={ticketStatus !== 'completed'}
              className="ui-btn ui-btn-primary w-full text-white font-semibold py-3 px-6 flex items-center justify-center gap-2 disabled:opacity-40">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {ticketStatus === 'completed' ? 'Descargar PDF' : 'Esperando reporte...'}
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Trust badges */}
      <div className="w-full max-w-3xl flex flex-wrap justify-center gap-6 pt-8 border-t border-slate-100/60 relative z-10">
        {[
          { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Privacidad Institucional', color: 'text-emerald-500' },
          { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Cifrado End-to-End', color: 'text-blue-500' },
          { icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', label: 'Auto-eliminación 48h', color: 'text-violet-500' },
        ].map(({ icon, label, color }) => (
          <div key={label} className="flex items-center gap-2 text-slate-500">
            <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} /></svg>
            <span className="text-sm font-medium">{label}</span>
          </div>
        ))}
      </div>
      
      <button id="analyze-another-btn" onClick={onReset} className="ui-btn ui-btn-ghost mt-10 px-6 py-2.5 text-blue-600 rounded-xl font-semibold relative z-10 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        Volver a mis documentos
      </button>
    </div>
  );
}
