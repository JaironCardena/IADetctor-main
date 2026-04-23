import React, { useState, useEffect, useMemo } from 'react';

interface TicketProgressRowProps {
  ticketId: string;
  createdAt: string;
  status: 'pending' | 'processing' | 'completed';
  assignedTo?: string | null;
  token?: string | null;
}

const TOTAL_SECONDS = 15 * 60;

const STAGES = [
  { id: 'upload', label: 'Enviando a servidores seguros', startMin: 0, endMin: 3, color: 'bg-blue-500' },
  { id: 'turnitin', label: 'Analizando similitudes (Turnitin)', startMin: 3, endMin: 8, color: 'bg-indigo-500' },
  { id: 'ai', label: 'Detección de IA generativa', startMin: 8, endMin: 13, color: 'bg-violet-500' },
  { id: 'report', label: 'Generando reportes PDF', startMin: 13, endMin: 15, color: 'bg-emerald-500' },
];

export function TicketProgressRow({ ticketId, createdAt, status, assignedTo, token }: TicketProgressRowProps) {
  const [now, setNow] = useState(Date.now());
  const [delayNotified, setDelayNotified] = useState(false);

  useEffect(() => {
    if (status === 'completed') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 1000);
  const isDelayed = elapsed >= TOTAL_SECONDS;
  const elapsedClamped = isDelayed ? TOTAL_SECONDS : elapsed;
  const elapsedMinutes = elapsedClamped / 60;
  const timeRemaining = isDelayed ? 0 : Math.max(0, TOTAL_SECONDS - elapsedClamped);
  const overallProgress = isDelayed ? 99 : Math.min((elapsedClamped / TOTAL_SECONDS) * 100, 95);

  // Send delay email once
  useEffect(() => {
    if (isDelayed && !delayNotified && token && status !== 'completed') {
      setDelayNotified(true);
      fetch(`/api/tickets/${ticketId}/notify-delay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }, [isDelayed, delayNotified, token, ticketId, status]);

  const activeStageIndex = useMemo(() => {
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (elapsedMinutes >= STAGES[i].startMin) return i;
    }
    return 0;
  }, [elapsedMinutes]);

  const activeStage = STAGES[activeStageIndex];

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate deletion countdown (48h from creation)
  const deletionTime = new Date(createdAt).getTime() + 48 * 60 * 60 * 1000;
  const deletionRemaining = Math.max(0, deletionTime - now);
  const deletionHours = Math.floor(deletionRemaining / (1000 * 60 * 60));
  const deletionMins = Math.floor((deletionRemaining % (1000 * 60 * 60)) / (1000 * 60));

  if (status === 'completed') {
    return (
      <div className="col-span-12 px-6 pb-4 -mt-2">
        <div className="bg-slate-50/80 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs font-semibold text-emerald-600">Análisis completado — Reportes listos para descargar</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Se eliminará en <strong className="text-slate-500">{deletionHours}h {deletionMins}m</strong></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-12 px-6 pb-4 -mt-2">
      <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/60 rounded-xl px-4 py-3.5 border border-blue-100/60">
        {/* Progress header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="w-0.5 bg-blue-500 rounded-full animate-wave" style={{ height: '12px', animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-xs font-semibold text-blue-700">{activeStage.label}</span>
            {assignedTo && (
              <span className="text-[10px] text-violet-600 font-medium bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                🛡️ Revisado por {assignedTo}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">
              {Math.floor(overallProgress)}%
            </span>
            <div className="bg-white/80 border border-blue-100 rounded-lg px-2.5 py-1">
              <span className="text-sm font-mono font-bold text-blue-600">{formatTime(timeRemaining)}</span>
              <span className="text-[10px] text-slate-400 ml-1">restante</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-white/80 rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-full transition-all duration-1000 ease-linear relative"
            style={{ width: `${overallProgress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 animate-shimmer" />
          </div>
        </div>

        {/* Stage dots */}
        <div className="flex items-center justify-between mb-2">
          {STAGES.map((stage, i) => {
            const isActive = i === activeStageIndex;
            const isDone = elapsedMinutes >= stage.endMin;
            return (
              <div key={stage.id} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full transition-all ${isDone ? 'bg-emerald-500' : isActive ? `${stage.color} animate-pulse` : 'bg-slate-200'}`} />
                <span className={`text-[10px] font-medium ${isDone ? 'text-emerald-600' : isActive ? 'text-slate-600' : 'text-slate-300'}`}>
                  {stage.label.split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Delay or Deletion warning */}
        {isDelayed ? (
          <div className="mt-2 pt-2 border-t border-amber-200/40">
            <div className="flex items-center gap-2 bg-amber-50/80 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[11px] text-amber-700 font-medium">Demora por alta demanda — Se te notificará por correo cuando esté listo.</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 pt-2 border-t border-blue-100/40">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Tus archivos se eliminarán automáticamente en <strong className="text-slate-500">{deletionHours}h {deletionMins}m</strong> por seguridad</span>
          </div>
        )}
      </div>
    </div>
  );
}
