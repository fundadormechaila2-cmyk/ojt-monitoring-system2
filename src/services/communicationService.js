import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export const MAX_MESSAGE_LENGTH = 5000;

function personName(profile) {
  return (
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
    profile.fullName ||
    profile.name ||
    profile.email ||
    "Unnamed user"
  );
}

export function subscribeConversations(uid, onData, onError) {
  return onSnapshot(
    query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", uid),
      orderBy("updatedAt", "desc"),
    ),
    onData,
    onError,
  );
}

export function subscribeMessages(conversationId, onData, onError) {
  return onSnapshot(
    query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc"),
    ),
    onData,
    onError,
  );
}

export function subscribeAnnouncements(user, onData, onError) {
  const audienceField = user.role === "coordinator" ? "authorUid" : "targetSupervisorUid";
  return onSnapshot(
    query(
      collection(db, "announcements"),
      where(audienceField, "==", user.uid),
      orderBy("createdAt", "desc"),
    ),
    onData,
    onError,
  );
}

export async function loadCommunicationContacts(user) {
  if (!user?.uid || !["coordinator", "supervisor"].includes(user.role)) {
    throw new Error("Only coordinators and supervisors can use the Communication Hub.");
  }

  const assignmentField = user.role === "coordinator" ? "coordinatorUid" : "supervisorUid";
  const assignments = await getDocs(
    query(collection(db, "students"), where(assignmentField, "==", user.uid)),
  );
  const records = assignments.docs.map((snapshot) => ({
    id: snapshot.id,
    ...snapshot.data(),
  }));
  const counterpartIds = [...new Set(
    records
      .map((record) => user.role === "coordinator" ? record.supervisorUid : record.coordinatorUid)
      .filter((uid) => typeof uid === "string" && uid.length > 0),
  )];

  const contacts = await Promise.all(
    counterpartIds.map(async (uid) => {
      const profileSnapshot = await getDoc(doc(db, "users", uid));
      if (!profileSnapshot.exists()) return null;
      const profile = profileSnapshot.data();
      const expectedRole = user.role === "coordinator" ? "supervisor" : "coordinator";
      if (profile.role !== expectedRole) return null;

      const relatedStudents = records
        .filter((record) =>
          user.role === "coordinator"
            ? record.supervisorUid === uid
            : record.coordinatorUid === uid,
        )
        .map((record) => ({
          id: record.id,
          name: record.name || record.fullName ||
            `${record.firstName || ""} ${record.lastName || ""}`.trim() ||
            record.studentId || record.id,
          studentId: record.studentId || "",
        }));
      return {
        uid,
        name: personName(profile),
        role: profile.role,
        profile,
        students: relatedStudents,
      };
    }),
  );

  return contacts.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadProfile(uid) {
  const profileSnapshot = await getDoc(doc(db, "users", uid));
  if (!profileSnapshot.exists()) return null;
  const profile = profileSnapshot.data();
  return { uid, name: personName(profile), role: profile.role };
}

function conversationId(coordinatorUid, supervisorUid) {
  return `${coordinatorUid.length}_${coordinatorUid}_${supervisorUid}`;
}

export async function getOrCreateConversation({ user, contact, studentIds }) {
  const coordinatorUid = user.role === "coordinator" ? user.uid : contact.uid;
  const supervisorUid = user.role === "supervisor" ? user.uid : contact.uid;
  if (
    !coordinatorUid ||
    !supervisorUid ||
    !Array.isArray(studentIds) ||
    studentIds.length === 0
  ) {
    throw new Error("An assigned student is required to start this conversation.");
  }

  const id = conversationId(coordinatorUid, supervisorUid);
  const ref = doc(db, "conversations", id);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) return;

    transaction.set(ref, {
      participantIds: [coordinatorUid, supervisorUid],
      coordinatorId: coordinatorUid,
      supervisorId: supervisorUid,
      relationshipStudentId: studentIds[0],
      relatedStudentIds: [...new Set(studentIds)],
      latestMessage: "",
      latestMessageId: "",
      latestSenderUid: "",
      unreadCounts: { [coordinatorUid]: 0, [supervisorUid]: 0 },
      updatedAt: serverTimestamp(),
    });
  });

  return id;
}

export async function sendMessage({ conversation, user, text }) {
  const messageText = text.trim();
  if (!messageText) throw new Error("Enter a message before sending.");
  if (messageText.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const recipientUid = conversation.participantIds.find((uid) => uid !== user.uid);
  if (!recipientUid) throw new Error("This conversation has no valid recipient.");

  const conversationRef = doc(db, "conversations", conversation.id);
  const messageRef = doc(collection(conversationRef, "messages"));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(conversationRef);
    if (!snapshot.exists()) throw new Error("This conversation no longer exists.");
    const current = snapshot.data();
    const unreadCounts = current.unreadCounts || {};

    transaction.set(messageRef, {
      senderUid: user.uid,
      senderRole: user.role,
      recipientUid,
      text: messageText,
      createdAt: serverTimestamp(),
      isRead: false,
    });
    transaction.update(conversationRef, {
      latestMessage: messageText,
      latestMessageId: messageRef.id,
      latestSenderUid: user.uid,
      updatedAt: serverTimestamp(),
      unreadCounts: {
        ...unreadCounts,
        [recipientUid]: (Number(unreadCounts[recipientUid]) || 0) + 1,
      },
    });
  });
}

export async function markConversationRead(conversationIdValue, uid, messages) {
  const unreadMessages = messages.filter(
    (message) => message.recipientUid === uid && !message.isRead,
  );
  const conversationRef = doc(db, "conversations", conversationIdValue);
  const batches = [];
  for (let index = 0; index < unreadMessages.length; index += 450) {
    const batch = writeBatch(db);
    unreadMessages.slice(index, index + 450).forEach((message) => {
      batch.update(
        doc(db, "conversations", conversationIdValue, "messages", message.id),
        { isRead: true },
      );
    });
    batches.push(batch.commit());
  }
  if (unreadMessages.length > 0) {
    batches.push(updateDoc(conversationRef, {
      [`unreadCounts.${uid}`]: 0,
    }));
  }
  await Promise.all(batches);
}

export async function createAnnouncement({ user, contact, studentId, title, content }) {
  const cleanTitle = title.trim();
  const cleanContent = content.trim();
  if (!cleanTitle || !cleanContent) {
    throw new Error("Enter both an announcement title and message.");
  }
  if (cleanTitle.length > 160 || cleanContent.length > 5000) {
    throw new Error("Announcement title or message is too long.");
  }
  if (user.role !== "coordinator" || contact.role !== "supervisor") {
    throw new Error("Only coordinators can announce to assigned supervisors.");
  }

  await runTransaction(db, async (transaction) => {
    const supervisorRef = doc(db, "users", contact.uid);
    const studentRef = doc(db, "students", studentId);
    const [supervisorSnapshot, studentSnapshot] = await Promise.all([
      transaction.get(supervisorRef),
      transaction.get(studentRef),
    ]);
    if (
      !supervisorSnapshot.exists() ||
      supervisorSnapshot.data().role !== "supervisor" ||
      !studentSnapshot.exists() ||
      studentSnapshot.data().coordinatorUid !== user.uid ||
      studentSnapshot.data().supervisorUid !== contact.uid
    ) {
      throw new Error("The selected supervisor is no longer assigned to this student.");
    }

    const announcementRef = doc(collection(db, "announcements"));
    transaction.set(announcementRef, {
      title: cleanTitle,
      content: cleanContent,
      authorUid: user.uid,
      authorRole: user.role,
      targetSupervisorUid: contact.uid,
      targetAudience: "assigned-supervisor",
      relationshipStudentId: studentId,
      createdAt: serverTimestamp(),
      acknowledged: false,
      acknowledgedBy: "",
      acknowledgedAt: null,
    });
  });
}

export async function acknowledgeAnnouncement(announcementId, uid) {
  await updateDoc(doc(db, "announcements", announcementId), {
    acknowledged: true,
    acknowledgedBy: uid,
    acknowledgedAt: serverTimestamp(),
  });
}
