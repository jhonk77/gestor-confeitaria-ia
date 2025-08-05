import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCeHwkwQAzxpgUSM36UxITJk7N-EnLTogQ",
  authDomain: "gestor-confeitaria-ia.firebaseapp.com",
  projectId: "gestor-confeitaria-ia",
  storageBucket: "gestor-confeitaria-ia.appspot.com",
  messagingSenderId: "680331013226",
  appId: "1:680331013226:web:a9c8b7f6e5d4a3b2c1d0e1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const functions = getFunctions(app, "southamerica-east1");
export const db = getFirestore(app);
