import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Copy,
  FileUp,
  Loader2,
  ReceiptText,
  ShieldCheck,
  CreditCard,
  Check
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { BankAccount, PlanSettings } from '@shared/types/subscription';

type PlanType = 'basic' | 'pro' | 'pro_plus';
type PlanConfig = Record<PlanType, PlanSettings>;

const PLAN_LABELS: Record<PlanType, string> = {
  basic: 'Plan Básico',
  pro: 'Plan Estándar',
  pro_plus: 'Plan Premium',
};

const PLAN_SCOPE: Record<PlanType, string> = {
  basic: 'Solo reporte de plagio.',
  pro: 'Plagio + IA + Humanizador (10.000 palabras).',
  pro_plus: 'Plagio + IA + Humanizador (30.000 palabras).',
};

export function PricingLayout() {
  const { token, refreshSubscription } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data state
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [prices, setPrices] = useState({ basic: '15.00', pro: '30.00', pro_plus: '50.00' });
  const [plans, setPlans] = useState<PlanConfig>({} as PlanConfig);
  const [days, setDays] = useState(30);

  // Selection state
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('pro');

  // Payment upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const accRes = await fetch('/api/subscription/bank-accounts', { headers: { Authorization: `Bearer ${token}` } });
      if (accRes.ok) {
        const data = await accRes.json();
        setAccounts(data.accounts || []);
        if (data.prices) setPrices(data.prices);
        if (data.plans || data.limits) setPlans(data.plans || data.limits);
        setDays(data.days);
      }
    } catch {}
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const checkout = {
    serviceId: selectedPlan,
    price: parseFloat(prices[selectedPlan] || '0'),
    label: `Suscripción ${PLAN_LABELS[selectedPlan]} (${days} días)`,
    metadata: {}
  };
  const hasBankAccounts = accounts.length > 0;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSubmit = async () => {
    if (!selectedFile || !token) return;
    if (!hasBankAccounts) {
      setError('No hay cuentas bancarias configuradas. Intenta nuevamente cuando el administrador agregue una cuenta.');
      return;
    }
    setUploading(true); setError(null);
    const formData = new FormData();
    formData.append('voucher', selectedFile);
    formData.append('planType', checkout.serviceId);
    formData.append('amount', checkout.price.toString());
    formData.append('metadata', JSON.stringify(checkout.metadata));

    try {
      const res = await fetch('/api/subscription/pay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        await refreshSubscription();
        setSelectedFile(null);
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al enviar el pago');
      }
    } catch { 
      setError('Error de conexión'); 
    } finally { 
      setUploading(false); 
    }
  };

  return (
    <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto p-4 md:p-8">
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
        <span>Inicio</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-semibold">Planes y Precios</span>
      </div>

      <div className="ui-section-header mb-8">
        <div>
          <span className="ui-eyebrow mb-3"><CreditCard className="w-3.5 h-3.5" /> Suscripciones</span>
          <h1 className="ui-title-lg">Suscripciones AcademiX AI</h1>
          <p className="ui-subtitle mt-1">
            Elige el plan que mejor se adapte a tus necesidades académicas. 
          </p>
        </div>
      </div>

      {success ? (
        <div className="ui-surface-elevated p-12 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">Pago enviado exitosamente</h3>
          <p className="text-slate-600 max-w-md mb-8">
            Tu comprobante ha sido enviado y está pendiente de revisión. 
            La suscripción se activará en tu cuenta automáticamente una vez que el administrador confirme el pago por WhatsApp o desde el panel.
          </p>
          <button onClick={() => setSuccess(false)} className="ui-btn ui-btn-primary px-8 py-3">
            Comprar otro plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Plan Selection */}
          <div className="lg:col-span-7 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['basic', 'pro', 'pro_plus'] as const).map(planId => {
                const p = plans[planId];
                const isSelected = selectedPlan === planId;
                return (
                  <div
                    key={planId}
                    onClick={() => setSelectedPlan(planId)}
                    className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col ${
                      isSelected 
                        ? 'border-blue-600 bg-blue-50/30 shadow-md ring-4 ring-blue-600/10' 
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                  >
                    {planId === 'pro_plus' && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                        Recomendado
                      </span>
                    )}
                    <h4 className={`font-extrabold text-lg mb-1 ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                      {PLAN_LABELS[planId]}
                    </h4>
                    <div className="mb-4">
                      <span className={`text-3xl font-extrabold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>${prices[planId]}</span>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">/ mes</span>
                    </div>
                    
                    <ul className="space-y-3 mt-auto pt-4 border-t border-slate-100">
                      <li className="flex items-start gap-2 text-sm">
                        <Check className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className="text-slate-600"><strong>{p?.detectorDocumentLimit ?? 0}</strong> docs / mes</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm">
                        <Check className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className="text-slate-600">{PLAN_SCOPE[planId]}</span>
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Payment Details */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="ui-surface p-6">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Banknote className="w-4 h-4" /> Resumen y Pago
              </h3>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-slate-600 mb-1">{checkout.label}</p>
                <div className="flex items-end gap-1">
                  <p className="text-3xl font-extrabold text-slate-900">${checkout.price.toFixed(2)}</p>
                  <p className="text-sm text-slate-500 font-bold mb-1.5">USD</p>
                </div>
              </div>

              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Cuentas Bancarias</h4>
              {accounts.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 text-center mb-6">
                  No hay cuentas bancarias configuradas. El pago estara disponible cuando el administrador agregue una cuenta.
                </div>
              ) : (
                <div className="space-y-3 mb-6">
                  {accounts.map((acc, i) => {
                    const copyId = acc.id || `acc-${i}`;
                    return (
                      <div key={copyId} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-blue-200 transition-colors">
                        <p className="text-xs font-bold text-slate-800 mb-1">{acc.bankName} - {acc.accountType}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono font-bold text-slate-600">{acc.accountNumber}</span>
                          <button
                            onClick={() => handleCopy(acc.accountNumber, copyId)}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            {copied === copyId ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">{acc.accountHolder}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Comprobante de Pago</h4>
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-6 ${selectedFile ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(e) => {
                  if (e.target.files?.[0]) { setSelectedFile(e.target.files[0]); setError(null); }
                }} />
                {selectedFile ? (
                  <div>
                    <CheckCircle2 className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800 truncate px-2">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <FileUp className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700">Clic para adjuntar archivo</p>
                    <p className="text-xs text-slate-400 font-medium mt-1">JPG, PNG o PDF</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 mb-6">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!selectedFile || !hasBankAccounts || uploading || checkout.price <= 0}
                className={`ui-btn w-full py-4 text-sm px-6 ${selectedFile && hasBankAccounts && !uploading && checkout.price > 0 ? 'ui-btn-primary' : 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed'}`}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Procesando pago...</>
                ) : (
                  'Enviar Comprobante y Suscribirse'
                )}
              </button>
            </div>
          </div>

        </div>
      )}
    </main>
  );
}
