import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) {
      if (result.needsVerification) {
        window.location.hash = `#/register?verify=${encodeURIComponent(result.email || email)}`;
        return;
      }
      setError(result.error || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="ui-page min-h-screen flex items-center justify-center relative overflow-hidden p-4">
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-11 h-11 bg-sky-600 rounded-xl flex items-center justify-center shadow-sm">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-slate-800">
              Academi<span className="text-sky-600">X</span>
              <span className="text-sky-600 font-black">AI</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Bienvenido de vuelta</h1>
          <p className="text-slate-400 mt-1">Inicia sesión para continuar</p>
        </div>

        <div className="ui-surface-elevated p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />

          <form onSubmit={handleSubmit} className="relative z-10 space-y-5">
            <div>
              <label className="ui-label">Correo electrónico</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="tu@correo.com"
                className="ui-input"
              />
            </div>

            <div>
              <label className="ui-label">Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="********"
                className="ui-input"
              />
            </div>

            {error && (
              <div className="ui-toast ui-toast-error flex items-center gap-2 animate-fade-in-up">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-600 text-sm font-semibold">{error}</p>
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Iniciando sesión...
                </span>
              ) : 'Iniciar sesión'}
            </button>
          </form>

          <div className="mt-6 text-center relative z-10">
            <p className="text-sm text-slate-400">
              No tienes cuenta?{' '}
              <a
                href="#/register"
                className="text-blue-600 font-semibold hover:text-blue-700 transition-colors"
              >
                Regístrate aquí
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
