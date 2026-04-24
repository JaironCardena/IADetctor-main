import React, { useState } from 'react';
import {
  ClipboardCheck,
  LogOut,
  PenLine,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  CreditCard,
  Zap,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import type { AppTab } from '../../App';

interface SidebarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { user, logout, hasActiveSubscription } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isOnAdmin = window.location.hash.startsWith('#/admin');
  const initials = user?.name?.slice(0, 1).toUpperCase() || 'U';

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navItemClass = (active: boolean) => 
    `flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-bold transition-none text-left ${
      active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand */}
      <div className="p-6">
        <a href="#/" className="flex items-center gap-3 no-underline" aria-label="AcademiX AI">
          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.3} />
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-slate-900">
            Academi<span className="text-slate-800">X</span>
          </span>
        </a>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-4 pb-2 pt-4">Servicios</div>
        {!isOnAdmin && (
          <>
            <button
              onClick={() => { setActiveTab('detector'); window.location.hash = '#/'; setIsMobileOpen(false); }}
              className={navItemClass(activeTab === 'detector')}
            >
              <ClipboardCheck className="w-5 h-5" />
              Detector
            </button>
            <button
              onClick={() => { setActiveTab('humanizer'); window.location.hash = '#/'; setIsMobileOpen(false); }}
              className={navItemClass(activeTab === 'humanizer')}
            >
              <PenLine className="w-5 h-5" />
              Humanizador
            </button>
          </>
        )}
        
        {isAdmin && (
          <a href="#/admin" className={navItemClass(isOnAdmin)}>
            <SlidersHorizontal className="w-5 h-5" />
            Admin Panel
          </a>
        )}

        {/* User Account / Billing Section */}
        {user && !isAdmin && (
          <>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-4 pb-2 pt-6 border-t border-slate-100 mt-4">Suscripción</div>
            <button
              onClick={() => { setActiveTab('account'); window.location.hash = '#/'; setIsMobileOpen(false); }}
              className={navItemClass(activeTab === 'account')}
            >
              <UserRound className="w-5 h-5" />
              Mi cuenta
            </button>
            <button
              onClick={() => { setActiveTab('pricing'); window.location.hash = '#/'; setIsMobileOpen(false); }}
              className={navItemClass(activeTab === 'pricing')}
            >
              <CreditCard className="w-5 h-5" />
              Planes y Precios
            </button>
          </>
        )}
      </nav>

      {/* Profile & Logout */}
      {user && (
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0 ${isAdmin ? 'bg-violet-600' : 'bg-slate-800'}`}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate leading-tight">{user.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <UserRound className="w-3 h-3 text-slate-500" />
                  <span className="text-[11px] font-semibold text-slate-500 truncate">
                    {isAdmin ? 'Administrador' : hasActiveSubscription ? 'Pro Activo' : 'Básico'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 z-40 bg-white">
        {sidebarContent}
      </aside>

      {/* Mobile Header (replaces the old top header on mobile) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-30 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 no-underline" aria-label="AcademiX AI">
          <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.3} />
          </div>
          <span className="font-extrabold text-lg tracking-tight text-slate-900">
            Academi<span className="text-slate-800">X</span>
          </span>
        </div>
        <button onClick={() => setIsMobileOpen(true)} className="p-2 text-slate-600 bg-slate-50 rounded-lg">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setIsMobileOpen(false)} />
          <div className="relative w-4/5 max-w-sm h-full bg-white flex flex-col shadow-xl">
            <button onClick={() => setIsMobileOpen(false)} className="absolute top-4 right-4 p-2 text-slate-400 bg-slate-50 rounded-lg">
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

    </>
  );
}
