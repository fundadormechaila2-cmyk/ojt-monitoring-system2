import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

export const login = async (email, password) => {
  return signInWithEmailAndPassword(auth, String(email || "").trim(), password);
};

export const logout = async () => {
  await signOut(auth);
};
