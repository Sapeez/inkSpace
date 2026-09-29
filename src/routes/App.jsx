import { Routes, Route, Navigate } from 'react-router-dom';
import ViewerPage from '../viewer/ViewerPage.jsx';
import LoginPage from './LoginPage.tsx';
import SignupPage from './SignupPage.tsx';
import ForgotPasswordPage from './ForgotPasswordPage.tsx';
import ResetPasswordPage from './ResetPasswordPage.tsx';
import VerifyEmailPage from './VerifyEmailPage.tsx';
import WorkspacePage from '../workspace/WorkspacePage.tsx';
import { useSession } from '../lib/session.ts';

// EH3 (simplified per tasks-accounts-workspace.md's scope note — no guest
// editor route): signed-in visitor at "/" lands in the workspace,
// unauthenticated visitor at "/" lands on the login page.
function EntryRedirect() {
  const { session, loading } = useSession();
  if (loading) return null;
  return <Navigate to={session ? '/workspace' : '/login'} replace />;
}

// Client-side redirect only — the real authorization boundary is the
// server's `requireAuth` (task 1.7). This just avoids rendering an
// authenticated page in a signed-out state instead of a helpful redirect.
function RequireSession({ children }) {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/workspace"
        element={
          <RequireSession>
            <WorkspacePage />
          </RequireSession>
        }
      />
      <Route
        path="/view/:attachmentId"
        element={
          <RequireSession>
            <ViewerPage />
          </RequireSession>
        }
      />
    </Routes>
  );
}
