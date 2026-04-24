import React, { useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
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
          <h1 className="ui-title-lg text-2xl">Bienvenido de vuelta</h1>
          <p className="ui-subtitle mt-2">Inicia sesión para revisar tus documentos y reportes.</p>
        </div>

        <div className="ui-surface-elevated p-7 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="ui-label" htmlFor="login-email">Correo electrónico</label>
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
              <label className="ui-label" htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="ui-input"
              />
            </div>

            {error && (
              <div className="ui-toast ui-toast-error flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full py-3.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Iniciando sesión...
                </>
              ) : 'Iniciar sesión'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              ¿No tienes cuenta?{' '}
              <a href="#/register" className="text-sky-700 font-bold hover:text-sky-800 transition-colors">
                Regístrate aquí
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
