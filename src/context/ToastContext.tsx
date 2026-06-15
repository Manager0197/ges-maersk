import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  onUndo?: () => void;
}

interface ToastContextType {
  showToast: (message: string, onUndo?: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, onUndo }]);
    
    // Auto remove after 5 seconds if no undo is provided, else 8 seconds
    setTimeout(() => {
      removeToast(id);
    }, onUndo ? 8000 : 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleUndo = (toast: Toast) => {
    if (toast.onUndo) {
      toast.onUndo();
    }
    removeToast(toast.id);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className="bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-4 min-w-[300px]">
            <span className="text-sm font-medium">{toast.message}</span>
            <div className="flex items-center gap-2">
              {toast.onUndo && (
                <button 
                  onClick={() => handleUndo(toast)}
                  className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded text-xs font-bold transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  Annuler
                </button>
              )}
              <button onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("Missing ToastProvider");
  return ctx;
}
