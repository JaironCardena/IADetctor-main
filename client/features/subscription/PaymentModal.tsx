import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface PaymentModalProps {
  onClose: () => void;
}

export function PaymentModal({ onClose }: PaymentModalProps) {
  const { token, refreshSubscription } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [price, setPrice] = useState('0');
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
        setAccounts(data.accounts); setPrice(data.price); setDays(data.days);
      }
      if (payRes.ok) {
        const data = await payRes.json();
        setPayments(data.payments);
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
    try {
      const res = await fetch('/api/subscription/pay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        await fetchData();
        await refreshSubscription();
        onClose(); // Close immediately on success
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in-up p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto glass rounded-3xl shadow-2xl border border-white/20" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600/90 to-indigo-600/90 p-6 rounded-t-3xl relative border-b border-white/10">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white/80 hover:bg-white/30 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">💳</div>
            <div>
              <h2 className="text-xl font-extrabold text-white">Realizar Pago</h2>
              <p className="text-blue-100 text-sm">Suscripción de {days} días — ${price}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 bg-white/60">
          {!success && (
            <>
              {/* Bank Accounts */}
              <div>
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  Datos Bancarios
                </h3>
                {accounts.length === 0 ? (
                  <p className="text-slate-500 text-sm">No hay cuentas bancarias configuradas.</p>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((acc, i) => (
                      <div key={i} className="bg-white/80 border border-white/40 rounded-2xl p-4 shadow-sm backdrop-blur-md">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-bold text-slate-800">{acc.bankName}</span>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">{acc.accountType}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-mono font-bold text-slate-700 tracking-wide">{acc.accountNumber}</span>
                          <button
                            onClick={() => handleCopy(acc.accountNumber, `acc-${i}`)}
                            className="text-slate-400 hover:text-blue-600 transition-colors"
                            title="Copiar"
                          >
                            {copied === `acc-${i}` ? (
                              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-slate-500">Titular: <strong>{acc.accountHolder}</strong></p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center backdrop-blur-sm">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Total a pagar</p>
                <p className="text-3xl font-extrabold text-emerald-800">${price}</p>
                <p className="text-xs text-emerald-700 mt-1">Suscripción por {days} días</p>
              </div>

              {/* Upload Voucher */}
              <div>
                <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Comprobante de Pago
                </h3>
                <div
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${selectedFile ? 'border-blue-400 bg-blue-500/10' : 'border-slate-300 hover:border-blue-400 hover:bg-white/50 bg-white/30'}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleFileSelect} />
                  {selectedFile ? (
                    <div>
                      <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <p className="text-sm font-bold text-slate-700">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} className="mt-2 text-xs font-bold text-red-400 hover:text-red-600 transition-colors">Quitar</button>
                    </div>
                  ) : (
                    <div>
                      <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      </div>
                      <p className="text-sm font-bold text-slate-600">Sube tu comprobante aquí</p>
                      <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP o PDF</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm font-semibold text-center">{error}</div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!selectedFile || uploading}
                className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${selectedFile && !uploading ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:-translate-y-0.5' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                {uploading ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
                ) : (
                  <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Enviar Comprobante</>
                )}
              </button>
            </>
          )}

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="mt-4 border-t border-slate-200/50 pt-6">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">Historial de Pagos</h3>
              <div className="space-y-2">
                {payments.map(p => {
                  const st = statusConfig[p.status] || statusConfig.pending;
                  return (
                    <div key={p.id} className="bg-white/60 border border-white/40 rounded-xl p-3 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-xs font-mono text-slate-500">{p.id}</p>
                        <p className="text-xs text-slate-400">{formatDate(p.createdAt)}</p>
                        {p.rejectionReason && <p className="text-xs text-red-500 mt-1">Motivo: {p.rejectionReason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
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
