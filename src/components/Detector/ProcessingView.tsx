import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';

interface ProcessingViewProps {
  file: File;
  ticketId: string | null;
  onComplete: () => void;
  onCancel: () => void;
}

const STAGES = [
  { id: 'upload', label: 'Enviando a servidores seguros', description: 'Cifrando documento con AES-256 y transfiriendo a la infraestructura de análisis.', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12', startMin: 0, endMin: 3, color: 'blue' },
  { id: 'turnitin', label: 'Analizando similitudes en Turnitin', description: 'Comparando contra bases de datos académicas globales, repositorios y publicaciones indexadas.', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', startMin: 3, endMin: 8, color: 'indigo' },
  { id: 'ai', label: 'Procesando detección de IA', description: 'Ejecutando modelos de aprendizaje profundo para identificar patrones de generación de IA.', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', startMin: 8, endMin: 13, color: 'violet' },
  { id: 'report', label: 'Generando reportes de salida', description: 'Compilando resultados de plagio e IA en formato PDF de alta resolución.', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', startMin: 13, endMin: 15, color: 'emerald' },
];

const TOTAL_SECONDS = 15 * 60;

export function ProcessingView({ file, ticketId, onComplete, onCancel }: ProcessingViewProps) {
  const [elapsed, setElapsed] = useState(0);
  const [showDevPanel, setShowDevPanel] = useState(false);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev >= TOTAL_SECONDS ? TOTAL_SECONDS : prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Socket.IO — listen for ticket completion
  useEffect(() => {
    if (!ticketId) return;
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socket.on('ticket_updated', (data: { ticketId: string; status: string }) => {
      if (data.ticketId === ticketId && data.status === 'completed') {
        onComplete();
      }
    });
    return () => { socket.disconnect(); };
  }, [ticketId, onComplete]);

  // Prevent closing
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const timeRemaining = Math.max(0, TOTAL_SECONDS - elapsed);
  const elapsedMinutes = elapsed / 60;
  const overallProgress = Math.min((elapsed / TOTAL_SECONDS) * 100, 95);

  const activeStageIndex = useMemo(() => {
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (elapsedMinutes >= STAGES[i].startMin) return i;
    }
    return 0;
  }, [elapsedMinutes]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getStageProgress = (stage: typeof STAGES[0]) => {
    if (elapsedMinutes >= stage.endMin) return 100;
    if (elapsedMinutes < stage.startMin) return 0;
    return ((elapsedMinutes - stage.startMin) / (stage.endMin - stage.startMin)) * 100;
  };

  const colorMap: Record<string, { bg: string; text: string; border: string; progressBg: string; glow: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', progressBg: 'bg-blue-500', glow: 'shadow-blue-500/20' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', progressBg: 'bg-indigo-500', glow: 'shadow-indigo-500/20' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', progressBg: 'bg-violet-500', glow: 'shadow-violet-500/20' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', progressBg: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 w-full animate-fade-in-up">
      {/* Main card */}
      <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-slate-200/50 border border-white/60 p-6 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 animate-gradient" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-100/30 to-indigo-100/30 rounded-full -mr-20 -mt-20 blur-xl" />

        <div className="relative z-10">
          {/* File info & timer header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="absolute left-2 right-2 h-0.5 bg-blue-400/60 rounded-full animate-scan" style={{ top: '30%' }} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-800 leading-tight truncate max-w-[200px] md:max-w-xs">{file.name}</h3>
                <p className="text-sm text-slate-400 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB • Procesando</p>
                {ticketId && (
                  <div className="mt-1 inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Ticket:</span>
                    <code className="text-[11px] font-mono font-bold text-blue-700">{ticketId}</code>
                  </div>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                <span className="text-3xl font-mono font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tighter">{formatTime(timeRemaining)}</span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Restante</p>
              </div>
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-sm mb-2 font-semibold">
              <span className="text-slate-500">Progreso general</span>
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent font-bold">{Math.floor(overallProgress)}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative">
              <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-full transition-all duration-1000 ease-linear animate-progress-glow" style={{ width: `${overallProgress}%` }}>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 animate-shimmer" />
              </div>
            </div>
          </div>

          {/* Processing stages */}
          <div className="space-y-3">
            {STAGES.map((stage, index) => {
              const stageProgress = getStageProgress(stage);
              const isActive = index === activeStageIndex && stageProgress > 0 && stageProgress < 100;
              const isCompleted = stageProgress >= 100;
              const colors = colorMap[stage.color];
              return (
                <div key={stage.id} id={`stage-${stage.id}`} className={`rounded-2xl border p-4 transition-all duration-500 ${isActive ? `${colors.bg} ${colors.border} shadow-lg ${colors.glow}` : isCompleted ? 'bg-slate-50/50 border-slate-100' : 'bg-slate-50/30 border-slate-100/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isCompleted ? 'bg-emerald-100 text-emerald-600' : isActive ? `${colors.bg} ${colors.text}` : 'bg-slate-100 text-slate-300'}`}>
                      {isCompleted ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" className="animate-check" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={stage.icon} /></svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`font-bold text-sm transition-colors ${isCompleted ? 'text-slate-500' : isActive ? 'text-slate-800' : 'text-slate-300'}`}>{stage.label}</h4>
                        {isActive && <span className={`text-xs font-bold ${colors.text}`}>{Math.floor(stageProgress)}%</span>}
                        {isCompleted && <span className="text-xs font-bold text-emerald-500">✓ Listo</span>}
                      </div>
                      {isActive && <p className="text-xs text-slate-400 mt-1 animate-fade-in-up">{stage.description}</p>}
                      {isActive && (
                        <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden mt-2">
                          <div className={`h-full ${colors.progressBg} rounded-full transition-all duration-1000 ease-linear`} style={{ width: `${stageProgress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom bar */}
          <div className="mt-8 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-6">
            <div className="flex gap-3 items-center">
              <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="font-medium">Conexión segura</span></div>
              <span className="text-slate-200">•</span>
              <span className="font-medium">AES-256</span>
            </div>
            <button id="cancel-analysis-btn" onClick={onCancel} className="hover:text-red-500 transition-colors font-semibold hover:bg-red-50 px-3 py-1.5 rounded-lg">Cancelar análisis</button>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="mt-6 flex items-center gap-3 px-5 py-3 bg-amber-50/80 border border-amber-100 rounded-2xl text-amber-700 text-sm font-medium max-w-2xl w-full">
        <svg className="w-5 h-5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
        <span>No cierres esta pestaña. Tus resultados se mostrarán automáticamente al finalizar.</span>
      </div>

      {/* Activity indicator */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="w-0.5 bg-blue-400 rounded-full animate-wave" style={{ height: '16px', animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <span className="text-xs text-slate-400 font-medium">Procesamiento activo</span>
      </div>

      {/* Dev tools */}
      <button id="dev-simulate-complete" onClick={() => setShowDevPanel(!showDevPanel)} className="mt-6 text-[10px] text-slate-300 hover:text-slate-500 transition-colors">[Dev Tools]</button>
      {showDevPanel && (
        <div className="mt-2 bg-slate-800 text-white rounded-xl p-4 max-w-sm w-full animate-fade-in-up">
          <p className="text-xs font-mono text-slate-400 mb-3">Panel de desarrollo</p>
          <div className="flex gap-2">
            <button onClick={onComplete} className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 transition-colors">→ Completar ahora</button>
            <button onClick={onCancel} className="px-3 py-2 bg-red-600/20 text-red-300 rounded-lg text-xs font-bold hover:bg-red-600/30 transition-colors">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
