import React from 'react';
import { formatFCFA } from '../lib/utils';
import { AlertTriangle, TrendingUp, Download, CheckCircle, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useBLContext } from '../context/BLContext';

export default function Dettes() {
  const { bls, loading, markBureauSolde, updateStatutMaersk } = useBLContext();

  const handleMarquerSoldeBureau = async (id: string) => {
    await markBureauSolde(id);
  };

  const handleMarquerPayeMaersk = async (id: string) => {
    await updateStatutMaersk(id, 'PAYE');
  };

  const exportExcel = () => {
    const data = bls.map(b => ({
      'BL': b.bl,
      'Contrat': b.type_contrat,
      'Marchandise': b.marchandise,
      'Nb TC': b.nb_tc,
      'Dette Bureau': b.bureau,
      'Net Réelle (Dette)': b.net_reelle === null ? b.bureau : (b.net_reelle < 0 ? Math.abs(b.net_reelle) : 0),
      'Dette Maersk (Net)': b.statut_maersk !== 'PAYE' ? b.net : 0,
      'Statut Maersk': b.statut_maersk
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dettes");
    XLSX.writeFile(wb, "dettes_TIMES.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Rapport Synthèse des Dettes (TIMES / MAERSK)", 14, 15);
    
    const dettesBureau = bls.filter(b => b.type_contrat === 'CLIENT' && (b.net_reelle === null || b.net_reelle < 0));
    const dettesMaersk = bls.filter(b => b.statut_maersk !== 'PAYE');

    doc.setFontSize(12);
    doc.text("Dettes envers le Bureau", 14, 25);
    
    const bureauBody = dettesBureau.map(b => [
      b.bl, 
      b.nb_tc.toString(), 
      formatFCFA(b.bureau), 
      b.montant_virement === null ? formatFCFA(b.bureau) : (b.net_reelle !== null ? formatFCFA(Math.abs(b.net_reelle)) : '0')
    ]);

    (doc as any).autoTable({
      startY: 30,
      head: [['BL', 'Nb TC', 'Dette (110k/TC)', 'Dette Actuelle']],
      body: bureauBody.length ? bureauBody : [['-', '-', '-', 'Aucune dette']],
    });

    const finalY = (doc as any).lastAutoTable.finalY || 30;
    
    doc.text("Dettes de Maersk", 14, finalY + 10);
    
    const maerskBody = dettesMaersk.map(b => [
      b.bl,
      b.type_contrat,
      formatFCFA(b.net),
      b.statut_maersk
    ]);

    (doc as any).autoTable({
      startY: finalY + 15,
      head: [['BL', 'Type', 'Montant Attendu (NET)', 'Statut']],
      body: maerskBody.length ? maerskBody : [['-', '-', '-', 'Aucune dette']],
    });

    doc.save("dettes_TIMES.pdf");
  };

  const dettesBureau = bls.filter(b => b.type_contrat === 'CLIENT' && (b.net_reelle === null || b.net_reelle < 0));
  const dettesMaersk = bls.filter(b => b.statut_maersk !== 'PAYE');

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-3xl font-bold text-slate-800">Gestion des Dettes</h2>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button onClick={exportExcel} className="flex-1 sm:flex-none justify-center items-center gap-2 px-4 py-2 min-h-[44px] bg-emerald-100 text-emerald-700 font-medium rounded-lg hover:bg-emerald-200 transition flex">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportPDF} className="flex-1 sm:flex-none justify-center items-center gap-2 px-4 py-2 min-h-[44px] bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 transition flex">
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {loading ? (
         <div className="p-4 animate-pulse text-slate-500">Chargement...</div>
      ) : (
      <>
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg"><AlertTriangle className="w-6 h-6" /></div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dettes envers le Bureau (Exportées vers Maersk)</h2>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap dark:text-slate-200">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">BL</th>
                <th className="px-4 py-3 text-right">Nb TC</th>
                <th className="px-4 py-3 text-right">Dette Récurrente (110k/TC)</th>
                <th className="px-4 py-3 text-right">Statut Maersk</th>
                <th className="px-4 py-3 text-right">Dette Actuelle (Net Réelle)</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dettesBureau.map(bl => (
                <tr key={bl.id}>
                  <td className="px-4 py-3 font-medium">{bl.bl}</td>
                  <td className="px-4 py-3 text-right">{bl.nb_tc}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600 font-bold">{formatFCFA(bl.bureau)}</td>
                  <td className="px-4 py-3 text-right">{bl.statut_maersk}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600 font-bold">
                    {bl.montant_virement === null ? formatFCFA(bl.bureau) : (bl.net_reelle !== null ? formatFCFA(Math.abs(bl.net_reelle)) : '-')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => handleMarquerSoldeBureau(bl.id)}
                      className="inline-flex justify-center items-center gap-1.5 px-4 py-2 min-h-[40px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-md transition"
                    >
                      <CheckCircle className="w-4 h-4" /> Marquer soldé
                    </button>
                  </td>
                </tr>
              ))}
              {dettesBureau.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Aucune dette Bureau en cours.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg"><TrendingUp className="w-6 h-6" /></div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100">Dettes de Maersk envers TIMES</h2>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm overflow-x-auto w-full">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px] dark:text-slate-200">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">BL</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Montant Attendu (NET)</th>
                <th className="px-4 py-3 text-right">Statut</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dettesMaersk.map(bl => (
                <tr key={bl.id}>
                  <td className="px-4 py-3 font-medium">{bl.bl}</td>
                  <td className="px-4 py-3">{bl.type_contrat}</td>
                  <td className="px-4 py-3 text-right font-mono text-orange-600 font-bold">{formatFCFA(bl.net)}</td>
                  <td className="px-4 py-3 text-right text-amber-600 font-medium">{bl.statut_maersk}</td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => handleMarquerPayeMaersk(bl.id)}
                      className="inline-flex justify-center items-center gap-1.5 px-4 py-2 min-h-[40px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs sm:text-sm font-semibold rounded-md transition"
                    >
                      <CheckCircle className="w-4 h-4" /> Marquer payé
                    </button>
                  </td>
                </tr>
              ))}
              {dettesMaersk.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Maersk a réglé toutes ses factures.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
