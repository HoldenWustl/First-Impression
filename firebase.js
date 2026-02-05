import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCFdj4RXzsF3eLWR0Cj1nC8kKdP8Nom9QA",
  authDomain: "first-impression-3d214.firebaseapp.com",
  projectId: "first-impression-3d214",
  storageBucket: "first-impression-3d214.firebasestorage.app",
  messagingSenderId: "650931441542",
  appId: "1:650931441542:web:e9c50be5204b9f9f6de607"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
