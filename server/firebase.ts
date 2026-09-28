import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

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

function getFirebaseAdmin() {
  try {
    if (getApps().length === 0) {
      const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      if (saEnv) {
        try {
          const sa = typeof saEnv === 'string' ? JSON.parse(saEnv) : saEnv;
          initializeApp({
            credential: cert(sa),
            projectId: firebaseConfig.projectId,
          });
        } catch (e) {
          console.warn('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT json:', e);
          initializeApp({
            projectId: firebaseConfig.projectId,
          });
        }
      } else {
        initializeApp({
          projectId: firebaseConfig.projectId,
        });
      }
    }
    const app = getApps()[0];
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';

    return {
      db: getFirestore(app, dbId),
      auth: getAuth(app),
      projectId: firebaseConfig.projectId,
      apiKey: firebaseConfig.apiKey,
    };
  } catch (e) {
    console.error('[Firebase Admin Init Error]', e);
    return {
      db: null,
      auth: null,
      projectId: firebaseConfig.projectId,
      apiKey: firebaseConfig.apiKey,
    };
  }
}

const adminInstance = getFirebaseAdmin();
export const db = adminInstance.db;
export const auth = adminInstance.auth;
export const firebaseProjectConfig = {
  projectId: adminInstance.projectId,
  apiKey: adminInstance.apiKey,
};

