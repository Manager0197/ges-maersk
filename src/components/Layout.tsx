import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileSpreadsheet, Wallet, AlertCircle, Menu, X, Sun, Moon, Activity, UserCog, Keyboard } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { role, setRole, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const navItems = [
    { name: 'Tableau de bord', to: '/', icon: LayoutDashboard, shortcutKey: 'D', shortcutFull: 'Alt + D (ou 1)' },
    { name: 'BL / Factures', to: '/bls', icon: FileSpreadsheet, shortcutKey: 'B', shortcutFull: 'Alt + B (ou 2)' },
    { name: 'Virements', to: '/virements', icon: Wallet, adminOnly: true, shortcutKey: 'V', shortcutFull: 'Alt + V (ou 3)' },
    { name: 'Dettes', to: '/dettes', icon: AlertCircle, adminOnly: true, shortcutKey: 'E', shortcutFull: 'Alt + E (ou 4)' },
    { name: "Journal d'activités", to: '/activities', icon: Activity, adminOnly: true, shortcutKey: 'A', shortcutFull: 'Alt + A (ou 5)' },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if in inputs
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || activeEl.hasAttribute('contenteditable')) {
          return;
        }
      }

      const key = e.key.toLowerCase();
      // Triggered by Alt key, Alt+Shift, or Ctrl+Alt
      const isAltPressed = e.altKey;
      const isCtrlAltPressed = e.ctrlKey && e.altKey;
      const triggered = isAltPressed || isCtrlAltPressed;

      if (triggered) {
        if (key === 'd' || key === '1') {
          e.preventDefault();
          navigate('/');
          showToast('Raccourci : Tableau de bord');
        } else if (key === 'b' || key === '2') {
          e.preventDefault();
          navigate('/bls');
          showToast('Raccourci : BL / Factures');
        } else if (isAdmin && (key === 'v' || key === '3')) {
          e.preventDefault();
          navigate('/virements');
          showToast('Raccourci : Virements');
        } else if (isAdmin && (key === 'e' || key === '4')) {
          e.preventDefault();
          navigate('/dettes');
          showToast('Raccourci : Dettes');
        } else if (isAdmin && (key === 'a' || key === '5')) {
          e.preventDefault();
          navigate('/activities');
          showToast("Raccourci : Journal d'activités");
        } else if (key === 'k') {
          e.preventDefault();
          setIsShortcutsHelpOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, isAdmin, showToast]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-40">
        <h1 className="text-lg font-bold tracking-tight text-blue-400">Times Trading Int.</h1>
        <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-300 hover:text-white">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transform transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-blue-400">Times Trading</h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">International</p>
          </div>
          <button onClick={closeMobileMenu} className="md:hidden text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors group relative",
                    isActive 
                      ? "bg-blue-600 text-white" 
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )
                }
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1">{item.name}</span>
                <span className="hidden md:inline-block text-[10px] font-semibold font-mono bg-slate-850 text-slate-400 group-hover:bg-slate-750 group-hover:text-slate-200 px-1.5 py-0.5 rounded border border-slate-700/50 shrink-0">
                  Alt+{item.shortcutKey}
                </span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 mt-auto border-t border-slate-800 flex flex-col gap-2">
           <button 
             onClick={() => setIsShortcutsHelpOpen(true)}
             className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
             title="Afficher les raccourcis clavier"
           >
             <Keyboard className="w-5 h-5" />
             <span>Raccourcis clavier</span>
             <span className="hidden md:inline-block ml-auto text-[10px] font-semibold font-mono bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50">
               Alt+K
             </span>
           </button>
           <button 
             onClick={() => setRole(role === 'ADMIN' ? 'EMPLOYE' : 'ADMIN')}
             className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
           >
             <UserCog className="w-5 h-5" />
             Rôle: {role === 'ADMIN' ? 'Admin' : 'Employé'}
           </button>
           <button 
             onClick={toggleTheme}
             className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
           >
             {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             {theme === 'dark' ? 'Mode Clair' : 'Mode Sombre'}
           </button>
        </div>
      </aside>

      {/* Keyboard Shortcuts Help Modal */}
      {isShortcutsHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setIsShortcutsHelpOpen(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Raccourcis Clavier</h3>
              </div>
              <button onClick={() => setIsShortcutsHelpOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg">&times;</button>
            </div>
            
            <div className="p-6 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
              <p className="text-slate-500 dark:text-slate-400 text-xs">Utilisez ces raccourcis clavier globaux pour naviguer instantanément à travers les différentes pages.</p>
              
              <div className="space-y-2.5">
                {navItems.map((item) => {
                  if (item.adminOnly && !isAdmin) return null;
                  return (
                    <div key={item.to} className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[11px] rounded shadow-sm font-semibold">Alt</kbd>
                        <span className="text-slate-400 font-medium">+</span>
                        <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[11px] rounded shadow-sm font-semibold uppercase">{item.shortcutKey}</kbd>
                        <span className="text-slate-400 font-medium text-xs self-center">ou {item.shortcutFull.slice(-2, -1)}</span>
                      </div>
                    </div>
                  );
                })}
                
                <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Keyboard className="w-4 h-4 text-slate-400" />
                    Ouvrir cette aide
                  </span>
                  <div className="flex gap-1.5">
                    <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[11px] rounded shadow-sm font-semibold">Alt</kbd>
                    <span className="text-slate-400 font-medium">+</span>
                    <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[11px] rounded shadow-sm font-semibold">K</kbd>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 text-center shrink-0">
              <button onClick={() => setIsShortcutsHelpOpen(false)} className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition">Compris !</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 h-full overflow-auto pt-16 md:pt-0 dark:bg-slate-950 dark:text-slate-200">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
