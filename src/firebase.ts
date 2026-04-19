import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import localConfig from '../firebase-applet-config.json';

// Usamos variables de entorno si están disponibles (Vercel), 
// si no, usamos el archivo local (AI Studio)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || localConfig.appId
};

// Log de depuración (puedes verlo en el F12 del navegador)
if (!firebaseConfig.apiKey) {
  console.error("⚠️ CRÍTICO: No se detectó ninguna API Key de Firebase.");
} else {
  console.log(`✅ Firebase configurado para el proyecto: ${firebaseConfig.projectId}`);
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
