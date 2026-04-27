import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { WhatsAppFloatingButton } from './components/WhatsAppFloatingButton';
import { DetectorLayout } from './features/detector/DetectorLayout';
import { HumanizerLayout } from './features/humanizer/HumanizerLayout';
import { AdminDashboard } from './features/admin/AdminDashboard';
import { PricingLayout } from './features/subscription/PricingLayout';
import { AccountLayout } from './features/account/AccountLayout';

export type AppTab = 'detector' | 'humanizer' | 'pricing' | 'account';

type HashRoute = {
  path: string;
  query: URLSearchParams;
};

function parseHashRoute(hash: string): HashRoute {
  const fallback = '#/';
  const safeHash = hash || fallback;
  const normalized = safeHash.startsWith('#') ? safeHash.slice(1) : safeHash;
  const [rawPath, rawQuery = ''] = normalized.split('?');
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return {
    path: path || '/',
    query: new URLSearchParams(rawQuery)
  };
}

function useHashRoute() {
  const [route, setRoute] = useState<HashRoute>(() => parseHashRoute(window.location.hash || '#/'));
  useEffect(() => {
    const handler = () => setRoute(parseHashRoute(window.location.hash || '#/'));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const route = useHashRoute();
  const [activeTab, setActiveTab] = useState<AppTab>('detector');

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    const tabByPath: Record<string, AppTab> = {
      '/': activeTab,
      '/detector': 'detector',
      '/humanizer': 'humanizer',
      '/pricing': 'pricing',
      '/account': 'account',
    };
    const nextTab = tabByPath[route.path];
    if (nextTab && nextTab !== activeTab) setActiveTab(nextTab);
  }, [activeTab, route.path, user]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center ui-page">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-slate-400 font-bold">Cargando...</p>
        </div>
      </div>
    );
  }

  // Not authenticated → show login/register
  if (!user) {
    if (route.path === '/register') return <RegisterPage />;
    return <LoginPage />;
  }

  // Admin route
  if (route.path === '/admin' && user.role === 'admin') {
    return (
      <div className="min-h-screen flex font-sans text-slate-900 ui-page">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-1 md:ml-64 flex flex-col min-h-screen pt-16 md:pt-0">
          <AdminDashboard />
          <Footer />
        </div>
        <WhatsAppFloatingButton />
      </div>
    );
  }

  // User view (default)
  const allowedUserRoutes = ['/', '/detector', '/humanizer', '/pricing', '/account'];
  if (!allowedUserRoutes.includes(route.path) && route.path !== '/admin') {
    window.location.hash = '#/';
  }

  return (
    <div className="min-h-screen flex font-sans text-slate-900 ui-page">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen pt-16 md:pt-0">
        {activeTab === 'detector' && <DetectorLayout />}
        {activeTab === 'humanizer' && <HumanizerLayout />}
        {activeTab === 'pricing' && <PricingLayout />}
        {activeTab === 'account' && <AccountLayout />}
        <Footer />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
