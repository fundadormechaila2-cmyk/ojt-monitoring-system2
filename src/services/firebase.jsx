export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCoSDPqmefchNUjwIOG6q2OowAJUQIXbJw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ojt-monitoringsystem2.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ojt-monitoringsystem2",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ojt-monitoringsystem2.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "260573620058",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:260573620058:web:758c048038690d0da67563",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0DF8XPGBM4",
};

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

export const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app);

export const auth = getAuth(app);
export const db = getFirestore(app);
