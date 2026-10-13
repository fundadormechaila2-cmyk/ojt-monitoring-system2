import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../../context/useAuth";
import { db } from "../../services/firebase";
import "../../styles/student-portal.css";

function Profile() {
  const { user } = useAuth();
  const [studentRecord, setStudentRecord] = useState(null);
  const [editedFields, setEditedFields] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) return undefined;

    const unsubscribe = onSnapshot(
      query(collection(db, "students"), where("studentUid", "==", user.uid)),
      (snapshot) => {
        if (!snapshot.empty) {
          const docData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          setStudentRecord(docData);
        } else {
          setStudentRecord(null);
        }
      },
      (err) => {
        console.error("Unable to load student record for profile:", err);
      },
    );

    return unsubscribe;
  }, [user?.uid]);

  const student = { ...user, ...studentRecord };
  const serverProfile = {
    fullName:
      student.fullName ||
      student.name ||
      `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
      user?.email ||
      "Student",
    studentId: student.studentId || student.studentID || student.idNumber || "",
    program: student.course || student.program || student.department || "",
    yearLevel: student.yearLevel || "4th Year",
    email: student.email || user?.email || "",
    contactNumber: student.phone || student.contactNumber || "",
    address: student.address || "",
    company: student.company || student.partnerCompanyName || "Not assigned",
    companySupervisor:
      student.supervisorName || student.companySupervisor || "Not assigned",
    facultyCoordinator:
      student.coordinatorName || student.facultyCoordinator || "Not assigned",
    startDate: student.startDate || "",
    endDate: student.endDate || "",
  };

  const profile = editedFields ? { ...serverProfile, ...editedFields } : serverProfile;

  const handleFieldChange = (field, value) => {
    setEditedFields((current) => ({
      ...(current || profile),
      [field]: value,
    }));
  };

  const handleStartEdit = () => {
    setEditedFields(serverProfile);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const updates = {
        name: profile.fullName,
        fullName: profile.fullName,
        phone: profile.contactNumber,
        contactNumber: profile.contactNumber,
        address: profile.address,
        yearLevel: profile.yearLevel,
        startDate: profile.startDate,
        endDate: profile.endDate,
        updatedAt: serverTimestamp(),
      };

      if (studentRecord?.id) {
        await updateDoc(doc(db, "students", studentRecord.id), updates);
      }

      await updateDoc(doc(db, "users", user.uid), updates);

      setIsEditing(false);
      setEditedFields(null);
      setNotice("Profile updated successfully.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (saveError) {
      console.error("Unable to update profile:", saveError);
      setError("Unable to save profile changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedFields(null);
    setIsEditing(false);
    setError("");
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
          {!isEditing ? (
            <button type="button" className="student-button primary" onClick={handleStartEdit}>
              Edit Profile
            </button>
          ) : null}
        </div>
      </header>

      {notice && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            background: "#e2f6ef",
            color: "#16866f",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "bold",
          }}
          role="status"
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            background: "#fff6f6",
            color: "#a63f46",
            borderRadius: "8px",
            fontSize: "13px",
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="student-card student-panel">
        <div className="student-profile-summary">
          <div className="student-avatar">{initials}</div>
          <div>
            <h2>{profile.fullName || "Loading..."}</h2>
            <p>{profile.studentId || "No student ID"} • {profile.program || "No program"}</p>
            <p>{profile.yearLevel}</p>
          </div>
        </div>

        <div className="student-form-grid" style={{ padding: "0 22px 18px" }}>
          <div className="student-field">
            <label>Full Name</label>
            <input
              type="text"
              value={profile.fullName}
              onChange={(event) => handleFieldChange("fullName", event.target.value)}
              readOnly={!isEditing}
            />
          </div>
          <div className="student-field">
            <label>Student ID</label>
            <input type="text" value={profile.studentId} readOnly />
          </div>
          <div className="student-field">
            <label>Course / Program</label>
            <input
              type="text"
              value={profile.program}
              readOnly
            />
          </div>
          <div className="student-field">
            <label>Year Level</label>
            <input
              type="text"
              value={profile.yearLevel}
              onChange={(event) => handleFieldChange("yearLevel", event.target.value)}
              readOnly={!isEditing}
            />
          </div>
          <div className="student-field">
            <label>Email</label>
            <input
              type="email"
              value={profile.email}
              readOnly
            />
          </div>
          <div className="student-field">
            <label>Contact Number</label>
            <input
              type="tel"
              value={profile.contactNumber}
              onChange={(event) => handleFieldChange("contactNumber", event.target.value)}
              readOnly={!isEditing}
            />
          </div>
          <div className="student-field full">
            <label>Address</label>
            <input
              type="text"
              value={profile.address}
              onChange={(event) => handleFieldChange("address", event.target.value)}
              readOnly={!isEditing}
            />
          </div>
          <div className="student-field">
            <label>OJT Company</label>
            <input
              type="text"
              value={profile.company}
              readOnly
            />
          </div>
          <div className="student-field">
            <label>Company Supervisor</label>
            <input
              type="text"
              value={profile.companySupervisor}
              readOnly
            />
          </div>
          <div className="student-field">
            <label>Faculty Coordinator</label>
            <input
              type="text"
              value={profile.facultyCoordinator}
              readOnly
            />
          </div>
          <div className="student-field">
            <label>OJT Start Date</label>
            <input
              type="date"
              value={profile.startDate}
              onChange={(event) => handleFieldChange("startDate", event.target.value)}
              readOnly={!isEditing}
            />
          </div>
          <div className="student-field">
            <label>OJT End Date</label>
            <input
              type="date"
              value={profile.endDate}
              onChange={(event) => handleFieldChange("endDate", event.target.value)}
              readOnly={!isEditing}
            />
          </div>
        </div>

        {isEditing ? (
          <div className="student-actions-row" style={{ padding: "0 22px 22px" }}>
            <button type="button" className="student-button" disabled={saving} onClick={handleCancel}>Cancel</button>
            <button type="button" className="student-button primary" disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default Profile;
