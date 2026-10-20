import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  archiveAccount,
  deactivateAccount,
  deleteAccountPermanently,
  describeRelatedRecords,
  previewAccount,
  reactivateAccount,
  restoreAccount,
} from "../services/accountManagementService";
import "../styles/users-management.css";

const actions = {
  deactivate: {
    title: "Deactivate account",
    run: deactivateAccount,
    button: "Deactivate",
    text: "The account will be blocked from signing in and from all protected data. All records are preserved and the account can be reactivated.",
  },
  reactivate: {
    title: "Reactivate account",
    run: reactivateAccount,
    button: "Reactivate",
    text: "The account will be able to sign in again.",
  },
  archive: {
    title: "Archive record",
    run: archiveAccount,
    button: "Archive",
    text: "The record is hidden from active lists and the account is blocked. Attendance, hours, evaluations, and reports are preserved, and an administrator can restore it later.",
  },
  restore: {
    title: "Restore record",
    run: restoreAccount,
    button: "Restore",
    text: "The record returns to active lists and the account is re-enabled.",
  },
  delete: {
    title: "Permanently delete account",
    run: deleteAccountPermanently,
    button: "Delete permanently",
    text: "This removes the sign-in account and profile and cannot be undone. Attendance, evaluations, and applications are kept as academic history.",
  },
};

// target: { type: "user" | "student", id, name, email, role }
function AccountActionDialog({ action, target, onClose, onDone }) {
  const config = actions[action];
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const request = { targetType: target.type, targetId: target.id };

  useEffect(() => {
    let active = true;
    previewAccount({ targetType: target.type, targetId: target.id })
      .then((result) => active && setPreview(result))
      .catch((previewError) => active && setError(previewError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [target.id, target.type]);

  const related = describeRelatedRecords(preview?.related);
  const blocker = action === "delete" ? preview?.related?.blockers?.[0] : "";
  const isSelf = preview?.isSelf && action !== "reactivate" && action !== "restore";
  const needsTyping = action === "delete";
  const canSubmit = !loading && !busy && preview && !blocker && !isSelf && (!needsTyping || typed === "DELETE");

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const result = await config.run(request);
      onDone(result.message || "Done.", result.warnings || []);
    } catch (runError) {
      setError(runError.message || "The operation failed.");
      setBusy(false);
    }
  };

  return (
    <div className="users-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="users-modal" role="alertdialog" aria-modal="true" aria-label={config.title}>
        <header>
          <div><p>Account management</p><h2>{config.title}</h2></div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="users-details">
          <div><small>Account</small><strong>{target.name}</strong></div>
          {target.email && <div><small>Email</small><strong>{target.email}</strong></div>}
          <div><small>Role</small><strong>{preview?.target?.role || target.role}</strong></div>
        </div>
        <div className="users-dialog-body">
        <p>{config.text}</p>
        {loading && <p role="status">Checking related records...</p>}
        {!loading && related.length > 0 && (
          <p role="status"><strong>Related records:</strong> {related.join(", ")}.</p>
        )}
        {isSelf && <p className="users-error" role="alert">You cannot perform this action on your own account.</p>}
        {blocker && <p className="users-error" role="alert">{blocker}</p>}
        {needsTyping && !blocker && !isSelf && (
          <label>Type DELETE to confirm<input value={typed} disabled={busy} onChange={(event) => setTyped(event.target.value)} autoComplete="off" /></label>
        )}
        {error && <p className="users-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="users-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="users-primary"
            style={action === "delete" ? { background: "#b91c1c", borderColor: "#b91c1c" } : undefined}
            disabled={!canSubmit}
            onClick={submit}
          >
            {busy ? "Processing..." : config.button}
          </button>
        </footer>
        </div>
      </section>
    </div>
  );
}

export default AccountActionDialog;
