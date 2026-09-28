import { initializeApp, getApps } from 'firebase/app';
import {
  initializeFirestore,
  setLogLevel,
  doc as firestoreDoc,
  getDoc as firestoreGetDoc,
  setDoc as firestoreSetDoc,
  deleteDoc as firestoreDeleteDoc,
  collection as firestoreCollection,
  getDocs as firestoreGetDocs,
} from 'firebase/firestore';
import { db as adminDb } from './firebase.js';
import fs from 'fs';
import path from 'path';

// Suppress internal stream reconnection noise from client SDK in Node.js
setLogLevel('error');

let firebaseConfig: any = {
  projectId: "marine-verve-xzp2g",
  appId: "1:43130968817:web:a88c0c0d65ead08fd62750",
  apiKey: "AIzaSyDk8nMsxNlJrao_H7CnMco6dZnAY0wuqQ8",
  authDomain: "marine-verve-xzp2g.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-jwsummitmailserv-bef8f5e5-c980-4539-b787-61041950d1b1",
  storageBucket: "marine-verve-xzp2g.firebasestorage.app",
  messagingSenderId: "43130968817",
  oAuthClientId: "43130968817-or59q388f0he1k7fq56ff3ph09vt77tv.apps.googleusercontent.com",
};

try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  // Use static fallback
}

// Function to recursively sanitize objects and eliminate `undefined` fields for Firestore compatibility
export function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}

// Initialize Firebase Client SDK with experimentalForceLongPolling to eliminate gRPC WebStream read ECONNRESET
const clientApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const clientDb = initializeFirestore(
  clientApp,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || '(default)'
);

// Helper to detect quota exhaustion
export function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code;
  return (
    code === 'resource-exhausted' ||
    code === 8 ||
    msg.includes('quota exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('resource_exhausted')
  );
}

const QUOTA_STATE_PATH = path.resolve(process.cwd(), 'data', '.quota_state.json');
let isQuotaExceededActive = false;
let quotaExceededUntil = 0;

function initQuotaState() {
  try {
    if (fs.existsSync(QUOTA_STATE_PATH)) {
      const data = JSON.parse(fs.readFileSync(QUOTA_STATE_PATH, 'utf-8'));
      if (data && data.quotaExceededUntil && Date.now() < data.quotaExceededUntil) {
        isQuotaExceededActive = true;
        quotaExceededUntil = data.quotaExceededUntil;
        console.warn(`[Firestore] Quota backoff active from previous run until ${new Date(quotaExceededUntil).toISOString()}.`);
      }
    }
  } catch {}
}

function saveQuotaState() {
  try {
    const dir = path.dirname(QUOTA_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(QUOTA_STATE_PATH, JSON.stringify({ isQuotaExceededActive, quotaExceededUntil }));
  } catch {}
}

initQuotaState();

export function isFirestoreQuotaExhausted(): boolean {
  if (isQuotaExceededActive && Date.now() < quotaExceededUntil) {
    return true;
  }
  if (isQuotaExceededActive && Date.now() >= quotaExceededUntil) {
    isQuotaExceededActive = false;
    saveQuotaState();
  }
  return false;
}

function markQuotaExhausted(err?: any) {
  if (!isQuotaExceededActive) {
    console.warn('[Firestore] Quota exceeded. Seamlessly operating via persistent local storage fallback.');
  }
  isQuotaExceededActive = true;
  // Back off from remote Firestore for 15 minutes to prevent retry storms
  quotaExceededUntil = Date.now() + 15 * 60 * 1000;
  saveQuotaState();
}

// Local persistent memory/file store
const LOCAL_DB_PATH = path.resolve(process.cwd(), 'data', 'db_fallback.json');
const localStore: Record<string, Record<string, any>> = {};

function initLocalStore() {
  try {
    const dir = path.dirname(LOCAL_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      for (const [col, val] of Object.entries(parsed)) {
        localStore[col] = {};
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && item.id) {
              localStore[col][item.id] = item;
            }
          }
        } else if (typeof val === 'object' && val !== null) {
          localStore[col] = val as Record<string, any>;
        }
      }
    }
  } catch (err) {
    // Non-blocking
  }
}

initLocalStore();

function saveLocalStore() {
  try {
    const formatted: Record<string, any[]> = {};
    for (const [col, docs] of Object.entries(localStore)) {
      formatted[col] = Object.values(docs);
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(formatted, null, 2), 'utf-8');
  } catch {
    // Non-blocking
  }
}

/**
 * Retry helper for transient database network glitches
 */
async function withRetry<T>(operation: () => Promise<T>, maxRetries: number = 2): Promise<T> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (isQuotaExceededError(err)) {
        markQuotaExhausted(err);
        throw err; // Do not retry on quota exhaustion
      }
      const isTransient =
        err?.code === 14 ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('UNAVAILABLE') ||
        err?.message?.includes('network');
      if (attempt < maxRetries && isTransient) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function getDoc<T>(collectionName: string, docId: string): Promise<T | null> {
  if (!docId) return null;

  // If quota is exhausted, immediately return from local store
  if (isFirestoreQuotaExhausted()) {
    const local = localStore[collectionName]?.[docId];
    return local ? ({ ...local, id: docId } as T) : null;
  }

  // 1. Try Firebase Admin SDK if available
  if (adminDb) {
    try {
      const snap = await adminDb.collection(collectionName).doc(docId).get();
      if (snap.exists) {
        const data = { ...(snap.data() as any), id: snap.id } as T;
        localStore[collectionName] = localStore[collectionName] || {};
        localStore[collectionName][docId] = data;
        return data;
      }
      return null;
    } catch (adminErr) {
      if (isQuotaExceededError(adminErr)) {
        markQuotaExhausted(adminErr);
        const local = localStore[collectionName]?.[docId];
        return local ? ({ ...local, id: docId } as T) : null;
      }
      // Fallback to client SDK
    }
  }

  // 2. Client SDK access with retry
  try {
    return await withRetry(async () => {
      const docRef = firestoreDoc(clientDb, collectionName, docId);
      const snap = await firestoreGetDoc(docRef);
      if (snap.exists()) {
        const data = { ...(snap.data() as any), id: snap.id } as T;
        localStore[collectionName] = localStore[collectionName] || {};
        localStore[collectionName][docId] = data;
        return data;
      }
      return null;
    });
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markQuotaExhausted(err);
      const local = localStore[collectionName]?.[docId];
      return local ? ({ ...local, id: docId } as T) : null;
    }
    const local = localStore[collectionName]?.[docId];
    return local ? ({ ...local, id: docId } as T) : null;
  }
}

export async function setDoc<T>(
  collectionName: string,
  docId: string,
  data: T,
  merge: boolean = true
): Promise<void> {
  if (!docId) return;

  const payload = sanitizeForFirestore(data);

  // Always keep local store in sync
  localStore[collectionName] = localStore[collectionName] || {};
  localStore[collectionName][docId] = merge
    ? { ...(localStore[collectionName][docId] || {}), ...payload, id: docId }
    : { ...payload, id: docId };
  saveLocalStore();

  // If quota is exhausted, don't hammer the backend
  if (isFirestoreQuotaExhausted()) {
    return;
  }

  // 1. Try Admin SDK
  if (adminDb) {
    try {
      await adminDb.collection(collectionName).doc(docId).set(payload, { merge });
      return; // Handled by Admin SDK
    } catch (adminErr) {
      if (isQuotaExceededError(adminErr)) {
        markQuotaExhausted(adminErr);
        return;
      }
      // Fallback to client SDK
    }
  }

  // 2. Client SDK with retry
  try {
    await withRetry(async () => {
      const docRef = firestoreDoc(clientDb, collectionName, docId);
      await firestoreSetDoc(docRef, payload, { merge });
    });
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markQuotaExhausted(err);
      return;
    }
    // Local store is already saved
  }
}

export async function listDocs<T>(collectionName: string): Promise<T[]> {
  // If quota is exhausted, immediately return from local store
  if (isFirestoreQuotaExhausted()) {
    const list = Object.values(localStore[collectionName] || {});
    return list as T[];
  }

  // 1. Try Admin SDK
  if (adminDb) {
    try {
      const snap = await adminDb.collection(collectionName).get();
      const docs = snap.docs.map((doc) => ({
        ...(doc.data() as any),
        id: doc.id,
      })) as T[];
      if (docs.length > 0) {
        localStore[collectionName] = localStore[collectionName] || {};
        for (const d of docs as any[]) {
          if (d.id) localStore[collectionName][d.id] = d;
        }
        saveLocalStore();
      }
      return docs;
    } catch (adminErr) {
      if (isQuotaExceededError(adminErr)) {
        markQuotaExhausted(adminErr);
        return Object.values(localStore[collectionName] || {}) as T[];
      }
      // Fallback to client SDK
    }
  }

  // 2. Client SDK with retry
  try {
    const docs = await withRetry(async () => {
      const colRef = firestoreCollection(clientDb, collectionName);
      const snap = await firestoreGetDocs(colRef);
      return snap.docs.map((doc) => ({
        ...(doc.data() as any),
        id: doc.id,
      })) as T[];
    });

    if (docs.length > 0) {
      localStore[collectionName] = localStore[collectionName] || {};
      for (const d of docs as any[]) {
        if (d.id) localStore[collectionName][d.id] = d;
      }
      saveLocalStore();
    }
    return docs;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markQuotaExhausted(err);
      return Object.values(localStore[collectionName] || {}) as T[];
    }
    return Object.values(localStore[collectionName] || {}) as T[];
  }
}

export async function deleteDoc(collectionName: string, docId: string): Promise<void> {
  if (!docId) return;

  if (localStore[collectionName]?.[docId]) {
    delete localStore[collectionName][docId];
    saveLocalStore();
  }

  if (isFirestoreQuotaExhausted()) {
    return;
  }

  // 1. Try Admin SDK
  if (adminDb) {
    try {
      await adminDb.collection(collectionName).doc(docId).delete();
      return;
    } catch (adminErr) {
      if (isQuotaExceededError(adminErr)) {
        markQuotaExhausted(adminErr);
        return;
      }
      // Fallback to client SDK
    }
  }

  // 2. Client SDK with retry
  try {
    await withRetry(async () => {
      const docRef = firestoreDoc(clientDb, collectionName, docId);
      await firestoreDeleteDoc(docRef);
    });
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markQuotaExhausted(err);
      return;
    }
  }
}

export async function queryDocs<T>(
  collectionName: string,
  field?: string,
  op?: string,
  value?: any
): Promise<T[]> {
  const all = await listDocs<T>(collectionName);
  if (!field || op === undefined || value === undefined) {
    return all;
  }

  return all.filter((item: any) => {
    const val = item[field];
    if (op === '==' || op === '=') return val === value;
    if (op === 'in' && Array.isArray(value)) return value.includes(val);
    return true;
  });
}
