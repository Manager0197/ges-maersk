import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc 
} from 'firebase/firestore';

const dbPath = path.resolve(process.cwd(), 'times_maersk.db');
const db = new Database(dbPath, { verbose: console.log });

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS bls (
    id TEXT PRIMARY KEY,
    fa TEXT NOT NULL,
    bl TEXT NOT NULL,
    num_facture INTEGER NOT NULL,
    type_contrat TEXT NOT NULL,
    marchandise TEXT NOT NULL,
    nb_tc INTEGER NOT NULL,
    prix_tc REAL NOT NULL,
    montant_ttc REAL NOT NULL,
    montant_ht REAL NOT NULL,
    taux_ib REAL DEFAULT 3,
    valeur_ib REAL NOT NULL,
    net REAL NOT NULL,
    statut_maersk TEXT DEFAULT 'EN ATTENTE',
    bureau REAL NOT NULL,
    date_virement TEXT,
    montant_virement REAL,
    net_reelle REAL,
    date_echeance TEXT,
    history TEXT DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

try { db.prepare("ALTER TABLE bls ADD COLUMN date_echeance TEXT").run(); } catch (e) {}
try { db.prepare("ALTER TABLE bls ADD COLUMN history TEXT DEFAULT '[]'").run(); } catch (e) {}

// Firebase configuration for real cloud persistence
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBQncdepecMzC2XgnSiz0ozN6kGRJMEtvg",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "ges-maersk.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "ges-maersk",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "ges-maersk.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "552040178243",
  appId: process.env.FIREBASE_APP_ID || "1:552040178243:web:f56fbf8a5208925dda2af6"
};

// Initialize Firebase App & Firestore with long polling to prevent gRPC streaming issues in containers
const appFirebase = initializeApp(firebaseConfig);
const firestoreDb = initializeFirestore(appFirebase, {
  experimentalForceLongPolling: true
});

// Calculation Logic based on constraints
function calculateBL(data: any) {
  const nb_tc = Number(data.nb_tc);
  const prix_tc = Number(data.prix_tc);
  const type_contrat = data.type_contrat;
  const montant_virement = data.montant_virement !== undefined && data.montant_virement !== null ? Number(data.montant_virement) : null;
  const taux_ib = data.taux_ib !== undefined ? Number(data.taux_ib) : 5;
  
  const montant_ttc = nb_tc * prix_tc;
  const montant_ht = montant_ttc / 1.18;
  const valeur_ib = montant_ht * (taux_ib / 100);
  const net = montant_ttc - valeur_ib;
  
  let bureau = 0;
  if (type_contrat === 'CLIENT') {
    bureau = nb_tc * 110000;
  }
  
  let net_reelle = null;
  let statut_maersk = data.statut_maersk || 'EN ATTENTE';
  
  if (montant_virement !== null) {
    net_reelle = montant_virement - bureau;
    statut_maersk = 'PAYE'; // Auto update statut if a valid virement is processed
  }

  const date_echeance = data.date_echeance || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const history = data.history || '[]';

  return {
    ...data,
    nb_tc,
    prix_tc,
    montant_ttc,
    montant_ht,
    taux_ib,
    valeur_ib,
    net,
    bureau,
    statut_maersk,
    net_reelle,
    date_echeance,
    history
  };
}

function appendToHistory(currentHistoryStr: string, action: string) {
  try {
    const list = JSON.parse(currentHistoryStr || '[]');
    list.unshift({ date: new Date().toISOString(), action });
    return JSON.stringify(list);
  } catch (e) {
    return currentHistoryStr;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // === API ROUTES ===
  
  // GET /api/bls
  app.get('/api/bls', async (req, res) => {
    try {
      console.log("Fetching BLs from Firestore...");
      const snapshot = await getDocs(collection(firestoreDb, 'bls'));
      const bls: any[] = [];
      snapshot.forEach(docSnap => {
        bls.push({ id: docSnap.id, ...docSnap.data() });
      });
      
      // Sort in-memory by created_at DESC to avoid indexing constraints
      bls.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
      
      res.json(bls);
    } catch (fsError) {
      console.error("Firestore GET failed, falling back to local SQLite:", fsError);
      try {
        const stmt = db.prepare('SELECT * FROM bls ORDER BY created_at DESC');
        const blsLocal = stmt.all();
        res.json(blsLocal);
      } catch (sqliteError) {
        res.status(500).json({ error: String(sqliteError) });
      }
    }
  });

  // GET /api/dashboard
  app.get('/api/dashboard', async (req, res) => {
    try {
      console.log("Fetching dashboard data from Firestore...");
      const snapshot = await getDocs(collection(firestoreDb, 'bls'));
      const bls: any[] = [];
      snapshot.forEach(docSnap => {
        bls.push({ id: docSnap.id, ...docSnap.data() });
      });

      let dettes_bureau_totales = 0;
      let dettes_maersk_totales = 0;
      let nb_tc_actifs = 0;
      let bl_en_attente = 0;
      let virement_mois_courant = 0;
      let net_a_payer_mois = 0;
      let commission_transport_mois = 0;
      
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      bls.forEach(bl => {
        const bd = new Date(bl.created_at);
        const isCurrentMonth = bd.getMonth() === currentMonth && bd.getFullYear() === currentYear;

        if (isCurrentMonth) {
          net_a_payer_mois += Number(bl.net || 0);
          commission_transport_mois += Number(bl.bureau || 0);
        }

        if (bl.type_contrat === 'CLIENT' && (bl.net_reelle === null || bl.net_reelle === undefined || bl.net_reelle < 0)) {
           if (bl.montant_virement === null || bl.montant_virement === undefined) {
              dettes_bureau_totales += Number(bl.bureau || 0);
           } else if (Number(bl.net_reelle || 0) < 0) {
              dettes_bureau_totales += Math.abs(Number(bl.net_reelle || 0));
           }
        }
        
        if (bl.statut_maersk !== 'PAYE') {
          dettes_maersk_totales += Number(bl.net || 0);
          bl_en_attente++;
        }
        
        nb_tc_actifs += Number(bl.nb_tc || 0);
        
        if (bl.date_virement) {
          const vd = new Date(bl.date_virement);
          if (vd.getMonth() === currentMonth && vd.getFullYear() === currentYear) {
            virement_mois_courant += Number(bl.montant_virement || 0);
          }
        }
      });

      // Chart Data: Repartition par marchandise
      const repartitionMap: Record<string, number> = {};
      bls.forEach(bl => {
        if (bl.marchandise) {
          repartitionMap[bl.marchandise] = (repartitionMap[bl.marchandise] || 0) + 1;
        }
      });
      const repartitionMarchandise = Object.keys(repartitionMap).map(k => ({
        name: k,
        value: repartitionMap[k]
      }));

      // Chart Data: Evolution mensuelle du NET
      const evolutionMap: Record<string, number> = {};
      bls.forEach(bl => {
        if (bl.created_at) {
          const mStr = bl.created_at.substring(0, 7); // YYYY-MM
          evolutionMap[mStr] = (evolutionMap[mStr] || 0) + Number(bl.net || 0);
        }
      });
      const evolutionMensuelle = Object.keys(evolutionMap).sort().map(k => ({
         mois: k,
         total_net: evolutionMap[k]
      }));

      res.json({
        dettes_bureau_totales,
        dettes_maersk_totales,
        nb_tc_actifs,
        bl_en_attente,
        virement_mois_courant,
        net_a_payer_mois,
        commission_transport_mois,
        repartitionMarchandise,
        evolutionMensuelle
      });
    } catch (fsError) {
      console.error("Firestore GET dashboard failed, falling back to local SQLite:", fsError);
      try {
        const bls = db.prepare('SELECT * FROM bls').all() as any[];
        
        let dettes_bureau_totales = 0;
        let dettes_maersk_totales = 0;
        let nb_tc_actifs = 0;
        let bl_en_attente = 0;
        let virement_mois_courant = 0;
        let net_a_payer_mois = 0;
        let commission_transport_mois = 0;
        
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        bls.forEach(bl => {
          const bd = new Date(bl.created_at);
          const isCurrentMonth = bd.getMonth() === currentMonth && bd.getFullYear() === currentYear;

          if (isCurrentMonth) {
            net_a_payer_mois += bl.net;
            commission_transport_mois += bl.bureau;
          }

          if (bl.type_contrat === 'CLIENT' && (bl.net_reelle === null || bl.net_reelle < 0)) {
             if (bl.montant_virement === null) {
                dettes_bureau_totales += bl.bureau;
             } else if (bl.net_reelle < 0) {
                dettes_bureau_totales += Math.abs(bl.net_reelle);
             }
          }
          
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
        });

        const repartitionMarchandise = db.prepare(`SELECT marchandise as name, COUNT(*) as value FROM bls GROUP BY marchandise`).all();
        const evolutionMensuelle = db.prepare(`
          SELECT strftime('%Y-%m', created_at) as mois, SUM(net) as total_net
          FROM bls
          GROUP BY mois
          ORDER BY mois ASC
        `).all();

        res.json({
          dettes_bureau_totales,
          dettes_maersk_totales,
          nb_tc_actifs,
          bl_en_attente,
          virement_mois_courant,
          net_a_payer_mois,
          commission_transport_mois,
          repartitionMarchandise,
          evolutionMensuelle
        });
      } catch (sqliteError) {
        res.status(500).json({ error: String(sqliteError) });
      }
    }
  });

  // POST /api/bls
  app.post('/api/bls', async (req, res) => {
    try {
      const data = calculateBL(req.body);
      const id = randomUUID();
      data.id = id;
      data.history = appendToHistory('[]', 'Création du BL');
      
      if (!data.created_at) {
        data.created_at = new Date().toISOString();
      }

      // 1. Dual-write to local SQLite database
      try {
        const stmt = db.prepare(`
          INSERT INTO bls (
            id, fa, bl, num_facture, type_contrat, marchandise, nb_tc, prix_tc,
            montant_ttc, montant_ht, taux_ib, valeur_ib, net, statut_maersk, bureau,
            date_virement, montant_virement, net_reelle, date_echeance, history, created_at
          ) VALUES (
            @id, @fa, @bl, @num_facture, @type_contrat, @marchandise, @nb_tc, @prix_tc,
            @montant_ttc, @montant_ht, @taux_ib, @valeur_ib, @net, @statut_maersk, @bureau,
            @date_virement, @montant_virement, @net_reelle, @date_echeance, @history, @created_at
          )
        `);
        stmt.run(data);
      } catch (sqliteError) {
        console.error("Local SQLite write failed inside POST /api/bls:", sqliteError);
      }

      // 2. Dual-write to cloud Firestore
      try {
        await setDoc(doc(firestoreDb, 'bls', id), data);
      } catch (fsError) {
        console.error("Firestore write failed inside POST /api/bls:", fsError);
      }

      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PUT /api/bls/:id
  app.put('/api/bls/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let current: any = null;

      // Check Firestore first
      try {
        const docSnap = await getDoc(doc(firestoreDb, 'bls', id));
        if (docSnap.exists()) {
          current = docSnap.data();
        }
      } catch (e) {}

      // Fallback checkout of SQLite
      if (!current) {
        try {
          current = db.prepare('SELECT * FROM bls WHERE id = ?').get(id) as any;
        } catch (e) {}
      }

      if (!current) return res.status(404).json({ error: 'BL not found' });
      
      const mergedData = { ...current, ...req.body };
      const data = calculateBL(mergedData);
      data.history = appendToHistory(current.history, 'Modification du BL');
      
      // Update local SQLite
      try {
        const stmt = db.prepare(`
          UPDATE bls SET 
            fa = @fa, bl = @bl, num_facture = @num_facture, type_contrat = @type_contrat,
            marchandise = @marchandise, nb_tc = @nb_tc, prix_tc = @prix_tc,
            montant_ttc = @montant_ttc, montant_ht = @montant_ht, taux_ib = @taux_ib, valeur_ib = @valeur_ib,
            net = @net, bureau = @bureau, date_echeance = @date_echeance, history = @history
          WHERE id = @id
        `);
        stmt.run({ ...data, id });
      } catch (sqliteError) {
        console.error("SQLite PUT update failed:", sqliteError);
      }

      // Update cloud Firestore
      try {
        await setDoc(doc(firestoreDb, 'bls', id), data);
      } catch (fsError) {
        console.error("Cloud Firestore PUT update failed:", fsError);
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // DELETE /api/bls/:id
  app.delete('/api/bls/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Delete from SQLite
      try {
        db.prepare('DELETE FROM bls WHERE id = ?').run(id);
      } catch (e) {}

      // Delete from Firestore
      try {
        await deleteDoc(doc(firestoreDb, 'bls', id));
      } catch (e) {}

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PATCH /api/bls/:id/virement
  app.patch('/api/bls/:id/virement', async (req, res) => {
    try {
      const { id } = req.params;
      const { montant_virement, date_virement } = req.body;
      
      let current: any = null;
      try {
        const docSnap = await getDoc(doc(firestoreDb, 'bls', id));
        if (docSnap.exists()) {
          current = docSnap.data();
        }
      } catch (e) {}

      if (!current) {
        try {
          current = db.prepare('SELECT * FROM bls WHERE id = ?').get(id) as any;
        } catch (e) {}
      }

      if (!current) return res.status(404).json({ error: 'BL not found' });
      
      const updated = calculateBL({
        ...current,
        montant_virement,
        date_virement: date_virement || new Date().toISOString()
      });
      const updatedHistory = appendToHistory(current.history, "Virement ajouté/modifié (" + montant_virement + " FCFA, " + date_virement + ")");
      updated.history = updatedHistory;
      
      // Update SQLite
      try {
        const stmt = db.prepare(`
          UPDATE bls SET 
            montant_virement = @montant_virement, 
            date_virement = @date_virement,
            net_reelle = @net_reelle,
            statut_maersk = @statut_maersk,
            history = @history
          WHERE id = @id
        `);
        stmt.run({
          id,
          montant_virement: updated.montant_virement,
          date_virement: updated.date_virement,
          net_reelle: updated.net_reelle,
          statut_maersk: updated.statut_maersk,
          history: updatedHistory
        });
      } catch (e) {}

      // Update Firestore
      try {
        await setDoc(doc(firestoreDb, 'bls', id), updated);
      } catch (e) {}
      
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PATCH /api/bls/:id/statut
  app.patch('/api/bls/:id/statut', async (req, res) => {
    try {
      const { id } = req.params;
      const { statut_maersk } = req.body;
      
      let current: any = null;
      try {
        const docSnap = await getDoc(doc(firestoreDb, 'bls', id));
        if (docSnap.exists()) {
          current = docSnap.data();
        }
      } catch (e) {}

      if (!current) {
        try {
          current = db.prepare('SELECT * FROM bls WHERE id = ?').get(id) as any;
        } catch (e) {}
      }

      if (!current) return res.status(404).json({ error: 'BL not found' });
      const updatedHistory = appendToHistory(current.history, "Statut Maersk changé en " + statut_maersk);
      const updated = { ...current, statut_maersk, history: updatedHistory };

      // SQLite
      try {
        const stmt = db.prepare(`UPDATE bls SET statut_maersk = @statut_maersk, history = @history WHERE id = @id`);
        stmt.run({ id, statut_maersk, history: updatedHistory });
      } catch (e) {}

      // Firestore
      try {
        await setDoc(doc(firestoreDb, 'bls', id), updated);
      } catch (e) {}
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // PATCH /api/bls/:id/bureau-solde
  app.patch('/api/bls/:id/bureau-solde', async (req, res) => {
    try {
      const { id } = req.params;
      
      let current: any = null;
      try {
        const docSnap = await getDoc(doc(firestoreDb, 'bls', id));
        if (docSnap.exists()) {
          current = docSnap.data();
        }
      } catch (e) {}

      if (!current) {
        try {
          current = db.prepare('SELECT * FROM bls WHERE id = ?').get(id) as any;
        } catch (e) {}
      }

      if (!current) return res.status(404).json({ error: 'BL not found' });
      
      const updatedHistory = appendToHistory(current.history, "Dette Bureau marquée comme soldée");
      const updated = {
        ...current,
        net_reelle: 0,
        montant_virement: current.bureau,
        history: updatedHistory
      };

      // SQLite
      try {
        const stmt = db.prepare(`UPDATE bls SET net_reelle = 0, montant_virement = bureau, history = @history WHERE id = @id`);
        stmt.run({ id, history: updatedHistory });
      } catch (e) {}

      // Firestore
      try {
        await setDoc(doc(firestoreDb, 'bls', id), updated);
      } catch (e) {}
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // === FRONTEND MIDDLEWARE ===
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log("Server running on port " + PORT);
  });
}

startServer();
