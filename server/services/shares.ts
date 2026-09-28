import { supabase } from '../lib/supabaseClient.js';
import { resolveUserIdByEmail } from './users.js';

export type ShareRole = 'edit' | 'view';

interface ShareRow {
  id: string;
  grantee_email: string;
  grantee_user_id: string | null;
  role: ShareRole;
  granted_by: string;
  granted_at: string;
}

// Camel-cased for the client, mirroring how storage.ts maps AttachmentRow ->
// SavedAttachment/AttachmentDownload rather than exposing snake_case DB
// column names across the wire.
export interface Share {
  id: string;
  granteeEmail: string;
  granteeUserId: string | null;
  role: ShareRole;
  grantedBy: string;
  grantedAt: string;
}

function toShare(row: ShareRow): Share {
  return {
    id: row.id,
    granteeEmail: row.grantee_email,
    granteeUserId: row.grantee_user_id,
    role: row.role,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
  };
}

const SHARE_COLUMNS = 'id, grantee_email, grantee_user_id, role, granted_by, granted_at';

export async function listShares(attachmentId: string): Promise<Share[]> {
  const { data, error } = await supabase
    .from('shares')
    .select(SHARE_COLUMNS)
    .eq('attachment_id', attachmentId)
    .order('granted_at', { ascending: false });

  if (error) {
    throw Object.assign(new Error(`Could not list shares: ${error.message}`), { status: 500 });
  }
  return (data as ShareRow[]).map(toShare);
}

export interface CreateSharePayload {
  attachmentId: string;
  email: string;
  role: ShareRole;
  grantedBy: string;
}

// P1: grants (or updates, if this email already has a share on this
// attachment — the table's unique (attachment_id, grantee_email) constraint
// makes this an upsert, not a plain insert) edit/view access by email.
// `grantee_user_id` is resolved once, at grant time — if the email doesn't
// match an existing account yet, it's left null and the row grants nothing
// (`canRead`/`canWrite` match on `grantee_user_id`, never on email) until a
// future reconciliation step backfills it; no such backfill exists yet.
export async function createShare({ attachmentId, email, role, grantedBy }: CreateSharePayload): Promise<Share> {
  const normalizedEmail = email.trim().toLowerCase();
  const granteeUserId = await resolveUserIdByEmail(normalizedEmail);

  const { data, error } = await supabase
    .from('shares')
    .upsert(
      {
        attachment_id: attachmentId,
        grantee_email: normalizedEmail,
        grantee_user_id: granteeUserId,
        role,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
      },
      { onConflict: 'attachment_id,grantee_email' },
    )
    .select(SHARE_COLUMNS)
    .single();

  if (error || !data) {
    throw Object.assign(new Error(`Could not create share: ${error?.message}`), { status: 500 });
  }
  return toShare(data as ShareRow);
}

export async function removeShare(attachmentId: string, shareId: string): Promise<void> {
  const { error } = await supabase.from('shares').delete().eq('id', shareId).eq('attachment_id', attachmentId);
  if (error) {
    throw Object.assign(new Error(`Could not remove share: ${error.message}`), { status: 500 });
  }
}
