import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Copy,
  FileUp,
  Loader2,
  ReceiptText,
  Search,
  Zap,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { BankAccount } from '@shared/types/subscription';

const EXPRESS_DETECTOR_OPTIONS = [
  { id: 'express_plagiarism', label: 'Reporte de Similitud', price: 3.00, credits: 1 },
  { id: 'express_ai', label: 'Reporte de IA', price: 3.00, credits: 1 },
  { id: 'express_full', label: 'Reporte Completo (Plagio + IA)', price: 5.00, credits: 1 },
];

interface ExpressDetectorSectionProps {
  onCancel: () => void;
}

export function ExpressDetectorSection({ onCancel }: ExpressDetectorSectionProps) {
  const { token, refreshSubscription } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedExpressDetector, setSelectedExpressDetector] = useState<string>('express_full');
  
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
      }
    } catch {}
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const opt = EXPRESS_DETECTOR_OPTIONS.find(o => o.id === selectedExpressDetector)!;
  const checkout = {
    serviceId: opt.id,
    price: opt.price,
    label: `Servicio Express: ${opt.label}`,
    metadata: { credits: opt.credits }
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

  if (success) {
    return (
      <div className="ui-surface-elevated p-8 mb-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Pago enviado exitosamente</h3>
        <p className="text-slate-600 max-w-md mb-6">
          Tu comprobante ha sido enviado y está pendiente de revisión por el administrador en WhatsApp o desde el panel. 
          Una vez validado, se habilitará tu crédito y podrás subir tu documento.
        </p>
        <button onClick={onCancel} className="ui-btn ui-btn-primary px-6 py-2.5">
          Entendido
        </button>
      </div>
    );
  }

  return (
    <div className="ui-surface-elevated p-6 md:p-8 mb-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" /> Adquirir Crédito Express
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Compra saldo para analizar un documento específico sin compromisos mensuales. Selecciona, paga y envía el comprobante para habilitar la subida del documento.
          </p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 ui-btn ui-btn-ghost px-3 py-1 text-sm font-semibold">
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Express Option Selection */}
        <div className="lg:col-span-6 space-y-6">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">1. Selecciona el servicio</h3>
          <div className="space-y-3">
            {EXPRESS_DETECTOR_OPTIONS.map(o => (
              <div
                key={o.id}
                onClick={() => setSelectedExpressDetector(o.id)}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedExpressDetector === o.id ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border-slate-200 hover:border-blue-300'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedExpressDetector === o.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Search className="w-5 h-5" />
                  </div>
                  <h4 className={`font-bold text-sm ${selectedExpressDetector === o.id ? 'text-blue-900' : 'text-slate-700'}`}>
                    {o.label}
                  </h4>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-extrabold ${selectedExpressDetector === o.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    ${o.price.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 mt-8 flex items-center gap-2">
              <Banknote className="w-4 h-4" /> 2. Realiza el pago
            </h3>
            {accounts.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 text-center">
                No hay cuentas bancarias configuradas. El pago estara disponible cuando el administrador agregue una cuenta.
              </div>
            ) : (
              <div className="space-y-3">
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
          </div>
        </div>

        {/* Right Column: Upload & Submit */}
        <div className="lg:col-span-6 flex flex-col">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <ReceiptText className="w-4 h-4" /> 3. Sube el comprobante
          </h3>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-6 flex-1 flex flex-col justify-center items-center ${selectedFile ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={(e) => {
              if (e.target.files?.[0]) { setSelectedFile(e.target.files[0]); setError(null); }
            }} />
            {selectedFile ? (
              <div>
                <CheckCircle2 className="w-10 h-10 text-blue-600 mx-auto mb-3" />
                <p className="text-base font-bold text-slate-800 truncate px-4">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 font-medium mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <FileUp className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">Clic aquí para adjuntar tu comprobante</p>
                <p className="text-xs text-slate-400 font-medium mt-2">JPG, PNG o PDF (Máx 2MB)</p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex justify-between items-center">
            <span className="text-sm font-bold text-slate-600">Total a pagar:</span>
            <span className="text-xl font-extrabold text-slate-900">${checkout.price.toFixed(2)} USD</span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!selectedFile || !hasBankAccounts || uploading}
            className={`ui-btn w-full py-4 text-sm px-6 ${selectedFile && hasBankAccounts && !uploading ? 'ui-btn-primary' : 'bg-slate-100 text-slate-400 border-transparent cursor-not-allowed'}`}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Procesando pago...</>
            ) : (
              'Enviar Comprobante y Solicitar Crédito'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
