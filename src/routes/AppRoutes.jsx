import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/login";
import Dashboard from "../pages/Dashboard";
import RoleRoute from "../services/RoleRoute";
import AdminLayout from "../layouts/AdminLayout";
import AdminPlaceholder from "../pages/admin/AdminPlaceholder";
import StudentDashboardPage from "../pages/student/StudentsDashboard";
import StudentAttendancePage from "../pages/student/Attendance";
import StudentProfilePage from "../pages/student/Profile";
import StudentReportsPage from "../pages/student/MyJournal";
import StudentSettingsPage from "../pages/student/Settings";
import Students from "../pages/admin/Students";
import OJTCoordinators from "../pages/admin/OJTCoordinators";
import AdminReportsDashboard from "../pages/admin/AdminReportsDashboard";
import Users from "../pages/admin/Users";
import Settings from "../pages/admin/Settings";
import CoordinatorDashboard from "../pages/coordinator/CoordinatorDashboard";
import CoordinatorAttendance from "../pages/coordinator/Attendance";
import CoordinatorStudents from "../pages/coordinator/students";
import CoordinatorSupervisor from "../pages/coordinator/Supervisor";
import StudentDashboardLayout from "../layouts/StudentsLayout";
import SupervisorLayout from "../layouts/SupervisorLayout";
import SupervisorDashboard from "../pages/supervisor/Dashboard";
import SupervisorStudents from "../pages/supervisor/Trainess";
import SupervisorAttendance from "../pages/supervisor/Attendance";
import SupervisorHours from "../pages/supervisor/OJTHours";
import SupervisorSettings from "../pages/supervisor/Settings";
import SupervisorDailyLogs from "../pages/supervisor/DailyLogs";
import ScanStudentQR from "../pages/supervisor/ScanStudentQR";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRole="admin">
              <AdminLayout />
            </RoleRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="reports-dashboard" element={<AdminReportsDashboard />} />
          <Route
            path="application"
            element={<AdminPlaceholder title="Applications" />}
          />
          <Route path="students" element={<Students />} />
          <Route
            path="partnercompanies"
            element={<AdminPlaceholder title="Partner Companies" />}
          />
          <Route
            path="attendance"
            element={<AdminPlaceholder title="Attendance" />}
          />
          <Route
            path="ojtreports"
            element={<AdminPlaceholder title="My Journal" />}
          />
          <Route
            path="attendancereports"
            element={<AdminPlaceholder title="Attendance Reports" />}
          />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
          <Route path="ojtcoordinators" element={<OJTCoordinators />} />
          <Route
            path="ojthours"
            element={<AdminPlaceholder title="OJT Hours" />}
          />
          <Route
            path="evaluation"
            element={<AdminPlaceholder title="Evaluations" />}
          />
        </Route>

        <Route
          path="/coordinator"
          element={
            <RoleRoute allowedRole="coordinator">
              <AdminLayout />
            </RoleRoute>
          }
        >
          <Route index element={<CoordinatorDashboard />} />
          <Route path="attendance" element={<CoordinatorAttendance />} />
          <Route path="students" element={<CoordinatorStudents />} />
          <Route path="supervisor" element={<CoordinatorSupervisor />} />
        </Route>

        <Route
          path="/Student"
          element={
            <RoleRoute allowedRole="student">
              <StudentDashboardLayout />
            </RoleRoute>
          }
        >
          <Route index element={<StudentDashboardPage />} />
          <Route path="profile" element={<StudentProfilePage />} />
          <Route path="attendance" element={<StudentAttendancePage />} />
          <Route path="ojtreports" element={<StudentReportsPage />} />
          <Route path="settings" element={<StudentSettingsPage />} />
        </Route>

        <Route
          path="/supervisor"
          element={
            <RoleRoute allowedRole="supervisor">
              <SupervisorLayout />
            </RoleRoute>
          }
        >
          <Route index element={<SupervisorDashboard />} />
          <Route path="scan-student-qr" element={<ScanStudentQR />} />
          <Route
            path="generate-attendance-qr"
            element={<Navigate to="/supervisor/scan-student-qr" replace />}
          />
          <Route path="students" element={<SupervisorStudents />} />
          <Route path="attendance" element={<SupervisorAttendance />} />
          <Route path="ojthours" element={<SupervisorHours />} />
          <Route path="dailylogs" element={<SupervisorDailyLogs />} />
          <Route path="settings" element={<SupervisorSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
