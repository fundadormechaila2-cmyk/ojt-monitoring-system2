import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "../pages/login";
import Dashboard from "../pages/Dashboard";
import StudentDashboardPage from "../pages/student/StudentsDashboard";
import StudentProfile from "../pages/student/Profile";
import StudentAttendance from "../pages/student/Attendance";
import StudentJournal from "../pages/student/MyJournal";
import RoleRoute from "../services/RoleRoute";
import AdminLayout from "../layouts/AdminLayout";
import AdminPlaceholder from "../pages/admin/AdminPlaceholder";
import Students from "../pages/admin/Students";
import OJTCoordinators from "../pages/admin/OJTCoordinators";
import AdminReportsDashboard from "../pages/admin/AdminReportsDashboard";
import Users from "../pages/admin/Users";
import Settings from "../pages/admin/Settings";
import CoordinatorDashboard from "../pages/coordinator/CoordinatorDashboard";
import CoordinatorAttendance from "../pages/coordinator/Attendance";
import CoordinatorStudents from "../pages/coordinator/students";
import StudentJournals from "../pages/coordinator/StudentJournals";
import CoordinatorPlaceholder from "../pages/coordinator/CoordinatorPlaceholder";
import StudentDashboardLayout from "../layouts/StudentsLayout";
import SupervisorLayout from "../layouts/SupervisorLayout";
import SupervisorDashboard from "../pages/supervisor/Dashboard";
import SupervisorAttendance from "../pages/supervisor/Attendance";
import SupervisorStudents from "../pages/supervisor/Trainess";
import SupervisorScanStudentQR from "../pages/supervisor/ScanStudentQR";
import SupervisorSettings from "../pages/supervisor/Settings";

const placeholderRoutes = [
  ["ojtcoordinators", "OJT Coordinators"],
  ["ojthours", "OJT Hours"],
  ["evaluation", "Evaluations"],
];

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/admin"
          element={
            <RoleRoute allowedRole="admin">
              <AdminLayout/>
            </RoleRoute>
          }
        >
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="ojtcoordinators" element={<OJTCoordinators />} />
            <Route path="settings" element={<Settings />} />
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
          <Route path="reports-dashboard" element={<AdminPlaceholder title="Reports Dashboard" />} />
          <Route path="application" element={<AdminPlaceholder title="Applications" />} />
          <Route path="students" element={<CoordinatorStudents />} />
          <Route path="journals" element={<StudentJournals />} />
          <Route path="partnercompanies" element={<AdminPlaceholder title="Partner Companies" />} />
          <Route path="attendance" element={<CoordinatorAttendance />} />
          <Route path="ojtreports" element={<AdminPlaceholder title="OJT Reports" />} />
          <Route path="attendancereports" element={<AdminPlaceholder title="Attendance Reports" />} />
          <Route path="ojthours" element={<AdminPlaceholder title="OJT Hours" />} />
          <Route path="evaluation" element={<AdminPlaceholder title="Evaluation" />} />
          <Route path="settings" element={<AdminPlaceholder title="Settings" />} />
          <Route path="ojtcoordinators" element={<CoordinatorPlaceholder />} />
          {placeholderRoutes.filter(([path]) => !["ojtcoordinators", "ojthours", "evaluation"].includes(path)).map(([path, title]) => (
            <Route key={path} path={path} element={<AdminPlaceholder title={title} />} />
          ))}
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
          <Route path="profile" element={<StudentProfile />} />
          <Route path="attendance" element={<StudentAttendance />} />
          <Route path="ojtreports" element={<StudentJournal />} />
          <Route path="settings" element={<AdminPlaceholder title="Settings" />} />
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
          <Route path="scan-student-qr" element={<SupervisorScanStudentQR />} />
          <Route path="attendance" element={<SupervisorAttendance />} />
          <Route path="students" element={<SupervisorStudents />} />
          <Route path="settings" element={<SupervisorSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
