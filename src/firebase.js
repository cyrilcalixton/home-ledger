import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDT5ltJuVL... (yours)",
  authDomain: "home-ledger-f4557.firebaseapp.com",
  projectId: "home-ledger-f4557",
  storageBucket: "home-ledger-f4557.firebasestorage.app",
  messagingSenderId: "464706917350",
  appId: "1:464706917350:web:2ac05295d0fa9044abc27"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);