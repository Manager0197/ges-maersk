import React, { useState, useMemo } from 'react';
import { useBLContext } from '../context/BLContext';
import { Activity, Clock, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function ActivityLog() {
  const { bls } = useBLContext();
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const activities = useMemo(() => {
    const allActivities: Array<{ date: string; action: string; blId: string; blRef: string }> = [];
    
    bls.forEach(bl => {
      if (bl.history) {
        try {
          const parsed = JSON.parse(bl.history);
          parsed.forEach((item: any) => {
            allActivities.push({
              date: item.date,
              action: item.action,
              blId: bl.id,
              blRef: bl.bl
            });
          });
        } catch (e) {}
      }
    });

    const sorted = allActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!searchQuery.trim()) {
      return sorted;
    }

    const q = searchQuery.toLowerCase();
    return sorted.filter(act => 
      act.action?.toLowerCase().includes(q) ||
      act.blRef?.toLowerCase().includes(q)
    );
  }, [bls, searchQuery]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg">
            <Activity className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Journal d'activités</h2>
        </div>
      </div>

      {/* Barre de recherche sur le journal */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm flex items-center gap-3">
        <Search className="w-5 h-5 text-slate-400 shrink-0" />
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="Rechercher par action, événement ou numéro de BL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent outline-none text-sm font-medium text-slate-700 dark:text-slate-200/90"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold dark:hover:text-slate-200"
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        {activities.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activities.map((activity, i) => (
              <div key={i} className="p-4 md:p-6 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                <div className="mt-1 p-2 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 rounded-full shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-0.5">
                    {activity.action}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    BL: <span className="font-semibold text-slate-700 dark:text-slate-300">{activity.blRef}</span>
                  </p>
                </div>
                <div className="text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap">
                  {new Date(activity.date).toLocaleString('fr-FR', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Aucune activité enregistrée pour le moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
