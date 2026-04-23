import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/Auth/LoginPage';
import { RegisterPage } from './components/Auth/RegisterPage';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { DetectorLayout } from './components/Detector/DetectorLayout';
import { HumanizerLayout } from './components/Humanizer/HumanizerLayout';
import { AdminDashboard } from './components/Admin/AdminDashboard';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const hash = useHashRoute();
  const [activeTab, setActiveTab] = useState<'detector' | 'humanizer'>('detector');

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25 animate-pulse">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-slate-400 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  // Not authenticated → show login/register
  if (!user) {
    if (hash === '#/register') return <RegisterPage />;
    return <LoginPage />;
  }

  // Admin route
  if (hash === '#/admin' && user.role === 'admin') {
    return (
      <div className="min-h-screen flex flex-col font-sans text-slate-900 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-indigo-200/15 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col min-h-screen">
          <Header activeTab={activeTab} setActiveTab={setActiveTab} />
          <AdminDashboard />
          <Footer />
        </div>
      </div>
    );
  }

  // User view (default)
  if (hash !== '#/' && hash !== '#/admin') {
    window.location.hash = '#/';
  }

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 relative overflow-hidden">
      {/* Ambient background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-indigo-200/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 right-1/3 w-72 h-72 bg-cyan-200/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Header activeTab={activeTab} setActiveTab={setActiveTab} />
        {activeTab === 'detector' ? <DetectorLayout /> : <HumanizerLayout />}
        <Footer />
      </div>
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
