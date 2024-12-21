// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDBRVL5_KcQbINskjIYidg7Ucvqfc4jzB0",
  authDomain: "mikeagent-94723.firebaseapp.com",
  projectId: "mikeagent-94723",
  storageBucket: "mikeagent-94723.firebasestorage.app",
  messagingSenderId: "835664975450",
  appId: "1:835664975450:web:8bc689f347aec6ff70ea63",
  measurementId: "G-HQKVLKWR5D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();