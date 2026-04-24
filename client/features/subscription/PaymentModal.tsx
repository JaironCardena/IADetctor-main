import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  FileUp,
  Loader2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { BankAccount, PlanSettings } from '@shared/types/subscription';

interface PaymentRecord {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  rejectionReason: string | null;
  planType: 'basic' | 'pro' | 'pro_plus';
  createdAt: string;
  reviewedAt: string | null;
}

interface PaymentModalProps {
  onClose: () => void;
}

type PlanType = 'basic' | 'pro' | 'pro_plus';
type PlanConfig = Record<PlanType, PlanSettings>;

const DEFAULT_PLANS: PlanConfig = {
  basic: { price: '5.00', detectorDocumentLimit: 5, humanizerWordLimit: 0, humanizerSubmissionLimit: 0 },
  pro: { price: '10.00', detectorDocumentLimit: 15, humanizerWordLimit: 0, humanizerSubmissionLimit: 0 },
  pro_plus: { price: '15.00', detectorDocumentLimit: 30, humanizerWordLimit: 0, humanizerSubmissionLimit: 0 },
};

const PLAN_LABELS: Record<PlanType, string> = {
  basic: 'Básica',
  pro: 'Pro',
  pro_plus: 'Pro+',
};

const PLAN_SCOPE: Record<PlanType, string> = {
  basic: 'Solo plagio',
  pro: 'Plagio + IA',
  pro_plus: 'Plagio + IA + humanizador',
};

export function PaymentModal({ onClose }: PaymentModalProps) {
  const { token, refreshSubscription } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [prices, setPrices] = useState({ basic: '5.00', pro: '10.00', pro_plus: '15.00' });
  const [plans, setPlans] = useState<PlanConfig>(DEFAULT_PLANS);
  const [planType, setPlanType] = useState<PlanType>('pro');
  const [days, setDays] = useState(30);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [accRes, payRes] = await Promise.all([
        fetch('/api/subscription/bank-accounts', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/subscription/payments', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (accRes.ok) {
        const data = await accRes.json();
        setAccounts(data.accounts || []);
        if (data.prices) setPrices(data.prices);
        if (data.plans || data.limits) setPlans(data.plans || data.limits);
        setDays(data.days);
      }
      if (payRes.ok) {
        const data = await payRes.json();
        setPayments(data.payments || []);
      }
    } catch {}
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSelectedFile(file); setError(null); }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !token) return;
    setUploading(true); setError(null);
    const formData = new FormData();
    formData.append('voucher', selectedFile);
    formData.append('planType', planType);
    try {
      const res = await fetch('/api/subscription/pay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        await fetchData();
        await refreshSubscription();
        setSelectedFile(null);
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al enviar el pago');
      }
    } catch { setError('Error de conexión'); }
    finally { setUploading(false); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-50' },
    approved: { label: 'Aprobado', color: 'text-emerald-700', bg: 'bg-emerald-50' },
    rejected: { label: 'Rechazado', color: 'text-red-700', bg: 'bg-red-50' },
  };

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal-shell max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header rounded-t-3xl">
          <button onClick={onClose} className="ui-modal-close absolute top-4 right-4 flex items-center justify-center" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="ui-title-md">Realizar pago</h2>
              <p className="text-slate-500 text-sm font-medium">Suscripción de {days} días</p>
            </div>
          </div>
        </div>

        <div className="ui-modal-body space-y-6 bg-white">
          {success && (
            <div className="ui-toast ui-toast-success flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-800">Comprobante enviado</p>
                <p className="text-sm text-emerald-700 mt-1">Tu pago quedó pendiente de revisión. Te avisaremos cuando sea aprobado o rechazado.</p>
              </div>
            </div>
          )}

          {!success && (
            <>
              <div>
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  Selecciona tu plan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['basic', 'pro', 'pro_plus'] as const).map(planId => {
                    const p = plans[planId];
                    const hasHumanizer = (p?.humanizerWordLimit ?? 0) > 0 || (p?.humanizerSubmissionLimit ?? 0) > 0 || planId === 'pro_plus';
                    return (
                      <button
                        key={planId}
                        onClick={() => setPlanType(planId)}
                        className={`ui-surface-muted relative p-4 border-2 transition-all text-left ${planType === planId ? 'border-blue-500 bg-blue-50/70 shadow-md' : 'border-slate-200 hover:border-blue-300'}`}
                      >
                        {planType === planId && (
                          <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <h4 className="font-extrabold text-slate-800">{PLAN_LABELS[planId]}</h4>
                        <p className="text-[11px] font-bold text-slate-500 mb-1">{p?.detectorDocumentLimit ?? 0} documentos del detector</p>
                        <p className="text-xs text-slate-500 mb-1">{PLAN_SCOPE[planId]}</p>
                        <p className={`text-[11px] font-semibold mb-2 ${hasHumanizer ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {hasHumanizer ? 'Humanizador incluido' : 'Sin humanizador'}
                        </p>
                        <p className="text-2xl font-extrabold text-blue-700">${prices[planId]}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-blue-500" />
                  Datos bancarios
                </h3>
                {accounts.length === 0 ? (
                  <div className="ui-empty-state py-6">
                    <p className="text-slate-500 text-sm font-semibold">No hay cuentas bancarias configuradas.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {accounts.map((acc, i) => {
                      const copyId = acc.id || `acc-${i}`;
                      return (
                        <div key={copyId} className="ui-surface-muted p-4">
                          <div className="flex justify-between items-start mb-3">
                            <span className="text-sm font-extrabold text-slate-800">{acc.bankName}</span>
                            <span className="ui-chip bg-blue-50 border border-blue-100 text-blue-700 uppercase">{acc.accountType}</span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-mono font-bold text-slate-700 tracking-wide">{acc.accountNumber}</span>
                            <button
                              onClick={() => handleCopy(acc.accountNumber, copyId)}
                              className="ui-btn ui-btn-ghost w-8 h-8 text-slate-400 hover:text-blue-600"
                              title="Copiar número de cuenta"
                            >
                              {copied === copyId ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500">Titular: <strong>{acc.accountHolder}</strong></p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Total a pagar</p>
                <p className="text-3xl font-extrabold text-emerald-800">${prices[planType]}</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Plan {PLAN_LABELS[planType]} por {days} días · {plans[planType]?.detectorDocumentLimit ?? 0} documentos
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-blue-500" />
                  Comprobante de pago
                </h3>
                <div
                  className={`ui-upload-tile p-6 text-center cursor-pointer transition-all ${selectedFile ? 'border-blue-400 bg-blue-50' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleFileSelect} />
                  {selectedFile ? (
                    <div>
                      <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-xl flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="mt-2 text-xs font-bold text-red-500 hover:text-red-600 transition-colors">Quitar</button>
                    </div>
                  ) : (
                    <div>
                      <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 rounded-xl flex items-center justify-center">
                        <FileUp className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-600">Sube tu comprobante aquí</p>
                      <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP o PDF</p>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="ui-toast ui-toast-error text-sm font-semibold flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!selectedFile || uploading}
                className={`ui-btn w-full py-4 font-bold text-sm ${selectedFile && !uploading ? 'ui-btn-primary' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                {uploading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</>
                ) : (
                  <><ShieldCheck className="w-5 h-5" /> Enviar comprobante</>
                )}
              </button>
            </>
          )}

          {payments.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-6">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">Historial de pagos</h3>
              <div className="space-y-2">
                {payments.map(p => {
                  const st = statusConfig[p.status] || statusConfig.pending;
                  return (
                    <div key={p.id} className="ui-surface-muted p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono text-slate-500">{p.id}</p>
                        <p className="text-[10px] font-bold text-blue-600 uppercase mt-0.5 mb-0.5">Plan {PLAN_LABELS[p.planType]}</p>
                        <p className="text-xs text-slate-400">{formatDate(p.createdAt)}</p>
                        {p.rejectionReason && <p className="text-xs text-red-500 mt-1">Motivo: {p.rejectionReason}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-slate-700">${p.amount}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${st.bg} ${st.color}`}>{st.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
