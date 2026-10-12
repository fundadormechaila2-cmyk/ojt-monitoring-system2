import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { firebaseConfig } from "./firebase";

// INITIALIZE SECONDARY FIREBASE APP
const secondaryApp =
  getApps().find((app) => app.name === "SecondaryApp") ||
  initializeApp(firebaseConfig, "SecondaryApp");

// SECONDARY AUTH
export const secondaryAuth = getAuth(secondaryApp);