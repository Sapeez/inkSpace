import { useNavigate } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useSession } from '../lib/session';

interface WorkspacePageProps {
  // Testability seam only — see the matching comment on LoginPage.tsx/
  // SignupPage.tsx.
  auth?: Pick<SupabaseClient['auth'], 'signOut'>;
}

// Placeholder shell — task 5.1 replaces this with the real file-manager UI
// (Recent section, grid/list, breadcrumbs, search, Upload as the primary
// CTA). This exists now only so task 1.6's logout has a real authenticated
// page to live on, reachable from every signed-in session.
export default function WorkspacePage({ auth = getSupabaseClient().auth }: WorkspacePageProps = {}) {
  const navigate = useNavigate();
  const { session } = useSession();

  async function handleLogout() {
    await auth.signOut();
    navigate('/login');
  }

  return (
    <main className="workspace-page-placeholder">
      <header className="workspace-page-placeholder-header">
        <span data-testid="workspace-user-email">{session?.user.email}</span>
        <button type="button" className="auth-submit-button" data-testid="logout-button" onClick={handleLogout}>
          Log out
        </button>
      </header>
    </main>
  );
}
