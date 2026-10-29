import { AlertTriangle, ArrowRight, BriefcaseBusiness, CheckCircle2, CircleDashed, Clock3, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { formatHoursMinutes } from "../../services/manualAttendanceService";
import "../../styles/student-portal.css";

const weeklyHours = [22, 30, 18, 34, 29, 41, 26];
const tasks = [
  { label: "Web application development", status: "Completed", value: 18 },
  { label: "Client onboarding tasks", status: "Completed", value: 12 },
  { label: "Documentation and testing", status: "In progress", value: 8 },
  { label: "Presentation prep", status: "Scheduled", value: 5 },
];

const evaluationSummary = [
  { label: "Work Performance", score: 92 },
  { label: "Professionalism", score: 90 },
  { label: "Communication", score: 88 },
  { label: "Initiative", score: 94 },
];

function StudentsProgress() {
  const requiredHours = 486;
  const completedHours = 320;
  const remainingHours = requiredHours - completedHours;
  const progressPercent = Math.round((completedHours / requiredHours) * 100);
  const attendancePercent = 91;

  const estimatedCompletion = useMemo(() => {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + 4, 15);
    return target.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return (
    <div className="student-portal-page">
      <header className="student-page-header">
        <div>
          <p className="student-meta">Progress Overview</p>
          <h1>OJT Progress</h1>
        </div>
        <div className="student-header-actions">
          <button type="button" className="student-button secondary">
            <TrendingUp size={15} />
            Weekly Summary
          </button>
        </div>
      </header>

      <section className="student-overview-grid">
        <div className="student-card student-stat-card">
          <p className="student-stat-label">Required Hours</p>
          <div className="student-stat-value">
            <strong>{formatHoursMinutes(requiredHours)}</strong>
            <span className="student-stat-trend neutral">Target</span>
          </div>
        </div>

        <div className="student-card student-stat-card">
          <p className="student-stat-label">Completed Hours</p>
          <div className="student-stat-value">
            <strong>{formatHoursMinutes(completedHours)}</strong>
            <span className="student-stat-trend positive">+24% vs plan</span>
          </div>
        </div>

        <div className="student-card student-stat-card">
          <p className="student-stat-label">Remaining Hours</p>
          <div className="student-stat-value">
            <strong>{formatHoursMinutes(remainingHours)}</strong>
            <span className="student-stat-trend neutral">On track</span>
          </div>
        </div>

        <div className="student-card student-stat-card">
          <p className="student-stat-label">Progress</p>
          <div className="student-stat-value">
            <strong>{progressPercent}%</strong>
            <span className="student-stat-trend positive">Strong</span>
          </div>
        </div>
      </section>

      <section className="student-grid-two">
        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Overall OJT progress</p>
              <h2 className="student-panel-title">Completion Summary</h2>
            </div>
            <span className="status-badge completed">On schedule</span>
          </div>

          <div className="progress-wrap">
            <div className="progress-label">
              <span>Hours completed</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="progress-bar" aria-label="OJT progress bar">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="student-summary-grid" style={{ marginTop: "20px" }}>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Attendance %</p>
              <div className="student-stat-value">
                <strong>{attendancePercent}%</strong>
                <span className="student-stat-trend positive">Good</span>
              </div>
            </div>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Daily Average</p>
              <div className="student-stat-value">
                <strong>7.2h</strong>
                <span className="student-stat-trend neutral">Avg</span>
              </div>
            </div>
            <div className="student-card student-stat-card">
              <p className="student-stat-label">Estimated finish</p>
              <div className="student-stat-value">
                <strong>{estimatedCompletion}</strong>
                <span className="student-stat-trend positive">Target</span>
              </div>
            </div>
          </div>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Performance</p>
              <h2 className="student-panel-title">Attendance Percentage</h2>
            </div>
            <Clock3 size={18} color="#2868c7" />
          </div>

          <div className="student-metric-list">
            <div className="student-metric-item">
              <strong>{attendancePercent}%</strong>
              <span className="student-meta">Across 28 attendance entries</span>
            </div>
            <div className="student-metric-item">
              <strong>23</strong>
              <span className="student-meta">Present</span>
            </div>
            <div className="student-metric-item">
              <strong>2</strong>
              <span className="student-meta">Late</span>
            </div>
            <div className="student-metric-item">
              <strong>1</strong>
              <span className="student-meta">Absent</span>
            </div>
          </div>
        </div>
      </section>

      <section className="student-grid-two" style={{ marginTop: "18px" }}>
        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Hours logged</p>
              <h2 className="student-panel-title">Weekly Hours Chart</h2>
            </div>
          </div>

          <div className="student-chart" aria-label="Weekly hours chart">
            {weeklyHours.map((value, index) => (
              <div className="student-bar" key={value + index}>
                <div
                  className="student-bar-fill"
                  style={{ height: `${Math.max((value / 48) * 100, 18)}%` }}
                  title={formatHoursMinutes(value)}
                />
                <span>{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Milestones</p>
              <h2 className="student-panel-title">Monthly Hours Summary</h2>
            </div>
          </div>

          <ul className="student-task-list">
            <li>
              <div>
                <strong>April</strong>
                <span>{formatHoursMinutes(156)} logged</span>
              </div>
              <span className="status-badge active">+9%</span>
            </li>
            <li>
              <div>
                <strong>May</strong>
                <span>{formatHoursMinutes(164)} logged</span>
              </div>
              <span className="status-badge completed">+12%</span>
            </li>
            <li>
              <div>
                <strong>June</strong>
                <span>{formatHoursMinutes(142)} logged</span>
              </div>
              <span className="status-badge pending">Stable</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="student-grid-two" style={{ marginTop: "18px" }}>
        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Assignments</p>
              <h2 className="student-panel-title">Skills and Tasks Completed</h2>
            </div>
            <CheckCircle2 size={18} color="#208d67" />
          </div>

          <ul className="student-task-list">
            {tasks.map((task) => (
              <li key={task.label}>
                <div>
                  <strong>{task.label}</strong>
                  <span>{formatHoursMinutes(task.value)}</span>
                </div>
                <span className={
                  task.status === "Completed"
                    ? "status-badge approved"
                    : task.status === "In progress"
                      ? "status-badge pending"
                      : "status-badge active"
                }>
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Feedback</p>
              <h2 className="student-panel-title">Faculty Evaluation Summary</h2>
            </div>
            <BriefcaseBusiness size={18} color="#2868c7" />
          </div>

          <div className="student-metric-list">
            {evaluationSummary.map((item) => (
              <div className="student-metric-item" key={item.label}>
                <div className="progress-label">
                  <span>{item.label}</span>
                  <strong>{item.score}%</strong>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="student-grid-two" style={{ marginTop: "18px" }}>
        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Supervisor</p>
              <h2 className="student-panel-title">Company Evaluation Summary</h2>
            </div>
            <CircleDashed size={18} color="#2868c7" />
          </div>

          <div className="student-warning-box">
            <span>Performance rating: 4.7 / 5.0</span>
            <ArrowRight size={16} />
          </div>

          <ul className="student-task-list" style={{ marginTop: "12px" }}>
            <li>
              <div>
                <strong>Reliability</strong>
                <span>Very good</span>
              </div>
              <span className="status-badge approved">92%</span>
            </li>
            <li>
              <div>
                <strong>Quality of work</strong>
                <span>Strong and consistent</span>
              </div>
              <span className="status-badge approved">95%</span>
            </li>
            <li>
              <div>
                <strong>Team collaboration</strong>
                <span>Excellent cooperation</span>
              </div>
              <span className="status-badge approved">90%</span>
            </li>
          </ul>
        </div>

        <div className="student-card student-panel">
          <div className="student-panel-header">
            <div>
              <p className="student-panel-subtitle">Next milestone</p>
              <h2 className="student-panel-title">Weekly Accomplishments</h2>
            </div>
            <AlertTriangle size={18} color="#c68b14" />
          </div>

          <ul className="student-notification-list">
            <li>
              <div className="student-notification-item">
                <strong>Completed a website module</strong>
                <span>Finished a responsive dashboard feature.</span>
              </div>
            </li>
            <li>
              <div className="student-notification-item">
                <strong>Updated documentation</strong>
                <span>Prepared weekly technical report for review.</span>
              </div>
            </li>
            <li>
              <div className="student-notification-item">
                <strong>Presented demo</strong>
                <span>Shared progress update to project lead.</span>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export default StudentsProgress;
