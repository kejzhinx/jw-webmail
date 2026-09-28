import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

export const firebaseConfig = {
  projectId: 'marine-verve-xzp2g',
  appId: '1:43130968817:web:a88c0c0d65ead08fd62750',
  apiKey: 'AIzaSyDk8nMsxNlJrao_H7CnMco6dZnAY0wuqQ8',
  authDomain: 'marine-verve-xzp2g.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-jwsummitmailserv-bef8f5e5-c980-4539-b787-61041950d1b1',
  storageBucket: 'marine-verve-xzp2g.firebasestorage.app',
  messagingSenderId: '43130968817',
  oAuthClientId: '43130968817-or59q388f0he1k7fq56ff3ph09vt77tv.apps.googleusercontent.com',
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const firestoreDb = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId || '(default)'
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
  }
})();

export {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
};
