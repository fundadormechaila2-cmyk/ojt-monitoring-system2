import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

export const login = async (email, password) => {
  return signInWithEmailAndPassword(auth, String(email || "").trim(), password);
};

export const sendPasswordReset = async (email) => {
  return sendPasswordResetEmail(auth, String(email || "").trim());
};

export const logout = async () => {
  await signOut(auth);
};
