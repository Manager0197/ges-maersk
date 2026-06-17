import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatFCFA, cn } from '../lib/utils';
import { Plus, Filter, Edit2, Trash2, ArrowUpDown, Search, Download, History, AlertTriangle, HelpCircle } from 'lucide-react';
import BLFormModal from '../components/BLFormModal';
import { useBLContext } from '../context/BLContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { BLRecord } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLUMN_DESCRIPTIONS: Record<string, { term: string; desc: string }> = {
  fa: { term: "FA (Fiche d'Accompagnement)", desc: "Document douanier de transit obligatoire servant de référence unique pour le dossier de transport." },
  bl: { term: "BL (Bill of Lading / Connaissement)", desc: "Titre de transport maritime représentant la propriété des marchandises embarquées." },
  num_facture: { term: "N° Facture", desc: "Le numéro d'enregistrement de la facture émise par Maersk." },
  type_contrat: { term: "Type de contrat", desc: "Régime de partenariat : CLIENT (Import, engendre des commissions bureau) ou FOURNISSEUR (Export)." },
  nb_tc: { term: "TC (Conteneurs)", desc: "Nombre total d'équivalents vingt pieds (conteneurs) déclarés dans l'envoi." },
  prix_tc: { term: "Tarif unitaire / TC", desc: "Tarif brut de transport convenu par conteneur (ex. 94 000 FCFA)." },
  montant_ttc: { term: "Montant TTC", desc: "Montant Brut Total toutes taxes comprises (Nombre TC x Prix unitaire)." },
  montant_ht: { term: "Montant HT", desc: "Montant Hors Taxe servant de base au calcul de l'AIB (divisé par 1.18 pour retirer la TVA locale)." },
  taux_ib: { term: "AIB % / Taux IB", desc: "Acompte d'impôt sur les bénéfices (souvent abrégé en IB ou AIB, ex. 5% pour un résident fiscal)." },
  valeur_ib: { term: "Valeur AIB", desc: "Montant déduit correspondant à la retenue à la source de l'AIB (Montant HT x Taux %)." },
  net: { term: "Net à payer (Maersk)", desc: "La somme finale nette due par Maersk après la retenue de taxes AIB sur la facture brute (Montant TTC - Valeur AIB)." },
  bureau: { term: "Dette Bureau", desc: "Rétribution de courtage affectée au bureau local central (générée sur les contrats CLIENT à 110 000 FCFA/TC)." },
  date_virement: { term: "Date Virement", desc: "Date d'exécution réelle du virement bancaire par Maersk pour le règlement de ce dossier." },
  montant_virement: { term: "Montant Virement", desc: "Règlement effectif reçu de la banque Maersk." },
  net_reelle: { term: "Net Réelle (Marge)", desc: "Solde réel après rapprochement entre le Net théorique à payer et le virement réel reçu." },
};

function HeaderHelpTooltip({ term, description }: { term: string; description: string }) {
  const [show, setShow] = useState(false);

  return (
    <span 
      className="relative inline-flex items-center ml-1 text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-colors cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => {
        e.stopPropagation(); // Avoid triggering sorting
      }}
    >
      <HelpCircle className="w-3.5 h-3.5 shrink-0" />
      {show && (
        <span 
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-normal rounded-lg shadow-xl z-50 whitespace-normal leading-relaxed text-left transition-opacity duration-200"
          style={{ transform: 'translateX(-50%)', bottom: '130%' }}
        >
          <span className="block font-bold text-blue-600 dark:text-blue-400 mb-1 font-sans">{term}</span>
          <span className="text-slate-600 dark:text-slate-200">{description}</span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-white dark:bg-slate-800 border-r border-b border-slate-200 dark:border-slate-700 rotate-45"></span>
        </span>
      )}
    </span>
  );
}

function HistoryTooltip({ historyString }: { historyString: string }) {
  const [open, setOpen] = useState(false);
  
  let historyList: any[] = [];
  try {
    historyList = JSON.parse(historyString || '[]');
  } catch (e) {}

  if (historyList.length === 0) return null;

  return (
    <div className="relative inline-block text-left" onMouseLeave={() => setOpen(false)}>
      <button 
        onMouseEnter={() => setOpen(true)}
        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition" 
        title="Historique"
      >
        <History className="w-4 h-4" />
      </button>
      
      {open && (
        <div className="absolute right-full bottom-0 mr-2 max-w-xs w-64 bg-slate-900 text-white rounded-lg p-3 shadow-xl z-50 text-xs">
          <h4 className="font-bold mb-2 border-b border-slate-700 pb-1">Historique des modifications</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {historyList.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <span className="text-slate-300">{new Date(item.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className="font-medium">{item.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BLTable() {
  const { bls, loading, deleteBL, updateStatutMaersk } = useBLContext();
  const { showToast } = useToast();
  const { isAdmin } = useAuth();

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const [scrollRangeMax, setScrollRangeMax] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  const handleTableScroll = () => {
    if (tableContainerRef.current) {
      setScrollLeftState(tableContainerRef.current.scrollLeft);
      setScrollRangeMax(tableContainerRef.current.scrollWidth - tableContainerRef.current.clientWidth);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const container = tableContainerRef.current;
    if (!container) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a') || target.closest('option') || target.closest('.history-tooltip')) {
      return;
    }

    isDown.current = true;
    container.style.cursor = 'grabbing';
    container.style.userSelect = 'none';
    startX.current = e.pageX - container.offsetLeft;
    scrollLeftStart.current = container.scrollLeft;
  };

  const onMouseLeave = () => {
    isDown.current = false;
    const container = tableContainerRef.current;
    if (container) {
      container.style.cursor = 'grab';
      container.style.userSelect = '';
    }
  };

  const onMouseUp = () => {
    isDown.current = false;
    const container = tableContainerRef.current;
    if (container) {
      container.style.cursor = 'grab';
      container.style.userSelect = '';
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDown.current) return;
    e.preventDefault();
    const container = tableContainerRef.current;
    if (!container) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    container.scrollLeft = scrollLeftStart.current - walk;
  };

  const scrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      const scrollAmount = 450;
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [editingBL, setEditingBL] = useState<BLRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterContrat, setFilterContrat] = useState<string>('ALL');
  const [filterStatut, setFilterStatut] = useState<string>('ALL');
  const [filterMarchandise, setFilterMarchandise] = useState<string>('ALL');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof BLRecord; direction: 'asc' | 'desc' } | null>(null);

  const [selectedBls, setSelectedBls] = useState<string[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const handleToggleSelectAll = () => {
    const pendingFiltered = sortedAndFilteredBls.filter(b => b.statut_maersk === 'EN ATTENTE');
    if (selectedBls.length === pendingFiltered.length && pendingFiltered.length > 0) {
      setSelectedBls([]);
    } else {
      setSelectedBls(pendingFiltered.map(b => b.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedBls(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleGroupVirementSuccess = () => {
    setIsGroupModalOpen(false);
    setSelectedBls([]);
    showToast('Virement groupé enregistré avec succès !');
  };

  const handleStatusChange = async (blId: string, newStatut: string, oldStatut: string) => {
    await updateStatutMaersk(blId, newStatut);
    showToast(`Statut changé en ${newStatut}`, () => {
      updateStatutMaersk(blId, oldStatut);
    });
  };

  const handleModalSuccess = (action: 'add' | 'edit', id?: string, shouldClose: boolean = true) => {
    if (action === 'add' && id) {
      showToast('BL ajouté avec succès', () => {
        deleteBL(id);
      });
    } else {
      showToast('BL mis à jour avec succès');
    }
    if (shouldClose) setIsModalOpen(false);
  };


  const marchandises = useMemo(() => Array.from(new Set(bls.map(b => b.marchandise))), [bls]);
  const selectedRecords = useMemo(() => bls.filter(b => selectedBls.includes(b.id)), [bls, selectedBls]);

  const sortedAndFilteredBls = useMemo(() => {
    let result = bls.filter(bl => {
      const qs = searchQuery.toLowerCase();
      const invoiceStr = bl.num_facture && bl.num_facture !== 0 ? bl.num_facture.toString() : '';
      const matchSearch = !qs || 
        bl.bl.toLowerCase().includes(qs) || 
        bl.fa.toLowerCase().includes(qs) || 
        invoiceStr.includes(qs);

      const matchContrat = filterContrat === 'ALL' || bl.type_contrat === filterContrat;
      const matchStatut = filterStatut === 'ALL' || bl.statut_maersk === filterStatut;
      const matchMarchandise = filterMarchandise === 'ALL' || bl.marchandise === filterMarchandise;
      
      let matchDate = true;
      if (dateDebut || dateFin) {
        const blDate = new Date(bl.created_at).getTime();
        const debut = dateDebut ? new Date(dateDebut).getTime() : 0;
        const fin = dateFin ? new Date(dateFin).setHours(23, 59, 59, 999) : Infinity;
        matchDate = blDate >= debut && blDate <= fin;
      }
      
      return matchSearch && matchContrat && matchStatut && matchMarchandise && matchDate;
    });

    if (sortConfig !== null) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (aValue === null) aValue = '';
        if (bValue === null) bValue = '';
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default Sort:
      // 1. BLs with NO invoice number first (e.g. 0, "", null, undefined).
      // 2. The rest sorted by invoice number ascending.
      result.sort((a, b) => {
        const hasA = a.num_facture && a.num_facture !== 0;
        const hasB = b.num_facture && b.num_facture !== 0;

        if (!hasA && hasB) return -1; // no invoice comes first
        if (hasA && !hasB) return 1;  // have invoice comes after

        if (!hasA && !hasB) {
          // Both have no invoice, order by creation date descending
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        }

        // Both have invoices, sort ascending
        const valA = Number(a.num_facture) || 0;
        const valB = Number(b.num_facture) || 0;
        return valA - valB;
      });
    }
    return result;
  }, [bls, searchQuery, filterContrat, filterStatut, filterMarchandise, dateDebut, dateFin, sortConfig]);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (container) {
      const updateScrollSize = () => {
        setScrollLeftState(container.scrollLeft);
        // Ensure scrollWidth calculations are done
        const maxScroll = container.scrollWidth - container.clientWidth;
        setScrollRangeMax(maxScroll > 0 ? maxScroll : 0);
      };

      // Initial measurement call
      updateScrollSize();

      // Schedule a layout measurement just in case of pending React render cycles
      const timer = setTimeout(updateScrollSize, 100);

      container.addEventListener('scroll', handleTableScroll);

      // We observe both the table container and the table itself to detect width shifts
      const observer = new ResizeObserver(() => {
        updateScrollSize();
      });
      observer.observe(container);
      if (tableRef.current) {
        observer.observe(tableRef.current);
      }

      return () => {
        clearTimeout(timer);
        container.removeEventListener('scroll', handleTableScroll);
        observer.disconnect();
      };
    }
  }, [sortedAndFilteredBls]);

  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const currentMonth = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
    
    doc.setFontSize(16);
    doc.text(`Rapport Mensuel des BLs - ${currentMonth}`, 14, 20);
    
    const statsByMonth = sortedAndFilteredBls.reduce((acc, bl) => {
      const monthYear = new Date(bl.created_at).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
      if (!acc[monthYear]) acc[monthYear] = { count: 0, maerskNet: 0, bureau: 0 };
      acc[monthYear].count++;
      acc[monthYear].maerskNet += bl.net;
      acc[monthYear].bureau += bl.bureau;
      return acc;
    }, {} as Record<string, { count: number; maerskNet: number; bureau: number }>);

    const bodyData = Object.entries(statsByMonth).map(([month, stats]: [string, any]) => [
      month,
      stats.count.toString(),
      formatFCFA(stats.bureau),
      formatFCFA(stats.maerskNet)
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Mois/Année', 'Nombre BLs', 'Commissions Transport', 'Commissions Maersk']],
      body: bodyData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 30;
    
    // Highlight Total Maersk Commissions
    const totalMaersk = (Object.values(statsByMonth) as any[]).reduce((sum: number, s: any) => sum + s.maerskNet, 0) as number;
    
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(`Total Commissions Maersk (Net à Payer): ${formatFCFA(totalMaersk)} FCFA`, 14, finalY + 15);
    doc.setTextColor(0, 0, 0);

    doc.save(`Rapport_BLs_${currentMonth.replace(' ', '_')}.pdf`);
  };

  const handleExportExcel = () => {
    const dataToExport = sortedAndFilteredBls.map(bl => ({
      'FA': bl.fa,
      'BL': bl.bl,
      'N° FACTURE': bl.num_facture,
      'CONTRAT': bl.type_contrat,
      'MARCHANDISE': bl.marchandise,
      'TC': bl.nb_tc,
      'PRIX / TC': bl.prix_tc,
      'MONTANT TTC': bl.montant_ttc,
      'MONTANT HT': bl.montant_ht,
      'IB(%)': bl.taux_ib,
      'VALEUR IB': bl.valeur_ib,
      'NET A PAYER': bl.net,
      'MAERSK': bl.statut_maersk,
      'BUREAU': bl.bureau,
      'DATE VIR.': bl.date_virement ? new Date(bl.date_virement).toLocaleDateString('fr-FR') : '',
      'VIREMENT': bl.montant_virement !== null ? bl.montant_virement : '',
      'NET RÉELLE': bl.net_reelle !== null ? bl.net_reelle : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BLs");
    XLSX.writeFile(workbook, "Export_BLs.xlsx");
  };

  const requestSort = (key: keyof BLRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const SortableHeader = ({ label, sortKey, align = 'left' }: { label: string, sortKey: keyof BLRecord, align?: 'left'|'right'|'center' }) => {
    const descInfo = COLUMN_DESCRIPTIONS[sortKey];
    return (
      <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap" onClick={() => requestSort(sortKey)}>
        <div className={`flex items-center gap-1 justify-${align === 'right' ? 'end' : align === 'center' ? 'center' : 'start'}`}>
          <span>{label}</span>
          {descInfo && <HeaderHelpTooltip term={descInfo.term} description={descInfo.desc} />}
          <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
        </div>
      </th>
    );
  };

  if (loading) return <div className="p-4 text-slate-500 animate-pulse">Chargement...</div>;

  const hasActiveFilters = searchQuery || dateDebut || dateFin || filterMarchandise !== 'ALL' || filterContrat !== 'ALL' || filterStatut !== 'ALL';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 shrink-0">Gestion des BLs</h2>
        
        <div className="flex flex-wrap items-center justify-end gap-2.5 w-full md:w-auto">
          {/* Collapsible Filter Toggle Button */}
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={cn(
              "flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border transition shadow-sm font-semibold text-sm cursor-pointer",
              isFilterOpen
                ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                : hasActiveFilters
                  ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                  : "bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
            title="Afficher/Masquer les options de recherche et filtres de tri"
          >
            <Filter className={cn("w-4 h-4 shrink-0", isFilterOpen ? "rotate-180" : "")} />
            <span>Filtres & Tri</span>
            {hasActiveFilters && (
              <span className="flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          {isAdmin && (
            <>
              <button 
                onClick={handleGeneratePDF}
                className="flex items-center gap-2 bg-red-600 text-white min-h-[44px] px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-sm font-semibold text-sm cursor-pointer"
                title="Exporter Rapport PDF"
              >
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </button>
              <button 
                onClick={handleExportExcel}
                className="flex items-center gap-2 bg-emerald-600 text-white min-h-[44px] px-4 py-2 rounded-lg hover:bg-emerald-700 transition shadow-sm font-semibold text-sm cursor-pointer"
                title="Exporter vers Excel"
              >
                <Download className="w-4 h-4" />
                <span>Excel</span>
              </button>
            </>
          )}

          <button 
            onClick={() => {
              setEditingBL(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 min-h-[44px] px-4 py-2 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition shadow-sm font-semibold text-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau BL</span>
          </button>
        </div>
      </div>

      {/* Expanded Filter Panel */}
      {isFilterOpen && (
        <div className="bg-slate-50 dark:bg-slate-905 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Recherche & Options de filtrage de la table</h3>
              <p className="text-xs text-slate-500">Saisissez vos critères ci-dessous pour filtrer les bordereaux.</p>
            </div>
            {hasActiveFilters && (
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setDateDebut('');
                  setDateFin('');
                  setFilterMarchandise('ALL');
                  setFilterContrat('ALL');
                  setFilterStatut('ALL');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                Réinit. les filtres
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search Input Block */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Recherche textuelle</label>
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input 
                  type="text" 
                  placeholder="Rechercher par BL, FA ou Facture..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-sm font-medium outline-none text-slate-700 dark:text-slate-200 w-full"
                />
              </div>
            </div>

            {/* Date Range Selector */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Période de création du dossier</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700" title="Du">
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold shrink-0">Du</span>
                  <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="bg-transparent text-xs sm:text-sm font-medium outline-none text-slate-700 dark:text-slate-200 w-full cursor-pointer" />
                </div>
                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700" title="Au">
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold shrink-0">Au</span>
                  <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="bg-transparent text-xs sm:text-sm font-medium outline-none text-slate-700 dark:text-slate-200 w-full cursor-pointer" />
                </div>
              </div>
            </div>

            {/* Dropdowns Filters */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Critères catégoriels</label>
              <div className="grid grid-cols-3 gap-2">
                <select 
                  value={filterMarchandise} 
                  onChange={e => setFilterMarchandise(e.target.value)}
                  className="bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none uppercase cursor-pointer"
                >
                  <option value="ALL">Marchandises</option>
                  {marchandises.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select 
                  value={filterContrat} 
                  onChange={e => setFilterContrat(e.target.value)}
                  className="bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="ALL">Contrats</option>
                  <option value="FOURNISSEUR">EXPORT (FOURN)</option>
                  <option value="CLIENT">IMPORT (CLI)</option>
                </select>
                <select 
                  value={filterStatut} 
                  onChange={e => setFilterStatut(e.target.value)}
                  className="bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="ALL">Statuts</option>
                  <option value="EN ATTENTE">EN ATTENTE</option>
                  <option value="PAYE">PAYÉ</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border text-sm border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden w-full">
        {/* Barre d'assistance au défilement horizontal */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-850 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="font-semibold text-[11px] sm:text-xs">
              De nombreuses colonnes (Montant, Valeur IB, Net à Payer, Virement) sont à droite. Défilez à l'aide des boutons ci-contre :
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => scrollTable('left')}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all text-[11px] font-bold shadow-sm flex items-center gap-1 cursor-pointer"
            >
              ◀ Gauche
            </button>
            <button
              type="button"
              onClick={() => scrollTable('right')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg active:scale-95 transition-all text-[11px] font-bold shadow-sm flex items-center gap-1 cursor-pointer"
            >
              Droite ▶
            </button>
          </div>
        </div>

        <div 
          ref={tableContainerRef} 
          onMouseDown={onMouseDown}
          onMouseLeave={onMouseLeave}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
          className={cn(
            "overflow-x-auto overflow-y-auto w-full custom-scrollbar cursor-grab transition-all duration-300",
            isFilterOpen 
              ? "max-h-[calc(100vh-455px)] min-h-[200px]" 
              : "max-h-[calc(100vh-295px)] min-h-[330px]"
          )}
        >
          <table ref={tableRef} className="w-full text-left whitespace-nowrap dark:text-slate-200">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 shadow-sm">
            <tr>
              {isAdmin && (
                <th className="px-4 py-3 text-center w-10">
                  <input 
                    type="checkbox" 
                    onChange={handleToggleSelectAll} 
                    checked={sortedAndFilteredBls.filter(b => b.statut_maersk === 'EN ATTENTE').length > 0 && selectedBls.length === sortedAndFilteredBls.filter(b => b.statut_maersk === 'EN ATTENTE').length}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </th>
              )}
              <SortableHeader label="FA" sortKey="fa" />
              <SortableHeader label="BL" sortKey="bl" />
              <SortableHeader label="N° FACTURE" sortKey="num_facture" />
              <SortableHeader label="CONTRAT" sortKey="type_contrat" />
              <SortableHeader label="MARCHANDISE" sortKey="marchandise" />
              <SortableHeader label="TC" sortKey="nb_tc" align="right" />
              <SortableHeader label="PRIX / TC" sortKey="prix_tc" align="right" />
              <SortableHeader label="MONTANT TTC" sortKey="montant_ttc" align="right" />
              <SortableHeader label="MONTANT HT" sortKey="montant_ht" align="right" />
              <SortableHeader label="IB(%)" sortKey="taux_ib" align="right" />
              <SortableHeader label="VALEUR IB" sortKey="valeur_ib" align="right" />
              <SortableHeader label="NET A PAYER" sortKey="net" align="right" />
              <SortableHeader label="MAERSK" sortKey="statut_maersk" align="center" />
              <SortableHeader label="BUREAU" sortKey="bureau" align="right" />
              <SortableHeader label="DATE VIR." sortKey="date_virement" align="right" />
              <SortableHeader label="VIREMENT" sortKey="montant_virement" align="right" />
              <SortableHeader label="NET RÉELLE" sortKey="net_reelle" align="right" />
              <th className="px-4 py-3 text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedAndFilteredBls.map((bl) => {
              const rowColor = 
                bl.type_contrat === 'FOURNISSEUR' ? 'bg-[#1A56DB]/10 hover:bg-[#1A56DB]/20 text-blue-900 dark:text-blue-200' : 
                bl.type_contrat === 'CLIENT' ? 'bg-[#F97316]/10 hover:bg-[#F97316]/20 text-orange-900 dark:text-orange-200' : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800';
              
              const netReelleColor = bl.net_reelle !== null && bl.net_reelle < 0 ? 'text-red-600' : 'text-emerald-600';

              let warningRender = null;
              if (bl.statut_maersk === 'EN ATTENTE' && bl.date_echeance) {
                const dtEcheance = new Date(bl.date_echeance).getTime();
                const diffDays = Math.ceil((dtEcheance - Date.now()) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                  warningRender = <AlertTriangle className="w-4 h-4 text-red-600 inline ml-1" title={String("Échéance dépassée (" + Math.abs(diffDays) + "j)")} />;
                } else if (diffDays <= 7) {
                  warningRender = <AlertTriangle className="w-4 h-4 text-amber-500 inline ml-1" title={String("Échéance proche (" + diffDays + "j)")} />;
                }
              }

              const isSelected = selectedBls.includes(bl.id);
              return (
                <tr key={bl.id} className={cn("transition-colors", rowColor, isSelected && "bg-blue-50/50 dark:bg-blue-950/20")}>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center w-10">
                      {bl.statut_maersk === 'EN ATTENTE' ? (
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(bl.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      ) : (
                        <span className="text-emerald-500 font-bold text-xs" title="Reglé">✓</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">{bl.fa}</td>
                  <td className="px-4 py-3 font-medium">
                    {bl.bl}
                    {warningRender}
                  </td>
                  <td className="px-4 py-3">
                    {!bl.num_facture || bl.num_facture === 0 ? (
                      <span className="text-slate-400 dark:text-slate-500 italic text-[11px] bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded-full">Non facturé</span>
                    ) : (
                      bl.num_facture
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-1 rounded-md text-xs font-bold", bl.type_contrat === 'FOURNISSEUR' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-800')}>
                      {bl.type_contrat}
                    </span>
                  </td>
                  <td className="px-4 py-3">{bl.marchandise}</td>
                  <td className="px-4 py-3 text-right font-mono">{bl.nb_tc}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatFCFA(bl.prix_tc)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatFCFA(bl.montant_ttc)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatFCFA(bl.montant_ht)}</td>
                  <td className="px-4 py-3 text-right">{bl.taux_ib}%</td>
                  <td className="px-4 py-3 text-right font-mono">{formatFCFA(bl.valeur_ib)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{formatFCFA(bl.net)}</td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={bl.statut_maersk}
                      disabled={!isAdmin}
                      onChange={(e) => handleStatusChange(bl.id, e.target.value, bl.statut_maersk)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-full font-bold outline-none cursor-pointer border-r-4 border-transparent",
                        bl.statut_maersk === 'PAYE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-500',
                        !isAdmin && 'opacity-70 cursor-not-allowed border-transparent appearance-none text-center bg-transparent'
                      )}
                    >
                      <option value="EN ATTENTE">EN ATTENTE</option>
                      <option value="PAYE">PAYÉ</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatFCFA(bl.bureau)}</td>
                  <td className="px-4 py-3">{bl.date_virement ? new Date(bl.date_virement).toLocaleDateString('fr-FR') : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{bl.montant_virement !== null ? formatFCFA(bl.montant_virement) : '-'}</td>
                  <td className={cn("px-4 py-3 text-right font-mono font-bold", netReelleColor)}>
                    {bl.net_reelle !== null ? formatFCFA(bl.net_reelle) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                       <HistoryTooltip historyString={bl.history} />
                       {isAdmin && (
                         <>
                           <button onClick={() => { setEditingBL(bl); setIsModalOpen(true); }} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition" title="Modifier">
                              <Edit2 className="w-4 h-4" />
                           </button>
                           <button onClick={() => { if (window.confirm("Supprimer ce BL ?")) deleteBL(bl.id); }} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition" title="Supprimer">
                              <Trash2 className="w-4 h-4" />
                           </button>
                         </>
                       )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sortedAndFilteredBls.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 19 : 18} className="px-4 py-8 text-center text-slate-500">
                  Aucun BL enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* Slider de défilement horizontal en bas */}
        {scrollRangeMax > 0 && (
          <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-4.5 flex flex-col sm:flex-row items-center gap-4 sticky bottom-0 z-20 shadow-[0_-8px_20px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-xs text-slate-650 dark:text-slate-350 font-extrabold select-none shrink-0 uppercase tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span>Glisser pour défiler :</span>
            </div>
            <div className="flex-1 flex items-center gap-4 w-full">
              <span className="text-[10px] text-slate-400 dark:text-slate-550 font-extrabold select-none uppercase tracking-wider shrink-0 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded">◀ Début (FA & BL)</span>
              
              <div className="flex-1 relative flex items-center">
                <input 
                  type="range"
                  min="0"
                  max={scrollRangeMax}
                  value={scrollLeftState}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setScrollLeftState(val);
                    if (tableContainerRef.current) {
                      tableContainerRef.current.scrollLeft = val;
                    }
                  }}
                  className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full appearance-none cursor-ew-resize focus:outline-none accent-blue-600 [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:hover:bg-blue-700 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white dark:[&::-webkit-slider-thumb]:border-slate-900"
                />
              </div>

              <span className="text-[10px] text-slate-400 dark:text-slate-550 font-extrabold select-none uppercase tracking-wider shrink-0 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded">Fin (Montants & Actions) ▶</span>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <BLFormModal 
          initialData={editingBL}
          onClose={() => setIsModalOpen(false)} 
          onSuccess={handleModalSuccess}
        />
      )}

      {selectedBls.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700/60 text-white rounded-2xl px-6 py-4 flex flex-col md:flex-row items-center gap-4 md:gap-8 shadow-2xl z-40 max-w-[95vw] w-full md:w-auto">
          <div className="text-center md:text-left">
            <p className="text-sm font-bold">{selectedBls.length} BL(s) sélectionné(s) pour virement</p>
            <p className="text-xs text-slate-400">Total Net à payer cumulé : <b className="font-mono text-emerald-400 text-sm">{formatFCFA(selectedRecords.reduce((sum, b) => sum + b.net, 0))} FCFA</b></p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => setSelectedBls([])} 
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer bg-transparent border-0"
            >
              Annuler
            </button>
            <button 
              onClick={() => setIsGroupModalOpen(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 font-bold text-xs rounded-lg text-white transition flex items-center gap-2 shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <span>Faire un virement groupé</span>
            </button>
          </div>
        </div>
      )}

      {isGroupModalOpen && (
        <GroupVirementModal 
          selectedBls={selectedRecords}
          onClose={() => setIsGroupModalOpen(false)}
          onSuccess={handleGroupVirementSuccess}
        />
      )}
    </div>
  );
}

function GroupVirementModal({ selectedBls, onClose, onSuccess }: { selectedBls: BLRecord[]; onClose: () => void; onSuccess: () => void }) {
  const { updateVirement } = useBLContext();
  const [dateVirement, setDateVirement] = useState(new Date().toISOString().split('T')[0]);
  const [totalVirementInput, setTotalVirementInput] = useState<string>('');
  const [individualAmounts, setIndividualAmounts] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const initial: Record<string, number> = {};
    let totalNet = 0;
    selectedBls.forEach(bl => {
      initial[bl.id] = Math.round(bl.net);
      totalNet += Math.round(bl.net);
    });
    setIndividualAmounts(initial);
    setTotalVirementInput(totalNet.toString());
  }, [selectedBls]);

  const totalSumRequired = useMemo(() => {
    return selectedBls.reduce((sum, bl) => sum + bl.net, 0);
  }, [selectedBls]);

  const handleTotalVirementChange = (valStr: string) => {
    setTotalVirementInput(valStr);
    const totalVal = Number(valStr) || 0;
    
    let remaining = totalVal;
    const distributed: Record<string, number> = {};
    
    selectedBls.forEach((bl, idx) => {
      const required = Math.round(bl.net);
      if (idx === selectedBls.length - 1) {
        distributed[bl.id] = remaining > 0 ? remaining : 0;
      } else {
        const assigned = Math.min(required, remaining);
        distributed[bl.id] = assigned;
        remaining -= assigned;
      }
    });
    setIndividualAmounts(distributed);
  };

  const handleAutoSolder = () => {
    const initial: Record<string, number> = {};
    let sum = 0;
    selectedBls.forEach(bl => {
      initial[bl.id] = Math.round(bl.net);
      sum += Math.round(bl.net);
    });
    setIndividualAmounts(initial);
    setTotalVirementInput(sum.toString());
  };

  const handleIndividualAmountChange = (blId: string, val: number) => {
    const updated = { ...individualAmounts, [blId]: val };
    setIndividualAmounts(updated);
    
    const sum = Object.keys(updated).reduce((acc, key) => acc + (updated[key] || 0), 0);
    setTotalVirementInput(sum.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await Promise.all(
        selectedBls.map(bl => {
          const amt = individualAmounts[bl.id] || 0;
          return updateVirement(bl.id, amt, dateVirement);
        })
      );
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const currentSumAllocated = Object.keys(individualAmounts).reduce((acc, key) => acc + (individualAmounts[key] || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 py-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-550 dark:bg-slate-800 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Saisir un Virement Groupé</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Enregistrer un règlement groupé reçu pour {selectedBls.length} BLs</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition font-bold text-xl">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 p-4 rounded-xl flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <span className="block text-xs uppercase font-extrabold text-blue-500 tracking-wider">Total théorique Net requis</span>
              <span className="font-bold text-lg text-blue-900 dark:text-blue-300 font-mono">{new Intl.NumberFormat('fr-FR').format(Math.round(totalSumRequired))} FCFA</span>
            </div>
            <div className="flex gap-2 shrink-0 items-center">
              <button 
                type="button" 
                onClick={handleAutoSolder}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-800/80 text-xs font-bold rounded-lg transition"
              >
                Tout solder (Nets exacts)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Date du virement de règlement</label>
              <input 
                required 
                type="date" 
                value={dateVirement} 
                onChange={e => setDateVirement(e.target.value)} 
                className="w-full px-3 py-2 border dark:border-slate-700 rounded-lg bg-slate-50 sm:bg-white dark:bg-slate-800 text-sm dark:text-slate-100" 
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Montant global du virement (FCFA)</label>
              <input 
                required 
                type="number" 
                min="0"
                value={totalVirementInput} 
                onChange={e => handleTotalVirementChange(e.target.value)} 
                className="w-full px-3 py-2 border dark:border-slate-700 rounded-lg bg-slate-50 sm:bg-white dark:bg-slate-800 text-sm font-mono font-semibold dark:text-slate-100" 
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">Saisir un montant global distribue automatiquement aux BL (solder en priorité, reliquat sur le dernier).</p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1 uppercase tracking-wider">Ventilation individuelle du virement par BL</h4>
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {selectedBls.map((bl) => {
                const reqVal = Math.round(bl.net);
                const assignedVal = individualAmounts[bl.id] || 0;
                
                return (
                  <div key={bl.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-xl">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                        <span className="font-bold text-xs sm:text-sm">{bl.bl}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", bl.type_contrat === 'FOURNISSEUR' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-450' : 'bg-orange-100 text-orange-850 dark:bg-orange-900/30 dark:text-orange-455')}>
                          {bl.type_contrat}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">FA: {bl.fa} • Facture: {bl.num_facture} • Net : <span className="font-mono text-slate-700 dark:text-slate-350 font-bold">{new Intl.NumberFormat('fr-FR').format(reqVal)} FCFA</span></p>
                    </div>

                    <div className="w-full sm:w-48 shrink-0 flex items-center gap-2">
                      <label className="text-[11px] text-slate-500 dark:text-slate-400 sm:hidden">Montant affecté :</label>
                      <input 
                        type="number"
                        min="0"
                        value={assignedVal}
                        onChange={e => handleIndividualAmountChange(bl.id, Number(e.target.value) || 0)}
                        className="w-full text-right px-2.5 py-1.5 text-xs font-mono font-semibold border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-150"
                        placeholder="Montant reçu"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-150 dark:border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-550 dark:text-slate-400 font-bold">Total affecté accumulé :</span>
            <span className={cn("font-mono font-extrabold text-sm", currentSumAllocated === Number(totalVirementInput) ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500')} title="Vérifiez que le total affecté correspond au virement global">
              {new Intl.NumberFormat('fr-FR').format(currentSumAllocated)} FCFA
            </span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition w-full sm:w-auto">Annuler</button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-1.5 w-full sm:w-auto disabled:opacity-50 font-bold text-center"
            >
              {isSaving ? "Enregistrement..." : "Confirmer le virement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
