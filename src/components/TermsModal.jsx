import { useEffect, useRef } from "react";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";

export default function TermsModal({ checked, onCheckedChange, onAccept, onSignOut, loading, error }) {
  const contentRef = useRef(null);
  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop">
      <section className="modal-card terms-modal" role="dialog" aria-modal="true" aria-labelledby="terms-title">
        <div className="modal-icon" aria-hidden="true"><ShieldCheck size={24} /></div>
        <h2 id="terms-title">Terms and Conditions</h2>
        <div className="terms-content" tabIndex={0} ref={contentRef}>
          <h3>LCC I OJT Monitoring System</h3>
          <p>Last Updated: November 18, 2026</p>
          <p>Welcome to the LCC I OJT Monitoring System. By accessing and using this system, you agree to comply with the following Terms and Conditions.</p>
          <h3>1. Acceptance of Terms</h3>
          <p>By logging in and using the system, you acknowledge that you have read, understood, and agreed to these Terms and Conditions.</p>
          <h3>2. User Accounts and Security</h3>
          <ul>
            <li>Each user is responsible for maintaining the confidentiality of their account credentials.</li>
            <li>Users must not share their passwords or allow unauthorized individuals to access their accounts.</li>
            <li>Users must immediately report any suspected unauthorized account access.</li>
          </ul>
          <h3>3. Role-Based Access</h3>
          <p>Each user is assigned a specific role: Administrator, OJT Coordinator, Supervisor, or Student. Users may only access the information and functions authorized for their assigned roles.</p>
          <h3>4. QR Code Attendance Monitoring</h3>
          <ul>
            <li>Each student is assigned a unique QR code for attendance monitoring.</li>
            <li>The QR code automatically refreshes every 30 seconds for security purposes.</li>
            <li>Only authorized Supervisors are permitted to scan student QR codes.</li>
            <li>Students must ensure that their attendance is properly recorded.</li>
            <li>Provide accurate real time progress of interns.</li>
          </ul>
          <h3>5. Manual Attendance Recording</h3>
          <p>If a student forgets or cannot present their QR code, the authorized Supervisor may use the system’s manual attendance recording feature, subject to proper verification and school procedures.</p>
          <h3>6. Internet Connection and System Access</h3>
          <p>The system requires a stable internet connection to process and record attendance transactions. Attendance may not be recorded during internet interruptions or connectivity problems. Users should immediately inform the authorized Supervisor or Coordinator of any attendance-related issues.</p>
          <h3>7. Data Privacy and Confidentiality</h3>
          <p>All users must respect the confidentiality of personal information and student records. Personal information collected through the system shall only be accessed and used for legitimate OJT monitoring purposes and handled in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and applicable institutional privacy policies.</p>
          <h3>8. Prohibited Activities</h3>
          <p>Users are prohibited from:</p>
          <ul>
            <li>Accessing accounts without authorization.</li>
            <li>Sharing login credentials with other individuals.</li>
            <li>Modifying or deleting records without proper authorization.</li>
            <li>Falsifying attendance information.</li>
            <li>Misusing or attempting to compromise the system.</li>
          </ul>
          <h3>9. System Maintenance and Availability</h3>
          <p>The school may perform system maintenance, updates, and improvements. Temporary interruptions may occur during these activities.</p>
          <h3>10. Violations and Responsibilities</h3>
          <p>Any violation of these Terms and Conditions may result in appropriate action in accordance with the school’s existing rules, regulations, and policies.</p>
          <h3>11. Changes to Terms and Conditions</h3>
          <p>The school reserves the right to update or modify these Terms and Conditions when necessary. Users will be notified and may be required to review and accept the updated terms before continuing to use the system.</p>
          <h3>12. Agreement</h3>
          <p>By selecting “I Agree” or accepting these Terms and Conditions, you confirm that you have read, understood, and agreed to follow the rules and responsibilities stated above.</p>
          <p>Thank you for using the LCC I OJT Monitoring System.</p>
        </div>
        <form onSubmit={onAccept}>
          <div className="login-terms-control">
            <input id="terms-accepted" type="checkbox" checked={checked} onChange={onCheckedChange} disabled={loading} />
            <label htmlFor="terms-accepted">I Agree</label>
          </div>
          {error && <div className="alert alert-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{error}</span></div>}
          <button className="login-submit" type="submit" disabled={!checked || loading}>
            {loading && <Loader2 className="spin" size={16} aria-hidden="true" />}
            {loading ? "Saving agreement..." : "I Agree and Continue"}
          </button>
          <button className="link-button" type="button" onClick={onSignOut} disabled={loading}>Cancel and sign out</button>
        </form>
      </section>
    </div>
  );
}
