import { supabase } from '../lib/supabaseClient.js';
import { httpError } from '../lib/httpError.js';
import type { Database } from '../../src/lib/database.types.js';

type AttachmentStorageRow = Pick<Database['public']['Tables']['attachments']['Row'], 'id' | 'storage_path'>;

function requireBucket(): string {
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new Error('STORAGE_BUCKET must be set');
  return bucket;
}

// 3.6/US5/R2, per code-review.md §4.4's exact required order: attachments
// (Storage + DB) -> folders -> workspace row -> the `auth.users` row itself
// (via the admin API). A real, immediate, ordered delete, not a soft flag
// (§4.9 out-of-scope: no reversible account deletion). Every step is
// explicit rather than relying solely on the FK `on delete cascade`s already
// in place, so a failure partway through surfaces as a 500 instead of
// silently leaving orphaned Storage objects — FK cascades clean up Postgres
// rows, never Storage. Sharing/grants (the `shares` table) is dropped
// entirely as of task 7.5 — there is nothing left to unwind here.
export async function deleteAccountCascade(userId: string): Promise<void> {
  const { data: attachments, error: attachmentsError } = await supabase
    .from('attachments')
    .select('id, storage_path')
    .eq('owner_id', userId);
  if (attachmentsError) {
    throw httpError(500, `Could not list attachments for deletion: ${attachmentsError.message}`);
  }
  const attachmentRows = (attachments ?? []) as AttachmentStorageRow[];

  // 1. Attachments — Storage objects first, then DB rows. Never the
  // reverse: a failed/partial Storage removal would be unrecoverable once
  // the row (and its storage_path) is gone.
  if (attachmentRows.length > 0) {
    const bucket = requireBucket();
    const storagePaths = attachmentRows.map((row) => row.storage_path);
    const { error } = await supabase.storage.from(bucket).remove(storagePaths);
    if (error) throw httpError(500, `Could not delete attachment storage objects: ${error.message}`);
  }
  {
    const { error } = await supabase.from('attachments').delete().eq('owner_id', userId);
    if (error) throw httpError(500, `Could not delete attachment rows: ${error.message}`);
  }

  // 2. Folders
  {
    const { error } = await supabase.from('folders').delete().eq('workspace_id', userId);
    if (error) throw httpError(500, `Could not delete folders: ${error.message}`);
  }

  // 3. Workspace row
  {
    const { error } = await supabase.from('workspaces').delete().eq('id', userId);
    if (error) throw httpError(500, `Could not delete workspace: ${error.message}`);
  }

  // 4. The `auth.users` row itself — last, so every dependent row/object
  // above is already gone by the time this account can no longer be
  // identified by `userId`.
  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    throw httpError(500, `Could not delete auth user: ${deleteUserError.message}`);
  }
}
