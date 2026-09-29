import { supabase } from '../lib/supabaseClient.js';
import { httpError } from '../lib/httpError.js';
import type { Database } from '../../src/lib/database.types.js';

const MAX_DISPLAY_NAME_LENGTH = 100;

type WorkspaceRow = Database['public']['Tables']['workspaces']['Row'];

export interface Workspace {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

const WORKSPACE_COLUMNS = 'id, display_name, created_at, updated_at';

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// WC1: `workspaces.id` *is* the caller's `auth.users` id (1:1, see the
// 4.1 migration) — there is no separate lookup from user to workspace.
export async function getWorkspace(userId: string): Promise<Workspace> {
  const { data, error } = await supabase.from('workspaces').select(WORKSPACE_COLUMNS).eq('id', userId).maybeSingle();

  if (error) {
    throw httpError(500, `Could not load workspace: ${error.message}`);
  }
  // 4.2's trigger + backfill create this row for every `auth.users` id, so a
  // miss here means the trigger migration hasn't run against this
  // environment yet, not a normal "new user" case — surfaced as a 500, not a
  // silent 404 a client would just have to work around.
  if (!data) {
    throw httpError(500, `No workspace found for user ${userId}`);
  }
  return toWorkspace(data as WorkspaceRow);
}

export function validateDisplayName(name: string): string | null {
  if (name.trim().length === 0) return 'Required field';
  if (name.length > MAX_DISPLAY_NAME_LENGTH) return `${MAX_DISPLAY_NAME_LENGTH} characters maximum`;
  return null;
}

export async function updateWorkspaceDisplayName(userId: string, displayName: string): Promise<Workspace> {
  const validationError = validateDisplayName(displayName);
  if (validationError) {
    throw httpError(400, validationError);
  }

  const { data, error } = await supabase
    .from('workspaces')
    .update({ display_name: displayName.trim() })
    .eq('id', userId)
    .select(WORKSPACE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw httpError(500, `Could not update workspace: ${error.message}`);
  }
  if (!data) {
    throw httpError(500, `No workspace found for user ${userId}`);
  }
  return toWorkspace(data as WorkspaceRow);
}
