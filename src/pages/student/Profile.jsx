import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { updateEmail } from "firebase/auth";
import { X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { auth, db } from "../../services/firebase";
import { studentAccountRef } from "../../services/studentAccountService";
import "../../styles/student-portal.css";

function Profile() {
  const { user } = useAuth();
  const [studentRecord, setStudentRecord] = useState(null);
  const [savedProfile, setSavedProfile] = useState(null);
  const [editForm, setEditForm] = useState({
    email: "",
    phone: "",
    address: "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) return undefined;

    return onSnapshot(
      query(collection(db, "students"), where("studentUid", "==", user.uid)),
      (snapshot) => {
        setStudentRecord(
          snapshot.empty
            ? null
            : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() },
        );
      },
      (snapshotError) => {
        console.error("Unable to load student record for profile:", snapshotError);
        setError("Unable to load your student profile.");
      },
    );
  }, [user?.uid]);

  const student = { ...user, ...studentRecord, ...(savedProfile?.uid === user?.uid ? savedProfile : {}) };
  const profile = {
    fullName:
      student.fullName ||
      student.name ||
      `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
      user?.email ||
      "Student",
    studentId: student.studentId || student.studentID || student.idNumber || "",
    program: student.course || student.program || student.department || "",
    schoolYear: student.schoolYear || "",
    email: auth.currentUser?.email || student.email || user?.email || "",
    phone: student.phone || student.contactNumber || "",
    address: student.address || "",
    company: student.company || student.partnerCompanyName || "Not assigned",
    companySupervisor:
      student.supervisorName || student.companySupervisor || "Not assigned",
    facultyCoordinator:
      student.coordinatorName || student.facultyCoordinator || "Not assigned",
  };

  const openEdit = () => {
    setEditForm({
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
    });
    setError("");
    setIsEditing(true);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const firebaseUser = auth.currentUser;
    if (!user?.uid || !firebaseUser) {
      setError("Your session has expired. Please sign in again.");
      return;
    }

    const email = editForm.email.trim();
    const phone = editForm.phone.trim();
    const address = editForm.address.trim();
    if (!email) {
      setError("Email address is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    let authEmailUpdated = false;
    try {
      const accountRef = studentAccountRef(user.uid);
      const accountSnapshot = await getDoc(accountRef);
      if (email !== firebaseUser.email) {
        await updateEmail(firebaseUser, email);
        authEmailUpdated = true;
      }

      const updates = {
        email,
        phone,
        contactNumber: phone,
        address,
        updatedAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), updates);
      batch.set(
        accountRef,
        accountSnapshot.exists()
          ? updates
          : { ...user, ...updates, uid: user.uid, role: "student" },
        { merge: true },
      );
      if (studentRecord?.id) {
        batch.update(doc(db, "students", studentRecord.id), updates);
      }
      await batch.commit();

      setSavedProfile({ uid: user.uid, email, phone, contactNumber: phone, address });
      setIsEditing(false);
      setNotice("Profile updated successfully.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (saveError) {
      console.error("Unable to update student profile:", saveError);
      if (
        saveError.code === "auth/requires-recent-login" ||
        saveError.code === "auth/needs-recent-login"
      ) {
        setError("Please sign out and sign in again before changing your email.");
      } else if (saveError.code === "auth/email-already-in-use") {
        setError("That email address is already associated with another account.");
      } else if (authEmailUpdated) {
        setError(
          "Your login email changed, but the profile could not be fully synchronized. Contact an administrator.",
        );
      } else {
        setError("Unable to save profile changes. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const initials = profile.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ST";
  return (
    <div className="student-portal-page">
      <header className="student-page-header">
        <div>
          <p className="student-meta">Student profile</p>
          <h1>My Profile</h1>
        </div>
        <div className="student-header-actions">
          <button type="button" className="student-button primary" onClick={openEdit}>
            Edit Profile
          </button>
        </div>
      </header>

      {notice && <div className="student-profile-notice" role="status">{notice}</div>}
      {error && <div className="student-profile-error" role="alert">{error}</div>}

      <section className="student-card student-panel" style={{ padding: "28px 26px 18px", background: "#f3f5f8" }}>
        <div className="student-profile-summary" style={{ display: "flex", alignItems: "center", gap: 18, padding: 0, marginBottom: 18 }}>
          <div className="student-avatar" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 24, background: "linear-gradient(135deg, #0a66d5, #0d4fb8)", color: "#fff" }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 42px)", fontWeight: 700, color: "#1f2937", letterSpacing: "-0.04em" }}>{profile.fullName || "Loading..."}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8, color: "#4b5563", fontSize: 18 }}>
              <span>{profile.studentId || "No student ID"}</span>
              <span style={{ opacity: 0.7 }}>•</span>
              <span>{profile.program || "No program"}</span>
            </div>
            <p style={{ marginTop: 10, color: "#374151", fontSize: 18 }}>School Year: {profile.schoolYear || "Not assigned"}</p>
          </div>
        </div>

        <div className="student-form-grid student-profile-fields">
          <ReadOnlyField label="Email" value={profile.email} />
          <ReadOnlyField label="Phone Number" value={profile.phone} />
          <ReadOnlyField label="Address" value={profile.address} full />
          <ReadOnlyField label="OJT Company" value={profile.company} />
          <ReadOnlyField label="Company Supervisor" value={profile.companySupervisor} />
          <ReadOnlyField label="Faculty Coordinator" value={profile.facultyCoordinator} />
        </div>
      </section>

      {isEditing && (
        <div
          className="journal-modal-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && !saving && setIsEditing(false)
          }
        >
          <section
            className="student-card journal-modal student-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
          >
            <header className="journal-modal-header student-profile-modal-header">
              <div>
                <p className="student-panel-subtitle">Account details</p>
                <h2 className="student-panel-title" id="edit-profile-title">
                  Edit Profile
                </h2>
                <p>Only your email, phone number, and address can be edited.</p>
              </div>
              <button
                type="button"
                className="journal-modal-close"
                aria-label="Close edit profile"
                disabled={saving}
                onClick={() => setIsEditing(false)}
              >
                <X size={18} />
              </button>
            </header>
            <form className="student-profile-edit-form" onSubmit={saveProfile}>
              <ProfileField
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(value) =>
                  setEditForm((current) => ({ ...current, email: value }))
                }
                required
              />
              <ProfileField
                label="Phone Number"
                type="tel"
                value={editForm.phone}
                onChange={(value) =>
                  setEditForm((current) => ({ ...current, phone: value }))
                }
              />
              <ProfileField
                label="Address"
                value={editForm.address}
                onChange={(value) =>
                  setEditForm((current) => ({ ...current, address: value }))
                }
                full
              />
              {error && <div className="student-profile-error" role="alert">{error}</div>}
              <footer className="student-actions-row">
                <button
                  type="button"
                  className="student-button"
                  disabled={saving}
                  onClick={() => setIsEditing(false)}
                >
                  Close
                </button>
                <button type="submit" className="student-button primary" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value, full = false }) {
  return (
    <div className={`student-field${full ? " full" : ""}`}>
      <label>{label}</label>
      <input type="text" value={value || "—"} readOnly />
    </div>
  );
}

function ProfileField({ label, value, onChange, type = "text", required = false, full = false }) {
  return (
    <label className={`student-field${full ? " full" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        autoComplete={type === "email" ? "email" : "off"}
      />
    </label>
  );
}

export default Profile;
