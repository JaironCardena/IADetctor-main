import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, FileText, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { PlanType } from '@shared/types/subscription';
import type { RequestedAnalysis } from '@shared/constants/ticketRules';
import { getActivePlanLabel } from '../../utils/subscription';
import type { TicketStatus } from '@shared/types/ticket';

interface AccountSummary {
  user: {
    name: string;
    email: string;
  };
  subscription: {
    planType: PlanType | null;
    active: boolean;
    startedAt: string | null;
    expiresAt: string | null;
    daysRemaining: number;
  };
  usage: {
    documentsUploaded: number;
    plagiarismReports: number;
    aiReports: number;
    humanizedWordsThisMonth: number;
    humanizerMonthlyLimit: number | null;
  };
  history: Array<{
    id: string;
    fileName: string;
    uploadedAt: string;
    serviceType: RequestedAnalysis;
    status: TicketStatus;
  }>;
}

const SERVICE_LABELS: Record<RequestedAnalysis, string> = {
  plagiarism: 'Plagio',
  ai: 'IA',
  both: 'Plagio e IA',
  humanizer: 'Humanizacion',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: 'Pendiente',
  processing: 'En proceso',
  completed: 'Completado',
  pending_payment: 'Pago pendiente',
  completed_pending_payment: 'Completado, pago pendiente',
};

function formatDate(value: string | null) {
  if (!value) return 'No disponible';
  return new Date(value).toLocaleDateString('es-EC', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatLimit(value: number | null) {
  return value === null ? 'Sin acceso' : value.toLocaleString();
}

export function AccountLayout() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    fetch('/api/account/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar la cuenta.');
        setSummary(data);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error de conexion'))
      .finally(() => setIsLoading(false));
  }, [token]);

  const planName = useMemo(() => {
    if (!summary?.subscription.active) return 'Sin plan activo';
    return getActivePlanLabel(summary.subscription.planType);
  }, [summary?.subscription.active, summary?.subscription.planType]);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 md:p-10">
        <div className="ui-surface p-6 text-sm font-semibold text-slate-500">Cargando cuenta...</div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex-1 p-6 md:p-10">
        <div className="ui-toast ui-toast-error">{error || 'No se pudo cargar la cuenta.'}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 w-full max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="ui-title-lg">Mi cuenta</h1>
        <p className="ui-subtitle mt-1">Informacion de membresia, uso e historial de servicios.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <section className="ui-surface-elevated p-6 xl:col-span-1">
          <div className="flex items-center gap-3 mb-6">
            <div className="ui-icon-wrap bg-slate-100 text-slate-700">
              <UserRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{summary.user.name}</h2>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5" />
                {summary.user.email}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="ui-surface-muted p-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Membresia activa</span>
              <p className="text-lg font-bold text-slate-900 mt-1">{planName}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="ui-surface-muted p-4">
                <CalendarDays className="w-4 h-4 text-slate-400 mb-2" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Inicio</span>
                <p className="text-sm font-bold text-slate-800 mt-1">{formatDate(summary.subscription.startedAt)}</p>
              </div>
              <div className="ui-surface-muted p-4">
                <Clock className="w-4 h-4 text-slate-400 mb-2" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vence</span>
                <p className="text-sm font-bold text-slate-800 mt-1">{formatDate(summary.subscription.expiresAt)}</p>
              </div>
            </div>
            <div className={`rounded-lg border p-4 ${summary.subscription.active ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
              <div className="flex items-center gap-2 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4" />
                {summary.subscription.active ? `Activa, ${summary.subscription.daysRemaining} dias restantes` : 'Sin suscripcion activa'}
              </div>
            </div>
          </div>
        </section>

        <section className="ui-surface-elevated p-6 xl:col-span-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Resumen de uso</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              ['Documentos subidos', summary.usage.documentsUploaded.toLocaleString()],
              ['Reportes de plagio', summary.usage.plagiarismReports.toLocaleString()],
              ['Reportes de IA', summary.usage.aiReports.toLocaleString()],
              ['Palabras este mes', summary.usage.humanizedWordsThisMonth.toLocaleString()],
              ['Limite mensual', formatLimit(summary.usage.humanizerMonthlyLimit)],
            ].map(([label, value]) => (
              <div key={label} className="ui-surface-muted p-4">
                <p className="text-2xl font-extrabold text-slate-900">{value}</p>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-2">{label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ui-surface-elevated p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Historial</h2>
          <FileText className="w-5 h-5 text-slate-400" />
        </div>

        {summary.history.length === 0 ? (
          <div className="ui-empty-state">
            <p className="text-sm font-semibold text-slate-500">No hay servicios registrados.</p>
          </div>
        ) : (
          <div className="ui-table-shell">
            <div className="ui-table-head grid grid-cols-12 gap-4 px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-5">Archivo</div>
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2">Servicio</div>
              <div className="col-span-3">Estado</div>
            </div>
            {summary.history.map(item => (
              <div key={item.id} className="ui-table-row grid grid-cols-12 gap-4 px-4 py-3 items-center text-sm">
                <div className="col-span-5 font-semibold text-slate-800 truncate">{item.fileName}</div>
                <div className="col-span-2 text-slate-500">{formatDate(item.uploadedAt)}</div>
                <div className="col-span-2 text-slate-600">{SERVICE_LABELS[item.serviceType]}</div>
                <div className="col-span-3">
                  <span className="ui-chip ui-chip-status-processing">{STATUS_LABELS[item.status]}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
