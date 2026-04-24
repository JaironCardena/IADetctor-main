import React from 'react';
import {
  BadgeCheck,
  ClipboardCheck,
  LogOut,
  PenLine,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

interface HeaderProps {
  activeTab: 'detector' | 'humanizer';
  setActiveTab: (tab: 'detector' | 'humanizer') => void;
}

export function Header({ activeTab, setActiveTab }: HeaderProps) {
  const { user, logout, hasActiveSubscription } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isOnAdmin = window.location.hash.startsWith('#/admin');
  const initials = user?.name?.slice(0, 1).toUpperCase() || 'U';

  const tabClass = (active: boolean) => `ui-nav-tab ${active ? 'ui-nav-tab-active' : ''}`;

  return (
    <header className="h-16 ui-nav-shell border-b flex items-center justify-between px-4 md:px-8 sticky top-0 z-50">
      <div className="flex items-center gap-5 md:gap-8 h-full min-w-0">
        <a href="#/" className="flex items-center gap-2.5 no-underline shrink-0" aria-label="AcademiX AI">
          <div className="w-9 h-9 bg-sky-600 rounded-xl flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.3} />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-slate-900">
            Academi<span className="text-sky-600">X</span><span className="text-sky-600"> AI</span>
          </span>
        </a>

        <nav className="hidden md:flex gap-1 items-center" aria-label="Navegación principal">
          {!isOnAdmin && (
            <>
              <button
                id="tab-detector"
                onClick={() => { setActiveTab('detector'); window.location.hash = '#/'; }}
                className={tabClass(activeTab === 'detector')}
              >
                <ClipboardCheck className="w-4 h-4" />
                Detector
              </button>
              <button
                id="tab-humanizer"
                onClick={() => { setActiveTab('humanizer'); window.location.hash = '#/'; }}
                className={tabClass(activeTab === 'humanizer')}
              >
                <PenLine className="w-4 h-4" />
                Humanizador
              </button>
            </>
          )}

          {isAdmin && (
            <a href="#/admin" className={`ui-nav-tab ${isOnAdmin ? 'text-violet-700 bg-violet-50' : ''}`}>
              <SlidersHorizontal className="w-4 h-4" />
              Admin
            </a>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-bold text-emerald-700">Online</span>
        </div>

        {user && (
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white ${isAdmin ? 'bg-violet-600' : 'bg-sky-600'}`}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700 max-w-[120px] truncate leading-tight">{user.name}</p>
                <div className="flex items-center gap-1">
                  <UserRound className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-semibold text-slate-400">{isAdmin ? 'Administrador' : 'Usuario'}</span>
                </div>
              </div>
              {isAdmin ? (
                <span className="ui-chip bg-violet-50 border border-violet-100 text-violet-700">Admin</span>
              ) : hasActiveSubscription ? (
                <span className="ui-chip ui-chip-status-completed"><BadgeCheck className="w-3 h-3" />Activa</span>
              ) : (
                <span className="ui-chip bg-red-50 border border-red-100 text-red-700">Sin plan</span>
              )}
            </div>
            <button
              id="logout-btn"
              onClick={logout}
              className="ui-btn ui-btn-ghost w-9 h-9 rounded-lg text-slate-500 hover:text-red-600"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 ui-mobile-nav flex z-50">
        <button
          onClick={() => { setActiveTab('detector'); window.location.hash = '#/'; }}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${activeTab === 'detector' && !isOnAdmin ? 'text-sky-600' : 'text-slate-400'}`}
        >
          <ClipboardCheck className="w-5 h-5" />
          <span className="text-[10px] font-bold">Detector</span>
        </button>
        <button
          onClick={() => { setActiveTab('humanizer'); window.location.hash = '#/'; }}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${activeTab === 'humanizer' && !isOnAdmin ? 'text-sky-600' : 'text-slate-400'}`}
        >
          <PenLine className="w-5 h-5" />
          <span className="text-[10px] font-bold">Humanizar</span>
        </button>
        {isAdmin && (
          <a href="#/admin" className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 ${isOnAdmin ? 'text-violet-600' : 'text-slate-400'}`}>
            <SlidersHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-bold">Admin</span>
          </a>
        )}
      </div>
    </header>
  );
}
