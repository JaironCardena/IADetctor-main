import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { io } from 'socket.io-client';
import { requiresAiReport, requiresPlagiarismReport } from '@shared/constants/ticketRules';
import { CheckCircle2, Clock3, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import type { BankAccount, PlanSettings, PaymentServiceType, PlanType } from '@shared/types/subscription';
import type { RequestedAnalysis } from '@shared/constants/ticketRules';

const EXPRESS_FEATURE_ENABLED = false;

interface Ticket {
  id: string; userId: string; userName: string; fileName: string; fileSize: number;
  requestedAnalysis: RequestedAnalysis;
  status: 'pending' | 'processing' | 'completed' | 'pending_payment' | 'completed_pending_payment';
  assignedTo: string | null;
  createdAt: string; completedAt: string | null;
}

interface AdminPayment {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planType: PaymentServiceType;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const PLAN_LABELS: Record<AdminPayment['planType'], string> = {
  basic: 'Basico',
  pro: 'Estandar',
  pro_plus: 'Premium',
  express_plagiarism: 'Express Plagio',
  express_ai: 'Express IA',
  express_full: 'Express Completo',
  express_humanizer: 'Express Humanizador',
};

type PlanConfig = Record<PlanType, PlanSettings>;

const EMPTY_PLAN_CONFIG: PlanConfig = {
  basic: { price: '', detectorDocumentLimit: 0, humanizerWordLimit: 0, humanizerSubmissionLimit: 0 },
  pro: { price: '', detectorDocumentLimit: 0, humanizerWordLimit: 0, humanizerSubmissionLimit: 0 },
  pro_plus: { price: '', detectorDocumentLimit: 0, humanizerWordLimit: 0, humanizerSubmissionLimit: 0 },
};

const createEmptyBankAccount = (): BankAccount => ({
  id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  bankName: '',
  accountNumber: '',
  accountHolder: '',
  accountType: 'Ahorros',
});

export function AdminDashboard() {
  const { token, user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<'pending' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'processing' | 'completed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ticketLoadError, setTicketLoadError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [planConfig, setPlanConfig] = useState<PlanConfig>(EMPTY_PLAN_CONFIG);
  const [planDraft, setPlanDraft] = useState<PlanConfig>(EMPTY_PLAN_CONFIG);
  const [bankAccountsConfig, setBankAccountsConfig] = useState<BankAccount[]>([]);
  const [bankAccountsDraft, setBankAccountsDraft] = useState<BankAccount[]>([]);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSuccess, setPriceSuccess] = useState<string | null>(null);
  const [savingPrices, setSavingPrices] = useState(false);
  // Per-ticket file state
  const [ticketFiles, setTicketFiles] = useState<Record<string, { plagiarism: File | null; ai: File | null }>>({});

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
        setTicketLoadError(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setTicketLoadError(data.error || 'No se pudieron cargar los tickets.');
      }
    } catch { setTicketLoadError('Error de conexión al cargar tickets.'); }
  }, [token]);

  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payments?status=${paymentFilter}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const payments = EXPRESS_FEATURE_ENABLED
          ? (data.payments || [])
          : (data.payments || []).filter((payment: AdminPayment) => !String(payment.planType).startsWith('express_'));
        setPayments(payments);
        setPaymentError(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setPaymentError(data.error || 'No se pudieron cargar los pagos.');
      }
    } catch { setPaymentError('Error de conexión al cargar pagos.'); }
  }, [paymentFilter, token]);

  const fetchPlanPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/subscription-settings', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los precios.');
      const plans = data.plans || EMPTY_PLAN_CONFIG;
      setPlanConfig(plans);
      setPlanDraft(plans);
      setBankAccountsConfig(data.bankAccounts || []);
      setBankAccountsDraft(data.bankAccounts || []);
      setPriceError(null);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Error de conexion al cargar precios.');
    }
  }, [token]);

  useEffect(() => {
    fetchTickets();
    fetchPayments();
    fetchPlanPrices();
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socket.on('ticket_updated', () => fetchTickets());
    socket.on('ticket_created', () => fetchTickets());
    socket.on('admin_payment_updated', () => fetchPayments());
    socket.on('payment_approved', () => fetchPayments());
    socket.on('payment_rejected', () => fetchPayments());
    socket.on('subscription_prices_updated', () => fetchPlanPrices());
    return () => { socket.disconnect(); };
  }, [fetchPayments, fetchPlanPrices, fetchTickets]);

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
    const plagiarismIsRequired = requiresPlagiarismReport(ticket.requestedAnalysis);
    if ((plagiarismIsRequired && !files.plagiarism) || (aiIsRequired && !files.ai)) {
      setUploadError(
        plagiarismIsRequired && aiIsRequired
          ? 'Debes subir ambos reportes (plagio e IA) para este ticket.'
          : plagiarismIsRequired
            ? 'Debes subir el reporte de plagio para este ticket.'
            : 'Debes subir el reporte de IA para este ticket.'
      );
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
      setUploadError('Error de conexión al enviar los resultados.');
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
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error || 'No se pudo descargar el archivo original.');
      }
    } catch { setUploadError('Error de conexión al descargar el archivo original.'); }
  };

  const handleDownloadVoucher = async (paymentId: string) => {
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/voucher`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Comprobante_${paymentId}`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      } else {
        const data = await res.json().catch(() => ({}));
        setPaymentError(data.error || 'No se pudo descargar el comprobante.');
      }
    } catch { setPaymentError('Error de conexión al descargar el comprobante.'); }
  };

  const handleApprovePayment = async (paymentId: string) => {
    setPaymentError(null); setPaymentSuccess(null); setPaymentActionId(paymentId);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo aprobar el pago.');
      setPaymentSuccess(`Pago ${paymentId} aprobado. La suscripción fue activada.`);
      await fetchPayments();
      setTimeout(() => setPaymentSuccess(null), 4000);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Error aprobando pago.');
    } finally { setPaymentActionId(null); }
  };

  const handleRejectPayment = async (paymentId: string) => {
    const reason = window.prompt('Motivo del rechazo');
    if (!reason?.trim()) return;
    setPaymentError(null); setPaymentSuccess(null); setPaymentActionId(paymentId);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo rechazar el pago.');
      setPaymentSuccess(`Pago ${paymentId} rechazado.`);
      await fetchPayments();
      setTimeout(() => setPaymentSuccess(null), 4000);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Error rechazando pago.');
    } finally { setPaymentActionId(null); }
  };

  const handleSavePlanPrices = async () => {
    setPriceError(null);
    setPriceSuccess(null);
    setSavingPrices(true);
    try {
      const res = await fetch('/api/admin/subscription-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plans: planDraft, bankAccounts: bankAccountsDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los precios.');
      const plans = data.plans || planDraft;
      const bankAccounts = data.bankAccounts || bankAccountsDraft;
      setPlanConfig(plans);
      setPlanDraft(plans);
      setBankAccountsConfig(bankAccounts);
      setBankAccountsDraft(bankAccounts);
      setPriceSuccess('Configuracion actualizada. Los usuarios veran estos planes y cuentas al pagar.');
      setTimeout(() => setPriceSuccess(null), 4000);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Error guardando precios.');
    } finally {
      setSavingPrices(false);
    }
  };

  const updatePlanDraft = (
    plan: keyof PlanConfig,
    field: keyof PlanSettings,
    value: string
  ) => {
    setPlanDraft(prev => ({
      ...prev,
      [plan]: {
        ...prev[plan],
        [field]: field === 'price' ? value : Number(value),
      },
    }));
  };

  const updateBankAccountDraft = (id: string, field: keyof Omit<BankAccount, 'id'>, value: string) => {
    setBankAccountsDraft(prev => prev.map(account => (
      account.id === id ? { ...account, [field]: value } : account
    )));
  };

  const addBankAccountDraft = () => {
    setBankAccountsDraft(prev => [...prev, createEmptyBankAccount()]);
  };

  const removeBankAccountDraft = (id: string) => {
    setBankAccountsDraft(prev => prev.filter(account => account.id !== id));
  };

  const statusBadge = (status: string) => {
    if (status === 'completed') return <span className="ui-chip ui-chip-status-completed"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Completado</span>;
    if (status === 'processing') return <span className="ui-chip ui-chip-status-processing"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 " />En proceso</span>;
    return <span className="ui-chip ui-chip-status-pending"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 " />Pendiente</span>;
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

  const pricesChanged = JSON.stringify(planConfig) !== JSON.stringify(planDraft)
    || JSON.stringify(bankAccountsConfig) !== JSON.stringify(bankAccountsDraft);

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <span className="ui-eyebrow mb-4 bg-violet-50 border-violet-100 text-violet-700">
          <ShieldCheck className="w-3.5 h-3.5" />
          Panel de {user?.name || 'Admin'}
        </span>
        <h1 className="ui-title-lg">Panel administrativo</h1>
        <p className="ui-subtitle mt-1">Revisa tickets, valida pagos y ajusta la configuracion del sistema desde un solo lugar.</p>
      </div>

      <div className="ui-surface-elevated p-5 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Flujo de trabajo</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="ui-surface-muted p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">1. Tickets</p>
            <p className="text-sm font-semibold text-slate-800">Confirma un ticket, descarga el original y sube los reportes necesarios.</p>
          </div>
          <div className="ui-surface-muted p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">2. Pagos</p>
            <p className="text-sm font-semibold text-slate-800">Aprueba o rechaza comprobantes pendientes desde la web o Telegram.</p>
          </div>
          <div className="ui-surface-muted p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">3. Configuracion</p>
            <p className="text-sm font-semibold text-slate-800">Actualiza precios, limites y cuentas bancarias visibles para los usuarios.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 order-1">
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-blue-50 text-blue-500"><FileText className="w-6 h-6" /></div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.total}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total</p></div>
        </div>
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-amber-50 text-amber-500"><Clock3 className="w-6 h-6" /></div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.pending}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pendientes</p></div>
        </div>
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-blue-50 text-blue-500"><RefreshCw className="w-6 h-6" /></div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.processing}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">En proceso</p></div>
        </div>
        <div className="ui-stat-card p-5 flex items-center gap-4">
          <div className="ui-icon-wrap w-12 h-12 bg-emerald-50 text-emerald-500"><CheckCircle2 className="w-6 h-6" /></div>
          <div><p className="text-2xl font-extrabold text-slate-800">{stats.completed}</p><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completados</p></div>
        </div>
      </div>

      {/* Plan settings */}
      <div className="ui-surface-elevated p-5 mb-8 order-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Configuracion de planes y cuentas</h2>
            <p className="text-xs text-slate-400 mt-1">Aqui defines precios, cupos y cuentas bancarias visibles para el usuario.</p>
          </div>
          <button
            onClick={handleSavePlanPrices}
            disabled={savingPrices || !pricesChanged}
            className="ui-btn ui-btn-primary px-5 py-3 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingPrices ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {(['basic', 'pro', 'pro_plus'] as const).map(plan => (
            <div key={plan} className="ui-surface-muted p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-slate-800">{PLAN_LABELS[plan]}</h3>
                <span className="ui-chip bg-blue-50 border border-blue-100 text-blue-700">
                  {planDraft[plan].detectorDocumentLimit || 0} docs
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block col-span-2">
                  <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Precio ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={planDraft[plan].price}
                    onChange={e => updatePlanDraft(plan, 'price', e.target.value)}
                    className="ui-input w-full py-2.5 px-3 text-sm font-semibold"
                  />
                </label>
                <label className="block col-span-2">
                  <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Documentos del detector</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={planDraft[plan].detectorDocumentLimit}
                    onChange={e => updatePlanDraft(plan, 'detectorDocumentLimit', e.target.value)}
                    className="ui-input px-3 py-2.5 text-sm font-semibold"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Palabras hum.</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={planDraft[plan].humanizerWordLimit}
                    onChange={e => updatePlanDraft(plan, 'humanizerWordLimit', e.target.value)}
                    className="ui-input px-3 py-2.5 text-sm font-semibold"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Envios hum.</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={planDraft[plan].humanizerSubmissionLimit}
                    onChange={e => updatePlanDraft(plan, 'humanizerSubmissionLimit', e.target.value)}
                    className="ui-input px-3 py-2.5 text-sm font-semibold"
                  />
                </label>
                {plan === 'pro_plus' && (
                  <p className="col-span-2 text-[10px] text-indigo-500 font-medium">
                    Nota: En el plan Pro+, colocar el limite en 0 significa <strong>ilimitado</strong>.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cuentas bancarias de Ecuador</h3>
              <p className="text-xs text-slate-400 mt-1">Estas cuentas aparecen en el modal de pago del usuario.</p>
            </div>
            <button
              type="button"
              onClick={addBankAccountDraft}
              className="ui-btn ui-btn-secondary px-4 py-2 text-xs font-bold text-slate-600"
            >
              Agregar cuenta
            </button>
          </div>
          {bankAccountsDraft.length === 0 ? (
            <div className="ui-empty-state py-6">
              <p className="text-sm font-semibold text-slate-500">No hay cuentas configuradas.</p>
              <p className="text-xs text-slate-400 mt-1">Agrega al menos una cuenta para que el usuario pueda pagar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {bankAccountsDraft.map(account => (
                <div key={account.id} className="ui-surface-muted p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-extrabold text-slate-800">
                        {account.bankName || 'Nueva cuenta'}
                      </p>
                      <p className="text-xs text-slate-400">Cuenta visible para pagos por transferencia o deposito.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBankAccountDraft(account.id)}
                      className="ui-btn ui-btn-danger px-3 py-2 text-xs font-bold"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Banco</span>
                      <input
                        value={account.bankName}
                        onChange={e => updateBankAccountDraft(account.id, 'bankName', e.target.value)}
                        placeholder="Banco Pichincha"
                        className="ui-input w-full px-3 py-2.5 text-sm font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo</span>
                      <select
                        value={account.accountType}
                        onChange={e => updateBankAccountDraft(account.id, 'accountType', e.target.value)}
                        className="ui-input w-full px-3 py-2.5 text-sm font-semibold"
                      >
                        <option value="Ahorros">Ahorros</option>
                        <option value="Corriente">Corriente</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Numero de cuenta</span>
                      <input
                        value={account.accountNumber}
                        onChange={e => updateBankAccountDraft(account.id, 'accountNumber', e.target.value)}
                        placeholder="0000000000"
                        className="ui-input w-full px-3 py-2.5 text-sm font-semibold"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Titular</span>
                      <input
                        value={account.accountHolder}
                        onChange={e => updateBankAccountDraft(account.id, 'accountHolder', e.target.value)}
                        placeholder="Nombre del titular"
                        className="ui-input w-full px-3 py-2.5 text-sm font-semibold"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {priceSuccess && <div className="ui-toast ui-toast-success mt-4 text-sm font-semibold">{priceSuccess}</div>}
        {priceError && <div className="ui-toast ui-toast-error mt-4 text-sm font-semibold">{priceError}</div>}
      </div>

      {/* Payments */}
      <div className="ui-surface-elevated p-5 mb-8 order-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Pagos pendientes</h2>
            <p className="text-xs text-slate-400 mt-1">Revisa comprobantes y decide si activar o rechazar la solicitud.</p>
          </div>
          <div className="flex gap-2">
            {([['pending', 'Pendientes'], ['all', 'Todos']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPaymentFilter(value)}
                className={`ui-btn px-4 py-2 rounded-xl text-xs font-bold ${paymentFilter === value ? 'ui-btn-primary text-white' : 'ui-btn-secondary text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {paymentSuccess && <div className="ui-toast ui-toast-success mb-3 text-sm font-semibold">{paymentSuccess}</div>}
        {paymentError && <div className="ui-toast ui-toast-error mb-3 text-sm font-semibold">{paymentError}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="ui-surface-muted p-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pendientes</p>
            <p className="text-lg font-extrabold text-slate-800">{payments.filter(payment => payment.status === 'pending').length}</p>
          </div>
          <div className="ui-surface-muted p-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Aprobados</p>
            <p className="text-lg font-extrabold text-emerald-700">{payments.filter(payment => payment.status === 'approved').length}</p>
          </div>
          <div className="ui-surface-muted p-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Rechazados</p>
            <p className="text-lg font-extrabold text-red-700">{payments.filter(payment => payment.status === 'rejected').length}</p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="ui-empty-state py-8">
            <p className="text-slate-400 font-medium text-sm">
              {paymentFilter === 'pending' ? 'No hay pagos pendientes' : 'No hay pagos registrados'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map(payment => {
              const isBusy = paymentActionId === payment.id;
              const statusClass = payment.status === 'approved'
                ? 'ui-chip-status-completed'
                : payment.status === 'rejected'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'ui-chip-status-pending';
              return (
                <div key={payment.id} className="ui-surface-muted p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <code className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{payment.id}</code>
                      <span className={`ui-chip ${statusClass}`}>
                        {payment.status === 'approved' ? 'Aprobado' : payment.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                      </span>
                      <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">
                        {PLAN_LABELS[payment.planType]} · ${payment.amount}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 truncate">{payment.userName} · {payment.userEmail}</p>
                    <p className="text-xs text-slate-400">
                      Enviado {formatDate(payment.createdAt)}
                      {payment.reviewedBy ? ` · Revisado por ${payment.reviewedBy}` : ''}
                    </p>
                    {payment.rejectionReason && <p className="text-xs text-red-500 mt-1">Motivo: {payment.rejectionReason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      onClick={() => handleDownloadVoucher(payment.id)}
                      className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-bold text-slate-600"
                    >
                      Comprobante
                    </button>
                    {payment.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprovePayment(payment.id)}
                          disabled={isBusy}
                          className="ui-btn ui-btn-primary px-3 py-2 text-xs font-bold text-white"
                        >
                          {isBusy ? 'Procesando...' : 'Aprobar'}
                        </button>
                        <button
                          onClick={() => handleRejectPayment(payment.id)}
                          disabled={isBusy}
                          className="ui-btn ui-btn-danger px-3 py-2 text-xs font-bold"
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search & Filter */}
      <div className="order-2 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Centro de tickets</h2>
        </div>
        <p className="text-xs text-slate-400">Filtra, revisa el original y sube reportes desde aqui.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6 order-2">
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
        <div className="ui-toast ui-toast-success mb-4 flex items-center gap-3 px-5 py-4 order-2">
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
        <div className="ui-toast ui-toast-error mb-4 flex items-center gap-3 px-5 py-4 order-2">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01" /></svg>
          </div>
          <p className="text-red-700 text-sm font-bold">{uploadError}</p>
        </div>
      )}

      {/* Tickets list — split into Active and History */}
      {ticketLoadError && (
        <div className="ui-toast ui-toast-error mb-4 text-sm font-semibold order-2">{ticketLoadError}</div>
      )}
      {(() => {
        const activeTickets = filtered.filter(t => t.status !== 'completed');
        const historyTickets = filtered.filter(t => t.status === 'completed');
        return (
      <div className="space-y-6 order-2">
        {/* Active Tickets Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 " />
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
                      : ticket.requestedAnalysis === 'ai'
                        ? 'bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700'
                        : 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                  }`}>
                    {ticket.requestedAnalysis === 'plagiarism' ? 'Solo plagio' : ticket.requestedAnalysis === 'ai' ? 'Solo IA' : 'Plagio + IA'}
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
              <div className="px-5 pb-5 pt-2 border-t border-slate-100 ">
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
                      Requisito del ticket: {aiIsRequired && requiresPlagiarismReport(ticket.requestedAnalysis) ? 'reporte de plagio + reporte de IA.' : aiIsRequired ? 'solo reporte de IA.' : 'solo reporte de plagio.'}
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
                    <button onClick={() => handleUploadResults(ticket.id)} disabled={(requiresPlagiarismReport(ticket.requestedAnalysis) && !files.plagiarism) || (aiIsRequired && !files.ai) || uploading}
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
                  <div className="px-4 pb-4 pt-1 border-t border-slate-50 ">
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
