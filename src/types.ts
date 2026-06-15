export type ContratType = "FOURNISSEUR" | "CLIENT";
export type StatutMaersk = "EN ATTENTE" | "PAYE";

export interface BLRecord {
  id: string;
  fa: string; // F ou H
  bl: string;
  num_facture: number;
  type_contrat: ContratType;
  marchandise: string;
  nb_tc: number;
  prix_tc: number;
  
  // Calculés
  montant_ttc: number;
  montant_ht: number;
  taux_ib: number; // Defaut 3
  valeur_ib: number;
  net: number;
  bureau: number;
  
  // Suivi
  statut_maersk: StatutMaersk;
  date_virement: string | null;
  montant_virement: number | null;
  net_reelle: number | null;
  date_echeance: string;
  history: string;
  
  created_at: string;
}

export interface DashboardKPIs {
  dettes_bureau_totales: number;
  dettes_maersk_totales: number;
  nb_tc_actifs: number;
  bl_en_attente: number;
  virement_mois_courant: number;
}
