import { supabase } from '../lib/supabaseClient.js';
import { isOwner } from '../middleware/permissions.js';
import { httpError } from '../lib/httpError.js';
import type { Database } from '../../src/lib/database.types.js';

const MAX_FOLDER_NAME_LENGTH = 100;

type FolderRow = Database['public']['Tables']['folders']['Row'];

export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

const FOLDER_COLUMNS = 'id, workspace_id, name, parent_folder_id, created_at, updated_at';

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateFolderName(name: string): string | null {
  if (name.trim().length === 0) return 'Required field';
  if (name.length > MAX_FOLDER_NAME_LENGTH) return `${MAX_FOLDER_NAME_LENGTH} characters maximum`;
  return null;
}

// 4.4/Risk R4: unlike `permissions.ts`'s `canRead`/`canWrite` (which defer a
// nonexistent attachment id to the route's own 404), a folder that exists
// but belongs to someone else's workspace fails closed as 403 here — there's
// no shared-folder model to defer to (WF5, no grants), so "not yours" is
// never ambiguous with "not found" the way a share-eligible attachment is.
type OwnershipLookup = 'not-found' | 'forbidden' | 'ok';

async function checkFolderOwnership(workspaceId: string, folderId: string): Promise<OwnershipLookup> {
  const { data, error } = await supabase.from('folders').select('workspace_id').eq('id', folderId).maybeSingle();
  if (error) throw httpError(500, `Could not look up folder: ${error.message}`);
  if (!data) return 'not-found';
  return (data as { workspace_id: string }).workspace_id === workspaceId ? 'ok' : 'forbidden';
}

async function assertFolderOwnership(workspaceId: string, folderId: string): Promise<void> {
  const lookup = await checkFolderOwnership(workspaceId, folderId);
  if (lookup === 'not-found') throw httpError(404, 'Folder not found');
  if (lookup === 'forbidden') throw httpError(403, 'Permission denied');
}

export async function listFolders(workspaceId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select(FOLDER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) {
    throw httpError(500, `Could not list folders: ${error.message}`);
  }
  return (data as FolderRow[]).map(toFolder);
}

export interface CreateFolderPayload {
  workspaceId: string;
  name: string;
  parentFolderId: string | null;
}

export async function createFolder({ workspaceId, name, parentFolderId }: CreateFolderPayload): Promise<Folder> {
  const validationError = validateFolderName(name);
  if (validationError) throw httpError(400, validationError);

  if (parentFolderId) {
    await assertFolderOwnership(workspaceId, parentFolderId);
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({ workspace_id: workspaceId, name: name.trim(), parent_folder_id: parentFolderId })
    .select(FOLDER_COLUMNS)
    .single();

  if (error || !data) {
    throw httpError(500, `Could not create folder: ${error?.message}`);
  }
  return toFolder(data as FolderRow);
}

export async function renameFolder(workspaceId: string, folderId: string, name: string): Promise<Folder> {
  const validationError = validateFolderName(name);
  if (validationError) throw httpError(400, validationError);
  await assertFolderOwnership(workspaceId, folderId);

  const { data, error } = await supabase.from('folders').update({ name: name.trim() }).eq('id', folderId).select(FOLDER_COLUMNS).single();

  if (error || !data) {
    throw httpError(500, `Could not rename folder: ${error?.message}`);
  }
  return toFolder(data as FolderRow);
}

// WF4/R3: deleting a folder must leave its files at the top level, not
// delete them — the `attachments.folder_id` FK's `on delete set null` (4.1
// migration) makes this a database-level guarantee rather than something
// this function has to remember to do itself. Subfolders *do* cascade-delete
// (`folders.parent_folder_id on delete cascade`) since the PRD only calls
// out files, not nested folders, as needing to survive.
export async function deleteFolder(workspaceId: string, folderId: string): Promise<void> {
  await assertFolderOwnership(workspaceId, folderId);

  const { error } = await supabase.from('folders').delete().eq('id', folderId);
  if (error) {
    throw httpError(500, `Could not delete folder: ${error.message}`);
  }
}

// WF3: moves a file into a folder, or back to the top level when `folderId`
// is null. Restricted to the attachment's actual owner (`isOwner`) — there
// is no share/grant model for folders or files (WF5), so this is the same
// owner-only check used everywhere else in this single-owner model.
export async function moveAttachment(workspaceId: string, attachmentId: string, folderId: string | null): Promise<void> {
  const owns = await isOwner(workspaceId, attachmentId);
  if (!owns) throw httpError(403, 'Permission denied');

  if (folderId) {
    await assertFolderOwnership(workspaceId, folderId);
  }

  const { error } = await supabase.from('attachments').update({ folder_id: folderId }).eq('id', attachmentId);
  if (error) {
    throw httpError(500, `Could not move attachment: ${error.message}`);
  }
}
