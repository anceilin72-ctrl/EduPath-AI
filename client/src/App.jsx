import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';

import Landing from './pages/Landing.jsx';
import About from './pages/About.jsx';
import { SignIn, SignUp } from './pages/Auth.jsx';
import Setup from './pages/Setup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Careers from './pages/Careers.jsx';
import CareerDetail from './pages/CareerDetail.jsx';
import Plans from './pages/Plans.jsx';
import PlanDetail from './pages/PlanDetail.jsx';
import AdaptiveRoadmap from './pages/AdaptiveRoadmap.jsx';
import Compare from './pages/Compare.jsx';
import Resume from './pages/Resume.jsx';
import SkillPassport from './pages/SkillPassport.jsx';
import SkillGaps from './pages/SkillGaps.jsx';
import Assessments from './pages/Assessments.jsx';
import AssessmentDetail from './pages/AssessmentDetail.jsx';
import WeeklyPlanner from './pages/WeeklyPlanner.jsx';
import AIAgentChat from './pages/AIAgentChat.jsx';
import AITutor from './pages/AITutor.jsx';
import InterviewCoach from './pages/InterviewCoach.jsx';
import AgentActivity from './pages/AgentActivity.jsx';
import ProjectAnalyzer from './pages/ProjectAnalyzer.jsx';
import CertificateAnalyzer from './pages/CertificateAnalyzer.jsx';
import CareerSimulator from './pages/CareerSimulator.jsx';
import ProgressReport from './pages/ProgressReport.jsx';
import Profile from './pages/Profile.jsx';
import NotFound from './pages/NotFound.jsx';

/**
 * A page that needs an account.
 *
 * `state.from` is carried into the sign-in page so that arriving at a protected
 * URL, signing in, and landing back where you meant to go is one continuous
 * motion rather than dumping you on the dashboard.
 */
function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading label="Checking your session" />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;

  return children;
}

/** The landing page has nothing to offer someone already signed in. */
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/home" replace />;
  return children;
}

/**
 * Where a signed-in learner lands.
 *
 * Somebody who has never finished setup gets the wizard, everybody else gets the
 * dashboard. This is decided from the profile the app already holds rather than by
 * asking the server, so there is no extra request and no flash of the wrong screen.
 *
 * `onboardedAt` is the test, not "has a plan": a learner who deleted their only
 * roadmap has still answered the questions, and making them answer again would be
 * the app forgetting them. The dashboard handles the no-plan case itself.
 */
function Home() {
  const { user } = useAuth();
  return user?.profile?.onboardedAt ? <Dashboard /> : <Navigate to="/setup" replace />;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnly>
              <Landing />
            </PublicOnly>
          }
        />
        <Route
          path="/sign-in"
          element={
            <PublicOnly>
              <SignIn />
            </PublicOnly>
          }
        />
        <Route
          path="/sign-up"
          element={
            <PublicOnly>
              <SignUp />
            </PublicOnly>
          }
        />

        {/* The catalog is readable without an account: someone deciding whether
            this app is worth signing up for should be able to see the careers. */}
        <Route path="/about" element={<About />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/careers/:key" element={<CareerDetail />} />

        <Route
          path="/home"
          element={
            <Protected>
              <Home />
            </Protected>
          }
        />
        <Route
          path="/setup"
          element={
            <Protected>
              <Setup />
            </Protected>
          }
        />

        <Route
          path="/plans"
          element={
            <Protected>
              <Plans />
            </Protected>
          }
        />
        <Route
          path="/plans/:id"
          element={
            <Protected>
              <PlanDetail />
            </Protected>
          }
        />
        <Route
          path="/plans/:id/adapt"
          element={
            <Protected>
              <AdaptiveRoadmap />
            </Protected>
          }
        />
        <Route
          path="/compare"
          element={
            <Protected>
              <Compare />
            </Protected>
          }
        />
        <Route
          path="/resume"
          element={
            <Protected>
              <Resume />
            </Protected>
          }
        />
        <Route
          path="/skill-passport"
          element={
            <Protected>
              <SkillPassport />
            </Protected>
          }
        />
        <Route
          path="/skill-gaps"
          element={
            <Protected>
              <SkillGaps />
            </Protected>
          }
        />
        <Route
          path="/assessments"
          element={
            <Protected>
              <Assessments />
            </Protected>
          }
        />
        <Route
          path="/assessments/:id"
          element={
            <Protected>
              <AssessmentDetail />
            </Protected>
          }
        />
        <Route
          path="/weekly-planner"
          element={
            <Protected>
              <WeeklyPlanner />
            </Protected>
          }
        />
        <Route
          path="/ai-agent"
          element={
            <Protected>
              <AIAgentChat />
            </Protected>
          }
        />
        <Route
          path="/ai-tutor"
          element={
            <Protected>
              <AITutor />
            </Protected>
          }
        />
        <Route
          path="/interview-coach"
          element={
            <Protected>
              <InterviewCoach />
            </Protected>
          }
        />
        <Route
          path="/agent-activity"
          element={
            <Protected>
              <AgentActivity />
            </Protected>
          }
        />
        <Route
          path="/project-analyzer"
          element={
            <Protected>
              <ProjectAnalyzer />
            </Protected>
          }
        />
        <Route
          path="/certificate-analyzer"
          element={
            <Protected>
              <CertificateAnalyzer />
            </Protected>
          }
        />
        <Route
          path="/simulator"
          element={
            <Protected>
              <CareerSimulator />
            </Protected>
          }
        />
        <Route
          path="/progress-report"
          element={
            <Protected>
              <ProgressReport />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <Profile />
            </Protected>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
