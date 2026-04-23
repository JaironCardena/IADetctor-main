import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { io } from 'socket.io-client';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  subscriptionPlan: 'basic' | 'pro' | 'pro_plus' | null;
  subscriptionExpiresAt: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; needsVerification?: boolean; email?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string; needsVerification?: boolean; email?: string }>;
  verifyCode: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshSubscription: () => Promise<void>;
  hasActiveSubscription: boolean;
  activePlan: 'basic' | 'pro' | 'pro_plus' | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('academix_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => setUser(data.user))
        .catch(() => { localStorage.removeItem('academix_token'); setToken(null); })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    
    socket.on('payment_approved', (data: { userId: string }) => {
      if (data.userId === user.id) {
        refreshSubscription();
      }
    });

    socket.on('payment_rejected', (data: { userId: string }) => {
      if (data.userId === user.id) {
        // Optional: show a toast or alert, but for now we just refresh history implicitly
        refreshSubscription();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, refreshSubscription]);

  const refreshSubscription = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {}
  }, [token]);

  const hasActiveSubscription = (() => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!user.subscriptionExpiresAt) return false;
    return new Date(user.subscriptionExpiresAt) > new Date();
  })();

  const activePlan = (() => {
    if (!user) return null;
    if (user.role === 'admin') return 'pro_plus';
    if (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) <= new Date()) return null;
    return user.subscriptionPlan;
  })();

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token); setUser(data.user);
        localStorage.setItem('academix_token', data.token);
        return { success: true };
      }
      if (res.status === 403 && data.needsVerification) {
        return { success: false, error: data.error, needsVerification: true, email: data.email };
      }
      return { success: false, error: data.error };
    } catch { return { success: false, error: 'Error de conexión con el servidor' }; }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.needsVerification) {
          return { success: true, needsVerification: true, email: data.email };
        }
        setToken(data.token); setUser(data.user);
        localStorage.setItem('academix_token', data.token);
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch { return { success: false, error: 'Error de conexión con el servidor' }; }
  };

  const verifyCode = async (email: string, code: string) => {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token); setUser(data.user);
        localStorage.setItem('academix_token', data.token);
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch { return { success: false, error: 'Error de conexión con el servidor' }; }
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('academix_token');
    window.location.hash = '#/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, verifyCode, logout, refreshSubscription, hasActiveSubscription, activePlan }}>
      {children}
    </AuthContext.Provider>
  );
}

