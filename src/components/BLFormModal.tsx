import React, { useState, useEffect } from 'react';
import { useBLContext } from '../context/BLContext';
import type { BLRecord } from '../types';

interface BLFormModalProps {
  onClose: () => void;
  onSuccess: (actionType: 'add' | 'edit', id?: string, shouldClose?: boolean) => void;
  initialData?: BLRecord | null;
}

export default function BLFormModal({ onClose, onSuccess, initialData }: BLFormModalProps) {
  const { addBL, updateBL } = useBLContext();
  const [formData, setFormData] = useState({
    fa: 'F',
    bl: '',
    num_facture: '',
    type_contrat: 'FOURNISSEUR',
    marchandise: '',
    nb_tc: 1,
    prix_tc: 94000,
    taux_ib: 5,
    date_echeance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        fa: initialData.fa,
        bl: initialData.bl,
        num_facture: initialData.num_facture.toString(),
        type_contrat: initialData.type_contrat,
        marchandise: initialData.marchandise,
        nb_tc: initialData.nb_tc,
        prix_tc: initialData.prix_tc,
        taux_ib: initialData.taux_ib !== undefined ? initialData.taux_ib : 5,
        date_echeance: initialData.date_echeance || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleManualSubmit = async (e: React.FormEvent, isQuickEntry: boolean) => {
    e.preventDefault();
    let newId: string | undefined;
    if (initialData) {
      await updateBL(initialData.id, formData);
    } else {
      newId = await addBL(formData);
    }
    
    if (isQuickEntry && !initialData) {
      if (newId) onSuccess('add', newId, false);
      // Clear bl and num_facture for next quick entry
      setFormData(prev => ({ ...prev, bl: '', num_facture: '' }));
    } else {
      onSuccess(initialData ? 'edit' : 'add', newId || initialData?.id, true);
    }
  };

  // Live previews
  const tc = Number(formData.nb_tc) || 0;
  const px = Number(formData.prix_tc) || 0;
  const taux = Number(formData.taux_ib) || 0;
  const ttc = tc * px;
  const ht = ttc / 1.18;
  const aib = ht * (taux / 100);
  const net = ttc - aib;
  const bureau = formData.type_contrat === 'CLIENT' ? tc * 110000 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 py-4 sm:px-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="text-lg font-bold text-slate-800">{initialData ? 'Modifier le BL' : 'Ajouter un nouveau BL'}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition">&times;</button>
        </div>
        
        <form onSubmit={(e) => handleManualSubmit(e, false)} className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">FA</label>
              <input required name="fa" value={formData.fa} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg bg-slate-50 sm:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">N° BL</label>
              <input required name="bl" value={formData.bl} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg uppercase bg-slate-50 sm:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">N° Facture</label>
              <input required type="number" name="num_facture" value={formData.num_facture} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg bg-slate-50 sm:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contrat</label>
              <select name="type_contrat" value={formData.type_contrat} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg bg-slate-50 sm:bg-white">
                <option value="FOURNISSEUR">FOURNISSEUR (Export)</option>
                <option value="CLIENT">CLIENT (Import)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Marchandise</label>
              <input required name="marchandise" value={formData.marchandise} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg uppercase bg-slate-50 sm:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre TC</label>
              <input required type="number" min="1" name="nb_tc" value={formData.nb_tc} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg bg-slate-50 sm:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prix unitaire TC (FCFA)</label>
              <input required type="number" min="1" name="prix_tc" value={formData.prix_tc} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg bg-slate-50 sm:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Taux AIB (%)</label>
              <input required type="number" step="0.1" name="taux_ib" value={formData.taux_ib} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg bg-slate-50 sm:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date Échéance</label>
              <input required type="date" name="date_echeance" value={formData.date_echeance} onChange={handleChange} className="w-full px-4 sm:px-3 py-3 sm:py-2 min-h-[44px] border rounded-lg bg-slate-50 sm:bg-white" />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-wrap gap-4 justify-between items-center text-sm md:text-base">
            <div>
              <span className="block text-slate-500 mb-1">Montant HT</span>
              <span className="font-bold font-mono text-slate-800 text-base">{new Intl.NumberFormat('fr-FR').format(Math.round(ht))}</span>
            </div>
            <div>
              <span className="block text-slate-500 mb-1">Valeur AIB</span>
              <span className="font-bold font-mono text-amber-600 text-base">{new Intl.NumberFormat('fr-FR').format(Math.round(aib))}</span>
            </div>
            <div>
              <span className="block text-slate-500 mb-1">Net à Payer</span>
              <span className="font-bold font-mono text-slate-800 text-base md:text-lg">{new Intl.NumberFormat('fr-FR').format(Math.round(net))} FCFA</span>
            </div>
            {bureau > 0 && (
              <div className="text-right w-full sm:w-auto">
                <span className="block text-slate-500 mb-1">Dette Bureau</span>
                <span className="font-bold font-mono text-red-600 text-base md:text-lg">{new Intl.NumberFormat('fr-FR').format(bureau)} FCFA</span>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-3 sm:py-2 min-h-[44px] w-full sm:w-auto font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Annuler</button>
            {!initialData && (
              <button type="button" onClick={(e) => handleManualSubmit(e, true)} className="px-4 py-3 sm:py-2 min-h-[44px] w-full sm:w-auto bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 transition">Enregistrer et Nouveau (Saisie Rapide)</button>
            )}
            <button type="button" onClick={(e) => handleManualSubmit(e, false)} className="px-4 py-3 sm:py-2 min-h-[44px] w-full sm:w-auto bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}
