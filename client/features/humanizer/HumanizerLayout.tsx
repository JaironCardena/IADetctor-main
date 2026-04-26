import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  CheckCircle2,
  Copy,
  FileCheck2,
  FileUp,
  Loader2,
  Lock,
  PenLine,
  ReceiptText,
  Sparkles,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import type { SubscriptionStatus, BankAccount } from '@shared/types/subscription';

const EXPRESS_FEATURE_ENABLED = false;

type Tone = 'natural' | 'formal' | 'casual' | 'academic' | 'persuasive';
type Strength = 'light' | 'medium' | 'strong';
type InputMode = 'text' | 'file';

const HUMANIZER_TONE: Tone = 'natural';
const HUMANIZER_STRENGTH: Strength = 'medium';
const HUMANIZER_PRESERVE_MEANING = true;
const HUMANIZER_VARIETY = 0.55;

interface TextAnalysis {
  characters: number;
  words: number;
  sentences: number;
  avgSentenceLength: number;
  lexicalDiversity: number;
}

interface HumanizeResponse {
  output: string;
  downloadUrl: string;
  filename?: string;
  model: string;
  settings: { tone: Tone; strength: Strength; preserveMeaning: boolean; variety: number };
  inputAnalysis: TextAnalysis;
  outputAnalysis: TextAnalysis;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function calculateExpressHumanizerPricing(wordCount: number) {
  const billedWords = Math.max(1000, Math.ceil(wordCount / 1000) * 1000);
  return {
    billedWords,
    amount: Number(((billedWords / 1000) * 0.5).toFixed(2)),
  };
}

export function HumanizerLayout() {
  const { token, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  
  // Express Payment State
  const [manualWordCount, setManualWordCount] = useState<number>(1000);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const voucherInputRef = useRef<HTMLInputElement>(null);
  const [expressSuccess, setExpressSuccess] = useState(false);

  useEffect(() => {
    if (!token || user?.role === 'admin') return;
    fetch('/api/subscription/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSubStatus(data); })
      .catch(() => {});
  }, [token, user?.role]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/subscription/bank-accounts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setAccounts(data?.accounts || []))
      .catch(() => {});
  }, [token]);

  const refreshSubStatus = useCallback(async () => {
    if (!token || user?.role === 'admin') return;
    try {
      const r = await fetch('/api/subscription/status', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const data = await r.json(); setSubStatus(data); }
    } catch {}
  }, [token, user?.role]);

  const hasHumanizerAccess = user?.role === 'admin' || (
    subStatus?.active
    && (subStatus.planType === 'pro' || subStatus.planType === 'pro_plus')
    && (subStatus.humanizerWordsRemaining === null || subStatus.humanizerWordsRemaining > 0)
  );
  const hasHumanizerPlan = user?.role === 'admin' || (
    subStatus?.active && (subStatus.planType === 'pro' || subStatus.planType === 'pro_plus')
  );

  // Input state
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HumanizeResponse | null>(null);

  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;
  const effectiveWordCount = inputMode === 'file' ? manualWordCount : wordCount;
  const expressPricing = calculateExpressHumanizerPricing(effectiveWordCount);
  const humanizerLimit = subStatus?.humanizerWordLimit ?? 0;
  const humanizerUsed = subStatus?.humanizerWordsUsed ?? 0;
  const usagePercent = humanizerLimit > 0 ? Math.min(100, Math.round((humanizerUsed / humanizerLimit) * 100)) : 0;
  const usageTone = usagePercent >= 85 ? 'red' : usagePercent >= 60 ? 'amber' : 'emerald';
  const usageBarClass = usageTone === 'red' ? 'bg-red-500' : usageTone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
  const usageTextClass = usageTone === 'red' ? 'text-red-700' : usageTone === 'amber' ? 'text-amber-700' : 'text-emerald-700';

  const canSubmit = inputMode === 'text'
    ? inputText.trim().length >= 20
    : selectedFile !== null;

  const canSubmitExpress = canSubmit && voucherFile !== null && effectiveWordCount >= 1000;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['txt', 'md', 'docx'].includes(ext || '')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Formato no soportado. Usa .txt, .md o .docx');
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['txt', 'md', 'docx'].includes(ext || '')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setSelectedFile(null);
        setError('Formato no soportado. Usa .txt, .md o .docx');
      }
    }
  }, []);

  const handleSubmit = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      let response: Response;

      if (!hasHumanizerAccess) {
        if (!EXPRESS_FEATURE_ENABLED) {
          window.location.hash = '#/pricing';
          setIsProcessing(false);
          return;
        }
        // Express flow
        if (effectiveWordCount < 1000) {
          setError('El humanizador express requiere al menos 1000 palabras.');
          setIsProcessing(false);
          return;
        }
        if (!voucherFile) {
          setError('Debes subir un comprobante de pago.');
          setIsProcessing(false);
          return;
        }
        
        const formData = new FormData();
        formData.append('voucher', voucherFile);
        formData.append('tone', HUMANIZER_TONE);
        formData.append('strength', HUMANIZER_STRENGTH);
        formData.append('preserveMeaning', String(HUMANIZER_PRESERVE_MEANING));
        formData.append('variety', String(HUMANIZER_VARIETY));

        if (inputMode === 'file' && selectedFile) {
          formData.append('file', selectedFile);
        } else {
          formData.append('text', inputText);
        }

        response = await fetch('/api/humanize/express', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

      } else {
        // Standard flow
        if (inputMode === 'file' && selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          formData.append('tone', HUMANIZER_TONE);
          formData.append('strength', HUMANIZER_STRENGTH);
          formData.append('preserveMeaning', String(HUMANIZER_PRESERVE_MEANING));
          formData.append('variety', String(HUMANIZER_VARIETY));

          response = await fetch('/api/humanize-file', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        } else {
          response = await fetch('/api/humanize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              text: inputText,
              tone: HUMANIZER_TONE,
              strength: HUMANIZER_STRENGTH,
              preserveMeaning: HUMANIZER_PRESERVE_MEANING,
              variety: HUMANIZER_VARIETY,
            }),
          });
        }
      }

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 402 || data.requiresSubscription) {
          window.location.hash = '#/pricing';
          setIsProcessing(false);
          return;
        }
        throw new Error(typeof data.error === 'string' ? data.error : 'Error al procesar el texto');
      }

      const data = await response.json();
      
      if (!hasHumanizerAccess) {
        setExpressSuccess(true);
      } else {
        setResult(data);
      }
      
      // Refresh subscription status to update usage counters
      await refreshSubStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexion');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (result?.downloadUrl) {
      window.open(result.downloadUrl, '_blank');
    }
  };

  const handleReset = () => {
    setResult(null);
    setInputText('');
    setSelectedFile(null);
    setVoucherFile(null);
    setExpressSuccess(false);
    setError(null);
  };

  // ── Results View ──
  if (result) {
    return (
      <div className="flex-1 flex flex-col items-center p-6 md:p-12 w-full max-w-5xl mx-auto">
        <div className="mb-6 ui-toast ui-toast-success flex items-center gap-3 animate-pulse">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-800">Humanizacion completada correctamente.</span>
        </div>
        <div className="text-center mb-8">
          <h1 className="ui-title-lg text-3xl">Texto Humanizado</h1>
          <p className="ui-subtitle mt-1">
            Modelo: {result.model} &middot; Estilo: humano neutro
          </p>
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Input Analysis */}
          <div className="ui-surface p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Texto Original</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="ui-surface-muted p-3 text-center">
                <div className="text-lg font-bold text-slate-800">{result.inputAnalysis.words}</div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase">Palabras</div>
              </div>
              <div className="ui-surface-muted p-3 text-center">
                <div className="text-lg font-bold text-slate-800">{result.inputAnalysis.sentences}</div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase">Oraciones</div>
              </div>
              <div className="ui-surface-muted p-3 text-center">
                <div className="text-lg font-bold text-slate-800">{result.inputAnalysis.lexicalDiversity}</div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase">Diversidad</div>
              </div>
            </div>
          </div>

          {/* Output Analysis */}
          <div className="ui-surface p-5 border-emerald-100">
            <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-3">Texto Humanizado</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl p-3 text-center bg-emerald-50/80 border border-emerald-100">
                <div className="text-lg font-bold text-emerald-700">{result.outputAnalysis.words}</div>
                <div className="text-[10px] font-semibold text-emerald-500 uppercase">Palabras</div>
              </div>
              <div className="rounded-xl p-3 text-center bg-emerald-50/80 border border-emerald-100">
                <div className="text-lg font-bold text-emerald-700">{result.outputAnalysis.sentences}</div>
                <div className="text-[10px] font-semibold text-emerald-500 uppercase">Oraciones</div>
              </div>
              <div className="rounded-xl p-3 text-center bg-emerald-50/80 border border-emerald-100">
                <div className="text-lg font-bold text-emerald-700">{result.outputAnalysis.lexicalDiversity}</div>
                <div className="text-[10px] font-semibold text-emerald-500 uppercase">Diversidad</div>
              </div>
            </div>
          </div>
        </div>

        {/* Output text */}
        <div className="w-full ui-surface-elevated p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Resultado</h3>
            <button
              onClick={() => navigator.clipboard.writeText(result.output)}
              className="text-xs font-semibold text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Copiar
            </button>
          </div>
          <div className="ui-surface-muted p-5 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
            {result.output}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleDownload}
            className="ui-btn ui-btn-primary px-8 py-3.5 text-white font-bold flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Descargar .docx
          </button>
          <button
            onClick={handleReset}
            className="ui-btn ui-btn-secondary px-8 py-3.5 text-slate-600 font-bold"
          >
            Nuevo texto
          </button>
        </div>
      </div>
    );
  }

  // ── Main Input View ──
  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <span className="ui-eyebrow mb-3"><Sparkles className="w-3.5 h-3.5" /> Estandar y Premium</span>
          <h1 className="ui-title-lg">Humanizador de textos</h1>
          <p className="ui-subtitle mt-1">
            Reescribe contenido con una voz humana, neutra y lista para descargar.
          </p>
        </div>

        {hasHumanizerPlan && subStatus && user?.role !== 'admin' && (
          <div className="w-full lg:w-[360px] ui-surface p-4">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Uso mensual</p>
                <p className={`text-sm font-extrabold ${usageTextClass}`}>
                  {humanizerUsed.toLocaleString()} / {humanizerLimit.toLocaleString()} palabras
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">{usagePercent}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${usageBarClass}`} style={{ width: `${usagePercent}%` }} />
            </div>
          </div>
        )}
      </div>

      {EXPRESS_FEATURE_ENABLED && expressSuccess && (
        <div className="mb-6 ui-toast ui-toast-success flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-bold text-emerald-800">Pago y archivo enviados</p>
            <p className="text-sm text-emerald-700">Tu solicitud esta en proceso y aparecera en el historial cuando este lista.</p>
          </div>
        </div>
      )}

      {hasHumanizerPlan && !hasHumanizerAccess && user?.role !== 'admin' && (
        <div className="mb-6 ui-toast ui-toast-error flex items-center gap-3">
          <Lock className="w-5 h-5 text-red-600" />
          <p className="text-sm font-bold">Has alcanzado el límite mensual de palabras de tu plan.</p>
        </div>
      )}

      {!hasHumanizerPlan && user?.role !== 'admin' && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Lock className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-800">Tu plan actual no incluye acceso al humanizador.</p>
            <p className="text-xs text-amber-700">Mejora tu suscripción para usar esta función.</p>
          </div>
          <button onClick={() => window.location.hash = '#/pricing'} className="ui-btn ui-btn-primary px-4 py-2 text-xs">
            Actualizar
          </button>
        </div>
      )}

      <div className={`w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${EXPRESS_FEATURE_ENABLED && expressSuccess ? 'hidden' : ''}`}>
        <div className="lg:col-span-8">
          <div className="ui-surface-elevated p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => setInputMode('file')}
                  className={`ui-btn min-h-0 px-4 py-2 text-sm ${inputMode === 'file' ? 'ui-btn-primary' : 'bg-transparent text-slate-600 hover:bg-white'}`}
                >
                  <FileUp className="w-4 h-4" />
                  Subir archivo
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`ui-btn min-h-0 px-4 py-2 text-sm ${inputMode === 'text' ? 'ui-btn-primary' : 'bg-transparent text-slate-600 hover:bg-white'}`}
                >
                  <PenLine className="w-4 h-4" />
                  Pegar texto
                </button>
              </div>
              <span className="text-xs font-semibold text-slate-400">.docx, .txt, .md</span>
            </div>

            {inputMode === 'file' && (
              <div
                className={`relative min-h-[300px] rounded-lg border-2 border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  isDraggingFile
                    ? 'border-slate-800 bg-slate-100'
                    : selectedFile
                      ? 'border-emerald-300 bg-emerald-50/70'
                      : 'border-slate-300 bg-slate-50 hover:border-slate-500 hover:bg-white'
                }`}
                onDragEnter={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDraggingFile(false); }}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.docx"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {selectedFile ? (
                  <div className="w-full max-w-md">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <FileCheck2 className="w-7 h-7" />
                    </div>
                    <p className="text-base font-extrabold text-slate-900 truncate">{selectedFile.name}</p>
                    <p className="text-sm text-slate-500 mt-1">{formatSize(selectedFile.size)}</p>
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 text-left">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Vista previa</p>
                      <p className="text-sm text-slate-700 truncate">{selectedFile.name}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      className="mt-4 text-xs font-bold text-red-500 hover:text-red-700"
                    >
                      Quitar archivo
                    </button>
                  </div>
                ) : (
                  <div className="max-w-sm">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center shadow-sm">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-extrabold text-slate-800">Arrastra tu documento aqui</p>
                    <p className="text-sm text-slate-500 mt-1">o haz clic para seleccionar un archivo compatible.</p>
                  </div>
                )}
              </div>
            )}

            {inputMode === 'text' && (
              <div className="space-y-3">
                <textarea
                  id="ai-input"
                  className="ui-input min-h-[300px] w-full rounded-lg p-4 text-sm leading-6 text-slate-700 placeholder:text-slate-400 resize-none"
                  placeholder="Pega aqui el texto que quieres humanizar..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <button
                    onClick={() => setInputText('')}
                    className="text-xs font-bold text-slate-500 hover:text-red-600"
                  >
                    Borrar
                  </button>
                  <span className="text-xs font-bold text-slate-500">{wordCount.toLocaleString()} palabras</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4 lg:sticky lg:top-6">
          <div className="ui-surface-elevated p-4 md:p-5">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Estilo unico</p>
            <h3 className="text-base font-extrabold text-slate-900">Humano neutro</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Escritura clara, natural y sin palabras rebuscadas. El texto conserva su significado y evita cambios exagerados.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="ui-toast ui-toast-error flex items-start gap-3 text-sm font-semibold">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Express Payment Section */}
          {EXPRESS_FEATURE_ENABLED && !hasHumanizerAccess && user?.role === 'user' && (
            <div className="ui-surface-elevated p-6 border border-indigo-100 bg-indigo-50/30">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4">
                Pago Express
              </h3>
              
              <div className="flex justify-between items-center mb-4 p-3 bg-white border border-slate-200 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-500">Costo ({expressPricing.billedWords} palabras facturadas)</p>
                  <p className="text-lg font-bold text-slate-800">${expressPricing.amount.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Tarifa</p>
                  <p className="text-xs font-medium text-slate-600">$0.50 / 1000 palabras</p>
                </div>
              </div>

              {accounts.length > 0 && (
                <div className="mb-4 space-y-2">
                  {accounts.map((account, index) => {
                    const copyId = account.id || `humanizer-acc-${index}`;
                    return (
                      <div key={copyId} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-slate-700">{account.bankName} - {account.accountType}</p>
                            <p className="text-sm font-mono font-bold text-slate-800">{account.accountNumber}</p>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400">{account.accountHolder}</p>
                          </div>
                          <button onClick={() => handleCopy(account.accountNumber, copyId)} className="text-slate-400 hover:text-slate-700">
                            {copied === copyId ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${voucherFile ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-slate-400 bg-white'}`}
                onClick={() => voucherInputRef.current?.click()}
              >
                <input ref={voucherInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={(e) => {
                  if (e.target.files?.[0]) { setVoucherFile(e.target.files[0]); setError(null); }
                }} />
                {voucherFile ? (
                  <div>
                    <CheckCircle2 className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-indigo-800 truncate px-2">{voucherFile.name}</p>
                  </div>
                ) : (
                  <div>
                    <ReceiptText className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-600">Subir comprobante</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Minimo 1000 palabras</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={(hasHumanizerAccess ? !canSubmit : !EXPRESS_FEATURE_ENABLED || !canSubmitExpress) || isProcessing}
            className={`ui-btn w-full py-4 text-sm font-extrabold ${
              (hasHumanizerAccess ? canSubmit : (EXPRESS_FEATURE_ENABLED && canSubmitExpress)) && !isProcessing
                ? 'ui-btn-primary text-white shadow-md'
                : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Humanizando...
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                {hasHumanizerAccess ? `Humanizar ${inputMode === 'file' ? 'archivo' : 'texto'}` : 'Actualizar plan'}
              </>
            )}
          </button>

          <p className="text-center text-[11px] font-medium text-slate-400">
            Archivos soportados: .docx, .txt, .md
          </p>
        </div>
      </div>
    </div>
  );
}
