import React, { useState, useEffect } from 'react';
import { formatFCFA } from '../lib/utils';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend, XAxis, YAxis, CartesianGrid } from 'recharts';
import { AlertTriangle, TrendingUp, Anchor, CheckCircle, Settings, ChevronUp, ChevronDown, RefreshCw, Calculator, HelpCircle, Eye, EyeOff } from 'lucide-react';
import { useBLContext } from '../context/BLContext';

interface CardDef {
  id: string;
  title: string;
  valueKey: string;
  color: string;
  bg: string;
  icon: any;
  isCount?: boolean;
  visible: boolean;
}

const defaultCardsData: CardDef[] = [
  { id: 'item-net', title: 'Net à payer (Mois courant)', valueKey: 'net_a_payer_mois', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/40', icon: CheckCircle, visible: true },
  { id: 'item-comm', title: 'Commission (Mois courant)', valueKey: 'commission_transport_mois', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40', icon: TrendingUp, visible: true },
  { id: 'item-dette-bur', title: 'Dettes Bureau (À Payer)', valueKey: 'dettes_bureau_totales', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/40', icon: AlertTriangle, visible: true },
  { id: 'item-dette-mae', title: 'Dettes Maersk (À Recevoir)', valueKey: 'dettes_maersk_totales', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/40', icon: TrendingUp, visible: true },
  { id: 'item-tc', title: 'TC Actifs (Volume)', valueKey: 'nb_tc_actifs', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40', icon: Anchor, isCount: true, visible: true },
  { id: 'item-vir', title: 'Virements (Mois courant)', valueKey: 'virement_mois_courant', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', icon: CheckCircle, visible: true },
];

export default function Dashboard() {
  const { dashboardData: data, loading } = useBLContext();
  const [cardsConfig, setCardsConfig] = useState<CardDef[]>([]);
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Simulator State
  const [simPreset, setSimPreset] = useState<'IMPORT' | 'EXPORT' | 'CUSTOM'>('IMPORT');
  const [simTc, setSimTc] = useState<number>(5);
  const [simPrixTc, setSimPrixTc] = useState<number>(110000); // Standard CLIENT is 110k, FOURNISSEUR is 94k
  const [simTauxIb, setSimTauxIb] = useState<number>(3);
  const [useTva, setUseTva] = useState<boolean>(true);
  const [simContract, setSimContract] = useState<'CLIENT' | 'FOURNISSEUR'>('CLIENT');

  const COLORS = ['#1A56DB', '#F97316', '#10B981', '#F59E0B'];

  // Load customizations
  useEffect(() => {
    const saved = localStorage.getItem('times_trading_dashboard_cards_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { id: string; visible: boolean }[];
        const merged = parsed.map(p => {
          const found = defaultCardsData.find(d => d.id === p.id);
          if (found) {
            return { ...found, visible: p.visible };
          }
          return null;
        }).filter(Boolean) as CardDef[];

        // Fill-in defaults if missing
        defaultCardsData.forEach(d => {
          if (!merged.some(m => m.id === d.id)) {
            merged.push(d);
          }
        });
        setCardsConfig(merged);
      } catch (err) {
        setCardsConfig(defaultCardsData);
      }
    } else {
      setCardsConfig(defaultCardsData);
    }
  }, []);

  // Update presets
  useEffect(() => {
    if (simPreset === 'IMPORT') {
      setSimContract('CLIENT');
      setSimPrixTc(110000);
      setSimTauxIb(3);
      setUseTva(true);
    } else if (simPreset === 'EXPORT') {
      setSimContract('FOURNISSEUR');
      setSimPrixTc(94000);
      setSimTauxIb(3);
      setUseTva(true);
    }
  }, [simPreset]);

  if (loading) return <div className="animate-pulse p-4 text-slate-500">Chargement des données du tableau de bord...</div>;

  const toggleCardVisibility = (id: string) => {
    const updated = cardsConfig.map(c => c.id === id ? { ...c, visible: !c.visible } : c);
    setCardsConfig(updated);
    saveCardsConfig(updated);
  };

  const moveCard = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= cardsConfig.length) return;
    const updated = [...cardsConfig];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setCardsConfig(updated);
    saveCardsConfig(updated);
  };

  const saveCardsConfig = (cfg: CardDef[]) => {
    localStorage.setItem('times_trading_dashboard_cards_v2', JSON.stringify(
      cfg.map(u => ({ id: u.id, visible: u.visible }))
    ));
  };

  const resetCards = () => {
    setCardsConfig(defaultCardsData);
    localStorage.removeItem('times_trading_dashboard_cards_v2');
  };

  // Simulator calculations
  const simTtc = simTc * simPrixTc;
  const simHt = useTva ? simTtc / 1.18 : simTtc;
  const simAibVal = simHt * (simTauxIb / 100);
  const simNet = simTtc - simAibVal;
  // If client (Import), courtage commission/bureau is generated
  const simBureau = simContract === 'CLIENT' ? simTc * 110000 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Tableau de bord</h2>
          <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">Suivi global et simulation des partenariats maritimes</p>
        </div>
        <button
          onClick={() => setIsCustomizing(!isCustomizing)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border transition shadow-sm cursor-pointer ${
            isCustomizing 
              ? 'bg-blue-550 border-blue-600 text-white bg-blue-600 hover:bg-blue-700' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Settings className={`w-4 h-4 ${isCustomizing ? 'animate-spin' : ''}`} />
          {isCustomizing ? 'Fermer la personnalisation' : 'Personnaliser l\'affichage'}
        </button>
      </div>

      {/* Customizer Panel */}
      {isCustomizing && (
        <div className="bg-slate-50 dark:bg-slate-905 p-6 rounded-2xl border border-slate-200 dark:border-slate-850 space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Organisateur de cartes de résumé</h3>
              <p className="text-xs text-slate-500">Ajustez l'ordre et la visibilité des statistiques clés du mois en cours.</p>
            </div>
            <button 
              onClick={resetCards}
              className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Réinitialiser
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {cardsConfig.map((card, idx) => (
              <div 
                key={card.id} 
                className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button 
                    onClick={() => toggleCardVisibility(card.id)}
                    className="p-1 text-slate-400 hover:text-indigo-500 transition"
                    title={card.visible ? "Masquer" : "Afficher"}
                  >
                    {card.visible ? <Eye className="w-4 h-4 text-emerald-500" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <span className={`text-xs font-semibold truncate ${card.visible ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through dark:text-slate-500'}`}>
                    {card.title}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <button 
                    disabled={idx === 0}
                    onClick={() => moveCard(idx, 'up')}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25 transition"
                    title="Monter"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={idx === cardsConfig.length - 1}
                    onClick={() => moveCard(idx, 'down')}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-25 transition"
                    title="Descendre"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {cardsConfig
          .filter(c => c.visible)
          .map((card) => {
            const val = data[card.valueKey as keyof typeof data];
            return (
              <StatCard
                key={card.id}
                title={card.title}
                value={val !== undefined ? val : 0}
                icon={card.icon}
                color={card.color}
                bg={card.bg}
                isCount={card.isCount}
              />
            );
          })}
        {cardsConfig.filter(c => c.visible).length === 0 && (
          <div className="col-span-full border-2 border-dashed border-slate-200 dark:border-slate-850 p-10 text-center rounded-2xl bg-white dark:bg-slate-900 text-slate-500">
            Toutes les cartes de résumé sont actuellement masquées. Utilisez le bouton <strong className="text-slate-700 dark:text-slate-300">« Personnaliser l'affichage »</strong> pour réactiver les indicateurs financiers.
          </div>
        )}
      </div>

      {/* Main Charts & Simulation Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Charts block (Span 2 to give space) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            
            {/* Pie Chart */}
            <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">Répartition par Marchandise</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.repartitionMarchandise}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {data.repartitionMarchandise.map((entry: any, index: number) => (
                        <Cell key={"cell-" + index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Summary Reference Mini-Panel */}
            <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-3 text-slate-800 dark:text-slate-100">Activité Logistique Maersk</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Le partenariat avec Maersk est structuré en contrats Import et Export. Les dossiers Import (CLIENT) donnent lieu à des commissions Bureau, tandis que les dossiers Export (FOURNISSEUR) calculent l'Acompte d'Impôt sur les Bénéfices (AIB).
                </p>
                
                <div className="space-y-2.5">
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-550 dark:text-slate-400 font-medium">Tarif Maersk Moyen (HT)</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">110 000 FCFA / 94 000 FCFA</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-550 dark:text-slate-400 font-medium">Taux fiscal d'Impôt Standard</span>
                    <span className="font-bold font-mono text-amber-600">3.0% (AIB retenu)</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-550 dark:text-slate-400 font-medium">Taux de TVA Standard</span>
                    <span className="font-bold font-mono text-slate-700 dark:text-slate-300">18.0% (Base de calcul HT)</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-4 text-center">
                Les montants représentés sont basés sur les données réelles consolidées.
              </p>
            </div>
          </div>

          {/* Monthly Flux Bar Chart */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">Évolution Mensuelle & Flux (FCFA)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.evolutionFlux}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="mois" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(val) => (val / 1000000) + 'M'} 
                    tick={{ fontSize: 12, fill: '#64748B' }}
                  />
                  <RechartsTooltip formatter={(value: number) => [formatFCFA(value), 'FCFA']} cursor={{fill: '#F1F5F9'}} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar name="Net à Payer (Maersk)" dataKey="NetAPayer" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  <Bar name="Dette Bureau" dataKey="DetteBureau" fill="#DC2626" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  <Bar name="Dette Maersk" dataKey="DetteMaersk" fill="#1A56DB" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Maersk Commissions Simulation Module */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-150 dark:border-slate-800 flex flex-col h-full justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Simulateur de Commission</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed dark:text-slate-400">
              Simulez à la volée les commissions de transport maritime Maersk, les déductions AIB ainsi que la caisse de courtage Bureau selon le volume de conteneurs.
            </p>

            {/* Presets */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Régime / Preset</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-850 p-1 rounded-lg">
                <button
                  onClick={() => setSimPreset('IMPORT')}
                  className={`py-1 text-[11px] font-bold rounded cursor-pointer ${simPreset === 'IMPORT' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  CLIENT (Imp)
                </button>
                <button
                  onClick={() => setSimPreset('EXPORT')}
                  className={`py-1 text-[11px] font-bold rounded cursor-pointer ${simPreset === 'EXPORT' ? 'bg-white dark:bg-slate-700 text-orange-700 dark:text-orange-300 shadow-xs' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  FOURN (Exp)
                </button>
                <button
                  onClick={() => setSimPreset('CUSTOM')}
                  className={`py-1 text-[11px] font-bold rounded cursor-pointer ${simPreset === 'CUSTOM' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  Perso.
                </button>
              </div>
            </div>

            {/* Contract type (Only if Custom) */}
            {simPreset === 'CUSTOM' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Contrat de Transit</label>
                <select 
                  value={simContract} 
                  onChange={e => setSimContract(e.target.value as any)}
                  className="w-full text-xs font-semibold px-2 py-1.5 border rounded-lg bg-slate-50 dark:bg-slate-800 dark:border-slate-705 border-slate-200 text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="CLIENT">CLIENT (Frais de courtage Bureau applicable)</option>
                  <option value="FOURNISSEUR">FOURNISSEUR (Pas de commission Bureau)</option>
                </select>
              </div>
            )}

            {/* Volume Container slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-400">Volume : {simTc} Conteneur(s)</span>
                <span className="font-mono text-indigo-650 dark:text-indigo-400 font-bold">{simTc} TC</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="100" 
                value={simTc} 
                onChange={e => setSimTc(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-indigo-600"
              />
            </div>

            {/* Unit Rate Column */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-400">Tarif par Conteneur (FCFA)</span>
              </div>
              <input 
                type="number" 
                min="1" 
                value={simPrixTc} 
                onChange={e => {
                  setSimPreset('CUSTOM');
                  setSimPrixTc(Number(e.target.value));
                }}
                className="w-full text-xs font-mono font-semibold px-2.5 py-1.5 border rounded-lg bg-slate-50 dark:bg-slate-800 dark:border-slate-700 border-slate-200 text-slate-800 dark:text-slate-200 outline-none"
                placeholder="Tarif par TC"
              />
            </div>

            {/* AIB reduction selection */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Taux fiscal AIB (%)</label>
              <div className="grid grid-cols-4 gap-1">
                {[0, 1, 2, 5].map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setSimPreset('CUSTOM');
                      setSimTauxIb(t);
                    }}
                    className={`py-1 text-[11px] font-mono font-bold rounded border cursor-pointer ${simTauxIb === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 hover:bg-slate-100'}`}
                  >
                    {t}%
                  </button>
                ))}
              </div>
            </div>

            {/* TVA toggle */}
            <div className="flex items-center justify-between text-xs pt-1.5">
              <span className="font-bold text-slate-600 dark:text-slate-400">Calculer Base de Taxe sur Montant HT (TVA 18%)</span>
              <input 
                type="checkbox" 
                checked={useTva}
                onChange={e => {
                  setSimPreset('CUSTOM');
                  setUseTva(e.target.checked);
                }}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Results Area */}
          <div className="mt-5 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-120 dark:border-indigo-900/30 font-sans space-y-2.5 text-xs">
            <h4 className="font-bold text-indigo-900 dark:text-indigo-400 border-b border-indigo-100 dark:border-indigo-900 pb-1 text-center">Rapport de Simulation</h4>
            
            <div className="flex justify-between py-0.5">
              <span className="text-slate-600 dark:text-slate-400">Facturation Brute (TTC)</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{formatFCFA(simTtc)}</span>
            </div>
            {useTva && (
              <div className="flex justify-between py-0.5 border-b border-dashed border-indigo-100/40 dark:border-indigo-900/20">
                <span className="text-slate-600 dark:text-slate-400">Base Éligible HT</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{formatFCFA(Math.round(simHt))}</span>
              </div>
            )}
            <div className="flex justify-between py-0.5">
              <span className="text-slate-600 dark:text-slate-400 text-amber-600">Retenue AIB ({simTauxIb}%)</span>
              <span className="font-mono font-bold text-amber-600">-{formatFCFA(Math.round(simAibVal))}</span>
            </div>
            
            <div className="flex justify-between border-t border-indigo-200 dark:border-indigo-900 pt-2 text-sm font-bold">
              <span className="text-indigo-950 dark:text-indigo-300">Net à Payer (Maersk)</span>
              <span className="font-mono text-indigo-700 dark:text-indigo-400">{formatFCFA(Math.round(simNet))} FCFA</span>
            </div>

            {simBureau > 0 && (
              <div className="flex justify-between border-t border-indigo-100 dark:border-indigo-900/40 pt-1.5">
                <span className="text-red-650 dark:text-red-400 font-bold">Commission Bureau</span>
                <span className="font-mono font-bold text-red-600">{formatFCFA(simBureau)} FCFA</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg, isCount = false }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-start justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 truncate">{title}</p>
        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
          {isCount ? value : formatFCFA(value)}
        </h4>
      </div>
      <div className={[`p-3 rounded-xl dark:opacity-80 shrink-0 ml-4`, bg].join(' ')}>
        <Icon className={[`w-6 h-6`, color].join(' ')} />
      </div>
    </div>
  );
}
