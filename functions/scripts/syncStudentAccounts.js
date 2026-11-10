const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT || "ojt-monitoringsystem2";
initializeApp({ credential: applicationDefault(), projectId });

async function syncStudentAccounts() {
  const db = getFirestore();
  const students = await db.collection("users").where("role", "==", "student").get();
  let created = 0;
  let skipped = 0;

  for (let offset = 0; offset < students.docs.length; offset += 400) {
    const batch = db.batch();
    let batchCreated = 0;
    const studentProfiles = students.docs.slice(offset, offset + 400);
    const existingProfiles = await Promise.all(
      studentProfiles.map((student) =>
        db.collection("studentAccounts").doc(student.id).get(),
      ),
    );

    studentProfiles.forEach((student, index) => {
      if (existingProfiles[index].exists) {
        skipped += 1;
        return;
      }
      batch.create(db.collection("studentAccounts").doc(student.id), {
        ...student.data(),
        uid: student.id,
      });
      created += 1;
      batchCreated += 1;
    });

    if (batchCreated > 0) await batch.commit();
  }

  console.log(`Created ${created} student account document(s); skipped ${skipped} existing document(s).`);
}

syncStudentAccounts().catch((error) => {
  console.error("Unable to sync student accounts:", error);
  process.exitCode = 1;
});
