import React, { useState, useMemo } from 'react';
import type { BLRecord } from '../types';
import { formatFCFA } from '../lib/utils';
import { Check, Search, Filter, AlertTriangle, HelpCircle, CheckCircle2 } from 'lucide-react';
import { useBLContext } from '../context/BLContext';

export default function Virements() {
  const { bls, updateVirement } = useBLContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterInvoiceStatus, setFilterInvoiceStatus] = useState<'ALL' | 'MISSING' | 'INVOICED'>('ALL');
  const [filterContrat, setFilterContrat] = useState<'ALL' | 'FOURNISSEUR' | 'CLIENT'>('ALL');

  // Multi-selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDate, setBulkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Ground-truth pending list (raw outstanding BLs)
  const allPending = useMemo(() => {
    return bls.filter(b => b.statut_maersk !== 'PAYE');
  }, [bls]);

  // Metrics calculations
  const stats = useMemo(() => {
    const total = allPending.length;
    const missingInvoice = allPending.filter(b => !b.num_facture || b.num_facture === 0).length;
    const invoiced = total - missingInvoice;
    return { total, missingInvoice, invoiced };
  }, [allPending]);

  // Final filtered list with sorting (non-factored items always first)
  const sortedAndFilteredPending = useMemo(() => {
    let filtered = allPending;

    // Apply Search
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(b => 
        (b.bl?.toLowerCase().includes(q)) ||
        (b.fa?.toLowerCase().includes(q)) ||
        (b.marchandise?.toLowerCase().includes(q)) ||
        (b.num_facture?.toString().includes(q))
      );
    }

    // Apply Invoice Status Filter
    if (filterInvoiceStatus === 'MISSING') {
      filtered = filtered.filter(b => !b.num_facture || b.num_facture === 0);
    } else if (filterInvoiceStatus === 'INVOICED') {
      filtered = filtered.filter(b => b.num_facture && b.num_facture !== 0);
    }

    // Apply Contract Type Filter
    if (filterContrat !== 'ALL') {
      filtered = filtered.filter(b => b.type_contrat === filterContrat);
    }

    // Sort: items lacking invoice (Non Facturé) first, then sort remaining by invoice number ascending
    return [...filtered].sort((a, b) => {
      const hasA = a.num_facture && a.num_facture !== 0;
      const hasB = b.num_facture && b.num_facture !== 0;

      if (!hasA && hasB) return -1; // Non invoiced comes first
      if (hasA && !hasB) return 1;  // Invoiced comes after

      if (!hasA && !hasB) {
        // Both not invoiced, order by creation date descending
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      }

      // Both invoiced, sort by invoice number ascending
      const valA = Number(a.num_facture) || 0;
      const valB = Number(b.num_facture) || 0;
      return valA - valB;
    });
  }, [allPending, searchQuery, filterInvoiceStatus, filterContrat]);

  // Selected BLs computed properties
  const selectedBLs = useMemo(() => {
    return bls.filter(b => selectedIds.includes(b.id));
  }, [bls, selectedIds]);

  const totalNetSelected = useMemo(() => {
    return selectedBLs.reduce((sum, bl) => sum + (bl.net || 0), 0);
  }, [selectedBLs]);

  // Selection toggle logic
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const filteredIds = useMemo(() => {
    return sortedAndFilteredPending.map(b => b.id);
  }, [sortedAndFilteredPending]);

  const isAllSelected = useMemo(() => {
    if (filteredIds.length === 0) return false;
    return filteredIds.every(id => selectedIds.includes(id));
  }, [filteredIds, selectedIds]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const union = new Set([...prev, ...filteredIds]);
        return Array.from(union);
      });
    }
  };

  // Submission handlers
  const handleSaisie = async (e: React.FormEvent, bl: BLRecord) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const montant = Number((form.elements.namedItem('montant') as HTMLInputElement).value);
    const date = (form.elements.namedItem('date') as HTMLInputElement).value;

    await updateVirement(bl.id, montant, date);
    // Remove from selection if it was checked
    setSelectedIds(prev => prev.filter(id => id !== bl.id));
  };

  const handleBulkSaisie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBLs.length === 0) return;
    setIsBulkProcessing(true);
    try {
      for (const bl of selectedBLs) {
        // Submit individual update to the context provider/database for each BL
        await updateVirement(bl.id, Math.round(bl.net), bulkDate);
      }
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100 font-sans tracking-tight">Saisie des Virements Maersk</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enregistrez les virements reçus de Maersk pour solder les connaissements en attente.</p>
        </div>
      </div>

      {/* Metrics Summary Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/40 dark:from-slate-900 dark:to-slate-900/60 p-4 rounded-xl border border-blue-100 dark:border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[11px] font-extrabold uppercase text-blue-650 dark:text-blue-400 tracking-wider">Total en attente</span>
            <p className="text-2xl font-black font-mono text-blue-900 dark:text-slate-100 mt-1">{stats.total}</p>
          </div>
          <span className="h-10 w-10 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-bold font-mono text-sm">EN</span>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-slate-900 dark:to-slate-900/60 p-4 rounded-xl border border-amber-250/60 dark:border-slate-800 flex items-center justify-between shadow-sm relative overflow-hidden">
          <div className="absolute right-0 top-0 h-1.5 w-full bg-amber-500"></div>
          <div>
            <span className="text-[11px] font-extrabold uppercase text-amber-700 dark:text-amber-400 tracking-wider flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
              </span>
              Factures manquantes (Manque)
            </span>
            <p className="text-2xl font-black font-mono text-amber-900 dark:text-slate-150 mt-1">{stats.missingInvoice}</p>
          </div>
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-bounce shrink-0" />
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 dark:from-slate-900 dark:to-slate-900/60 p-4 rounded-xl border border-emerald-100 dark:border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[11px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">Facturés à Encaisser</span>
            <p className="text-2xl font-black font-mono text-emerald-900 dark:text-slate-100 mt-1">{stats.invoiced}</p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4.5 rounded-xl shadow-sm space-y-3.5">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">Recherche & Options de filtrage des virements</h3>
          </div>
          {(searchQuery !== '' || filterInvoiceStatus !== 'ALL' || filterContrat !== 'ALL' || selectedIds.length > 0) && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setFilterInvoiceStatus('ALL');
                setFilterContrat('ALL');
                setSelectedIds([]);
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              Réinitialiser
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Text search input */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Rechercher par BL, FA, Marchandise..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm font-medium outline-none text-slate-700 dark:text-slate-200 w-full"
            />
          </div>

          {/* Facturation selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase shrink-0">Facturation :</span>
            <select 
              value={filterInvoiceStatus} 
              onChange={e => setFilterInvoiceStatus(e.target.value as any)}
              className="bg-transparent text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 outline-none w-full cursor-pointer"
            >
              <option value="ALL">TOUTES LES FACTURES</option>
              <option value="MISSING">FACTURES MANQUANTES (NON FACTURÉ)</option>
              <option value="INVOICED">FACTURES RENSEIGNÉES</option>
            </select>
          </div>

          {/* Contrat selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase shrink-0">Contrat :</span>
            <select 
              value={filterContrat} 
              onChange={e => setFilterContrat(e.target.value as any)}
              className="bg-transparent text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 outline-none w-full cursor-pointer"
            >
              <option value="ALL">TOUS LES CONTRATS</option>
              <option value="FOURNISSEUR">EXPORT (FOURNISSEUR)</option>
              <option value="CLIENT">IMPORT (CLIENT)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Action and Toggle Panel */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={isAllSelected}
            onChange={toggleSelectAll}
            className="w-5 h-5 rounded cursor-pointer text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" 
          />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-350">
            {isAllSelected ? "Tout désélectionner" : "Sélectionner tout"} ({sortedAndFilteredPending.length} BLs affichés)
          </span>
        </label>
        {selectedIds.length > 0 && (
          <div className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400 font-bold px-3 py-1 rounded-full">
            {selectedIds.length} connaissement(s) coché(s)
          </div>
        )}
      </div>

      {/* Batch Payment Processing Box */}
      {selectedIds.length > 0 && (
        <form onSubmit={handleBulkSaisie} className="bg-gradient-to-r from-blue-50 to-emerald-50 dark:from-slate-900 dark:to-emerald-950/20 border border-emerald-250 dark:border-emerald-900/40 p-5 rounded-2xl shadow-sm flex flex-col lg:flex-row gap-5 items-stretch lg:items-end justify-between transition-all">
          <div className="space-y-1">
            <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Virement groupé ({selectedIds.length} BLs cochés)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Enregistrez un virement groupé pour les connaissements sélectionnés d'un montant total estimé de : <strong className="text-emerald-700 dark:text-emerald-400 text-sm font-mono">{formatFCFA(totalNetSelected)} FCFA</strong>
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 shrink-0">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Date Encaissement Collective</label>
              <input 
                required 
                type="date" 
                value={bulkDate} 
                onChange={(e) => setBulkDate(e.target.value)} 
                className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 min-h-[44px] cursor-pointer" 
              />
            </div>
            <button 
              type="submit" 
              disabled={isBulkProcessing}
              className="min-h-[44px] px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition active:scale-95 cursor-pointer shadow-sm"
            >
              {isBulkProcessing ? (
                <span>Trachage en cours...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Encaisser les {selectedIds.length} BLs d'un coup
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Main List of Cards */}
      <div className="grid gap-4">
        {sortedAndFilteredPending.map(bl => {
          const isMissingInvoice = !bl.num_facture || bl.num_facture === 0;
          const isRowSelected = selectedIds.includes(bl.id);
          return (
            <div 
              key={bl.id} 
              className={`bg-white dark:bg-slate-900 border flex flex-col md:flex-row gap-4 md:gap-6 justify-between p-4 md:p-6 rounded-2xl shadow-sm transition-all md:items-center ${
                isRowSelected 
                  ? "border-blue-500 dark:border-blue-700 ring-2 ring-blue-105 bg-blue-50/10 dark:bg-blue-950/10"
                  : isMissingInvoice
                    ? "border-amber-250 dark:border-amber-950/60 border-l-4 border-l-amber-500 bg-amber-50/10 dark:bg-amber-950/5"
                    : "border-slate-100 dark:border-slate-800"
              }`}
            >
              {/* Checkbox column */}
              <div className="flex items-center self-start md:self-auto shrink-0 pt-1 md:pt-0">
                <input 
                  type="checkbox" 
                  checked={isRowSelected}
                  onChange={() => toggleSelect(bl.id)}
                  className="w-5.5 h-5.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" 
                />
              </div>

              <div className="space-y-2 flex-1">
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="font-bold text-lg dark:text-slate-100 tracking-tight">{bl.bl}</h3>
                  <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                     FA: {bl.fa}
                  </span>
                  {isMissingInvoice ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] tracking-wider font-extrabold bg-amber-100 text-amber-800 border border-amber-250 animate-pulse dark:bg-amber-900/40 dark:text-amber-400 inline-flex items-center gap-1 uppercase">
                      <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Facture manquante
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] tracking-wider font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400 inline-flex items-center gap-1 uppercase">
                      Renseigné
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] tracking-wider font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-305 uppercase">
                     {bl.type_contrat}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <p className="text-slate-500 dark:text-slate-400">
                    Marchandise : <strong className="text-slate-700 dark:text-slate-350">{bl.marchandise}</strong>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Facture N° : {isMissingInvoice ? (
                      <span className="text-amber-650 dark:text-amber-405 font-bold italic text-xs bg-amber-100/50 dark:bg-amber-900/20 px-2 py-0.5 rounded">Non facturé</span>
                    ) : (
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{bl.num_facture}</span>
                    )}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 sm:col-span-2 border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
                    Montant attendu (NET A PAYER) : <strong className="font-mono text-orange-600 dark:text-orange-400 text-base">{formatFCFA(bl.net)} FCFA</strong>
                  </p>
                </div>
              </div>

              <form onSubmit={(e) => handleSaisie(e, bl)} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shrink-0">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Date Encaissement</label>
                  <input required type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 min-h-[44px] cursor-pointer" />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Montant Reçu (FCFA)</label>
                  <input required type="number" name="montant" defaultValue={Math.round(bl.net)} className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg text-sm font-mono bg-white dark:bg-slate-900 dark:text-slate-100 min-h-[44px]" />
                </div>
                <button type="submit" className="min-h-[44px] px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition active:scale-95 cursor-pointer shadow-sm">
                  <Check className="w-4 h-4" /> Encaisser
                </button>
              </form>
            </div>
          );
        })}

        {sortedAndFilteredPending.length === 0 && (
          <div className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 p-8 rounded-xl text-center border border-slate-200 dark:border-slate-800/80 font-medium font-sans">
            {allPending.length === 0 
              ? "Tous les connaissements (BL) ont été réglés par Maersk. Aucun virement en attente."
              : "Aucun connaissement ne correspond à vos critères de filtrage."
            }
          </div>
        )}
      </div>
    </div>
  );
}

