import React from 'react';
import { useAuth } from '../../features/auth/AuthContext';

interface HeaderProps {
  activeTab: 'detector' | 'humanizer';
  setActiveTab: (tab: 'detector' | 'humanizer') => void;
}

export function Header({ activeTab, setActiveTab }: HeaderProps) {
  const { user, logout, hasActiveSubscription } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isOnAdmin = window.location.hash.startsWith('#/admin');

  return (
    <header className="h-16 glass border-b border-white/40 flex items-center justify-between px-4 md:px-8 sticky top-0 z-50">
      <div className="flex items-center gap-6 md:gap-8 h-full">
        {/* Logo */}
        <a href="#/" className="flex items-center gap-2.5 no-underline">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-slate-800">
            Academi<span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">X</span>
            <span className="text-blue-600 font-black">AI</span>
          </span>
        </a>

        {/* Navigation tabs */}
        <nav className="hidden md:flex gap-1 h-full items-center">
          {!isOnAdmin && (
            <>
              <button
                id="tab-detector"
                onClick={() => { setActiveTab('detector'); window.location.hash = '#/'; }}
                className={`relative font-semibold h-full flex items-center px-4 transition-all duration-300 ${
                  activeTab === 'detector' && !isOnAdmin ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Detector de IA
                </span>
                {activeTab === 'detector' && !isOnAdmin && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full" />
                )}
              </button>
              <button
                id="tab-humanizer"
                onClick={() => { setActiveTab('humanizer'); window.location.hash = '#/'; }}
                className={`relative font-semibold h-full flex items-center gap-2 px-4 transition-all duration-300 ${
                  activeTab === 'humanizer' && !isOnAdmin ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Humanizador
                </span>
                {activeTab === 'humanizer' && !isOnAdmin && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full" />
                )}
              </button>
            </>
          )}

          {/* Admin tab */}
          {isAdmin && (
            <a
              href="#/admin"
              className={`relative font-semibold h-full flex items-center gap-2 px-4 transition-all duration-300 no-underline ${
                isOnAdmin ? 'text-violet-600' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Admin
              {isOnAdmin && (
                <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full" />
              )}
            </a>
          )}
        </nav>
      </div>

      {/* Right side — user info */}
      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <span className="text-xs font-bold text-emerald-600 uppercase hidden sm:inline tracking-wide">Online</span>
        </div>

        {user && (
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${isAdmin ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-slate-600 max-w-[100px] truncate">{user.name}</span>
              {isAdmin && <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-bold uppercase">Admin</span>}
              {!isAdmin && (
                hasActiveSubscription
                  ? <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase">Activa</span>
                  : <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase">Sin plan</span>
              )}
            </div>
            <button
              id="logout-btn"
              onClick={logout}
              className="ui-btn ui-btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500"
              title="Cerrar sesión"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/40 flex z-50">
        <button
          onClick={() => { setActiveTab('detector'); window.location.hash = '#/'; }}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${activeTab === 'detector' && !isOnAdmin ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
          <span className="text-[10px] font-bold">Detector</span>
        </button>
        <button
          onClick={() => { setActiveTab('humanizer'); window.location.hash = '#/'; }}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${activeTab === 'humanizer' && !isOnAdmin ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          <span className="text-[10px] font-bold">Humanizar</span>
        </button>
        {isAdmin && (
          <a href="#/admin" className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors no-underline ${isOnAdmin ? 'text-violet-600' : 'text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-[10px] font-bold">Admin</span>
          </a>
        )}
      </div>
    </header>
  );
}
