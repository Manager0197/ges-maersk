import React from 'react';
import type { BLRecord } from '../types';
import { formatFCFA } from '../lib/utils';
import { Check } from 'lucide-react';
import { useBLContext } from '../context/BLContext';

export default function Virements() {
  const { bls, updateVirement } = useBLContext();
  const pendingVirements = bls.filter(b => b.statut_maersk !== 'PAYE');

  const handleSaisie = async (e: React.FormEvent, bl: BLRecord) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const montant = Number((form.elements.namedItem('montant') as HTMLInputElement).value);
    const date = (form.elements.namedItem('date') as HTMLInputElement).value;

    await updateVirement(bl.id, montant, date);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">Saisie des Virements Maersk</h2>
      
      <div className="grid gap-4">
        {pendingVirements.map(bl => (
          <div key={bl.id} className="bg-white dark:bg-slate-900 border flex flex-col md:flex-row gap-4 md:gap-6 justify-between p-4 md:p-6 rounded-2xl shadow-sm border-orange-100 dark:border-slate-800">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg dark:text-slate-100">{bl.bl}</h3>
                <span className="px-2 py-0.5 rounded text-xs tracking-wider font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-500">EN ATTENTE</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Contrat: <strong className="text-slate-800 dark:text-slate-200">{bl.type_contrat}</strong> • Facture: {bl.num_facture}</p>
              <p className="text-sm border-t border-slate-100 dark:border-slate-800 pt-2 md:border-t-0 md:pt-0 mt-2 md:mt-0 dark:text-slate-300">
                Montant attendu (NET A PAYER): <strong className="font-mono text-orange-600 dark:text-orange-400 block sm:inline">{formatFCFA(bl.net)} FCFA</strong>
              </p>
            </div>

            <form onSubmit={(e) => handleSaisie(e, bl)} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date</label>
                <input required type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 min-h-[44px]" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Montant Reçu (FCFA)</label>
                <input required type="number" name="montant" defaultValue={Math.round(bl.net)} className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg text-sm font-mono bg-white dark:bg-slate-900 dark:text-slate-100 min-h-[44px]" />
              </div>
              <button type="submit" className="min-h-[44px] px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2 font-medium text-sm transition">
                <Check className="w-4 h-4" /> Encaisser
              </button>
            </form>
          </div>
        ))}

        {pendingVirements.length === 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 p-6 rounded-xl text-center border border-emerald-100 dark:border-emerald-800/50 font-medium">
            Tous les connaissements (BL) ont été réglés par Maersk. Aucun virement en attente.
          </div>
        )}
      </div>
    </div>
  );
}
