import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FileText, FileUp, Lock, PenLine, Sparkles, ReceiptText, CheckCircle2, Copy } from 'lucide-react';
import type { SubscriptionStatus, BankAccount } from '@shared/types/subscription';

const EXPRESS_FEATURE_ENABLED = false;

type Tone = 'natural' | 'formal' | 'casual' | 'academic' | 'persuasive';
type Strength = 'light' | 'medium' | 'strong';
type InputMode = 'text' | 'file';

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

const TONE_OPTIONS: { value: Tone; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'academic', label: 'Academico', desc: 'Formal y estructurado',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" /><path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /></svg>
  },
  {
    value: 'formal', label: 'Profesional', desc: 'Directo y corporativo',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
  },
  {
    value: 'natural', label: 'Natural', desc: 'Fluido y organico',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
  },
  {
    value: 'casual', label: 'Casual', desc: 'Cercano e informal',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  },
  {
    value: 'persuasive', label: 'Persuasivo', desc: 'Argumentativo y dinamico',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
  },
];

const STRENGTH_OPTIONS: { value: Strength; label: string }[] = [
  { value: 'light', label: 'Sutil' },
  { value: 'medium', label: 'Moderado' },
  { value: 'strong', label: 'Profundo' },
];

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
    subStatus && (subStatus.humanizerWordsRemaining === null || subStatus.humanizerWordsRemaining > 0)
  );

  // Input state
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Settings
  const [tone, setTone] = useState<Tone>('academic');
  const [strength, setStrength] = useState<Strength>('medium');
  const [preserveMeaning, setPreserveMeaning] = useState(true);
  const [variety, setVariety] = useState(0.7);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HumanizeResponse | null>(null);

  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;
  const effectiveWordCount = inputMode === 'file' ? manualWordCount : wordCount;
  const expressPricing = calculateExpressHumanizerPricing(effectiveWordCount);

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
        formData.append('tone', tone);
        formData.append('strength', strength);
        formData.append('preserveMeaning', String(preserveMeaning));
        formData.append('variety', String(variety));

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
          formData.append('tone', tone);
          formData.append('strength', strength);
          formData.append('preserveMeaning', String(preserveMeaning));
          formData.append('variety', String(variety));

          response = await fetch('/api/humanize-file', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        } else {
          response = await fetch('/api/humanize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text: inputText, tone, strength, preserveMeaning, variety }),
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
        <div className="text-center mb-8">
          <h1 className="ui-title-lg text-3xl">Texto Humanizado</h1>
          <p className="ui-subtitle mt-1">
            Modelo: {result.model} &middot; Tono: {result.settings.tone} &middot; Intensidad: {result.settings.strength}
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
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 w-full max-w-5xl mx-auto">
      <div className="text-center mb-8 max-w-2xl w-full">
        <span className="ui-eyebrow mx-auto mb-4"><Sparkles className="w-3.5 h-3.5" /> Pro+</span>
        <h1 className="ui-title-lg text-3xl">Humanizador de textos</h1>
        <p className="ui-subtitle mt-1">
          Reescribe textos generados por IA para que pasen los detectores academicos.
        </p>
        
        {EXPRESS_FEATURE_ENABLED && expressSuccess && (
          <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex flex-col items-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
            <h3 className="text-lg font-bold text-slate-800">Pago y archivo enviados</h3>
            <p className="text-slate-600 text-sm mt-2 max-w-md">
              Tu solicitud está en proceso. Una vez que un administrador apruebe tu pago, podrás descargar el resultado desde tu <strong>Historial de Tickets</strong>.
            </p>
            <button onClick={handleReset} className="ui-btn ui-btn-primary mt-6 px-6">
              Nueva solicitud
            </button>
          </div>
        )}

        {/* Usage stats for pro_plus users */}
        {hasHumanizerAccess && subStatus && user?.role !== 'admin' && (
          <div className="mt-4 inline-flex items-center gap-4 bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-indigo-600 uppercase">Envios:</span>
              <span className="text-sm font-bold text-indigo-800">
                {subStatus.humanizerUsed}{subStatus.humanizerSubmissionsRemaining !== null ? ` / ${(subStatus.humanizerUsed + subStatus.humanizerSubmissionsRemaining)}` : ''}
              </span>
              {subStatus.humanizerSubmissionsRemaining === null && (
                <span className="text-[10px] font-bold text-indigo-400 uppercase">Ilimitado</span>
              )}
            </div>
            <div className="w-px h-4 bg-indigo-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-indigo-600 uppercase">Palabras:</span>
              <span className="text-sm font-bold text-indigo-800">
                {subStatus.humanizerWordsUsed?.toLocaleString()}{subStatus.humanizerWordsRemaining !== null ? ` / ${((subStatus.humanizerWordsUsed || 0) + subStatus.humanizerWordsRemaining).toLocaleString()}` : ''}
              </span>
              {subStatus.humanizerWordsRemaining === null && (
                <span className="text-[10px] font-bold text-indigo-400 uppercase">Ilimitado</span>
              )}
            </div>
          </div>
        )}
        {/* Blocked banner for non pro_plus */}
        {!hasHumanizerAccess && user?.role !== 'admin' && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-bold text-amber-800">Requiere Plan Pro+</p>
              <p className="text-xs text-amber-600">Actualiza tu suscripcion para acceder al humanizador.</p>
            </div>
            <button onClick={() => window.location.hash = '#/pricing'} className="ml-auto ui-btn ui-btn-primary px-4 py-2 text-xs font-bold text-white">
              Actualizar
            </button>
          </div>
        )}
      </div>

      <div className={`w-full grid grid-cols-1 lg:grid-cols-12 gap-8 ${EXPRESS_FEATURE_ENABLED && expressSuccess ? 'hidden' : ''}`}>
        {/* Left: Input area */}
        <div className="col-span-1 lg:col-span-8">
          <div className="ui-surface-elevated p-6 flex flex-col h-full min-h-[460px]">
            {/* Mode toggle */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setInputMode('file')}
                className={`ui-btn px-4 py-2 rounded-xl text-sm font-bold transition-all ${inputMode === 'file' ? 'ui-btn-primary text-white' : 'ui-btn-secondary text-slate-500'}`}
              >
                <span className="flex items-center gap-2">
                  <FileUp className="w-4 h-4" />
                  Subir archivo
                </span>
              </button>
              <button
                onClick={() => setInputMode('text')}
                className={`ui-btn px-4 py-2 rounded-xl text-sm font-bold transition-all ${inputMode === 'text' ? 'ui-btn-primary text-white' : 'ui-btn-secondary text-slate-500'}`}
              >
                <span className="flex items-center gap-2">
                  <PenLine className="w-4 h-4" />
                  Pegar texto
                </span>
              </button>
            </div>

            {/* File upload area */}
            {inputMode === 'file' && (
              <div
                className={`ui-upload-tile flex-1 flex flex-col items-center justify-center p-8 cursor-pointer ${
                  selectedFile ? 'border-blue-300 bg-blue-50/50' : ''
                }`}
                onDragOver={(e) => e.preventDefault()}
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
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
                      <FileText className="w-8 h-8 text-blue-600" />
                    </div>
                    <p className="text-lg font-bold text-slate-800 mb-1">{selectedFile.name}</p>
                    <p className="text-sm text-slate-500">{formatSize(selectedFile.size)}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      className="mt-4 text-xs font-bold text-red-400 hover:text-red-600 transition-colors"
                    >
                      Quitar archivo
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                      <FileUp className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-lg font-bold text-slate-600 mb-1">Arrastra un archivo aquí</p>
                    <p className="text-sm text-slate-400 mb-3">o haz clic para seleccionar</p>
                    <p className="text-xs text-slate-400 font-medium">.docx, .txt, .md</p>
                  </div>
                )}
                {inputMode === 'file' && !hasHumanizerAccess && EXPRESS_FEATURE_ENABLED && (
                  <div className="w-full mt-6 bg-white border border-slate-200 rounded-xl p-4 text-left">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Palabras estimadas del documento
                    </label>
                    <input 
                      type="number" 
                      min="1000"
                      value={manualWordCount}
                      onChange={(e) => setManualWordCount(Math.max(1000, parseInt(e.target.value) || 0))}
                      className="w-full p-3 text-sm font-bold text-slate-800 rounded-lg border border-slate-200 focus:border-slate-800 outline-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-2">
                      El express cobra $0.50 por cada 1000 palabras y el minimo permitido es 1000.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Text input area */}
            {inputMode === 'text' && (
              <>
                <textarea
                  id="ai-input"
                  className="ui-input w-full flex-1 rounded-2xl p-4 text-slate-700 placeholder:text-slate-300 resize-none"
                  placeholder="Pega el texto generado por IA aquí..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <div className="flex justify-between items-center mt-3">
                  <button
                    onClick={() => setInputText('')}
                    className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Borrar
                  </button>
                  <span className="text-xs font-semibold text-slate-400">{wordCount} palabras</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Settings panel */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
          <div className="ui-surface-elevated p-6 flex flex-col gap-6">
            {/* Tone selector */}
            <div>
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                Tono
              </h3>
              <div className="flex flex-col gap-2">
                {TONE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="ui-surface-muted relative flex items-center p-3 cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50 group">
                    <input type="radio" name="tone" value={opt.value} checked={tone === opt.value} onChange={() => setTone(opt.value)} className="sr-only peer" />
                    <div className="flex items-center gap-3 w-full">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center group-has-[:checked]:bg-blue-100 group-has-[:checked]:text-blue-600 transition-colors">
                        {opt.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">{opt.label}</span>
                        <span className="text-[11px] font-medium text-slate-400">{opt.desc}</span>
                      </div>
                    </div>
                    <div className="absolute right-4 w-4 h-4 rounded-full border-2 border-slate-200 hidden peer-checked:block bg-blue-600 border-blue-600 shadow-[0_0_0_2px_white_inset]" />
                  </label>
                ))}
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Strength */}
            <div>
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">Intensidad</h3>
              <div className="flex gap-2">
                {STRENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStrength(opt.value)}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      strength === opt.value
                        ? 'ui-btn-primary text-white shadow-md shadow-blue-500/25'
                        : 'ui-btn-secondary text-slate-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Advanced settings */}
            <div>
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Ajustes
              </h3>

              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-slate-500">Preservar significado</span>
                <button
                  onClick={() => setPreserveMeaning(!preserveMeaning)}
                  className={`w-10 h-6 rounded-full relative transition-colors ${preserveMeaning ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all ${preserveMeaning ? 'left-5' : 'left-1'}`} />
                </button>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-slate-500">Variedad lingüística</span>
                  <span className="text-xs font-bold text-blue-600">{Math.round(variety * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={variety * 100}
                  onChange={(e) => setVariety(Number(e.target.value) / 100)}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="ui-toast ui-toast-error p-4 text-red-600 text-sm font-medium">
              {error}
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
            className={`ui-btn w-full py-4 font-bold flex justify-center items-center gap-2 transition-all ${
              (hasHumanizerAccess ? canSubmit : (EXPRESS_FEATURE_ENABLED && canSubmitExpress)) && !isProcessing
                ? 'ui-btn-primary text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Procesando...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                {hasHumanizerAccess ? `Humanizar ${inputMode === 'file' ? 'Archivo' : 'Texto'}` : 'Actualizar plan'}
              </>
            )}
          </button>

          <p className="text-center text-[11px] font-medium text-slate-400">
            Archivos soportados: .docx, .txt, .md &middot; Hasta ~20 páginas
          </p>
        </div>
      </div>
    </div>
  );
}
