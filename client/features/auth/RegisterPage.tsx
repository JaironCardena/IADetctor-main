import React, { useState, useRef, useEffect } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';

type Step = 'register' | 'verify';

export function RegisterPage() {
  const { verifyCode } = useAuth();
  const [step, setStep] = useState<Step>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const applyHashVerificationState = () => {
      const hash = window.location.hash || '#/register';
      const [, rawQuery = ''] = hash.split('?');
      const params = new URLSearchParams(rawQuery);
      const verifyEmail = params.get('verify');
      if (!verifyEmail) return;

      setEmail(verifyEmail);
      setStep('verify');
      setError('');
      setSuccess('');
      setCode(['', '', '', '', '', '']);
      setResendCooldown((prev) => (prev > 0 ? prev : 60));
    };

    applyHashVerificationState();
    window.addEventListener('hashchange', applyHashVerificationState);
    return () => window.removeEventListener('hashchange', applyHashVerificationState);
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (res.ok && data.needsVerification) {
        setStep('verify');
        setResendCooldown(60);
        setSuccess('');
      } else {
        setError(data.error || 'Error al registrarse');
      }
    } catch {
      setError('Error de conexión con el servidor');
    }
    setLoading(false);
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < text.length; i++) newCode[i] = text[i];
    setCode(newCode);
    inputRefs.current[Math.min(text.length, 5)]?.focus();
  };

  const handleVerify = async () => {
    const codeStr = code.join('');
    if (codeStr.length !== 6) {
      setError('Ingresa el código completo de 6 dígitos');
      return;
    }
    setError('');
    setLoading(true);
    const result = await verifyCode(email, codeStr);
    setLoading(false);
    if (!result.success) setError(result.error || 'Error al verificar');
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Código reenviado a tu correo.');
        setResendCooldown(60);
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } else {
        setError(data.error || 'Error al reenviar');
      }
    } catch {
      setError('Error de conexión');
    }
  };

  return (
    <div className="ui-page min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-11 h-11 bg-sky-600 rounded-xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-6 h-6 text-white" strokeWidth={2.3} />
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-slate-900">
              Academi<span className="text-sky-600">X</span><span className="text-sky-600"> AI</span>
            </span>
          </div>
          <h1 className="ui-title-lg text-2xl">
            {step === 'register' ? 'Crea tu cuenta' : 'Verifica tu correo'}
          </h1>
          <p className="ui-subtitle mt-2">
            {step === 'register' ? 'Regístrate para analizar tus documentos.' : `Enviamos un código a ${email}.`}
          </p>
        </div>

        <div className="ui-surface-elevated p-7 md:p-8">
          {step === 'register' ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="ui-label" htmlFor="register-name">Nombre completo</label>
                <input id="register-name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Tu nombre" className="ui-input" />
              </div>
              <div>
                <label className="ui-label" htmlFor="register-email">Correo electrónico</label>
                <input id="register-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@correo.com" className="ui-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="ui-label" htmlFor="register-password">Contraseña</label>
                  <input id="register-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••" className="ui-input" />
                </div>
                <div>
                  <label className="ui-label" htmlFor="register-confirm">Confirmar</label>
                  <input id="register-confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="••••••" className="ui-input" />
                </div>
              </div>

              {error && (
                <div className="ui-toast ui-toast-error flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm font-semibold">{error}</p>
                </div>
              )}

              <button id="register-submit" type="submit" disabled={loading} className="ui-btn ui-btn-primary w-full py-3.5">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Registrando...</> : 'Crear cuenta'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center border border-sky-100">
                  <KeyRound className="w-8 h-8 text-sky-600" />
                </div>
              </div>

              <div className="flex justify-center gap-2.5" onPaste={handleCodePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleCodeChange(i, e.target.value)}
                    onKeyDown={e => handleCodeKeyDown(i, e)}
                    className="w-11 sm:w-12 h-14 text-center text-xl font-extrabold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-400 transition-all shadow-sm"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {error && (
                <div className="ui-toast ui-toast-error flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm font-semibold">{error}</p>
                </div>
              )}

              {success && (
                <div className="ui-toast ui-toast-success flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm font-semibold">{success}</p>
                </div>
              )}

              <button onClick={handleVerify} disabled={loading || code.join('').length !== 6} className="ui-btn ui-btn-primary w-full py-3.5">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Verificando...</> : 'Verificar cuenta'}
              </button>

              <div className="text-center">
                <p className="text-sm text-slate-500">
                  ¿No recibiste el código?{' '}
                  {resendCooldown > 0 ? (
                    <span className="font-medium text-slate-400">Reenviar en {resendCooldown}s</span>
                  ) : (
                    <button onClick={handleResendCode} className="text-sky-700 font-bold hover:text-sky-800 transition-colors">
                      Reenviar código
                    </button>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              ¿Ya tienes cuenta?{' '}
              <a href="#/login" className="text-sky-700 font-bold hover:text-sky-800 transition-colors">Inicia sesión</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
