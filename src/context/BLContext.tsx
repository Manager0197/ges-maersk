import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import type { BLRecord } from '../types';
import { saveBLsToLocal, getLocalBLs, enqueueOfflineAction, getOfflineQueue, clearOfflineAction } from '../lib/db';
import { useToast } from './ToastContext';

interface BLContextType {
  bls: BLRecord[];
  loading: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  fetchBLs: () => Promise<void>;
  addBL: (data: any) => Promise<string>;
  updateBL: (id: string, data: any) => Promise<void>;
  deleteBL: (id: string) => Promise<void>;
  updateVirement: (id: string, montant: number, date: string) => Promise<void>;
  updateStatutMaersk: (id: string, statut: string) => Promise<void>;
  markBureauSolde: (id: string) => Promise<void>;
  dashboardData: any;
}

const BLContext = createContext<BLContextType | undefined>(undefined);

export function BLProvider({ children }: { children: ReactNode }) {
  const [bls, setBls] = useState<BLRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showToast } = useToast();

  const fetchBLs = useCallback(async () => {
    try {
      if (!navigator.onLine) {
        const local = await getLocalBLs();
        setBls(local);
        return;
      }
      const res = await fetch('/api/bls');
      if (!res.ok) throw new Error('Fetch Error');
      const data = await res.json();
      setBls(data);
      await saveBLsToLocal(data);
    } catch (e) {
      console.error(e);
      const local = await getLocalBLs();
      setBls(local);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const queue = await getOfflineQueue();
      if (queue.length === 0) return;
      
      showToast('Synchronisation des données en cours...', undefined);

      for (const item of queue) {
        try {
          switch (item.action) {
            case 'ADD':
              await fetch('/api/bls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
              break;
            case 'UPDATE':
              await fetch('/api/bls/' + item.blId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
              break;
            case 'DELETE':
              await fetch('/api/bls/' + item.blId, { method: 'DELETE' });
              break;
            case 'PATCH_VIREMENT':
              await fetch('/api/bls/' + item.blId + '/virement', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
              break;
            case 'PATCH_STATUT':
              await fetch('/api/bls/' + item.blId + '/statut', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
              break;
            case 'PATCH_BUREAU':
              await fetch('/api/bls/' + item.blId + '/bureau-solde', { method: 'PATCH' });
              break;
          }
          if (item.id) await clearOfflineAction(item.id);
        } catch (err) {
          console.error("Failed to sync item", item, err);
        }
      }
      showToast('Synchronisation réussie !');
      await fetchBLs();
    } finally {
      setIsSyncing(false);
    }
  }, [fetchBLs, isSyncing, showToast]);

  useEffect(() => {
    fetchBLs();

    const handleOnline = () => {
      setIsOffline(false);
      Object.assign(document.documentElement.style, { "--tw-prose-body": "inherit" }); // Force repaint hack if needed
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast('Vous êtes hors-ligne. Modifications sauvegardées localement.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchBLs, syncOfflineQueue, showToast]);

  const addBL = async (data: any) => {
    if (isOffline) {
      const tempId = 'temp_' + Date.now();
      const newBL = { ...data, id: tempId, created_at: new Date().toISOString(), history: '[]' };
      await enqueueOfflineAction({ action: 'ADD', payload: data });
      setBls(prev => [...prev, newBL]);
      return tempId;
    } else {
      const res = await fetch('/api/bls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      await fetchBLs();
      return result.id;
    }
  };

  const updateBL = async (id: string, data: any) => {
    if (isOffline) {
      await enqueueOfflineAction({ action: 'UPDATE', blId: id, payload: data });
      setBls(prev => prev.map(bl => bl.id === id ? { ...bl, ...data } : bl));
    } else {
      await fetch('/api/bls/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      await fetchBLs();
    }
  };

  const deleteBL = async (id: string) => {
    if (isOffline) {
      await enqueueOfflineAction({ action: 'DELETE', blId: id, payload: {} });
      setBls(prev => prev.filter(bl => bl.id !== id));
    } else {
      await fetch('/api/bls/' + id, { method: 'DELETE' });
      await fetchBLs();
    }
  };

  const updateVirement = async (id: string, montant: number, date: string) => {
    const payload = { montant_virement: montant, date_virement: date };
    if (isOffline) {
      await enqueueOfflineAction({ action: 'PATCH_VIREMENT', blId: id, payload });
      setBls(prev => prev.map(bl => bl.id === id ? { ...bl, ...payload } : bl));
    } else {
      await fetch('/api/bls/' + id + '/virement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await fetchBLs();
    }
  };

  const updateStatutMaersk = async (id: string, statut: string) => {
    const payload = { statut_maersk: statut };
    if (isOffline) {
      await enqueueOfflineAction({ action: 'PATCH_STATUT', blId: id, payload });
      setBls(prev => prev.map(bl => bl.id === id ? { ...bl, ...payload } : bl));
    } else {
      await fetch('/api/bls/' + id + '/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await fetchBLs();
    }
  };

  const markBureauSolde = async (id: string) => {
    if (isOffline) {
      await enqueueOfflineAction({ action: 'PATCH_BUREAU', blId: id, payload: {} });
      setBls(prev => prev.map(bl => bl.id === id ? { ...bl, net_reelle: 0, montant_virement: bl.bureau } : bl));
    } else {
      await fetch('/api/bls/' + id + '/bureau-solde', { method: 'PATCH' });
      await fetchBLs();
    }
  };

  const dashboardData = useMemo(() => {
    let dettes_bureau_totales = 0;
    let dettes_maersk_totales = 0;
    let nb_tc_actifs = 0;
    let bl_en_attente = 0;
    let virement_mois_courant = 0;
    let net_a_payer_mois = 0;
    let commission_transport_mois = 0;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const repartitionMap: Record<string, number> = {};
    const fluxMap: Record<string, { dettesBureau: number, dettesMaersk: number, netAPayer: number }> = {};

    bls.forEach(bl => {
      const bd = new Date(bl.created_at);
      const isCurrentMonth = bd.getMonth() === currentMonth && bd.getFullYear() === currentYear;
      
      const mKey = bl.created_at.substring(0, 7); // YYYY-MM
      if (!fluxMap[mKey]) fluxMap[mKey] = { dettesBureau: 0, dettesMaersk: 0, netAPayer: 0 };

      fluxMap[mKey].netAPayer += bl.net;

      if (isCurrentMonth) {
        net_a_payer_mois += bl.net;
        commission_transport_mois += bl.bureau;
      }

      // Dettes Bureau logic
      if (bl.type_contrat === 'CLIENT' && (bl.net_reelle === null || bl.net_reelle < 0)) {
        if (bl.montant_virement === null) {
          dettes_bureau_totales += bl.bureau;
        } else if (bl.net_reelle < 0) {
          dettes_bureau_totales += Math.abs(bl.net_reelle);
        }
      }

      // Dettes Maersk
      if (bl.statut_maersk !== 'PAYE') {
        dettes_maersk_totales += bl.net;
        bl_en_attente++;
      }

      nb_tc_actifs += bl.nb_tc;

      if (bl.date_virement) {
        const vd = new Date(bl.date_virement);
        if (vd.getMonth() === currentMonth && vd.getFullYear() === currentYear) {
          virement_mois_courant += (bl.montant_virement || 0);
        }
      }

      // Pie chart
      repartitionMap[bl.marchandise] = (repartitionMap[bl.marchandise] || 0) + 1;

      // Flux (cash flow) by month
      const date = new Date(bl.created_at);
      const monthKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');

      if (!fluxMap[monthKey]) fluxMap[monthKey] = { dettesBureau: 0, dettesMaersk: 0, netAPayer: 0 };
      
      if (bl.type_contrat === 'CLIENT') {
        fluxMap[monthKey].dettesBureau += bl.bureau;
      }
      fluxMap[monthKey].dettesMaersk += bl.net;

    });

    const repartitionMarchandise = Object.keys(repartitionMap).map(k => ({ name: k, value: repartitionMap[k] }));
    
    const evolutionFlux = Object.keys(fluxMap).sort().map(k => ({
      mois: k,
      DetteBureau: fluxMap[k].dettesBureau,
      DetteMaersk: fluxMap[k].dettesMaersk,
      NetAPayer: fluxMap[k].netAPayer
    }));

    return {
      dettes_bureau_totales,
      dettes_maersk_totales,
      nb_tc_actifs,
      bl_en_attente,
      virement_mois_courant,
      net_a_payer_mois,
      commission_transport_mois,
      repartitionMarchandise,
      evolutionFlux
    };
  }, [bls]);

  return (
    <BLContext.Provider value={{
      bls, loading, fetchBLs, addBL, updateBL, deleteBL, updateVirement, updateStatutMaersk, markBureauSolde, dashboardData
    }}>
      {children}
    </BLContext.Provider>
  );
}

export function useBLContext() {
  const ctx = useContext(BLContext);
  if (!ctx) throw new Error("Missing BLProvider");
  return ctx;
}
