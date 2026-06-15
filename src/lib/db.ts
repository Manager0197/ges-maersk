import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface TimesDB extends DBSchema {
  blStore: {
    key: string;
    value: any;
  };
  offlineQueue: {
    key: number;
    value: {
      id?: number;
      action: 'ADD' | 'UPDATE' | 'DELETE' | 'PATCH_VIREMENT' | 'PATCH_STATUT' | 'PATCH_BUREAU';
      payload: any;
      blId?: string;
    };
    indexes: { 'by-date': number };
  };
}

let dbPromise: Promise<IDBPDatabase<TimesDB>>;

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<TimesDB>('times-trading-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('blStore')) {
          db.createObjectStore('blStore', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offlineQueue')) {
          const qStore = db.createObjectStore('offlineQueue', { keyPath: 'id', autoIncrement: true });
          qStore.createIndex('by-date', 'date');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveBLsToLocal(bls: any[]) {
  const db = await initDB();
  const tx = db.transaction('blStore', 'readwrite');
  await tx.objectStore('blStore').clear();
  for (const bl of bls) {
    await tx.objectStore('blStore').put(bl);
  }
  await tx.done;
}

export async function getLocalBLs(): Promise<any[]> {
  const db = await initDB();
  return db.getAll('blStore');
}

export async function enqueueOfflineAction(action: any) {
  const db = await initDB();
  await db.add('offlineQueue', { ...action, date: Date.now() });
}

export async function getOfflineQueue() {
  const db = await initDB();
  return db.getAllFromIndex('offlineQueue', 'by-date');
}

export async function clearOfflineAction(id: number) {
  const db = await initDB();
  await db.delete('offlineQueue', id);
}
