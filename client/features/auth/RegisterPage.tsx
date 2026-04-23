import React, { useState, useRef, useEffect } from 'react';
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

  // Verification code state
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

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    } catch { setError('Error de conexión con el servidor'); }
    setLoading(false);
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
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
    if (codeStr.length !== 6) { setError('Ingresa el código completo de 6 dígitos'); return; }
    setError(''); setLoading(true);
    const result = await verifyCode(email, codeStr);
    setLoading(false);
    if (!result.success) setError(result.error || 'Error al verificar');
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError(''); setSuccess('');
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    } catch { setError('Error de conexión'); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 relative overflow-hidden p-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-200/20 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-slate-800">
              Academi<span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">X</span>
              <span className="text-blue-600 font-black">AI</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {step === 'register' ? 'Crea tu cuenta' : 'Verifica tu correo'}
          </h1>
          <p className="text-slate-400 mt-1">
            {step === 'register' ? 'Regístrate para analizar tus documentos' : `Enviamos un código a ${email}`}
          </p>
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl shadow-slate-200/50 border border-white/60 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500" />

          {step === 'register' ? (
            <form onSubmit={handleRegister} className="relative z-10 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Nombre completo</label>
                <input id="register-name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Tu nombre"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Correo electrónico</label>
                <input id="register-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@correo.com"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Contraseña</label>
                  <input id="register-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Confirmar</label>
                  <input id="register-confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="••••••"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-fade-in-up">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-600 text-sm font-semibold">{error}</p>
                </div>
              )}

              <button id="register-submit" type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Registrando...' : 'Crear Cuenta'}
              </button>
            </form>
          ) : (
            /* VERIFICATION STEP */
            <div className="relative z-10 space-y-6">
              {/* Email icon */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              {/* Code input boxes */}
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
                    className="w-12 h-14 text-center text-xl font-bold bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-fade-in-up">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-600 text-sm font-semibold">{error}</p>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 animate-fade-in-up">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-emerald-600 text-sm font-semibold">{success}</p>
                </div>
              )}

              <button onClick={handleVerify} disabled={loading || code.join('').length !== 6}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Verificando...
                  </span>
                ) : 'Verificar Cuenta'}
              </button>

              {/* Resend link */}
              <div className="text-center">
                <p className="text-sm text-slate-400">
                  ¿No recibiste el código?{' '}
                  {resendCooldown > 0 ? (
                    <span className="text-slate-300 font-medium">Reenviar en {resendCooldown}s</span>
                  ) : (
                    <button onClick={handleResendCode} className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
                      Reenviar código
                    </button>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 text-center relative z-10">
            <p className="text-sm text-slate-400">
              ¿Ya tienes cuenta?{' '}
              <a href="#/login" className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">Inicia sesión</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
