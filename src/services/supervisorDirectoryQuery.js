import { collection, query, where } from "firebase/firestore";

export function supervisorDirectoryQuery(db, department) {
  return query(
    collection(db, "users"),
    where("role", "==", "supervisor"),
    where("department", "==", department),
  );
}
